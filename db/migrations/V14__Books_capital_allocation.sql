-- V14__Books_capital_allocation.sql
-- 1. kind 'capital': money out that buys a fixed asset. Not in the P&L; on
--    the balance sheet at cost. Depreciation / Section 179 is the preparer's
--    call on the return.
-- 2. category_allocation: business-use percentage per category (optionally
--    per year). The books keep GROSS; v_pl shows allowed/disallowed so the
--    tax position is written down instead of living on a worksheet.
-- 3. Owner's answers (2026-10-18) applied as data.
-- 4. Views recreated with the above.

ALTER TABLE expense DROP CONSTRAINT IF EXISTS expense_kind_check;
ALTER TABLE expense ADD CONSTRAINT expense_kind_check
  CHECK (kind IN ('expense','personal','payroll','contractor','capital',
                  'income','contribution','distribution','transfer','refund'));

CREATE TABLE category_allocation (
  id            BIGSERIAL PRIMARY KEY,
  category_id   BIGINT        NOT NULL REFERENCES expense_category(id) ON DELETE CASCADE,
  year          INTEGER,                              -- NULL = default for all years
  business_pct  NUMERIC(5,2)  NOT NULL CHECK (business_pct >= 0 AND business_pct <= 100),
  note          TEXT,
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);
CREATE UNIQUE INDEX uniq_category_allocation ON category_allocation (category_id, COALESCE(year, 0));

-- Statutory: meals are 50% deductible. Everything else defaults to 100% until
-- the owner / preparer sets it.
INSERT INTO category_allocation (category_id, year, business_pct, note)
SELECT id, NULL, 50, 'IRS: meals 50% deductible' FROM expense_category WHERE name = 'Meals' AND deleted_at IS NULL;

-- The sync trigger must accept the new kind on the personal toggle.
CREATE OR REPLACE FUNCTION expense_sync_kind() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.kind = 'personal' THEN
      NEW.is_personal := TRUE;
    ELSIF NEW.is_personal THEN
      IF NEW.kind = 'expense' THEN
        NEW.kind := 'personal';
      ELSE
        RAISE EXCEPTION 'is_personal cannot be set on a % row', NEW.kind;
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.kind IS DISTINCT FROM OLD.kind THEN
    NEW.is_personal := (NEW.kind = 'personal');
    RETURN NEW;
  END IF;
  IF NEW.is_personal IS DISTINCT FROM OLD.is_personal THEN
    IF NEW.is_personal THEN
      IF NEW.kind IN ('expense','payroll','contractor','distribution','capital') THEN
        NEW.kind := 'personal';
      ELSE
        RAISE EXCEPTION 'a % row cannot be marked personal', NEW.kind;
      END IF;
    ELSIF NEW.kind = 'personal' THEN
      NEW.kind := 'expense';
    END IF;
    NEW.kind_set_by := 'user';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- ------------------------------------------------------------ data: owner answers
-- (a) QuickBooks contractor payments without a label in the CSV: same ACH
--     originator as the labelled Sandau payments.
UPDATE expense e SET kind = 'contractor', kind_set_by = 'rule',
  accepted_category_id = (SELECT id FROM expense_category WHERE name = 'Payroll' AND deleted_at IS NULL), accepted_at = NOW()
FROM bank_transaction bt
WHERE bt.id = e.bank_transaction_id AND e.deleted_at IS NULL AND e.kind = 'expense' AND e.accepted_category_id IS NULL
  AND bt.description ~* 'ACH PAYROLL' AND bt.description ~* 'CO:\s*PAYROLL';

-- (b) 2025-06-07 859.57 Shared Branch deposit: owner's IRS refund, deposited
--     by family. Contribution, confirmed by the owner.
UPDATE expense e SET kind = 'contribution', kind_set_by = 'user'
FROM bank_transaction bt
WHERE bt.id = e.bank_transaction_id AND bt.posted_date = '2025-06-07' AND bt.amount = 859.57;

-- (c) Cash withdrawals from the business account that the owner categorized
--     as expenses stay as categorized (owner's judgment; cash-paid business
--     costs are real). v_books_checks lists them for the preparer.

-- (d) Fixed assets: the 2024 mobile habitat for month-long client site visits.
--     The vehicle purchase (three wires) and the camper (every Poptop Overland
--     payment) are capital; gear, repairs, parts and registration stay expenses.
--     Owner can move rows between capital and expense in the UI.
UPDATE expense e SET kind = 'capital', kind_set_by = 'rule'
FROM expense_category c, project p
WHERE c.id = e.accepted_category_id AND p.id = e.project_id AND p.name = '2024'
  AND c.name = 'Truck/Camper' AND e.kind = 'expense' AND e.deleted_at IS NULL
  AND e.description ~* 'Wire Transfer Domestic Wire Out|POPTOP';

-- (e) The 2024-05-15 Poptop payment of 3,684.25 appears on both the PayPal
--     activity export and the PayPal Credit statement (PayPal Credit funded the
--     PayPal payment). Keep the funding-account row; retire the PayPal one.
UPDATE expense SET deleted_at = NOW(), raw_data = raw_data || '{"deleted_by": "V14: duplicate of the PayPal Credit row"}'::jsonb
WHERE deleted_at IS NULL AND source = 'paypal' AND date = '2024-05-15' AND amount = 3684.25 AND description ~* 'POPTOP';

-- (f) Home Improvement is the owner's house (mostly 2019 work financed by a
--     personal SoFi loan whose repayments were used as the proxy; Nov 2021 -
--     Mar 2022 was prepping the house for sale). Never a business expense.
UPDATE expense_category SET lean = 'personal', updated_at = NOW() WHERE name = 'Home Improvement' AND deleted_at IS NULL;
UPDATE expense e SET kind = 'personal', kind_set_by = 'user'
FROM expense_category c
WHERE c.id = e.accepted_category_id AND c.name = 'Home Improvement' AND e.deleted_at IS NULL
  AND e.kind IN ('expense','capital');

-- ------------------------------------------------------------ views
DROP VIEW IF EXISTS v_return_compare, v_books_checks, v_fixed_assets, v_balance_sheet, v_equity_rollforward,
  v_cash_balances, v_distributions, v_contributions, v_pl_summary, v_pl, v_cash_tie, v_ledger CASCADE;

CREATE VIEW v_ledger AS
SELECT e.id,
       p.name::int                                   AS year,
       e.date,
       e.source,
       a.id                                          AS account_id,
       a.owner                                       AS account_owner,
       a.kind                                        AS account_kind,
       e.kind,
       e.currency,
       e.amount                                      AS amount_native,
       CASE WHEN fx.per_usd IS NULL THEN NULL
            ELSE e.amount / fx.per_usd END           AS amount_usd,   -- positive = money out; unrounded
       fx.per_usd IS NULL                            AS fx_missing,
       c.name                                        AS category,
       e.accepted_category_id,
       e.description,
       COALESCE(bt.description, e.description)       AS bank_description,
       e.bank_transaction_id,
       e.kind_set_by,
       bt.rule_kind,
       bt.rule_specific,
       COALESCE(ay.business_pct, ad.business_pct, 100)      AS business_pct,
       CASE WHEN fx.per_usd IS NULL THEN NULL
            ELSE e.amount / fx.per_usd * COALESCE(ay.business_pct, ad.business_pct, 100) / 100 END AS allowed_usd
FROM expense e
JOIN project p               ON p.id = e.project_id AND p.deleted_at IS NULL AND p.name ~ '^\d{4}$'
LEFT JOIN account a          ON a.name = e.source
LEFT JOIN fx_rate fx         ON fx.currency = e.currency AND fx.year = p.name::int
LEFT JOIN expense_category c ON c.id = e.accepted_category_id
LEFT JOIN bank_transaction bt ON bt.id = e.bank_transaction_id
LEFT JOIN category_allocation ay ON ay.category_id = e.accepted_category_id AND ay.year = p.name::int
LEFT JOIN category_allocation ad ON ad.category_id = e.accepted_category_id AND ad.year IS NULL
WHERE e.deleted_at IS NULL
  AND e.amount IS NOT NULL
  AND COALESCE(a.in_books, TRUE);

CREATE VIEW v_cash_tie AS
SELECT a.name                                   AS account,
       EXTRACT(YEAR FROM sp.period_start)::int  AS year,
       sp.period_start, sp.period_end,
       sp.opening_balance,
       COALESCE(SUM(bt.amount) FILTER (WHERE bt.amount > 0), 0) AS deposits,
       COALESCE(SUM(bt.amount) FILTER (WHERE bt.amount < 0), 0) AS withdrawals,
       sp.closing_balance,
       ROUND(sp.opening_balance + COALESCE(SUM(bt.amount), 0) - sp.closing_balance, 2) AS tie_diff,
       COUNT(bt.id)                                        AS lines,
       COUNT(bt.id) FILTER (WHERE e.id IS NULL)            AS unexplained_lines,
       sp.source_file
FROM statement_period sp
JOIN account a ON a.id = sp.account_id
LEFT JOIN bank_transaction bt ON bt.statement_period_id = sp.id
LEFT JOIN expense e ON e.bank_transaction_id = bt.id AND e.deleted_at IS NULL
GROUP BY a.name, sp.id
ORDER BY a.name, sp.period_start;

CREATE VIEW v_pl AS
WITH lines AS (
  SELECT year,
         CASE kind
           WHEN 'income'     THEN 'Income'
           WHEN 'payroll'    THEN 'Payroll'
           WHEN 'contractor' THEN 'Contract labor'
           ELSE 'Expenses' END                        AS section,   -- refunds: negative expenses
         CASE kind
           WHEN 'income'     THEN 'Revenue (deposits)'
           WHEN 'refund'     THEN COALESCE(category, 'Refunds & adjustments')   -- nets against the category it offsets
           WHEN 'payroll'    THEN CASE WHEN bank_description ~* 'TYPE:\s*TAX' THEN 'Payroll taxes (Gusto TAX)'
                                       WHEN bank_description ~* 'TYPE:\s*NET' THEN 'Wages, net (Gusto NET)'
                                       ELSE 'Payroll (unsplit)' END
           WHEN 'contractor' THEN 'Contract labor'
           ELSE COALESCE(category, 'Uncategorized') END AS line,
         -- income rows are negative (money in): flip to positive. Refunds stay
         -- negative so they reduce the expense section.
         CASE WHEN kind = 'income' THEN -amount_usd ELSE amount_usd END AS amount_usd,
         CASE WHEN kind = 'income' THEN -amount_usd ELSE allowed_usd END AS allowed_usd,
         account_owner
  FROM v_ledger
  WHERE kind IN ('income','refund','expense','payroll','contractor')
)
SELECT year, section, line,
       ROUND(SUM(amount_usd), 2)                                       AS amount_usd,
       ROUND(SUM(allowed_usd), 2)                                      AS allowed_usd,
       ROUND(SUM(amount_usd) - SUM(allowed_usd), 2)                    AS disallowed_usd,
       ROUND(SUM(amount_usd) FILTER (WHERE account_owner = 'business'), 2) AS paid_from_business,
       ROUND(SUM(amount_usd) FILTER (WHERE account_owner = 'personal'), 2) AS paid_from_personal,
       COUNT(*)                                                        AS lines
FROM lines
GROUP BY year, section, line
ORDER BY year,
         CASE section WHEN 'Income' THEN 0 WHEN 'Payroll' THEN 1 WHEN 'Contract labor' THEN 2 ELSE 3 END,
         amount_usd DESC;

CREATE VIEW v_pl_summary AS
SELECT year,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Income'), 0)         AS income,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Expenses'), 0)       AS expenses,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Payroll'), 0)        AS payroll,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Contract labor'), 0) AS contract_labor,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Income'), 0)
       - COALESCE(SUM(amount_usd) FILTER (WHERE section <> 'Income'), 0)      AS net_income,
       COALESCE(SUM(allowed_usd) FILTER (WHERE section <> 'Income'), 0)       AS deductions_allowed,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Income'), 0)
       - COALESCE(SUM(allowed_usd) FILTER (WHERE section <> 'Income'), 0)     AS net_income_allowed
FROM v_pl
GROUP BY year
ORDER BY year;

CREATE VIEW v_contributions AS
WITH lines AS (
  SELECT year,
         CASE WHEN account_owner = 'business' THEN 'Cash transferred in'
              ELSE 'Business expense paid from personal account' END AS form,
         source                                                       AS account,
         CASE WHEN account_owner = 'business' THEN NULL
              ELSE CASE kind WHEN 'payroll' THEN 'Payroll' WHEN 'contractor' THEN 'Contract labor'
                             WHEN 'refund' THEN 'Refunds (negative)'
                             WHEN 'capital' THEN 'Fixed asset: ' || COALESCE(category, 'Uncategorized')
                             ELSE COALESCE(category, 'Uncategorized') END END AS category,
         CASE WHEN account_owner = 'business' THEN -amount_usd ELSE amount_usd END AS amount_usd
  FROM v_ledger
  WHERE (account_owner = 'business' AND kind = 'contribution')
     OR (account_owner = 'personal' AND kind IN ('expense','payroll','contractor','refund','capital'))
)
SELECT year, form, account, category,
       ROUND(SUM(amount_usd), 2) AS amount_usd,
       COUNT(*)                  AS lines
FROM lines
GROUP BY year, form, account, category
ORDER BY year, form, amount_usd DESC;

CREATE VIEW v_distributions AS
WITH lines AS (
  SELECT year,
         CASE WHEN kind = 'personal' THEN 'Personal spending from business account'
              WHEN bank_description ~* 'ALLY BANK'                         THEN 'Transfer to Ally savings'
              WHEN bank_description ~* 'To\s+SWEDBERG|TO SWEDBERG|To R\.? ERIK|^Internet Banking Transfer\s*$' THEN 'Transfer to personal checking'
              WHEN bank_description ~* 'To\s+CASTLE'                       THEN 'Transfer to spouse'
              WHEN bank_description ~* 'BARCLAY'                           THEN 'Paid personal card: Barclaycard'
              WHEN bank_description ~* 'PAYPAL\s*\*?\s*CREDIT|PAYPAL CREDIT' THEN 'Paid personal card: PayPal Credit'
              WHEN bank_description ~* 'APPLE ?CARD'                       THEN 'Paid personal card: Apple Card'
              WHEN bank_description ~* 'USAA'                              THEN 'Paid personal account: USAA'
              WHEN bank_description ~* 'REDWOOD'                           THEN 'Paid personal account: Redwood CU'
              WHEN bank_description ~* 'at ATM|Shared Branch|Cash'         THEN 'Cash withdrawal'
              WHEN bank_description ~* 'Wire'                              THEN 'Wire out'
              ELSE 'Other transfer to owner' END                           AS destination,
         source                                                             AS account,
         amount_usd
  FROM v_ledger
  WHERE account_owner = 'business' AND kind IN ('distribution','personal')
)
SELECT year, destination, account,
       ROUND(SUM(amount_usd), 2) AS amount_usd,
       COUNT(*)                  AS lines
FROM lines
GROUP BY year, destination, account
ORDER BY year, amount_usd DESC;

CREATE VIEW v_cash_balances AS
SELECT EXTRACT(YEAR FROM sp.period_end)::int AS year, a.name AS account,
       sp.closing_balance AS cash_eoy
FROM statement_period sp JOIN account a ON a.id = sp.account_id
WHERE a.owner = 'business' AND a.in_books
  AND sp.period_end = (SELECT MAX(period_end) FROM statement_period s2
                       WHERE s2.account_id = sp.account_id
                         AND EXTRACT(YEAR FROM s2.period_end) = EXTRACT(YEAR FROM sp.period_end));

CREATE VIEW v_equity_rollforward AS
WITH years AS (
  SELECT DISTINCT year FROM v_ledger
),
pl AS (
  SELECT year,
         SUM(CASE WHEN kind = 'income' THEN -amount_usd ELSE -amount_usd END) FILTER (WHERE kind IN ('income','refund'))
         - SUM(amount_usd) FILTER (WHERE kind IN ('expense','payroll','contractor')) AS net_income
  FROM v_ledger WHERE kind IN ('income','refund','expense','payroll','contractor') GROUP BY year
),
con AS (
  SELECT year, SUM(CASE WHEN account_owner = 'business' THEN -amount_usd ELSE amount_usd END) AS contributions
  FROM v_ledger
  WHERE (account_owner = 'business' AND kind = 'contribution')
     OR (account_owner = 'personal' AND kind IN ('expense','payroll','contractor','refund','capital'))
  GROUP BY year
),
cap AS (
  SELECT year, SUM(amount_usd) AS capital FROM v_ledger WHERE kind = 'capital' GROUP BY year
),
dis AS (
  SELECT year, SUM(amount_usd) AS distributions
  FROM v_ledger WHERE account_owner = 'business' AND kind IN ('distribution','personal') GROUP BY year
),
cash AS (SELECT year, SUM(cash_eoy) AS cash_eoy FROM v_cash_balances GROUP BY year),
first_cash AS (
  SELECT SUM(sp.opening_balance) AS cash_boy
  FROM statement_period sp JOIN account a ON a.id = sp.account_id
  WHERE a.owner = 'business' AND a.in_books
    AND sp.period_start = (SELECT MIN(period_start) FROM statement_period s2 WHERE s2.account_id = sp.account_id)
),
rows_ AS (
  SELECT y.year,
         COALESCE(pl.net_income, 0)    AS net_income,
         COALESCE(con.contributions, 0) AS contributions,
         COALESCE(dis.distributions, 0) AS distributions,
         COALESCE(cap.capital, 0)       AS capital,
         cash.cash_eoy
  FROM years y
  LEFT JOIN pl   ON pl.year = y.year
  LEFT JOIN con  ON con.year = y.year
  LEFT JOIN dis  ON dis.year = y.year
  LEFT JOIN cash ON cash.year = y.year
  LEFT JOIN cap  ON cap.year = y.year
)
SELECT year,
       ROUND((SELECT cash_boy FROM first_cash)
             + COALESCE(SUM(net_income + contributions - distributions)
                        OVER (ORDER BY year ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0), 2) AS equity_boy,
       ROUND(net_income, 2)    AS net_income,
       ROUND(contributions, 2) AS contributions,
       ROUND(distributions, 2) AS distributions,
       ROUND((SELECT cash_boy FROM first_cash)
             + SUM(net_income + contributions - distributions)
               OVER (ORDER BY year ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 2) AS equity_eoy,
       cash_eoy,
       ROUND(SUM(capital) OVER (ORDER BY year ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 2) AS fixed_assets_eoy,
       ROUND((SELECT cash_boy FROM first_cash)
             + SUM(net_income + contributions - distributions)
               OVER (ORDER BY year ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
             - cash_eoy
             - SUM(capital) OVER (ORDER BY year ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 2) AS equity_vs_cash_diff
FROM rows_
ORDER BY year;

CREATE VIEW v_balance_sheet AS
SELECT r.year,
       r.cash_eoy                                               AS assets_cash,
       r.fixed_assets_eoy                                       AS assets_fixed_at_cost,
       r.cash_eoy + r.fixed_assets_eoy                          AS assets_total,
       0::numeric                                               AS liabilities,
       r.equity_eoy                                             AS equity_total,
       SUM(r.contributions) OVER (ORDER BY r.year)              AS equity_paid_in_capital_cum,
       SUM(r.distributions) OVER (ORDER BY r.year)              AS equity_distributions_cum,
       SUM(r.net_income)    OVER (ORDER BY r.year)              AS equity_retained_earnings_cum,
       r.equity_vs_cash_diff                                    AS check_diff
FROM v_equity_rollforward r
ORDER BY r.year;

CREATE VIEW v_fixed_assets AS
SELECT year, id, date, source AS account, account_owner, category, description,
       ROUND(amount_usd, 2) AS cost_usd, currency, amount_native
FROM v_ledger WHERE kind = 'capital'
ORDER BY year, date;

CREATE VIEW v_books_checks AS
SELECT year, 'statement periods not tying'::text AS check_name, COUNT(*)::bigint AS problems,
       STRING_AGG(account || ' ' || period_start::text || ' diff ' || tie_diff, '; ') AS detail
FROM v_cash_tie WHERE tie_diff <> 0 GROUP BY year
UNION ALL
SELECT year, 'bank lines with no ledger row', SUM(unexplained_lines)::bigint,
       STRING_AGG(account || ' ' || period_start::text || ': ' || unexplained_lines, '; ') FILTER (WHERE unexplained_lines > 0)
FROM v_cash_tie GROUP BY year HAVING SUM(unexplained_lines) > 0
UNION ALL
SELECT EXTRACT(YEAR FROM sp.period_start)::int, 'statement gap or overlap', COUNT(*)::bigint,
       STRING_AGG(a.name || ' ' || sp.period_start::text || ' follows ' || prev_end::text, '; ')
FROM (SELECT sp.*, LAG(period_end) OVER (PARTITION BY account_id ORDER BY period_start) AS prev_end FROM statement_period sp) sp
JOIN account a ON a.id = sp.account_id
WHERE prev_end IS NOT NULL AND sp.period_start <> prev_end + 1
GROUP BY 1
UNION ALL
SELECT EXTRACT(YEAR FROM sp.period_start)::int, 'opening balance != prior closing', COUNT(*)::bigint,
       STRING_AGG(a.name || ' ' || sp.period_start::text || ' open ' || sp.opening_balance || ' prior close ' || prev_close, '; ')
FROM (SELECT sp.*, LAG(closing_balance) OVER (PARTITION BY account_id ORDER BY period_start) AS prev_close FROM statement_period sp) sp
JOIN account a ON a.id = sp.account_id
WHERE prev_close IS NOT NULL AND sp.opening_balance <> prev_close
GROUP BY 1
UNION ALL
SELECT y.year, 'December statement missing', COUNT(*)::bigint, STRING_AGG(a.name, '; ')
FROM (SELECT DISTINCT year FROM v_ledger) y
CROSS JOIN account a
WHERE a.owner = 'business' AND a.in_books
  AND NOT EXISTS (SELECT 1 FROM statement_period sp WHERE sp.account_id = a.id
                  AND EXTRACT(YEAR FROM sp.period_end) = y.year AND EXTRACT(MONTH FROM sp.period_end) = 12)
GROUP BY y.year
UNION ALL
SELECT year, 'ledger rows with no FX rate', COUNT(*)::bigint, STRING_AGG(DISTINCT currency, ', ')
FROM v_ledger WHERE fx_missing GROUP BY year
UNION ALL
SELECT year, 'business-account rows with no statement line', COUNT(*)::bigint,
       STRING_AGG(id::text || ' ' || COALESCE(date::text,'?') || ' ' || amount_native::text, '; ')
FROM v_ledger WHERE account_owner = 'business' AND bank_transaction_id IS NULL GROUP BY year
UNION ALL
SELECT p.name::int, 'business-account rows with NULL amount', COUNT(*)::bigint,
       STRING_AGG(e.id::text || ' ' || COALESCE(e.date::text,'?') || ' ' || LEFT(REGEXP_REPLACE(e.description, '\s+', ' ', 'g'), 40), '; ')
FROM expense e JOIN project p ON p.id = e.project_id AND p.deleted_at IS NULL AND p.name ~ '^\d{4}$'
JOIN account a ON a.name = e.source AND a.owner = 'business' AND a.in_books
WHERE e.deleted_at IS NULL AND e.amount IS NULL GROUP BY p.name
UNION ALL
SELECT year, 'kind and sign disagree', COUNT(*)::bigint,
       STRING_AGG(id::text || ' ' || kind || ' ' || amount_native::text, '; ')
FROM v_ledger
WHERE (kind IN ('income','contribution','refund') AND amount_native > 0)
   OR (kind IN ('expense','payroll','contractor','distribution','capital') AND amount_native < 0)
GROUP BY year
UNION ALL
SELECT year, 'ledger-kind rows carrying a P&L category', COUNT(*)::bigint,
       STRING_AGG(id::text || ' ' || kind || ' ' || category, '; ')
FROM v_ledger WHERE kind IN ('income','contribution','distribution','transfer') AND category IS NOT NULL
GROUP BY year
UNION ALL
SELECT year, 'kind disagrees with the statement rule (machine-set)', COUNT(*)::bigint,
       STRING_AGG(id::text || ' is ' || kind || ', rule says ' || rule_kind || ' (' || LEFT(REGEXP_REPLACE(bank_description, '\s+', ' ', 'g'), 40) || ')', '; ')
FROM v_ledger
WHERE account_owner = 'business' AND rule_specific AND kind <> rule_kind AND kind <> 'personal'
  AND kind_set_by IN ('backfill','rule','match')
  AND NOT EXISTS (SELECT 1 FROM invoice_payment ip WHERE ip.expense_id = v_ledger.id)
GROUP BY year
UNION ALL
SELECT year, 'info: owner-categorized rows the statement rule reads differently (confirm)', COUNT(*)::bigint,
       STRING_AGG(id::text || ' is ' || kind || COALESCE('/' || category, '') || ', rule says ' || rule_kind || ' (' || LEFT(REGEXP_REPLACE(bank_description, '\s+', ' ', 'g'), 40) || ')', '; ')
FROM v_ledger
WHERE account_owner = 'business' AND rule_specific AND kind <> rule_kind AND kind <> 'personal'
  AND (kind_set_by IS NULL OR kind_set_by = 'user')
  AND NOT EXISTS (SELECT 1 FROM invoice_payment ip WHERE ip.expense_id = v_ledger.id)
GROUP BY year
UNION ALL
SELECT l.year, 'invoice-matched deposits not booked as income', COUNT(*)::bigint,
       STRING_AGG(l.id::text || ' is ' || l.kind || ' ' || ROUND(-l.amount_usd, 2)::text, '; ')
FROM v_ledger l
WHERE l.kind <> 'income' AND EXISTS (SELECT 1 FROM invoice_payment ip WHERE ip.expense_id = l.id)
GROUP BY l.year
UNION ALL
SELECT year, 'payroll rows without a Gusto NET/TAX memo', COUNT(*)::bigint,
       STRING_AGG(id::text || ' ' || amount_native::text, '; ')
FROM v_ledger WHERE kind = 'payroll' AND account_owner = 'business' AND bank_description !~* 'TYPE:\s*(NET|TAX)'
GROUP BY year
UNION ALL
SELECT year, 'uncategorized business expense rows', COUNT(*)::bigint,
       STRING_AGG(id::text || ' ' || COALESCE(date::text,'?') || ' ' || amount_native::text, '; ')
FROM v_ledger WHERE kind = 'expense' AND accepted_category_id IS NULL GROUP BY year
UNION ALL
SELECT l.year, 'info: income deposits not matched to an invoice', COUNT(*)::bigint,
       STRING_AGG(l.date::text || ' ' || ROUND(-l.amount_usd, 2)::text, '; ' ORDER BY l.date)
FROM v_ledger l
WHERE l.kind = 'income' AND l.account_owner = 'business'
  AND NOT EXISTS (SELECT 1 FROM invoice_payment ip WHERE ip.expense_id = l.id)
GROUP BY l.year
UNION ALL
SELECT year, 'info: anonymous deposits booked as owner contributions (confirm)', COUNT(*)::bigint,
       STRING_AGG(date::text || ' ' || ROUND(-amount_usd, 2)::text || ' (' || LEFT(REGEXP_REPLACE(bank_description, '\s+', ' ', 'g'), 40) || ')', '; ' ORDER BY date)
FROM v_ledger
WHERE kind = 'contribution' AND account_owner = 'business'
  AND bank_description !~* 'SWEDBERG|CASTLE|P2P'
  AND COALESCE(kind_set_by, '') <> 'user'
GROUP BY year
UNION ALL
SELECT a.year, 'info: possible duplicate rows (same date and amount on two personal sources)', COUNT(*)::bigint,
       STRING_AGG(a.id::text || '/' || b.id::text || ' ' || a.date::text || ' ' || a.amount_native::text || ' ' || a.source || ' vs ' || b.source, '; ')
FROM v_ledger a JOIN v_ledger b ON b.year = a.year AND b.date = a.date AND b.amount_native = a.amount_native AND b.id > a.id AND b.source <> a.source
WHERE a.account_owner = 'personal' AND b.account_owner = 'personal' AND a.amount_native >= 100
  AND a.kind IN ('expense','capital') AND b.kind IN ('expense','capital')
GROUP BY a.year
UNION ALL
SELECT year, 'equity rollforward vs cash', 1::bigint, 'diff ' || equity_vs_cash_diff
FROM v_equity_rollforward WHERE ABS(equity_vs_cash_diff) >= 0.01
ORDER BY 1, 2;

CREATE VIEW v_return_compare AS
WITH books AS (
  SELECT year, '1a' AS line, 'Gross receipts' AS label, income AS books_amount FROM v_pl_summary
  UNION ALL
  SELECT year, '7+8', 'Wages (books: Gusto NET+TAX cash)', payroll FROM v_pl_summary
  UNION ALL
  SELECT year, '11', 'Rents (books: Rent/Mortgage + Studio Rent + Storage)',
         COALESCE(SUM(allowed_usd) FILTER (WHERE section = 'Expenses' AND line IN ('Rent/Mortgage','Studio Rent','Storage')), 0)
  FROM v_pl GROUP BY year
  UNION ALL
  SELECT year, '20/21', 'Total deductions (books: allowed after business-use %)', deductions_allowed FROM v_pl_summary
  UNION ALL
  SELECT year, '21/22', 'Ordinary business income (loss) (books: allowed)', net_income_allowed FROM v_pl_summary
),
ret AS (
  SELECT year,
         CASE line WHEN '7' THEN '7+8' WHEN '8' THEN '7+8' ELSE line END AS line,
         SUM(amount) AS return_amount,
         STRING_AGG(DISTINCT source, '; ') AS return_source
  FROM tax_return_line
  WHERE form = '1120-S' AND source NOT LIKE '%prior-year column%'
  GROUP BY year, CASE line WHEN '7' THEN '7+8' WHEN '8' THEN '7+8' ELSE line END
)
SELECT b.year, b.line, b.label,
       ROUND(b.books_amount, 2)                         AS books_amount,
       r.return_amount,
       ROUND(b.books_amount - COALESCE(r.return_amount, 0), 2) AS diff,
       r.return_source
FROM books b
LEFT JOIN ret r ON r.year = b.year AND r.line = b.line
ORDER BY b.year, CASE b.line WHEN '1a' THEN 0 WHEN '7+8' THEN 1 WHEN '11' THEN 2 WHEN '20/21' THEN 3 ELSE 4 END;

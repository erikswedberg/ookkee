-- V12__Books_views.sql
-- The books themselves: SQL views over the classified rows. Export = SELECT.
--
-- Conventions (see V11): expense.amount positive = money OUT; deposits are
-- negative rows. All views present money as POSITIVE numbers in USD (fx_rate
-- yearly average), with the direction given by the section/column.
--
-- Scope: live rows in live year-named projects, on accounts with in_books.

-- ------------------------------------------------------------ v_ledger
-- One row per live ledger line, USD-converted, with account ownership.
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
            ELSE ROUND(e.amount / fx.per_usd, 2) END AS amount_usd,   -- positive = money out
       fx.per_usd IS NULL                            AS fx_missing,
       c.name                                        AS category,
       e.accepted_category_id,
       e.description,
       COALESCE(bt.description, e.description)       AS bank_description,
       e.bank_transaction_id,
       e.kind_set_by
FROM expense e
JOIN project p               ON p.id = e.project_id AND p.deleted_at IS NULL AND p.name ~ '^\d{4}$'
LEFT JOIN account a          ON a.name = e.source
LEFT JOIN fx_rate fx         ON fx.currency = e.currency AND fx.year = p.name::int
LEFT JOIN expense_category c ON c.id = e.accepted_category_id
LEFT JOIN bank_transaction bt ON bt.id = e.bank_transaction_id
WHERE e.deleted_at IS NULL
  AND e.amount IS NOT NULL
  AND COALESCE(a.in_books, TRUE);

-- ---------------------------------------------------------- v_cash_tie
-- Per statement period: does opening + lines = closing, and is every line
-- explained by a ledger row?
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

-- ---------------------------------------------------------------- v_pl
-- Profit & loss lines per year. Payroll is split on the Gusto memo
-- (NET = take-home wages, TAX = withholding + employer taxes) because the
-- bank line carries it even where the uploaded CSV did not.
CREATE VIEW v_pl AS
WITH lines AS (
  SELECT year,
         CASE kind
           WHEN 'income'     THEN 'Income'
           WHEN 'refund'     THEN 'Income'
           WHEN 'payroll'    THEN 'Payroll'
           WHEN 'contractor' THEN 'Contract labor'
           ELSE 'Expenses' END                        AS section,
         CASE kind
           WHEN 'income'     THEN 'Revenue (deposits)'
           WHEN 'refund'     THEN 'Refunds & adjustments'
           WHEN 'payroll'    THEN CASE WHEN bank_description ~* 'TYPE:\s*TAX' THEN 'Payroll taxes (Gusto TAX)'
                                       WHEN bank_description ~* 'TYPE:\s*NET' THEN 'Wages, net (Gusto NET)'
                                       ELSE 'Payroll (unsplit)' END
           WHEN 'contractor' THEN 'Contract labor'
           ELSE COALESCE(category, 'Uncategorized') END AS line,
         -- income/refund rows are negative (money in): flip to positive
         CASE WHEN kind IN ('income','refund') THEN -amount_usd ELSE amount_usd END AS amount_usd,
         account_owner
  FROM v_ledger
  WHERE kind IN ('income','refund','expense','payroll','contractor')
)
SELECT year, section, line,
       ROUND(SUM(amount_usd), 2)                                       AS amount_usd,
       ROUND(SUM(amount_usd) FILTER (WHERE account_owner = 'business'), 2) AS paid_from_business,
       ROUND(SUM(amount_usd) FILTER (WHERE account_owner = 'personal'), 2) AS paid_from_personal,
       COUNT(*)                                                        AS lines
FROM lines
GROUP BY year, section, line
ORDER BY year,
         CASE section WHEN 'Income' THEN 0 WHEN 'Payroll' THEN 1 WHEN 'Contract labor' THEN 2 ELSE 3 END,
         amount_usd DESC;

-- -------------------------------------------------------- v_pl_summary
CREATE VIEW v_pl_summary AS
SELECT year,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Income'), 0)         AS income,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Expenses'), 0)       AS expenses,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Payroll'), 0)        AS payroll,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Contract labor'), 0) AS contract_labor,
       COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Income'), 0)
       - COALESCE(SUM(amount_usd) FILTER (WHERE section <> 'Income'), 0)      AS net_income
FROM v_pl
GROUP BY year
ORDER BY year;

-- ------------------------------------------------------ v_contributions
-- Owner capital put INTO the business: cash transferred in, and business
-- costs paid from the owner's personal accounts.
CREATE VIEW v_contributions AS
WITH lines AS (
  SELECT year,
         CASE WHEN account_owner = 'business' THEN 'Cash transferred in'
              ELSE 'Business expense paid from personal account' END AS form,
         source                                                       AS account,
         CASE WHEN account_owner = 'business' THEN NULL
              ELSE CASE kind WHEN 'payroll' THEN 'Payroll' WHEN 'contractor' THEN 'Contract labor'
                             ELSE COALESCE(category, 'Uncategorized') END END AS category,
         CASE WHEN account_owner = 'business' THEN -amount_usd ELSE amount_usd END AS amount_usd
  FROM v_ledger
  WHERE (account_owner = 'business' AND kind = 'contribution')
     OR (account_owner = 'personal' AND kind IN ('expense','payroll','contractor'))
)
SELECT year, form, account, category,
       ROUND(SUM(amount_usd), 2) AS amount_usd,
       COUNT(*)                  AS lines
FROM lines
GROUP BY year, form, account, category
ORDER BY year, form, amount_usd DESC;

-- ------------------------------------------------------ v_distributions
-- Business cash that went to the owner: transfers out, card/loan payments
-- made from the business account, cash withdrawals, and personal spending
-- charged to the business account.
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

-- ------------------------------------------------------ v_cash_balances
-- Year-end cash per business account from the December statement, and the
-- opening cash of the first year.
CREATE VIEW v_cash_balances AS
SELECT EXTRACT(YEAR FROM sp.period_end)::int AS year, a.name AS account,
       sp.closing_balance AS cash_eoy
FROM statement_period sp JOIN account a ON a.id = sp.account_id
WHERE a.owner = 'business' AND a.in_books
  AND sp.period_end = (SELECT MAX(period_end) FROM statement_period s2
                       WHERE s2.account_id = sp.account_id
                         AND EXTRACT(YEAR FROM s2.period_end) = EXTRACT(YEAR FROM sp.period_end));

-- --------------------------------------------------- v_equity_rollforward
-- Equity_EOY = Equity_BOY + net income + contributions - distributions,
-- checked against actual year-end cash (the company holds no other assets
-- and no liabilities; if that changes, add them here).
CREATE VIEW v_equity_rollforward AS
WITH years AS (
  SELECT DISTINCT year FROM v_ledger
),
pl AS (SELECT year, net_income FROM v_pl_summary),
con AS (SELECT year, SUM(amount_usd) AS contributions FROM v_contributions GROUP BY year),
dis AS (SELECT year, SUM(amount_usd) AS distributions FROM v_distributions GROUP BY year),
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
         cash.cash_eoy
  FROM years y
  LEFT JOIN pl   ON pl.year = y.year
  LEFT JOIN con  ON con.year = y.year
  LEFT JOIN dis  ON dis.year = y.year
  LEFT JOIN cash ON cash.year = y.year
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
       ROUND((SELECT cash_boy FROM first_cash)
             + SUM(net_income + contributions - distributions)
               OVER (ORDER BY year ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) - cash_eoy, 2) AS equity_vs_cash_diff
FROM rows_
ORDER BY year;

-- ------------------------------------------------------ v_balance_sheet
CREATE VIEW v_balance_sheet AS
SELECT r.year,
       r.cash_eoy                                               AS assets_cash,
       0::numeric                                               AS liabilities,
       r.equity_eoy                                             AS equity_total,
       SUM(r.contributions) OVER (ORDER BY r.year)              AS equity_paid_in_capital_cum,
       SUM(r.distributions) OVER (ORDER BY r.year)              AS equity_distributions_cum,
       SUM(r.net_income)    OVER (ORDER BY r.year)              AS equity_retained_earnings_cum,
       r.equity_vs_cash_diff                                    AS check_diff
FROM v_equity_rollforward r
ORDER BY r.year;

-- ------------------------------------------------------- v_books_checks
-- Everything that must be zero/empty before a year is handed to the CPA.
CREATE VIEW v_books_checks AS
SELECT year, 'statement periods not tying'          AS check_name, COUNT(*) AS problems,
       STRING_AGG(account || ' ' || period_start::text || ' diff ' || tie_diff, '; ') AS detail
FROM v_cash_tie WHERE tie_diff <> 0 GROUP BY year
UNION ALL
SELECT year, 'bank lines with no ledger row', SUM(unexplained_lines),
       STRING_AGG(account || ' ' || period_start::text || ': ' || unexplained_lines, '; ') FILTER (WHERE unexplained_lines > 0)
FROM v_cash_tie GROUP BY year HAVING SUM(unexplained_lines) > 0
UNION ALL
SELECT year, 'ledger rows with no FX rate', COUNT(*), STRING_AGG(DISTINCT currency, ', ')
FROM v_ledger WHERE fx_missing GROUP BY year
UNION ALL
SELECT year, 'business-account rows with no statement line', COUNT(*),
       STRING_AGG(id::text || ' ' || COALESCE(date::text,'?') || ' ' || amount_native::text, '; ')
FROM v_ledger WHERE account_owner = 'business' AND bank_transaction_id IS NULL GROUP BY year
UNION ALL
SELECT year, 'uncategorized business expense rows', COUNT(*), NULL
FROM v_ledger WHERE kind = 'expense' AND accepted_category_id IS NULL GROUP BY year
UNION ALL
SELECT l.year, 'income deposits not matched to an invoice', COUNT(*),
       STRING_AGG(l.date::text || ' ' || (-l.amount_usd)::text, '; ' ORDER BY l.date)
FROM v_ledger l
WHERE l.kind = 'income' AND l.account_owner = 'business'
  AND NOT EXISTS (SELECT 1 FROM invoice_payment ip WHERE ip.expense_id = l.id)
GROUP BY l.year
UNION ALL
SELECT year, 'equity rollforward vs cash', 1, 'diff ' || equity_vs_cash_diff
FROM v_equity_rollforward WHERE equity_vs_cash_diff <> 0
ORDER BY 1, 2;

-- V15__Books_dup_followup.sql
-- PayPal "PreApproved Payment" charges funded by the Redwood debit card appear
-- on both exports; keep the card row, retire the PayPal twin (1:1 pairs).
WITH keep AS (
  SELECT e.id, p.name AS yr, e.date, e.amount, ROW_NUMBER() OVER (PARTITION BY p.name, e.date, e.amount ORDER BY e.id) AS n
  FROM expense e JOIN project p ON p.id = e.project_id AND p.deleted_at IS NULL AND p.name ~ '^\d{4}$'
  WHERE e.deleted_at IS NULL AND e.source = 'redwood' AND e.amount > 0
), twin AS (
  SELECT e.id, p.name AS yr, e.date, e.amount, ROW_NUMBER() OVER (PARTITION BY p.name, e.date, e.amount ORDER BY e.id) AS n
  FROM expense e JOIN project p ON p.id = e.project_id AND p.deleted_at IS NULL AND p.name ~ '^\d{4}$'
  WHERE e.deleted_at IS NULL AND e.source = 'paypal' AND e.amount > 0 AND e.description ~* 'PreApproved Payment'
)
UPDATE expense x SET deleted_at = NOW(), raw_data = x.raw_data || jsonb_build_object('deleted_by', 'V15: duplicate of redwood row ' || k.id)
FROM twin t JOIN keep k ON k.yr = t.yr AND k.date = t.date AND k.amount = t.amount AND k.n = t.n
WHERE x.id = t.id;

-- The duplicate check ignores small coincidences (two different $4 charges on
-- the same day are not a double count). Full definition restated.
CREATE OR REPLACE VIEW v_books_checks AS
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
   OR (kind = 'personal' AND account_owner = 'business' AND amount_native < 0)
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
  AND accepted_category_id IS NULL   -- a category on the row is the owner's confirmation
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
SELECT year, 'info: anonymous deposits booked as owner contributions (confirm)', COUNT(*)::bigint,
       STRING_AGG(date::text || ' ' || ROUND(-amount_usd, 2)::text || ' (' || LEFT(REGEXP_REPLACE(bank_description, '\s+', ' ', 'g'), 40) || ')', '; ' ORDER BY date)
FROM v_ledger
WHERE kind = 'contribution' AND account_owner = 'business'
  AND bank_description !~* 'SWEDBERG|CASTLE|P2P'
  AND COALESCE(kind_set_by, '') <> 'user'
GROUP BY year
UNION ALL
SELECT d.year, 'info: possible duplicate rows (same date and amount on two personal sources)', COUNT(*)::bigint,
       STRING_AGG(d.a_id::text || '/' || d.b_id::text || ' ' || d.date::text || ' ' || d.amount::text || ' ' || d.a_src || ' vs ' || d.b_src, '; ')
FROM (
  WITH rows_ AS MATERIALIZED (
    SELECT e.id, p.name::int AS year, e.date, e.amount, e.source
    FROM expense e
    JOIN project p ON p.id = e.project_id AND p.deleted_at IS NULL AND p.name ~ '^\d{4}$'
    JOIN account a ON a.name = e.source AND a.owner = 'personal' AND a.in_books
    WHERE e.deleted_at IS NULL AND e.kind IN ('expense','capital') AND e.amount >= 50
  )
  SELECT a.year, a.date, a.amount, a.id AS a_id, b.id AS b_id, a.source AS a_src, b.source AS b_src
  FROM rows_ a JOIN rows_ b ON b.year = a.year AND b.date = a.date AND b.amount = a.amount AND b.id > a.id AND b.source <> a.source
) d
GROUP BY d.year
UNION ALL
SELECT year, 'equity rollforward vs cash', 1::bigint, 'diff ' || equity_vs_cash_diff
FROM v_equity_rollforward WHERE ABS(equity_vs_cash_diff) >= 0.01
ORDER BY 1, 2;

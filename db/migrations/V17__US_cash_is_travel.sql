-- V17__US_cash_is_travel.sql
-- Owner (2026-10-19): cash taken out in the US was travel expense. Applies to
-- US-located ATM / shared-branch withdrawals on the business account that are
-- either unexplained (defaulted to distribution) or coded with the placeholder
-- category "Fees". Rows the owner coded deliberately (Parking, Project
-- Supplies, Home Improvement, Move to AUS), rows flagged personal, and
-- Australian withdrawals are left alone.
WITH us_cash AS (
  SELECT e.id
  FROM expense e
  JOIN bank_transaction bt ON bt.id = e.bank_transaction_id
  JOIN account a ON a.name = e.source AND a.owner = 'business'
  LEFT JOIN expense_category c ON c.id = e.accepted_category_id
  WHERE e.deleted_at IS NULL
    AND bt.description ~* 'at ATM|Shared Branch|Cash Withdrawal'
    AND bt.description !~* ' AU |AUS|KEW|HAWTHORN|ELWOOD|RINGWOOD|WESTPAC|ANZ BANK|MELBOURNE|SYDNEY'
    AND ((e.kind = 'distribution') OR (e.kind = 'expense' AND c.name = 'Fees'))
)
UPDATE expense e SET kind = 'expense', kind_set_by = 'user',
  accepted_category_id = (SELECT id FROM expense_category WHERE name = 'Travel' AND deleted_at IS NULL),
  accepted_at = NOW()
FROM us_cash WHERE e.id = us_cash.id;

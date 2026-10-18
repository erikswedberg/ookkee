-- V13__Books_return_compare_and_fx.sql
-- 1. FX: replace the 2025 placeholders with the IRS yearly averages.
-- 2. tax_return_line: numbers from previously prepared returns, so the books
--    can be laid side by side with what was (or was about to be) filed.
-- 3. v_return_compare: books vs return per year for the lines a CPA checks.

UPDATE fx_rate SET per_usd = 1.551, source = 'IRS yearly average' WHERE currency = 'AUD' AND year = 2025;
UPDATE fx_rate SET per_usd = 0.886, source = 'IRS yearly average' WHERE currency = 'EUR' AND year = 2025;

CREATE TABLE tax_return_line (
  id          BIGSERIAL PRIMARY KEY,
  year        INTEGER NOT NULL,
  form        TEXT    NOT NULL,            -- '1120-S'
  line        TEXT    NOT NULL,            -- '1a', '7', '8', '11', '20/21', '21/22'
  label       TEXT    NOT NULL,
  amount      NUMERIC(14,2),
  source      TEXT,                        -- which document / version
  UNIQUE (year, form, line, source)
);

-- Values read from the 1120-S PDFs prepared by the prior preparer (July 2026
-- drafts, not filed). 2020 exists in two versions; both kept.
INSERT INTO tax_return_line (year, form, line, label, amount, source) VALUES
  (2020,'1120-S','1a','Gross receipts',           241642, '1120 for 2020.pdf'),
  (2020,'1120-S','7', 'Compensation of officers', NULL,   '1120 for 2020.pdf'),
  (2020,'1120-S','8', 'Salaries and wages',       12639,  '1120 for 2020.pdf'),
  (2020,'1120-S','11','Rents',                    32724,  '1120 for 2020.pdf'),
  (2020,'1120-S','20/21','Total deductions',      260218, '1120 for 2020.pdf'),
  (2020,'1120-S','21/22','Ordinary business income (loss)', -18576, '1120 for 2020.pdf'),
  (2020,'1120-S','11','Rents',                    31082,  '2021 return, prior-year column'),
  (2020,'1120-S','20/21','Total deductions',      214959, '2021 return, prior-year column'),
  (2020,'1120-S','21/22','Ordinary business income (loss)', 26683, '2021 return, prior-year column'),
  (2021,'1120-S','1a','Gross receipts',           402888, '1120 S for 2021.pdf'),
  (2021,'1120-S','7', 'Compensation of officers', NULL,   '1120 S for 2021.pdf'),
  (2021,'1120-S','8', 'Salaries and wages',       158158, '1120 S for 2021.pdf'),
  (2021,'1120-S','11','Rents',                    41517,  '1120 S for 2021.pdf'),
  (2021,'1120-S','12','Taxes and licenses',       12667,  '1120 S for 2021.pdf'),
  (2021,'1120-S','20/21','Total deductions',      332036, '1120 S for 2021.pdf'),
  (2021,'1120-S','21/22','Ordinary business income (loss)', 70852, '1120 S for 2021.pdf'),
  (2022,'1120-S','1a','Gross receipts',           82000,  '1120 S for 2022.pdf'),
  (2022,'1120-S','7', 'Compensation of officers', NULL,   '1120 S for 2022.pdf'),
  (2022,'1120-S','8', 'Salaries and wages',       2000,   '1120 S for 2022.pdf'),
  (2022,'1120-S','11','Rents',                    8023,   '1120 S for 2022.pdf'),
  (2022,'1120-S','12','Taxes and licenses',       219,    '1120 S for 2022.pdf'),
  (2022,'1120-S','20/21','Total deductions',      110269, '1120 S for 2022.pdf'),
  (2022,'1120-S','21/22','Ordinary business income (loss)', -28269, '1120 S for 2022.pdf'),
  (2023,'1120-S','1a','Gross receipts',           105095, '1120 S for 2023 _2_.pdf'),
  (2023,'1120-S','7', 'Compensation of officers', NULL,   '1120 S for 2023 _2_.pdf'),
  (2023,'1120-S','8', 'Salaries and wages',       NULL,   '1120 S for 2023 _2_.pdf'),
  (2023,'1120-S','11','Rents',                    19948,  '1120 S for 2023 _2_.pdf'),
  (2023,'1120-S','20/21','Total deductions',      90331,  '1120 S for 2023 _2_.pdf'),
  (2023,'1120-S','21/22','Ordinary business income (loss)', 105095-90331, '1120 S for 2023 _2_.pdf'),
  (2024,'1120-S','1a','Gross receipts',           167749, '1120 S - 2024.pdf'),
  (2024,'1120-S','7', 'Compensation of officers', NULL,   '1120 S - 2024.pdf'),
  (2024,'1120-S','8', 'Salaries and wages',       NULL,   '1120 S - 2024.pdf'),
  (2024,'1120-S','11','Rents',                    29691,  '1120 S - 2024.pdf'),
  (2024,'1120-S','20/21','Total deductions',      184372, '1120 S - 2024.pdf'),
  (2024,'1120-S','21/22','Ordinary business income (loss)', 167749-184372, '1120 S - 2024.pdf'),
  (2025,'1120-S','1a','Gross receipts',           110500, '1120 S - 2025 _revised 7.13.26_.pdf'),
  (2025,'1120-S','7', 'Compensation of officers', NULL,   '1120 S - 2025 _revised 7.13.26_.pdf'),
  (2025,'1120-S','8', 'Salaries and wages',       NULL,   '1120 S - 2025 _revised 7.13.26_.pdf'),
  (2025,'1120-S','11','Rents',                    28976,  '1120 S - 2025 _revised 7.13.26_.pdf'),
  (2025,'1120-S','20/21','Total deductions',      81633,  '1120 S - 2025 _revised 7.13.26_.pdf'),
  (2025,'1120-S','21/22','Ordinary business income (loss)', 110500-81633, '1120 S - 2025 _revised 7.13.26_.pdf');

-- Books-side equivalents of the return lines. Payroll on the books is cash
-- (Gusto NET + TAX = gross wages + employer taxes); the W-2 split belongs to
-- the preparer. "Rents" here = the categories a preparer would put on line 11.
CREATE VIEW v_return_compare AS
WITH books AS (
  SELECT year, '1a' AS line, 'Gross receipts' AS label, income AS books_amount FROM v_pl_summary
  UNION ALL
  SELECT year, '7+8', 'Wages (books: Gusto NET+TAX cash)', payroll FROM v_pl_summary
  UNION ALL
  SELECT year, '11', 'Rents (books: Rent/Mortgage + Studio Rent + Storage)',
         COALESCE(SUM(amount_usd) FILTER (WHERE section = 'Expenses' AND line IN ('Rent/Mortgage','Studio Rent','Storage')), 0)
  FROM v_pl GROUP BY year
  UNION ALL
  SELECT year, '20/21', 'Total deductions', expenses + payroll + contract_labor FROM v_pl_summary
  UNION ALL
  SELECT year, '21/22', 'Ordinary business income (loss)', net_income FROM v_pl_summary
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

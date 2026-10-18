-- V11__Books_ledger.sql
-- Books: turn the categorized expense rows into a ledger that can produce
-- P&L, contributions/distributions, an equity rollforward and a balance sheet.
--
-- Design (see DEAR_LLM.md, Phase 10):
--   * account            one row per expense.source; owner business|personal
--   * expense.kind       what a row IS for the books (expense, personal,
--                        payroll, contractor, income, contribution,
--                        distribution, transfer, refund). is_personal stays
--                        the UI toggle; a trigger keeps the two in sync.
--   * expense.currency   per-row currency (was buried in raw_data)
--   * statement_period   opening/closing balance per account per statement
--   * bank_transaction   raw statement rows (immutable), linked 1:1 to an
--                        expense row via expense.bank_transaction_id
--   * invoice / invoice_payment   Harvest invoices and which deposit(s) paid them
--   * fx_rate            yearly average rates for non-USD rows
--   * books_close        frozen snapshot of a year's report pack
--
-- Amount conventions:
--   expense.amount           positive = money OUT (app convention, unchanged).
--                            Deposits imported as expense rows are NEGATIVE.
--   bank_transaction.amount  signed as printed on the statement:
--                            positive = deposit, negative = withdrawal.
--   => for linked rows, expense.amount = -bank_transaction.amount

-- ---------------------------------------------------------------- account
CREATE TABLE account (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT        NOT NULL UNIQUE,          -- matches expense.source
  owner         TEXT        NOT NULL CHECK (owner IN ('business','personal')),
  kind          TEXT        NOT NULL DEFAULT 'other'
                            CHECK (kind IN ('checking','savings','credit_card','other')),
  currency      TEXT        NOT NULL DEFAULT 'USD',
  institution   TEXT,
  in_books      BOOLEAN     NOT NULL DEFAULT TRUE,     -- FALSE => ignored by all book views
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO account (name, owner, kind, currency, institution, in_books, note) VALUES
  ('UFCU business',          'business', 'checking',    'USD', 'UFCU',           TRUE,  'R. Erik Swedberg Consulting, Inc. operating account (share 0080)'),
  ('GSB business',           'business', 'checking',    'AUD', 'GSB',            FALSE, 'Australian entity; out of scope for US books'),
  ('GSB checking',           'personal', 'checking',    'AUD', 'GSB',            FALSE, 'Australian personal; out of scope for US books'),
  ('UFCU checking',          'personal', 'checking',    'USD', 'UFCU',           TRUE,  NULL),
  ('UFCU CC',                'personal', 'credit_card', 'USD', 'UFCU',           TRUE,  NULL),
  ('usaa',                   'personal', 'other',       'USD', 'USAA',           TRUE,  NULL),
  ('barclaycard',            'personal', 'credit_card', 'USD', 'Barclays',       TRUE,  NULL),
  ('paypal credit',          'personal', 'credit_card', 'USD', 'PayPal',         TRUE,  NULL),
  ('paypalcredit_2020.pdf',  'personal', 'credit_card', 'USD', 'PayPal',         TRUE,  'same account as "paypal credit"; source name kept as uploaded'),
  ('paypal',                 'personal', 'other',       'USD', 'PayPal',         TRUE,  'rows carry their own currency (USD/AUD/EUR)'),
  ('apple',                  'personal', 'credit_card', 'USD', 'Apple Card',     TRUE,  NULL),
  ('anz',                    'personal', 'checking',    'AUD', 'ANZ',            TRUE,  'AUD; converted via fx_rate'),
  ('redwood',                'personal', 'checking',    'USD', 'Redwood CU',     TRUE,  NULL);

-- Any source we did not anticipate becomes a personal account so nothing is
-- silently dropped; the owner can fix it in the account table.
INSERT INTO account (name, owner, kind, note)
SELECT DISTINCT e.source, 'personal', 'other', 'auto-created by V11; verify owner'
FROM expense e
WHERE e.source IS NOT NULL AND e.source <> ''
  AND NOT EXISTS (SELECT 1 FROM account a WHERE a.name = e.source);

-- ------------------------------------------------------ statement_period
CREATE TABLE statement_period (
  id               BIGSERIAL PRIMARY KEY,
  account_id       BIGINT        NOT NULL REFERENCES account(id),
  period_start     DATE          NOT NULL,
  period_end       DATE          NOT NULL,
  opening_balance  NUMERIC(14,2) NOT NULL,
  closing_balance  NUMERIC(14,2) NOT NULL,
  source_file      TEXT,
  imported_at      TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE (account_id, period_start)
);

-- ------------------------------------------------------ bank_transaction
CREATE TABLE bank_transaction (
  id                   BIGSERIAL PRIMARY KEY,
  account_id           BIGINT        NOT NULL REFERENCES account(id),
  statement_period_id  BIGINT        REFERENCES statement_period(id) ON DELETE CASCADE,
  seq                  INTEGER       NOT NULL,      -- order within the statement
  posted_date          DATE          NOT NULL,
  effective_date       DATE,
  txn_type             TEXT,                        -- Withdrawal | Deposit | ...
  description          TEXT          NOT NULL,
  amount               NUMERIC(14,2) NOT NULL,      -- + deposit / - withdrawal
  balance_after        NUMERIC(14,2),
  fingerprint          TEXT          NOT NULL UNIQUE, -- idempotent re-import
  rule_kind            TEXT,                        -- kind the description rules propose (set at link time)
  rule_category        TEXT,                        -- category the rules propose, if any
  rule_specific        BOOLEAN       NOT NULL DEFAULT FALSE, -- TRUE when a named rule matched (not the fallback)
  created_at           TIMESTAMPTZ   DEFAULT NOW()
);
CREATE INDEX idx_bank_txn_account_date ON bank_transaction (account_id, posted_date);
CREATE INDEX idx_bank_txn_period       ON bank_transaction (statement_period_id);

-- ---------------------------------------------------------- expense.kind
ALTER TABLE expense
  ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense'
    CHECK (kind IN ('expense','personal','payroll','contractor',
                    'income','contribution','distribution','transfer','refund')),
  ADD COLUMN kind_set_by TEXT,                        -- 'backfill' | 'rule' | 'match' | 'user'
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN bank_transaction_id BIGINT UNIQUE REFERENCES bank_transaction(id) ON DELETE SET NULL;

CREATE INDEX idx_expense_kind ON expense (project_id, kind);

-- currency: lift out of raw_data; blank/absent means USD.
UPDATE expense
SET currency = UPPER(raw_data->>'currency')
WHERE COALESCE(raw_data->>'currency','') <> '';

-- kind backfill, in order of specificity. Every rule records why.
-- 1. personal flag
UPDATE expense SET kind = 'personal', kind_set_by = 'backfill'
WHERE is_personal = TRUE;

-- 2. Gusto payroll runs (W-2 wages + taxes). Gusto's own fee rows stay 'expense'
--    where the CSV text says so; where the CSV text is just "ACH GUSTO" the fee
--    rows are corrected after statement linking from the bank memo (TYPE: FEE).
UPDATE expense e SET kind = 'payroll', kind_set_by = 'backfill'
FROM expense_category c
WHERE c.id = e.accepted_category_id AND c.name = 'Payroll'
  AND e.is_personal = FALSE
  AND e.description ~* 'gusto'
  AND e.description !~* 'TYPE\s*:\s*FEE';

-- 3. Contract labor: pre-Gusto invoice payments to T. Hayes (2020-21) and
--    QuickBooks contractor payments (2025).
UPDATE expense e SET kind = 'contractor', kind_set_by = 'backfill'
FROM expense_category c
WHERE c.id = e.accepted_category_id AND c.name = 'Payroll'
  AND e.is_personal = FALSE
  AND (e.description ~* 'HAYES' OR e.description ~* 'Contractor');

-- 4. Business account -> owner/spouse: distributions.
UPDATE expense e SET kind = 'distribution', kind_set_by = 'backfill',
  raw_data = CASE WHEN e.accepted_category_id IS NULL THEN e.raw_data
                  ELSE e.raw_data || jsonb_build_object('prior_category', (SELECT name FROM expense_category c WHERE c.id = e.accepted_category_id)) END,
  accepted_category_id = NULL, accepted_at = NULL
FROM account a
WHERE a.name = e.source AND a.owner = 'business'
  AND e.description ~* '(Transfer.*To\s+SWEDBERG|Transfer.*To\s+CASTLE)';

-- 5. Business share-to-share housekeeping (savings <-> checking): transfer.
UPDATE expense e SET kind = 'transfer', kind_set_by = 'backfill',
  raw_data = CASE WHEN e.accepted_category_id IS NULL THEN e.raw_data
                  ELSE e.raw_data || jsonb_build_object('prior_category', (SELECT name FROM expense_category c WHERE c.id = e.accepted_category_id)) END,
  accepted_category_id = NULL, accepted_at = NULL
FROM account a
WHERE a.name = e.source AND a.owner = 'business'
  AND e.description ~* 'Neg Share Xfer';

-- 6. Personal account -> owner's other account: transfer (the business side
--    of the same movement, if any, shows up as a deposit on the statement).
UPDATE expense e SET kind = 'transfer', kind_set_by = 'backfill',
  raw_data = CASE WHEN e.accepted_category_id IS NULL THEN e.raw_data
                  ELSE e.raw_data || jsonb_build_object('prior_category', (SELECT name FROM expense_category c WHERE c.id = e.accepted_category_id)) END,
  accepted_category_id = NULL, accepted_at = NULL
FROM account a
WHERE a.name = e.source AND a.owner = 'personal'
  AND e.is_personal = FALSE
  AND e.description ~* 'Transfer\s+To\s+R\.?\s*ERIK\s+SWEDBERG';

-- 8. Credits in the uploaded CSVs (negative amounts) on business-kind rows are
--    refunds of expenses. Personal rows keep their sign as-is.
UPDATE expense SET kind = 'refund', kind_set_by = 'backfill'
WHERE kind = 'expense' AND amount < 0;

-- 9. Junk rows from statement-to-CSV conversion with no amount ("Ending
--    Balance" captions, header fragments) contribute nothing; retire them so
--    the books do not have to keep explaining them.
UPDATE expense SET deleted_at = NOW(), raw_data = raw_data || '{"deleted_by": "V11: no amount"}'::jsonb
WHERE deleted_at IS NULL AND amount IS NULL;

-- 7. Personal account -> spouse: personal, not a business contribution.
UPDATE expense e SET kind = 'personal', is_personal = TRUE, kind_set_by = 'backfill'
FROM account a
WHERE a.name = e.source AND a.owner = 'personal'
  AND e.description ~* 'Transfer.*To\s+CASTLE,\s*WENDY';

-- Keep is_personal and kind consistent from here on, whoever writes.
--   * kind='personal' <=> is_personal.
--   * Flagging a row personal is allowed for money-out kinds (expense, payroll,
--     contractor, distribution): it becomes 'personal'. For deposit-side and
--     transfer kinds it is an error, so the UI gets feedback instead of a
--     silent no-op.
--   * Un-flagging a personal row makes it 'expense'; the statement-rule check
--     in v_books_checks flags it if the bank memo says otherwise.
--   * If both columns change in one statement, kind wins.
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
      IF NEW.kind IN ('expense','payroll','contractor','distribution') THEN
        NEW.kind := 'personal';
      ELSE
        RAISE EXCEPTION 'a % row cannot be marked personal', NEW.kind;
      END IF;
    ELSIF NEW.kind = 'personal' THEN
      NEW.kind := 'expense';
    END IF;
    -- A person flipped it: the statement-rule refine step must not undo it.
    NEW.kind_set_by := 'user';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_expense_sync_kind
BEFORE INSERT OR UPDATE OF is_personal, kind ON expense
FOR EACH ROW EXECUTE FUNCTION expense_sync_kind();

-- ---------------------------------------------------------------- invoice
CREATE TABLE invoice (
  id             BIGSERIAL PRIMARY KEY,
  invoice_number TEXT          NOT NULL UNIQUE,
  client         TEXT          NOT NULL,
  description    TEXT,
  issue_date     DATE          NOT NULL,
  paid_date      DATE,
  amount         NUMERIC(14,2) NOT NULL,
  currency       TEXT          NOT NULL DEFAULT 'USD',
  source         TEXT          NOT NULL DEFAULT 'harvest',
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);

-- Which deposit row(s) paid an invoice. One deposit can settle several
-- invoices and (rarely) one invoice can arrive in pieces.
CREATE TABLE invoice_payment (
  invoice_id  BIGINT        NOT NULL REFERENCES invoice(id) ON DELETE CASCADE,
  expense_id  BIGINT        NOT NULL REFERENCES expense(id) ON DELETE CASCADE,
  amount      NUMERIC(14,2) NOT NULL,
  PRIMARY KEY (invoice_id, expense_id)
);
CREATE INDEX idx_invoice_payment_expense ON invoice_payment (expense_id);

-- ---------------------------------------------------------------- fx_rate
-- Yearly average, units of foreign currency per 1 USD (IRS convention).
CREATE TABLE fx_rate (
  currency      TEXT    NOT NULL,
  year          INTEGER NOT NULL,
  per_usd       NUMERIC(12,6) NOT NULL,
  source        TEXT,
  PRIMARY KEY (currency, year)
);
INSERT INTO fx_rate (currency, year, per_usd, source) VALUES
  ('USD', 2020, 1, 'identity'), ('USD', 2021, 1, 'identity'), ('USD', 2022, 1, 'identity'),
  ('USD', 2023, 1, 'identity'), ('USD', 2024, 1, 'identity'), ('USD', 2025, 1, 'identity'),
  ('AUD', 2020, 1.452, 'IRS yearly average'),
  ('AUD', 2021, 1.332, 'IRS yearly average'),
  ('AUD', 2022, 1.442, 'IRS yearly average'),
  ('AUD', 2023, 1.506, 'IRS yearly average'),
  ('AUD', 2024, 1.516, 'IRS yearly average'),
  ('AUD', 2025, 1.550, 'PLACEHOLDER - replace with IRS 2025 yearly average'),
  ('EUR', 2023, 0.924, 'IRS yearly average'),
  ('EUR', 2024, 0.924, 'IRS yearly average'),
  ('EUR', 2025, 0.900, 'PLACEHOLDER');

-- ------------------------------------------------------------ books_close
CREATE TABLE books_close (
  year          INTEGER     PRIMARY KEY,
  closed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  snapshot      JSONB       NOT NULL,
  content_hash  TEXT        NOT NULL,
  note          TEXT
);

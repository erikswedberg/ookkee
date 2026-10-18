package books

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// shareAccounts maps a UFCU share number to the account name in the account
// table. Shares not listed here are skipped with a warning.
var shareAccounts = map[string]string{
	"0080": "UFCU business",
	"0000": "UFCU business savings",
}

// ImportResult summarises one statement import.
type ImportResult struct {
	SourceFile string
	Periods    []PeriodResult
}

// PeriodResult is one share's import outcome.
type PeriodResult struct {
	Account     string
	PeriodStart string
	PeriodEnd   string
	Opening     float64
	Closing     float64
	Inserted    int
	Unchanged   int
	Removed     int
	Warnings    []string
}

func fingerprint(account string, st *Statement, t Txn) string {
	h := sha1.New()
	fmt.Fprintf(h, "%s|%s|%d|%s|%.2f|%s", account, st.PeriodStart.Format("2006-01-02"), t.Seq,
		t.PostedDate.Format("2006-01-02"), t.Amount, t.Description)
	return hex.EncodeToString(h.Sum(nil))
}

// ensureAccount returns the account id, creating the savings share on first
// sight (the checking account is seeded by V11).
func ensureAccount(ctx context.Context, tx pgx.Tx, name string) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `SELECT id FROM account WHERE name = $1`, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	if err != pgx.ErrNoRows {
		return 0, err
	}
	kind := "checking"
	if strings.Contains(strings.ToLower(name), "savings") {
		kind = "savings"
	}
	err = tx.QueryRow(ctx, `INSERT INTO account (name, owner, kind, currency, institution, in_books, note)
		VALUES ($1, 'business', $2, 'USD', 'UFCU', TRUE, 'created by statement import') RETURNING id`, name, kind).Scan(&id)
	return id, err
}

// ImportStatement loads a parsed statement into statement_period and
// bank_transaction. Re-importing the same statement is a no-op; re-importing
// a statement whose parse changed replaces the rows that differ (links from
// expense rows to removed bank rows are nulled by the FK and must be re-run).
func ImportStatement(ctx context.Context, pool *pgxpool.Pool, st *Statement) (*ImportResult, error) {
	res := &ImportResult{SourceFile: st.SourceFile}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	for _, sh := range st.Shares {
		accName, ok := shareAccounts[sh.Number]
		if !ok {
			res.Periods = append(res.Periods, PeriodResult{Account: sh.Name + " (" + sh.Number + ")", Warnings: []string{"share not mapped to an account; skipped"}})
			continue
		}
		accID, err := ensureAccount(ctx, tx, accName)
		if err != nil {
			return nil, err
		}
		pr := PeriodResult{Account: accName, PeriodStart: st.PeriodStart.Format("2006-01-02"), PeriodEnd: st.PeriodEnd.Format("2006-01-02"),
			Opening: sh.OpeningBalance, Closing: sh.ClosingBalance, Warnings: sh.Warnings}

		var periodID int64
		err = tx.QueryRow(ctx, `
			INSERT INTO statement_period (account_id, period_start, period_end, opening_balance, closing_balance, source_file)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (account_id, period_start) DO UPDATE SET
			  period_end = EXCLUDED.period_end, opening_balance = EXCLUDED.opening_balance,
			  closing_balance = EXCLUDED.closing_balance, source_file = EXCLUDED.source_file, imported_at = NOW()
			RETURNING id`,
			accID, st.PeriodStart, st.PeriodEnd, sh.OpeningBalance, sh.ClosingBalance, filepath.Base(st.SourceFile)).Scan(&periodID)
		if err != nil {
			return nil, fmt.Errorf("statement_period: %w", err)
		}

		fps := make([]string, 0, len(sh.Transactions))
		for _, t := range sh.Transactions {
			fp := fingerprint(accName, st, t)
			fps = append(fps, fp)
			tag, err := tx.Exec(ctx, `
				INSERT INTO bank_transaction (account_id, statement_period_id, seq, posted_date, effective_date, txn_type, description, amount, balance_after, fingerprint)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
				ON CONFLICT (fingerprint) DO NOTHING`,
				accID, periodID, t.Seq, t.PostedDate, t.EffectiveDate, t.Type, t.Description, t.Amount, t.BalanceAfter, fp)
			if err != nil {
				return nil, fmt.Errorf("bank_transaction seq %d: %w", t.Seq, err)
			}
			if tag.RowsAffected() == 1 {
				pr.Inserted++
			} else {
				pr.Unchanged++
			}
		}
		// Drop rows from an earlier parse of this period that no longer exist.
		tag, err := tx.Exec(ctx, `DELETE FROM bank_transaction WHERE statement_period_id = $1 AND NOT (fingerprint = ANY($2))`, periodID, fps)
		if err != nil {
			return nil, err
		}
		pr.Removed = int(tag.RowsAffected())
		res.Periods = append(res.Periods, pr)
	}
	return res, tx.Commit(ctx)
}

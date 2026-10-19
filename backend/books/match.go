package books

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// LinkResult summarises one account's matching pass.
type LinkResult struct {
	Account         string
	Linked          int // bank rows linked to an existing live expense row
	LinkedDeleted   int // bank rows linked to a soft-deleted row (row restored)
	Created         int // bank rows with no expense row: one was created
	CreatedByKind   map[string]int
	Refined         int // machine-set kinds corrected from the bank memo
	OrphanExpenses  []Orphan // live expense rows on this account with no bank row
}

// Orphan is an expense row that claims to be on a bank account but has no
// statement line behind it.
type Orphan struct {
	ExpenseID   int64
	ProjectName string
	Date        *time.Time
	Description string
	Amount      *float64
}

// candidateSources lists which expense.source values may hold rows for an
// account. The uploaded CSVs lumped both UFCU shares under "UFCU business".
var candidateSources = map[string][]string{
	"UFCU business savings": {"UFCU business savings", "UFCU business"},
}

func sourcesFor(account string) []string {
	if s, ok := candidateSources[account]; ok {
		return s
	}
	return []string{account}
}

type bankRow struct {
	ID       int64
	Posted   time.Time
	Desc     string
	Amount   float64
	Year     int
	PeriodID int64
}

type expRow struct {
	ID        int64
	ProjectID int64
	Date      *time.Time
	Desc      string
	Amount    *float64
	Deleted   bool
	Kind      string
	RowIndex  int
}

// Kind rules for statement lines, in priority order. First match wins.
// Deposits (amount > 0) and withdrawals (amount < 0) have separate lists.
type kindRule struct {
	re       *regexp.Regexp
	kind     string
	category string // optional category name to assign
}

var depositRules = []kindRule{
	{regexp.MustCompile(`(?i)Adjustment|Credit Voucher|ACCTVERIFY|TYPE:\s*(INV|BBV|EBV|BVC)\b|Fee Refund|Reversal|Return`), "refund", ""},
	// Owner money arriving: share transfers, P2P from the owner's personal
	// account, cash/branch deposits, and wires with no client name.
	{regexp.MustCompile(`(?i)From SWEDBERG|From R\.? ERIK|From CASTLE|RANDALL E SWED|SWEDBERG.*P2P|TYPE:\s*P2P|Shared Branch|at ATM|Mobile Deposit|Cash Deposit|Domestic Wire In|Wire Transfer`), "contribution", ""},
	{regexp.MustCompile(`(?i)From Share 0000|Neg Share Xfer|Share Transfer`), "transfer", ""},
	{regexp.MustCompile(`(?i)Dividend`), "income", ""},
	// Anything else arriving in the business account is presumed client
	// revenue; invoice matching confirms it, and unmatched ones are reported.
	{regexp.MustCompile(`.`), "income", ""},
}

var withdrawalRules = []kindRule{
	// Insurance premiums paid by bill-pay mention the insurer (USAA...) and
	// would otherwise look like a personal-account payment below.
	{regexp.MustCompile(`(?i)INSURANCE`), "expense", ""},
	{regexp.MustCompile(`(?i)GUSTO[\s\S]*TYPE:\s*(NET|TAX)\b`), "payroll", "Payroll"},
	{regexp.MustCompile(`(?i)GUSTO[\s\S]*TYPE:\s*(FEE|BBV|EBV|BVC|INV)\b`), "expense", "Fees"}, // fees and penny verifications
	{regexp.MustCompile(`(?i)HAYES|Contractor|ACH PAYROLL[\s\S]*CO:\s*PAYROLL`), "contractor", "Payroll"},
	{regexp.MustCompile(`(?i)To SWEDBERG|TO SWEDBERG|To CASTLE|To R\.? ERIK|ALLY BANK|PAYPAL \*Swedberg|Swedberg Erik|at ATM|Shared Branch|Cash Withdrawal|Domestic Wire Out`), "distribution", ""},
	// A bare "Internet Banking Transfer" out of the business account with no
	// printed counterparty is a share-to-share move to the owner.
	{regexp.MustCompile(`(?i)^Internet Banking Transfer\s*$`), "distribution", ""},
	// Paying a personal card or loan from the business account returns the
	// owner's capital: a distribution, not an expense and not a transfer.
	{regexp.MustCompile(`(?i)BARCLAY|PAYPAL\s*\*?\s*CREDIT|PAYPAL CREDIT|APPLE ?CARD|APPLECARD|USAA|CAPITAL ONE|CAPITALONE|AMEX|AMERICAN EXPRESS|CHASE CARD|CARDMEMBER|SYNCHRONY|DISCOVER|CITI ?CARD|CREDIT CARD|CRDTCARD|CC PAYMENT|Loan Payment|REDWOOD CREDIT`), "distribution", ""},
	// Nameless share-to-share moves within the business membership.
	{regexp.MustCompile(`(?i)Neg Share Xfer|To Share 0000|From Share|Share Transfer|^(Internet Banking )?Transfer\s+To Share \d{4}\s*$`), "transfer", ""},
	{regexp.MustCompile(`(?i)Overdraft|ATM Fee|Fee Withdrawal|Service Charge|Monthly Fee|Returned Item|FUNDS COLLECTED`), "expense", "Fees"},
	{regexp.MustCompile(`.`), "expense", ""},
}

// classify applies the description rules. specific is false when only the
// catch-all rule matched (plain expense / plain income).
func classify(desc string, amount float64) (kind, category string, specific bool) {
	rules := withdrawalRules
	if amount > 0 {
		rules = depositRules
	}
	for i, r := range rules {
		if r.re.MatchString(desc) {
			return r.kind, r.category, i < len(rules)-1
		}
	}
	return "expense", "", false
}

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// normDesc reduces a description to its first few meaningful tokens so the
// bank line "Debit Card Check Card\nHOVER 866-731-6556 MS" and the CSV row
// "HOVER 866-731-6556 MS" compare well.
func normTokens(s string) map[string]bool {
	s = strings.ToLower(s)
	out := map[string]bool{}
	for _, w := range nonAlnum.Split(s, -1) {
		if len(w) >= 3 && w != "debit" && w != "card" && w != "check" && w != "pos" && w != "ach" && w != "withdrawal" && w != "deposit" && w != "recurring" && w != "bill" && w != "payment" {
			out[w] = true
		}
	}
	return out
}

func overlap(a, b map[string]bool) int {
	n := 0
	for k := range a {
		if b[k] {
			n++
		}
	}
	return n
}

func absDays(a, b time.Time) int {
	d := a.Sub(b).Hours() / 24
	if d < 0 {
		d = -d
	}
	return int(d + 0.5)
}

// LinkAccount matches every bank_transaction on the named account to an
// expense row (live first, then soft-deleted which is restored), creates
// expense rows for statement lines nothing explains, and reports expense
// rows that claim the account but have no statement line.
//
// Matching key: same project year, same signed amount (expense.amount =
// -bank.amount), posted date within `window` days; ties broken by description
// token overlap, then by date distance, then by row order.
func LinkAccount(ctx context.Context, pool *pgxpool.Pool, accountName string, window int) (*LinkResult, error) {
	res := &LinkResult{Account: accountName, CreatedByKind: map[string]int{}}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var accID int64
	if err := tx.QueryRow(ctx, `SELECT id FROM account WHERE name = $1`, accountName).Scan(&accID); err != nil {
		return nil, fmt.Errorf("account %q: %w", accountName, err)
	}

	// year -> project id (live projects named by year)
	projects := map[int]int64{}
	rows, err := tx.Query(ctx, `SELECT id, name FROM project WHERE deleted_at IS NULL AND name ~ '^\d{4}$'`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		var y int
		fmt.Sscanf(name, "%d", &y)
		projects[y] = id
	}
	rows.Close()

	categories := map[string]int64{}
	rows, err = tx.Query(ctx, `SELECT id, name FROM expense_category WHERE deleted_at IS NULL`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		categories[name] = id
	}
	rows.Close()

	// Unlinked bank rows, in statement order.
	var banks []bankRow
	rows, err = tx.Query(ctx, `
		SELECT bt.id, bt.posted_date, bt.description, bt.amount, EXTRACT(YEAR FROM bt.posted_date)::int, bt.statement_period_id
		FROM bank_transaction bt
		WHERE bt.account_id = $1
		  AND NOT EXISTS (SELECT 1 FROM expense e WHERE e.bank_transaction_id = bt.id)
		ORDER BY bt.posted_date, bt.statement_period_id, bt.seq`, accID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var b bankRow
		if err := rows.Scan(&b.ID, &b.Posted, &b.Desc, &b.Amount, &b.Year, &b.PeriodID); err != nil {
			return nil, err
		}
		banks = append(banks, b)
	}
	rows.Close()

	// Candidate expense rows on this account, not yet linked, keyed by amount.
	byAmount := map[string][]*expRow{}
	rows, err = tx.Query(ctx, `
		SELECT e.id, e.project_id, e.date, COALESCE(e.description,''), e.amount, e.deleted_at IS NOT NULL, e.kind, e.row_index
		FROM expense e JOIN project p ON p.id = e.project_id
		WHERE e.source = ANY($1) AND p.deleted_at IS NULL AND e.bank_transaction_id IS NULL AND e.amount IS NOT NULL`, sourcesFor(accountName))
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var e expRow
		if err := rows.Scan(&e.ID, &e.ProjectID, &e.Date, &e.Desc, &e.Amount, &e.Deleted, &e.Kind, &e.RowIndex); err != nil {
			return nil, err
		}
		k := fmt.Sprintf("%d|%.2f", e.ProjectID, *e.Amount)
		byAmount[k] = append(byAmount[k], &e)
	}
	rows.Close()

	used := map[int64]bool{}
	for _, b := range banks {
		projID, ok := projects[b.Year]
		if !ok {
			return nil, fmt.Errorf("no project for year %d (bank row %d)", b.Year, b.ID)
		}
		key := fmt.Sprintf("%d|%.2f", projID, -b.Amount)
		var best *expRow
		bestScore := -1
		btoks := normTokens(b.Desc)
		for _, e := range byAmount[key] {
			if used[e.ID] || e.Date == nil {
				continue
			}
			dd := absDays(*e.Date, b.Posted)
			if dd > window {
				continue
			}
			// live rows beat deleted; then description overlap; then nearer date
			score := 1000*overlap(btoks, normTokens(e.Desc)) + (window - dd)
			if !e.Deleted {
				score += 100000
			}
			if score > bestScore {
				best, bestScore = e, score
			}
		}
		if best != nil {
			used[best.ID] = true
			if best.Deleted {
				// The user removed this row (as a transfer/distribution/double
				// count). Restore it under its ledger kind so it is explained.
				kind, _, _ := classify(b.Desc, b.Amount)
				if kind == "expense" {
					// No rule explains it. The owner removed this line from
					// the expenses, so for the books the cash left the
					// business for the owner's benefit: a distribution.
					kind = "distribution"
				}
				// A ledger-kind row must not carry a P&L category (it would
				// look like an expense in disguise); remember it in raw_data.
				if _, err := tx.Exec(ctx, `
					UPDATE expense e SET bank_transaction_id = $1, deleted_at = NULL, kind = $2, kind_set_by = 'match', source = $4,
					  raw_data = CASE WHEN e.accepted_category_id IS NULL THEN e.raw_data
					                  ELSE e.raw_data || jsonb_build_object('prior_category', (SELECT name FROM expense_category c WHERE c.id = e.accepted_category_id)) END,
					  accepted_category_id = NULL, accepted_at = NULL
					WHERE id = $3`, b.ID, kind, best.ID, accountName); err != nil {
					return nil, err
				}
				res.LinkedDeleted++
			} else {
				if _, err := tx.Exec(ctx, `UPDATE expense SET bank_transaction_id = $1, source = $3 WHERE id = $2`, b.ID, best.ID, accountName); err != nil {
					return nil, err
				}
				res.Linked++
			}
			continue
		}

		// Nothing explains this statement line: create the expense row.
		kind, catName, _ := classify(b.Desc, b.Amount)
		var catID *int64
		if id, ok := categories[catName]; ok && catName != "" {
			catID = &id
		}
		raw, _ := json.Marshal(map[string]string{
			"source": accountName, "date": b.Posted.Format("2006-01-02"),
			"description": b.Desc, "amount": fmt.Sprintf("%.2f", -b.Amount), "currency": "USD",
			"origin": "statement-import",
		})
		var rowIndex int
		if err := tx.QueryRow(ctx, `SELECT COALESCE(MAX(row_index),0)+1 FROM expense WHERE project_id = $1`, projID).Scan(&rowIndex); err != nil {
			return nil, err
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO expense (project_id, row_index, raw_data, source, date_text, date, description, amount,
			                     accepted_category_id, accepted_at, is_personal, kind, kind_set_by, currency, bank_transaction_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9::bigint IS NULL THEN NULL ELSE NOW() END, FALSE, $10, 'rule', 'USD', $11)`,
			projID, rowIndex, raw, accountName, b.Posted.Format("01/02"), b.Posted, b.Desc, -b.Amount, catID, kind, b.ID)
		if err != nil {
			return nil, fmt.Errorf("create expense for bank row %d: %w", b.ID, err)
		}
		res.Created++
		res.CreatedByKind[kind]++
	}

	// Record what the rules say about every line on this account, and correct
	// machine-set kinds that disagree with a named rule. Rows a person decided
	// (kind_set_by = 'user') and rows flagged personal are left alone; the
	// disagreement is surfaced by v_books_checks instead.
	rows, err = tx.Query(ctx, `SELECT id, description, amount FROM bank_transaction WHERE account_id = $1`, accID)
	if err != nil {
		return nil, err
	}
	type verdict struct {
		id       int64
		kind     string
		category string
		specific bool
	}
	var verdicts []verdict
	for rows.Next() {
		var id int64
		var desc string
		var amt float64
		if err := rows.Scan(&id, &desc, &amt); err != nil {
			return nil, err
		}
		k, c, sp := classify(desc, amt)
		verdicts = append(verdicts, verdict{id, k, c, sp})
	}
	rows.Close()
	for _, v := range verdicts {
		if _, err := tx.Exec(ctx, `UPDATE bank_transaction SET rule_kind = $2, rule_category = NULLIF($3,''), rule_specific = $4 WHERE id = $1`, v.id, v.kind, v.category, v.specific); err != nil {
			return nil, err
		}
		if !v.specific {
			continue
		}
		var catID *int64
		if id, ok := categories[v.category]; ok && v.category != "" {
			catID = &id
		}
		tag, err := tx.Exec(ctx, `
			UPDATE expense e SET kind = $2, kind_set_by = 'rule',
			  raw_data = CASE WHEN e.accepted_category_id IS NULL OR $2 IN ('expense','payroll','contractor') THEN e.raw_data
			                  ELSE e.raw_data || jsonb_build_object('prior_category', (SELECT name FROM expense_category c WHERE c.id = e.accepted_category_id)) END,
			  accepted_category_id = CASE WHEN $3::bigint IS NOT NULL THEN $3 WHEN $2 IN ('expense','payroll','contractor') THEN e.accepted_category_id ELSE NULL END
			WHERE bank_transaction_id = $1 AND deleted_at IS NULL
			  AND kind <> $2 AND kind <> 'personal' AND kind_set_by IN ('backfill','rule','match')
			  AND NOT EXISTS (SELECT 1 FROM invoice_payment ip WHERE ip.expense_id = e.id)`, v.id, v.kind, catID)
		if err != nil {
			return nil, err
		}
		res.Refined += int(tag.RowsAffected())
	}

	// Live expense rows on this account that no statement line explains.
	rows, err = tx.Query(ctx, `
		SELECT e.id, p.name, e.date, COALESCE(e.description,''), e.amount
		FROM expense e JOIN project p ON p.id = e.project_id
		WHERE e.source = $1 AND p.deleted_at IS NULL AND e.deleted_at IS NULL AND e.bank_transaction_id IS NULL
		ORDER BY p.name, e.date, e.row_index`, accountName)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var o Orphan
		if err := rows.Scan(&o.ExpenseID, &o.ProjectName, &o.Date, &o.Description, &o.Amount); err != nil {
			return nil, err
		}
		res.OrphanExpenses = append(res.OrphanExpenses, o)
	}
	rows.Close()

	return res, tx.Commit(ctx)
}

// Ensure pgx import is used even if candidate helpers change.
var _ = pgx.ErrNoRows

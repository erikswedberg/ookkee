package books

import (
	"context"
	"encoding/csv"
	"fmt"
	"os"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ImportInvoicesCSV upserts invoices from a CSV with the header
// invoice_id,issue_date,paid_date,client,description,amount,currency.
func ImportInvoicesCSV(ctx context.Context, pool *pgxpool.Pool, path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	r := csv.NewReader(f)
	hdr, err := r.Read()
	if err != nil {
		return 0, err
	}
	col := map[string]int{}
	for i, h := range hdr {
		col[strings.TrimSpace(h)] = i
	}
	for _, need := range []string{"invoice_id", "issue_date", "paid_date", "client", "description", "amount", "currency"} {
		if _, ok := col[need]; !ok {
			return 0, fmt.Errorf("missing column %q", need)
		}
	}
	n := 0
	for {
		rec, err := r.Read()
		if err != nil {
			break
		}
		get := func(k string) string { return strings.TrimSpace(rec[col[k]]) }
		var paid *time.Time
		if p := get("paid_date"); p != "" {
			t, err := time.Parse("2006-01-02", p)
			if err != nil {
				return n, fmt.Errorf("invoice %s paid_date: %w", get("invoice_id"), err)
			}
			paid = &t
		}
		issue, err := time.Parse("2006-01-02", get("issue_date"))
		if err != nil {
			return n, fmt.Errorf("invoice %s issue_date: %w", get("invoice_id"), err)
		}
		amt, err := strconv.ParseFloat(get("amount"), 64)
		if err != nil {
			return n, fmt.Errorf("invoice %s amount: %w", get("invoice_id"), err)
		}
		_, err = pool.Exec(ctx, `
			INSERT INTO invoice (invoice_number, client, description, issue_date, paid_date, amount, currency, source)
			VALUES ($1, $2, $3, $4, $5, $6, $7, 'harvest')
			ON CONFLICT (invoice_number) DO UPDATE SET client = EXCLUDED.client, description = EXCLUDED.description,
			  issue_date = EXCLUDED.issue_date, paid_date = EXCLUDED.paid_date, amount = EXCLUDED.amount, currency = EXCLUDED.currency`,
			get("invoice_id"), get("client"), get("description"), issue, paid, amt, strings.ToUpper(get("currency")))
		if err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}

type openInvoice struct {
	ID     int64
	Number string
	Client string
	Paid   *time.Time
	Amount float64
	Remain float64
}

type depositRow struct {
	ExpenseID int64
	Posted    time.Time
	Desc      string
	Amount    float64 // positive = money in
	Remain    float64
	Kind      string
}

// MatchResult reports the invoice-to-deposit allocation.
type MatchResult struct {
	Allocated         int
	UnmatchedDeposits []depositRow
	UnpaidInvoices    []openInvoice
}

var reInvoiceNo = regexp.MustCompile(`TYPE:\s*(\d{7})\b`)

func clientKey(s string) string {
	s = strings.ToLower(s)
	for _, k := range []string{"clarity", "apple", "farbridge", "metalab", "corvus", "spike"} {
		if strings.Contains(s, k) {
			return k
		}
	}
	return ""
}

// MatchInvoices allocates income deposits (expense rows with kind='income')
// to invoices. Order of preference: invoice number printed in the ACH memo;
// exact single-invoice amount with paid date within the window; a small
// subset of the same client's open invoices summing to the deposit.
func MatchInvoices(ctx context.Context, pool *pgxpool.Pool, windowDays int) (*MatchResult, error) {
	res := &MatchResult{}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var invs []*openInvoice
	rows, err := tx.Query(ctx, `
		SELECT i.id, i.invoice_number, i.client, i.paid_date, i.amount,
		       i.amount - COALESCE((SELECT SUM(amount) FROM invoice_payment ip WHERE ip.invoice_id = i.id), 0)
		FROM invoice i WHERE i.currency = 'USD' ORDER BY i.paid_date NULLS LAST, i.invoice_number`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var o openInvoice
		if err := rows.Scan(&o.ID, &o.Number, &o.Client, &o.Paid, &o.Amount, &o.Remain); err != nil {
			return nil, err
		}
		invs = append(invs, &o)
	}
	rows.Close()
	byNumber := map[string]*openInvoice{}
	for _, o := range invs {
		byNumber[o.Number] = o
	}

	var deps []*depositRow
	rows, err = tx.Query(ctx, `
		SELECT e.id, e.date, COALESCE(bt.description, e.description, ''), -e.amount,
		       -e.amount - COALESCE((SELECT SUM(amount) FROM invoice_payment ip WHERE ip.expense_id = e.id), 0), e.kind
		FROM expense e
		JOIN account a ON a.name = e.source
		LEFT JOIN bank_transaction bt ON bt.id = e.bank_transaction_id
		WHERE e.kind IN ('income','contribution') AND e.deleted_at IS NULL AND a.in_books AND e.currency = 'USD' AND e.amount < 0
		ORDER BY e.date, e.id`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var d depositRow
		if err := rows.Scan(&d.ExpenseID, &d.Posted, &d.Desc, &d.Amount, &d.Remain, &d.Kind); err != nil {
			return nil, err
		}
		deps = append(deps, &d)
	}
	rows.Close()

	allocate := func(d *depositRow, o *openInvoice, amt float64) error {
		if _, err := tx.Exec(ctx, `INSERT INTO invoice_payment (invoice_id, expense_id, amount) VALUES ($1, $2, $3)
			ON CONFLICT (invoice_id, expense_id) DO UPDATE SET amount = invoice_payment.amount + EXCLUDED.amount`, o.ID, d.ExpenseID, amt); err != nil {
			return err
		}
		if d.Kind != "income" {
			// An invoice explains this deposit, so it is client money, not
			// the owner's (e.g. a cash deposit of a client's cheque, an
			// anonymous incoming wire).
			if _, err := tx.Exec(ctx, `UPDATE expense SET kind = 'income', kind_set_by = 'match' WHERE id = $1`, d.ExpenseID); err != nil {
				return err
			}
			d.Kind = "income"
		}
		o.Remain = round2(o.Remain - amt)
		d.Remain = round2(d.Remain - amt)
		res.Allocated++
		return nil
	}
	near := func(o *openInvoice, d *depositRow) bool {
		return o.Paid != nil && absDays(*o.Paid, d.Posted) <= windowDays
	}

	for _, d := range deps {
		if d.Remain <= 0.004 {
			continue
		}
		// 1. invoice number in the memo
		if m := reInvoiceNo.FindStringSubmatch(d.Desc); m != nil {
			if o, ok := byNumber[m[1]]; ok && o.Remain > 0 && round2(o.Remain) == round2(d.Remain) {
				if err := allocate(d, o, o.Remain); err != nil {
					return nil, err
				}
				continue
			}
		}
		// 2. single open invoice, same amount, paid date within window
		ck := clientKey(d.Desc)
		var cands []*openInvoice
		for _, o := range invs {
			if o.Remain > 0.004 && near(o, d) && (ck == "" || clientKey(o.Client) == ck) {
				cands = append(cands, o)
			}
		}
		var single *openInvoice
		for _, o := range cands {
			if round2(o.Remain) == round2(d.Remain) {
				single = o
				break
			}
		}
		if single != nil {
			if err := allocate(d, single, single.Remain); err != nil {
				return nil, err
			}
			continue
		}
		// 3. subset of up to 4 candidates summing to the deposit
		sort.Slice(cands, func(i, j int) bool { return cands[i].Number < cands[j].Number })
		if combo := subsetSum(cands, d.Remain, 4); combo != nil {
			for _, o := range combo {
				if err := allocate(d, o, o.Remain); err != nil {
					return nil, err
				}
			}
			continue
		}
	}
	// 4. Batch: a client paid several invoices in different splits. Per
	//    client, if the unmatched deposits and the open invoices within the
	//    window sum to the same total, allocate in order (waterfall).
	for _, key := range []string{"clarity", "apple", "farbridge", "metalab", "corvus", "spike"} {
		var ds []*depositRow
		var os []*openInvoice
		for _, d := range deps {
			if d.Remain > 0.004 && (clientKey(d.Desc) == key || (clientKey(d.Desc) == "" && d.Kind != "income")) {
				ds = append(ds, d)
			}
		}
		for _, o := range invs {
			if o.Remain > 0.004 && clientKey(o.Client) == key {
				os = append(os, o)
			}
		}
		if len(ds) == 0 || len(os) == 0 {
			continue
		}
		// restrict to deposits/invoices that are near each other in time
		var dsN []*depositRow
		var osN []*openInvoice
		for _, d := range ds {
			for _, o := range os {
				if near(o, d) {
					dsN = appendUniqueD(dsN, d)
					osN = appendUniqueO(osN, o)
				}
			}
		}
		var sd, so float64
		for _, d := range dsN {
			sd += d.Remain
		}
		for _, o := range osN {
			so += o.Remain
		}
		if len(dsN) == 0 || round2(sd) != round2(so) {
			continue
		}
		sort.Slice(dsN, func(i, j int) bool { return dsN[i].Posted.Before(dsN[j].Posted) })
		sort.Slice(osN, func(i, j int) bool { return osN[i].Number < osN[j].Number })
		oi := 0
		for _, d := range dsN {
			for d.Remain > 0.004 && oi < len(osN) {
				amt := d.Remain
				if osN[oi].Remain < amt {
					amt = osN[oi].Remain
				}
				if err := allocate(d, osN[oi], amt); err != nil {
					return nil, err
				}
				if osN[oi].Remain <= 0.004 {
					oi++
				}
			}
		}
	}

	for _, d := range deps {
		if d.Remain > 0.004 {
			res.UnmatchedDeposits = append(res.UnmatchedDeposits, *d)
		}
	}
	for _, o := range invs {
		if o.Remain > 0.004 {
			res.UnpaidInvoices = append(res.UnpaidInvoices, *o)
		}
	}
	return res, tx.Commit(ctx)
}

// subsetSum finds a subset of at most k invoices whose remaining amounts sum
// to target. Small n, so plain recursion.
func subsetSum(cands []*openInvoice, target float64, k int) []*openInvoice {
	var rec func(start int, remain float64, depth int, acc []*openInvoice) []*openInvoice
	rec = func(start int, remain float64, depth int, acc []*openInvoice) []*openInvoice {
		if round2(remain) == 0 && len(acc) > 1 {
			return append([]*openInvoice(nil), acc...)
		}
		if depth == k || remain < -0.004 {
			return nil
		}
		for i := start; i < len(cands); i++ {
			if cands[i].Remain > remain+0.004 {
				continue
			}
			if r := rec(i+1, remain-cands[i].Remain, depth+1, append(acc, cands[i])); r != nil {
				return r
			}
		}
		return nil
	}
	return rec(0, target, 0, nil)
}

func appendUniqueD(xs []*depositRow, x *depositRow) []*depositRow {
	for _, y := range xs {
		if y == x {
			return xs
		}
	}
	return append(xs, x)
}

func appendUniqueO(xs []*openInvoice, x *openInvoice) []*openInvoice {
	for _, y := range xs {
		if y == x {
			return xs
		}
	}
	return append(xs, x)
}

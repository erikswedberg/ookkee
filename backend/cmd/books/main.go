// books: command-line entry points for the bookkeeping layer.
//
//	go run ./cmd/books parse <statement.pdf>...     parse + validate, print summary
package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"ookkee/books"
	"ookkee/database"
)

func getenv(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func connect() {
	url := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable",
		getenv("DB_USER", "postgres"), getenv("DB_PASSWORD", "postgres"),
		getenv("DB_HOST", "localhost"), getenv("DB_PORT", "5432"), getenv("DB_NAME", "ookkee"))
	if err := database.Initialize(url); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: books parse|dump|import-statements <pdf>...")
		os.Exit(2)
	}
	switch os.Args[1] {
	case "parse":
		fails := 0
		for _, p := range os.Args[2:] {
			st, err := books.ParseUFCUFile(p)
			if err != nil {
				fmt.Printf("FAIL %s: %v\n", p, err)
				fails++
				continue
			}
			for _, sh := range st.Shares {
				var w, d float64
				for _, t := range sh.Transactions {
					if t.Amount < 0 {
						w += t.Amount
					} else {
						d += t.Amount
					}
				}
				fmt.Printf("ok %s %s-%s %s(%s) n=%d open=%.2f dep=%.2f wd=%.2f close=%.2f\n",
					st.SourceFile[len(st.SourceFile)-min(28, len(st.SourceFile)):], st.PeriodStart.Format("2006-01-02"), st.PeriodEnd.Format("01-02"),
					sh.Name, sh.Number, len(sh.Transactions), sh.OpeningBalance, d, w, sh.ClosingBalance)
			}
		}
		if fails > 0 {
			os.Exit(1)
		}
	case "import-statements":
		connect()
		defer database.Close()
		ctx := context.Background()
		fails := 0
		for _, p := range os.Args[2:] {
			st, err := books.ParseUFCUFile(p)
			if err != nil {
				fmt.Printf("FAIL parse %s: %v\n", p, err)
				fails++
				continue
			}
			res, err := books.ImportStatement(ctx, database.Pool, st)
			if err != nil {
				fmt.Printf("FAIL import %s: %v\n", p, err)
				fails++
				continue
			}
			for _, pr := range res.Periods {
				fmt.Printf("%s %s..%s %-22s open=%10.2f close=%10.2f ins=%d same=%d rm=%d %s\n",
					"ok", pr.PeriodStart, pr.PeriodEnd, pr.Account, pr.Opening, pr.Closing, pr.Inserted, pr.Unchanged, pr.Removed, strings.Join(pr.Warnings, "; "))
			}
		}
		if fails > 0 {
			os.Exit(1)
		}
	case "link":
		connect()
		defer database.Close()
		acc := "UFCU business"
		if len(os.Args) > 2 {
			acc = os.Args[2]
		}
		res, err := books.LinkAccount(context.Background(), database.Pool, acc, 5)
		if err != nil {
			fmt.Println("FAIL", err)
			os.Exit(1)
		}
		fmt.Printf("%s: linked=%d restored_deleted=%d created=%d by_kind=%v refined=%d orphans=%d\n",
			res.Account, res.Linked, res.LinkedDeleted, res.Created, res.CreatedByKind, res.Refined, len(res.OrphanExpenses))
		for _, o := range res.OrphanExpenses {
			d := ""
			if o.Date != nil {
				d = o.Date.Format("2006-01-02")
			}
			amt := "NULL"
			if o.Amount != nil {
				amt = fmt.Sprintf("%.2f", *o.Amount)
			}
			fmt.Printf("  orphan expense %d %s %s %s %s\n", o.ExpenseID, o.ProjectName, d, amt, strings.ReplaceAll(o.Description, "\n", " | "))
		}
	case "import-invoices":
		connect()
		defer database.Close()
		n, err := books.ImportInvoicesCSV(context.Background(), database.Pool, os.Args[2])
		if err != nil {
			fmt.Println("FAIL", err)
			os.Exit(1)
		}
		fmt.Printf("invoices upserted: %d\n", n)
	case "match-invoices":
		connect()
		defer database.Close()
		res, err := books.MatchInvoices(context.Background(), database.Pool, 60)
		if err != nil {
			fmt.Println("FAIL", err)
			os.Exit(1)
		}
		fmt.Printf("allocations=%d unmatched_deposits=%d unpaid_invoices=%d\n", res.Allocated, len(res.UnmatchedDeposits), len(res.UnpaidInvoices))
		for _, d := range res.UnmatchedDeposits {
			fmt.Printf("  deposit expense=%d %s %10.2f remain=%10.2f %s\n", d.ExpenseID, d.Posted.Format("2006-01-02"), d.Amount, d.Remain, strings.ReplaceAll(d.Desc, "\n", " | "))
		}
		for _, o := range res.UnpaidInvoices {
			p := ""
			if o.Paid != nil {
				p = o.Paid.Format("2006-01-02")
			}
			fmt.Printf("  invoice %s %s %-22s %10.2f remain=%10.2f\n", o.Number, p, o.Client, o.Amount, o.Remain)
		}
	case "dump":
		for _, p := range os.Args[2:] {
			st, err := books.ParseUFCUFile(p)
			if err != nil {
				fmt.Println("FAIL", err)
				os.Exit(1)
			}
			for _, sh := range st.Shares {
				for _, w := range sh.Warnings {
					fmt.Printf("# %s(%s) warning: %s\n", sh.Name, sh.Number, w)
				}
				for _, t := range sh.Transactions {
					eff := ""
					if t.EffectiveDate != nil {
						eff = t.EffectiveDate.Format("01/02")
					}
					fmt.Printf("%s\t%d\t%s\t%s\t%-10s\t%10.2f\t%10.2f\t%s\n", sh.Number, t.Seq, t.PostedDate.Format("2006-01-02"), eff, t.Type, t.Amount, t.BalanceAfter, strings.ReplaceAll(t.Description, "\n", " | "))
				}
			}
		}
	default:
		fmt.Fprintln(os.Stderr, "unknown command", os.Args[1])
		os.Exit(2)
	}
}

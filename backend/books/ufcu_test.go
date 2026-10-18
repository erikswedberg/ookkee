package books_test

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"ookkee/books"
)

const hdr = `
                                                                       XXXXXX8373          01/01/21-01/31/21     1 of 1
R. ERIK SWEDBERG CONSULTING
`

func stmt(body string) string {
	return hdr + "\nBUSINESS CHECKING (0080)\nTRANS EFFECTIVE\nDATE DATE TYPE DESCRIPTION AMOUNT BALANCE\n" + body
}

func dump(t *testing.T, st *books.Statement, err error) {
	if err != nil {
		t.Logf("ERR: %v", err)
		return
	}
	for _, sh := range st.Shares {
		t.Logf("share %s(%s) open=%.2f close=%.2f n=%d warn=%v", sh.Name, sh.Number, sh.OpeningBalance, sh.ClosingBalance, len(sh.Transactions), sh.Warnings)
		for _, x := range sh.Transactions {
			eff := ""
			if x.EffectiveDate != nil {
				eff = x.EffectiveDate.Format("01/02")
			}
			t.Logf("  seq=%d %s eff=%q type=%s amt=%.2f bal=%.2f desc=%q", x.Seq, x.PostedDate.Format("2006-01-02"), eff, x.Type, x.Amount, x.BalanceAfter, x.Description)
		}
	}
}

// (a) description with two money-looking tokens
func TestTwoMoneyTokens(t *testing.T) {
	st, err := books.ParseUFCUText(stmt(`
01/01   Beginning Balance                                   100.00
01/05   01/05   Withdrawal   Debit Card Check Card PAY 12.50 of 25.00 TOTAL    -12.50     87.50
01/31   Ending Balance                                      87.50
`))
	dump(t, st, err)
	if err == nil && (st.Shares[0].Transactions[0].Amount != -12.50 || !strings.Contains(st.Shares[0].Transactions[0].Description, "25.00")) {
		t.Errorf("two-money description mis-parsed")
	}
	// money token at the END of the description with no type: "REF 1,234.56" then amount, balance
	st, err = books.ParseUFCUText(stmt(`
01/01   Beginning Balance                                   100.00
01/05   01/05   Withdrawal   ACH VENDOR REF 1,234.56       -12.50     87.50
01/31   Ending Balance                                      87.50
`))
	dump(t, st, err)
}

// (b) negative opening balance
func TestNegativeOpening(t *testing.T) {
	st, err := books.ParseUFCUText(stmt(`
01/01   Beginning Balance                                   -50.00
01/05   01/05   Deposit      ACH CLIENT                     100.00     50.00
01/31   Ending Balance                                      50.00
`))
	dump(t, st, err)
	if err != nil {
		t.Errorf("negative opening: %v", err)
	}
}

// (c) share with zero transactions
func TestZeroTxnShare(t *testing.T) {
	st, err := books.ParseUFCUText(hdr + `
REGULAR SAVINGS (0000)
01/01   Beginning Balance                                   5.67
01/31   Ending Balance                                      5.67
BUSINESS CHECKING (0080)
01/01   Beginning Balance                                   100.00
01/05   01/05   Deposit      ACH CLIENT                     100.00     200.00
01/31   Ending Balance                                      200.00
`)
	dump(t, st, err)
	if err != nil || len(st.Shares) != 2 || len(st.Shares[0].Transactions) != 0 {
		t.Errorf("zero-txn share: %v", err)
	}
	// zero-txn share whose Beginning != Ending (bank error or dividend not printed)
	_, err = books.ParseUFCUText(hdr + `
REGULAR SAVINGS (0000)
01/01   Beginning Balance                                   5.67
01/31   Ending Balance                                      6.67
`)
	t.Logf("zero-txn mismatch -> %v (want error)", err)
}

// (d) continuation that itself starts with a date
func TestDateContinuation(t *testing.T) {
	st, err := books.ParseUFCUText(stmt(`
01/01   Beginning Balance                                   100.00
01/05   01/05   Withdrawal   Debit Card Check Card          -10.00     90.00
01/04   HOVER 866-731-6556 MS
01/06   01/06   Withdrawal   Debit Card Check Card          -10.00     80.00
12/31   RENEWAL 12/31 TO 12/31
01/31   Ending Balance                                      80.00
`))
	dump(t, st, err)
	// a continuation that is just a bare date (would be swallowed as effective date, s="")
	st, err = books.ParseUFCUText(stmt(`
01/01   Beginning Balance                                   100.00
01/05   01/05   Withdrawal   Debit Card Check Card          -10.00     90.00
01/04   2020 ANNUAL FEE
01/31   Ending Balance                                      90.00
`))
	dump(t, st, err)
}

// (e) continuation lines after a page break are dropped (the real bug)
func TestPageBreakContinuation(t *testing.T) {
	st, err := books.ParseUFCUText(hdr + `
BUSINESS CHECKING (0080)
01/01   Beginning Balance                                   100.00
01/05   01/05   Withdrawal   ACH GUSTO                     -10.00     90.00
                                                                       XXXXXX8373          01/01/21-01/31/21     1 of 2


BUSINESS CHECKING (0080) - Continued
TRANS EFFECTIVE
DATE DATE TYPE DESCRIPTION AMOUNT BALANCE
                                        TYPE: NET 793926 ID: 9138864001
                                        CO: GUSTO
01/31   Ending Balance                                      90.00
`)
	dump(t, st, err)
	if err == nil && !strings.Contains(st.Shares[0].Transactions[0].Description, "TYPE: NET") {
		t.Errorf("continuation after page break LOST: desc=%q", st.Shares[0].Transactions[0].Description)
	}
}

// (f) a statement line whose description contains "Beginning Balance"/"Ending Balance" text or that
// matches reNoise ("Return" etc) is not the concern; but a description line equal to "Deposit"/"Withdrawal"
// as a continuation sets Type. Also: period straddling year (12/15-01/14) date resolution.
func TestYearStraddle(t *testing.T) {
	text := `
                                                                       XXXXXX8373          12/15/20-01/14/21     1 of 1
BUSINESS CHECKING (0080)
12/15   Beginning Balance                                   100.00
12/20   12/20   Withdrawal   Debit Card Check Card          -10.00     90.00
01/05   01/05   Withdrawal   Debit Card Check Card          -10.00     80.00
01/14   Ending Balance                                      80.00
`
	st, err := books.ParseUFCUText(text)
	dump(t, st, err)
	if err == nil {
		if st.Shares[0].Transactions[1].PostedDate.Year() != 2021 {
			t.Errorf("01/05 in a 12/15/20-01/14/21 period should be 2021, got %v", st.Shares[0].Transactions[1].PostedDate)
		}
	}
}

// (g) Count real truncations across all 72 PDFs: a transaction line immediately followed (ignoring blanks)
// by a page header and then, after the "- Continued" block, by indented continuation text before the next
// dated line.
func TestRealTruncations(t *testing.T) {
	files, _ := filepath.Glob("/app/data/books/ufcu/*/*.pdf")
	sort.Strings(files)
	total := 0
	for _, f := range files {
		out, err := exec.Command("pdftotext", "-layout", f, "-").Output()
		if err != nil {
			t.Fatal(err)
		}
		lines := strings.Split(string(out), "\n")
		for i := 0; i < len(lines); i++ {
			if !strings.Contains(lines[i], " of ") || !strings.Contains(lines[i], "XXXXXX") {
				continue
			}
			// previous non-blank line must be a txn line (ends with two money columns)
			j := i - 1
			for j >= 0 && strings.TrimSpace(lines[j]) == "" {
				j--
			}
			if j < 0 {
				continue
			}
			prev := strings.TrimSpace(lines[j])
			if !(len(prev) > 5 && prev[2] == '/' && strings.Count(prev, ".") >= 2) {
				continue
			}
			// skip forward past "- Continued", TRANS EFFECTIVE, DATE DATE... headers
			k := i + 1
			for k < len(lines) && (strings.TrimSpace(lines[k]) == "" || strings.Contains(lines[k], "- Continued") || strings.HasPrefix(strings.TrimSpace(lines[k]), "TRANS EFFECTIVE") || strings.HasPrefix(strings.TrimSpace(lines[k]), "DATE DATE") || strings.Contains(lines[k], "UFCU.org") || strings.Contains(lines[k], "Continued on page")) {
				k++
			}
			if k >= len(lines) {
				continue
			}
			nxt := lines[k]
			tr := strings.TrimSpace(nxt)
			// continuation = does not start with a date MM/DD and is not Recurring/Withdrawal/Deposit alone
			if len(tr) > 5 && tr[2] == '/' && tr[0] >= '0' && tr[0] <= '9' {
				continue
			}
			if tr == "Recurring" || tr == "Withdrawal" || tr == "Deposit" {
				continue
			}
			total++
			fmt.Fprintf(os.Stderr, "TRUNC %s: %q  LOST: %q\n", filepath.Base(f), prev, tr)
		}
	}
	t.Logf("transactions whose continuation text is lost at a page break: %d", total)
}

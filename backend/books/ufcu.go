// Package books holds the bookkeeping layer: statement parsing, the raw
// bank_transaction import, matching to categorized expense rows, invoice
// matching and the report views' helpers.
package books

import (
	"bufio"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Statement is one parsed UFCU statement PDF. A statement covers several
// "shares" (sub-accounts): REGULAR SAVINGS (0000), BUSINESS CHECKING (0080).
type Statement struct {
	SourceFile  string
	PeriodStart time.Time
	PeriodEnd   time.Time
	Shares      []Share
}

// Share is one sub-account's section of a statement.
type Share struct {
	Name           string // e.g. "BUSINESS CHECKING"
	Number         string // e.g. "0080"
	OpeningBalance float64
	ClosingBalance float64
	Transactions   []Txn
	// From the statement's own summary line, when present.
	SummaryWithdrawals *float64
	SummaryDeposits    *float64
	// Non-fatal observations (e.g. the bank's summary line disagrees with the
	// line items because it nets out same-day adjustment pairs).
	Warnings []string
}

// Txn is one statement line (plus its continuation lines).
type Txn struct {
	Seq           int
	PostedDate    time.Time
	EffectiveDate *time.Time
	Type          string // Withdrawal | Deposit | "" (inferred from sign when blank)
	Description   string // full multi-line description, lines joined with "\n"
	Amount        float64 // signed as printed: deposits +, withdrawals -
	BalanceAfter  float64
}

var (
	rePeriod   = regexp.MustCompile(`(\d{2}/\d{2}/\d{2})-(\d{2}/\d{2}/\d{2})`)
	reShare    = regexp.MustCompile(`^\s*([A-Z][A-Z ]+?)\s+\((\d{4})\)(\s+-\s+Continued)?\s*$`)
	reBegin    = regexp.MustCompile(`^\s*(\d{2}/\d{2})\s+Beginning Balance\s+(-?[\d,]+\.\d{2})\s*$`)
	reEnd      = regexp.MustCompile(`^\s*(\d{2}/\d{2})\s+Ending Balance\s+(-?[\d,]+\.\d{2})\s*$`)
	reSummary  = regexp.MustCompile(`(\d+)\s+Withdrawals\s+=\s+(-?[\d,]+\.\d{2})\s+(\d+)\s+Deposits\s+=\s+(-?[\d,]+\.\d{2})`)
	reMoney    = `(-?[\d,]+\.\d{2})`
	// A transaction line: posted date, optional effective date, optional type,
	// description, amount, running balance. The balance column is what makes
	// this unambiguous: every real transaction line ends in two money columns.
	reTxn      = regexp.MustCompile(`^\s*(\d{2}/\d{2})\s+(?:(\d{2}/\d{2})\s+)?(?:(Withdrawal|Deposit)\s+)?(.*?)\s+` + reMoney + `\s+` + reMoney + `\s*$`)
	// Continuation line that starts with a date but has no money columns
	// (e.g. "08/01   HOVER 866-731-6556 MS" = effective date + merchant).
	reDateCont = regexp.MustCompile(`^\s*(\d{2}/\d{2})\s+(.*\S)\s*$`)
	reNoise    = regexp.MustCompile(`^\s*(XXXXXX\d+|TRANS EFFECTIVE|DATE DATE TYPE|Dividends Paid|Statement Period|Total Overdraft|Total Returned|\d+ Withdrawals =|R\. ERIK SWEDBERG CONSULTING|\d{4,} +\d{8} +\d{8}|Continued on page)`)
	rePageHdr  = regexp.MustCompile(`\d+ of \d+\s*$`)
)

func money(s string) (float64, error) {
	return strconv.ParseFloat(strings.ReplaceAll(s, ",", ""), 64)
}

// pdfText runs pdftotext -layout and returns the text.
func pdfText(path string) (string, error) {
	out, err := exec.Command("pdftotext", "-layout", path, "-").Output()
	if err != nil {
		return "", fmt.Errorf("pdftotext %s: %w", path, err)
	}
	return string(out), nil
}

// ParseUFCUFile parses a UFCU statement PDF.
func ParseUFCUFile(path string) (*Statement, error) {
	text, err := pdfText(path)
	if err != nil {
		return nil, err
	}
	st, err := ParseUFCUText(text)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	st.SourceFile = path
	return st, nil
}

// ParseUFCUText parses the pdftotext -layout output of a UFCU statement.
func ParseUFCUText(text string) (*Statement, error) {
	m := rePeriod.FindStringSubmatch(text)
	if m == nil {
		return nil, fmt.Errorf("no statement period found")
	}
	start, err := time.Parse("01/02/06", m[1])
	if err != nil {
		return nil, err
	}
	end, err := time.Parse("01/02/06", m[2])
	if err != nil {
		return nil, err
	}
	st := &Statement{PeriodStart: start, PeriodEnd: end}

	// dateIn resolves MM/DD within the statement period (handles a period
	// that straddles a year boundary, which monthly statements never do, but
	// be safe).
	dateIn := func(md string) (time.Time, error) {
		t, err := time.Parse("01/02/2006", md+"/"+strconv.Itoa(start.Year()))
		if err != nil {
			return t, err
		}
		if t.Before(start.AddDate(0, 0, -7)) && end.Year() > start.Year() {
			t = t.AddDate(1, 0, 0)
		}
		return t, nil
	}

	var cur *Share
	var last *Txn
	seq := 0
	sc := bufio.NewScanner(strings.NewReader(text))
	sc.Buffer(make([]byte, 1<<20), 1<<20)
	for sc.Scan() {
		line := strings.TrimRight(sc.Text(), " \t\f")
		if strings.TrimSpace(line) == "" {
			continue
		}
		if sm := reShare.FindStringSubmatch(line); sm != nil {
			name, num := strings.TrimSpace(sm[1]), sm[2]
			if sm[3] != "" { // "- Continued": same share, new page
				if cur == nil || cur.Number != num {
					return nil, fmt.Errorf("continued section %s (%s) without a start", name, num)
				}
				continue
			}
			st.Shares = append(st.Shares, Share{Name: name, Number: num})
			cur = &st.Shares[len(st.Shares)-1]
			last = nil
			seq = 0
			continue
		}
		if cur == nil {
			continue // address block, header
		}
		if rePageHdr.MatchString(line) || reNoise.MatchString(line) {
			if sm := reSummary.FindStringSubmatch(line); sm != nil {
				w, _ := money(sm[2])
				d, _ := money(sm[4])
				cur.SummaryWithdrawals, cur.SummaryDeposits = &w, &d
			}
			last = nil
			continue
		}
		if sm := reBegin.FindStringSubmatch(line); sm != nil {
			cur.OpeningBalance, _ = money(sm[2])
			last = nil
			continue
		}
		if sm := reEnd.FindStringSubmatch(line); sm != nil {
			cur.ClosingBalance, _ = money(sm[2])
			last = nil
			continue
		}
		if sm := reTxn.FindStringSubmatch(line); sm != nil {
			posted, err := dateIn(sm[1])
			if err != nil {
				return nil, fmt.Errorf("bad date %q: %w", sm[1], err)
			}
			amt, _ := money(sm[5])
			bal, _ := money(sm[6])
			seq++
			t := Txn{Seq: seq, PostedDate: posted, Type: sm[3], Description: strings.TrimSpace(sm[4]), Amount: amt, BalanceAfter: bal}
			if sm[2] != "" {
				if e, err := dateIn(sm[2]); err == nil {
					t.EffectiveDate = &e
				}
			}
			cur.Transactions = append(cur.Transactions, t)
			last = &cur.Transactions[len(cur.Transactions)-1]
			continue
		}
		// Continuation lines attach to the previous transaction.
		if last != nil {
			s := strings.TrimSpace(line)
			if sm := reDateCont.FindStringSubmatch(line); sm != nil {
				// effective date on its own line + merchant text
				if last.EffectiveDate == nil {
					if e, err := dateIn(sm[1]); err == nil {
						last.EffectiveDate = &e
					}
				}
				s = strings.TrimSpace(sm[2])
			}
			switch s {
			case "Withdrawal", "Deposit":
				if last.Type == "" {
					last.Type = s
				}
				continue
			case "Recurring":
				// the next line is the transaction; "Recurring" is a prefix label
				// that pdftotext emits before it. Keep it as context on the
				// previous txn? No: it belongs to the NEXT line. Drop it.
				continue
			}
			if s != "" {
				last.Description = strings.TrimSpace(last.Description + "\n" + s)
			}
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	if len(st.Shares) == 0 {
		return nil, fmt.Errorf("no account sections found")
	}
	// Fill blank types from the sign and validate.
	for i := range st.Shares {
		sh := &st.Shares[i]
		for j := range sh.Transactions {
			t := &sh.Transactions[j]
			if t.Type == "" {
				if t.Amount < 0 {
					t.Type = "Withdrawal"
				} else {
					t.Type = "Deposit"
				}
			}
		}
		if err := sh.Validate(); err != nil {
			return nil, fmt.Errorf("%s (%s): %w", sh.Name, sh.Number, err)
		}
	}
	return st, nil
}

// Validate checks the running balance line by line and the opening/closing
// tie. Any parse slip (a dropped or duplicated line, a mis-read amount)
// breaks the chain and is reported with the sequence number.
func (sh *Share) Validate() error {
	bal := sh.OpeningBalance
	for _, t := range sh.Transactions {
		want := round2(bal + t.Amount)
		if round2(t.BalanceAfter) != want {
			return fmt.Errorf("running balance broke at seq %d (%s %.2f): have %.2f, want %.2f",
				t.Seq, t.PostedDate.Format("01/02"), t.Amount, t.BalanceAfter, want)
		}
		bal = t.BalanceAfter
	}
	if round2(bal) != round2(sh.ClosingBalance) {
		return fmt.Errorf("closing balance %.2f != computed %.2f", sh.ClosingBalance, bal)
	}
	if sh.SummaryWithdrawals != nil && sh.SummaryDeposits != nil {
		var w, d float64
		for _, t := range sh.Transactions {
			if t.Amount < 0 {
				w += t.Amount
			} else {
				d += t.Amount
			}
		}
		if round2(w) != round2(*sh.SummaryWithdrawals) || round2(d) != round2(*sh.SummaryDeposits) {
			// The bank's summary nets out same-day adjustment pairs; the
			// running-balance chain above is the authoritative check.
			sh.Warnings = append(sh.Warnings, fmt.Sprintf("summary line differs: withdrawals %.2f vs %.2f, deposits %.2f vs %.2f",
				w, *sh.SummaryWithdrawals, d, *sh.SummaryDeposits))
		}
	}
	return nil
}

func round2(f float64) float64 {
	v, _ := strconv.ParseFloat(strconv.FormatFloat(f, 'f', 2, 64), 64)
	return v
}

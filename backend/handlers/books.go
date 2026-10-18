package handlers

import (
	"archive/zip"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"ookkee/database"
)

// bookViews whitelists the SQL views that make up the books, with the text
// that goes into the export README. Order is the export order.
var bookViews = []struct {
	Name, View, Title, Doc string
	ByYear                 bool
}{
	{"checks", "v_books_checks", "Checks", "Everything that must be empty before a year goes to the CPA.", true},
	{"equity_rollforward", "v_equity_rollforward", "Equity rollforward", "Equity_EOY = Equity_BOY + net income + contributions - distributions, checked against year-end cash.", true},
	{"balance_sheet", "v_balance_sheet", "Balance sheet", "Year-end cash, liabilities (none), equity and its cumulative components.", true},
	{"pl_summary", "v_pl_summary", "P&L summary", "Income, expenses, payroll, contract labor, net income per year (cash basis, USD).", true},
	{"pl", "v_pl", "P&L detail", "P&L lines by section and category, split by which account paid.", true},
	{"contributions", "v_contributions", "Contributions of capital", "Cash transferred in from the owner, and business expenses paid from personal accounts by account and category.", true},
	{"distributions", "v_distributions", "Distributions", "Business cash to the owner by destination; includes personal spending charged to the business account.", true},
	{"cash_tie", "v_cash_tie", "Cash tie", "Per statement: opening + lines = closing, and every line explained.", true},
	{"cash_balances", "v_cash_balances", "Year-end cash", "Closing balance per business account from the last statement of the year.", true},
	{"ledger", "v_ledger", "Ledger", "Every ledger line with kind, account owner, USD amount (positive = money out).", true},
}

func findBookView(name string) (view string, byYear bool, ok bool) {
	for _, v := range bookViews {
		if v.Name == name {
			return v.View, v.ByYear, true
		}
	}
	return "", false, false
}

// ListBookViews: GET /api/books/views
func ListBookViews(w http.ResponseWriter, r *http.Request) {
	type item struct {
		Name, Title, Doc string
	}
	out := make([]item, 0, len(bookViews))
	for _, v := range bookViews {
		out = append(out, item{v.Name, v.Title, v.Doc})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
}

// BookYears: GET /api/books/years
func BookYears(w http.ResponseWriter, r *http.Request) {
	rows, err := database.Pool.Query(r.Context(), `SELECT DISTINCT year FROM v_ledger ORDER BY year`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	years := []int{}
	for rows.Next() {
		var y int
		if err := rows.Scan(&y); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		years = append(years, y)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(years)
}

// queryView runs SELECT * FROM view [WHERE year = $1] and returns the column
// names and rows as strings (CSV-ready) and as typed values (JSON-ready).
func queryView(r *http.Request, view string, year *int) (cols []string, rows [][]string, objs []map[string]interface{}, err error) {
	q := "SELECT * FROM " + view
	var args []interface{}
	if year != nil {
		q += " WHERE year = $1"
		args = append(args, *year)
	}
	res, err := database.Pool.Query(r.Context(), q, args...)
	if err != nil {
		return nil, nil, nil, err
	}
	defer res.Close()
	for _, fd := range res.FieldDescriptions() {
		cols = append(cols, string(fd.Name))
	}
	for res.Next() {
		vals, err := res.Values()
		if err != nil {
			return nil, nil, nil, err
		}
		strs := make([]string, len(vals))
		obj := map[string]interface{}{}
		for i, v := range vals {
			strs[i], obj[cols[i]] = formatCell(v)
		}
		rows = append(rows, strs)
		objs = append(objs, obj)
	}
	return cols, rows, objs, res.Err()
}

func formatCell(v interface{}) (string, interface{}) {
	switch t := v.(type) {
	case nil:
		return "", nil
	case pgtype.Numeric:
		if !t.Valid {
			return "", nil
		}
		f, _ := t.Float64Value()
		s := strconv.FormatFloat(f.Float64, 'f', 2, 64)
		return s, f.Float64
	case *big.Int:
		return t.String(), t.String()
	case time.Time:
		s := t.Format("2006-01-02")
		return s, s
	case pgtype.Date:
		if !t.Valid {
			return "", nil
		}
		s := t.Time.Format("2006-01-02")
		return s, s
	case bool:
		return strconv.FormatBool(t), t
	case int16, int32, int64, int:
		return fmt.Sprint(t), t
	case float32, float64:
		return fmt.Sprint(t), t
	case string:
		return t, t
	default:
		return fmt.Sprint(t), fmt.Sprint(t)
	}
}

func parseYear(r *http.Request) (*int, error) {
	ys := strings.TrimSpace(r.URL.Query().Get("year"))
	if ys == "" {
		return nil, nil
	}
	y, err := strconv.Atoi(ys)
	if err != nil || y < 1990 || y > 2100 {
		return nil, fmt.Errorf("bad year %q", ys)
	}
	return &y, nil
}

// GetBookView: GET /api/books/views/{name}?year=YYYY&format=csv|json
func GetBookView(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	view, byYear, ok := findBookView(name)
	if !ok {
		http.Error(w, "unknown view", http.StatusNotFound)
		return
	}
	year, err := parseYear(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !byYear {
		year = nil
	}
	cols, rows, objs, err := queryView(r, view, year)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if r.URL.Query().Get("format") == "csv" {
		w.Header().Set("Content-Type", "text/csv")
		fn := name
		if year != nil {
			fn += "-" + strconv.Itoa(*year)
		}
		w.Header().Set("Content-Disposition", "attachment; filename="+fn+".csv")
		cw := csv.NewWriter(w)
		cw.Write(cols)
		cw.WriteAll(rows)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if objs == nil {
		objs = []map[string]interface{}{}
	}
	json.NewEncoder(w).Encode(map[string]interface{}{"columns": cols, "rows": objs})
}

// ExportBooks: GET /api/books/export?year=YYYY  -> zip of every view as CSV
// (all years when year is omitted) plus a README with the conventions.
func ExportBooks(w http.ResponseWriter, r *http.Request) {
	year, err := parseYear(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	label := "all-years"
	if year != nil {
		label = strconv.Itoa(*year)
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=books-"+label+".zip")
	zw := zip.NewWriter(w)
	defer zw.Close()

	readme := &strings.Builder{}
	fmt.Fprintf(readme, "Ookkee books export — %s — generated %s\n\n", label, time.Now().Format(time.RFC3339))
	readme.WriteString("Conventions\n- Cash basis. Amounts in USD; non-USD rows converted at the yearly average in fx_rate.\n")
	readme.WriteString("- Income = deposits into the business account classified as client revenue (invoices are labels, the bank is the record).\n")
	readme.WriteString("- Contributions = owner cash transferred in + business expenses paid from the owner's personal accounts.\n")
	readme.WriteString("- Distributions = business cash to the owner (transfers, personal card/loan payments, cash, personal spending on the business account).\n")
	readme.WriteString("- Equity rollforward is checked against the year-end bank balance; equity_vs_cash_diff must be 0.\n\nFiles\n")
	for _, v := range bookViews {
		y := year
		if !v.ByYear {
			y = nil
		}
		cols, rows, _, err := queryView(r, v.View, y)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		f, err := zw.Create(v.Name + ".csv")
		if err != nil {
			return
		}
		cw := csv.NewWriter(f)
		cw.Write(cols)
		cw.WriteAll(rows)
		fmt.Fprintf(readme, "- %s.csv — %s: %s (%d rows)\n", v.Name, v.Title, v.Doc, len(rows))
	}
	f, _ := zw.Create("README.txt")
	f.Write([]byte(readme.String()))
}

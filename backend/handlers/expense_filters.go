package handlers

import (
	"fmt"
	"net/http"
	"strings"
)

// expenseFilter builds a SQL WHERE fragment + args for the view/search params
// shared by GetExpenses, the count endpoint, and progress. The returned clause
// always starts with "AND ..." pieces appended to a base query that already has
// "WHERE project_id = $1 AND deleted_at IS NULL". argStart is the next $N index.
type expenseFilter struct {
	view   string // "all" | "business" | "personal" | "removed" | "ledger"
	search string
}

// Row kinds the categorization UI works on. Everything else (income,
// contribution, distribution, transfer, refund) belongs to the books ledger
// and is only visible through the "ledger" view and the books views.
const (
	AppKinds      = "('expense','personal','payroll','contractor','capital')"
	BusinessKinds = "('expense','payroll','contractor','capital')"
	LedgerKinds   = "('income','contribution','distribution','transfer','refund')"
)

// orderByClause maps a whitelisted sort key to a safe SQL ORDER BY clause.
// Default (and any unknown value) is date ascending — the canonical view order.
func orderByClause(sort string) string {
	switch sort {
	case "amount_desc":
		return "amount DESC NULLS LAST, date ASC NULLS LAST, row_index ASC"
	case "amount_asc":
		return "amount ASC NULLS LAST, date ASC NULLS LAST, row_index ASC"
	default:
		return "date ASC NULLS LAST, row_index ASC"
	}
}

func parseExpenseFilter(r *http.Request) expenseFilter {
	v := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("view")))
	switch v {
	case "business", "personal", "all", "removed", "ledger":
	default:
		v = "all"
	}
	return expenseFilter{
		view:   v,
		search: strings.TrimSpace(r.URL.Query().Get("search")),
	}
}

// clause returns extra "AND ..." SQL and the args to append, given the next
// placeholder index to use. It always includes the deleted_at condition so the
// caller's base query should NOT hardcode `deleted_at IS NULL`.
func (f expenseFilter) clause(argStart int) (string, []interface{}) {
	var parts []string
	var args []interface{}
	idx := argStart

	// The "removed" view shows soft-deleted rows; all others hide them.
	if f.view == "removed" {
		parts = append(parts, "deleted_at IS NOT NULL")
	} else {
		parts = append(parts, "deleted_at IS NULL")
	}

	switch f.view {
	case "business":
		parts = append(parts, "kind IN "+BusinessKinds)
	case "personal":
		parts = append(parts, "kind = 'personal'")
	case "ledger":
		parts = append(parts, "kind IN "+LedgerKinds)
	case "removed":
		// everything the user removed, whatever its kind
	default: // all
		parts = append(parts, "kind IN "+AppKinds)
	}

	if f.search != "" {
		parts = append(parts, fmt.Sprintf("description ILIKE $%d", idx))
		args = append(args, "%"+f.search+"%")
		idx++
	}

	return " AND " + strings.Join(parts, " AND "), args
}

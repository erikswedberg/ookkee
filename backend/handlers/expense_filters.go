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
	view   string // "all" | "business" | "personal"
	search string
}

func parseExpenseFilter(r *http.Request) expenseFilter {
	v := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("view")))
	switch v {
	case "business", "personal", "all":
	default:
		v = "all"
	}
	return expenseFilter{
		view:   v,
		search: strings.TrimSpace(r.URL.Query().Get("search")),
	}
}

// clause returns extra "AND ..." SQL and the args to append, given the next
// placeholder index to use.
func (f expenseFilter) clause(argStart int) (string, []interface{}) {
	var parts []string
	var args []interface{}
	idx := argStart

	switch f.view {
	case "business":
		parts = append(parts, "(is_personal IS NULL OR is_personal = FALSE)")
	case "personal":
		parts = append(parts, "is_personal = TRUE")
	}

	if f.search != "" {
		parts = append(parts, fmt.Sprintf("description ILIKE $%d", idx))
		args = append(args, "%"+f.search+"%")
		idx++
	}

	if len(parts) == 0 {
		return "", args
	}
	return " AND " + strings.Join(parts, " AND "), args
}

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
	view        string // "all" | "business" | "personal" | "removed"
	search      string
	searchField string // "description" | "source" | "category"
	uncat       bool   // only rows with no accepted category
	miscat      bool   // only rows whose accepted category conflicts with the lane
	unset       bool   // only rows never triaged into a lane (is_personal IS NULL)
}

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
	case "business", "personal", "all", "removed":
	default:
		v = "all"
	}
	field := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("searchField")))
	switch field {
	case "source", "category":
	default:
		field = "description"
	}
	return expenseFilter{
		view:        v,
		search:      strings.TrimSpace(r.URL.Query().Get("search")),
		searchField: field,
		uncat:       r.URL.Query().Get("uncat") == "1",
		miscat:      r.URL.Query().Get("miscat") == "1",
		unset:       r.URL.Query().Get("unset") == "1",
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
		parts = append(parts, "(is_personal IS NULL OR is_personal = FALSE)")
	case "personal":
		parts = append(parts, "is_personal = TRUE")
	}

	// Uncategorized only: no accepted category. On the All view (no personal
	// scope) also exclude personal rows, since those aren't "to categorize".
	if f.uncat {
		parts = append(parts, "accepted_category_id IS NULL")
		if f.view == "all" {
			parts = append(parts, "(is_personal IS NULL OR is_personal = FALSE)")
		}
	}

	// Miscategorized only: the accepted category's lean conflicts with the row's
	// lane. Personal row (is_personal=TRUE) + business category, or business row
	// (is_personal NULL/FALSE) + personal category.
	// Unset only: never triaged into a business/personal lane.
	if f.unset {
		parts = append(parts, "is_personal IS NULL")
	}

	if f.miscat {
		parts = append(parts, `accepted_category_id IN (
			SELECT id FROM expense_category WHERE lean IS NOT NULL AND lean = CASE
				WHEN expense.is_personal = TRUE THEN 'business' ELSE 'personal' END)`)
	}

	if f.search != "" {
		pattern := "%" + f.search + "%"
		switch f.searchField {
		case "source":
			parts = append(parts, fmt.Sprintf("source ILIKE $%d", idx))
			args = append(args, pattern)
		case "category":
			// Match the accepted category's name.
			parts = append(parts, fmt.Sprintf(
				"accepted_category_id IN (SELECT id FROM expense_category WHERE name ILIKE $%d)", idx))
			args = append(args, pattern)
		default: // description
			parts = append(parts, fmt.Sprintf("description ILIKE $%d", idx))
			args = append(args, pattern)
		}
		idx++
	}

	return " AND " + strings.Join(parts, " AND "), args
}

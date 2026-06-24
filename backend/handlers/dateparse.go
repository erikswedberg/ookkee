package handlers

import (
	"strings"
	"time"
)

// parsedDate is the result of interpreting a messy date_text string.
type parsedDate struct {
	t       time.Time
	hasYear bool // whether the source string carried an explicit year
	ok      bool // whether anything parseable was found
}

// dateFormatsWithYear are tried first; they pin an absolute date.
var dateFormatsWithYear = []string{
	"01/02/2006", // 10/22/2020  (UFCU CC)
	"1/2/2006",
	"01/02/06", // 02/08/20    (paypalcredit)
	"1/2/06",
	"2006-01-02", // ISO, just in case
	"Jan 02 2006",
	"Jan 2 2006",
}

// dateFormatsNoYear lack a year; the caller supplies one.
var dateFormatsNoYear = []string{
	"01/02", // 12/01       (UFCU business/checking, usaa)
	"1/2",
	"Jan 02", // Sep 06      (barclaycard)
	"Jan 2",
}

// parseDateText normalizes one date_text value. Many sources cram two dates
// into one field separated by whitespace/newlines (e.g. "11/20 11/21" or
// "12/03\n12/02"); we take the first token, which is conventionally the
// transaction date. Yearless values are returned with hasYear=false so the
// caller can apply an inferred default year.
func parseDateText(raw string) parsedDate {
	s := strings.TrimSpace(raw)
	if s == "" {
		return parsedDate{}
	}

	// Try the whole trimmed string first. This correctly handles single dates
	// that legitimately contain a space, e.g. "Sep 06".
	if p := tryFormats(s); p.ok {
		return p
	}

	// Otherwise the field may cram two dates together separated by whitespace
	// or a newline (e.g. "11/20 11/21" or "12/03\n12/02"). Take the first
	// token, which is conventionally the transaction date.
	norm := strings.ReplaceAll(s, "\n", " ")
	norm = strings.ReplaceAll(norm, "\r", " ")
	if idx := strings.IndexAny(norm, " \t"); idx >= 0 {
		first := strings.TrimSpace(norm[:idx])
		if p := tryFormats(first); p.ok {
			return p
		}
	}
	return parsedDate{}
}

// tryFormats attempts every known layout against s.
func tryFormats(s string) parsedDate {
	for _, f := range dateFormatsWithYear {
		if t, err := time.Parse(f, s); err == nil {
			return parsedDate{t: t, hasYear: true, ok: true}
		}
	}
	for _, f := range dateFormatsNoYear {
		if t, err := time.Parse(f, s); err == nil {
			// Year defaults to 0; caller will set the real year.
			return parsedDate{t: t, hasYear: false, ok: true}
		}
	}
	return parsedDate{}
}

// inferDefaultYear picks the most common explicit year among the parsed dates,
// to be applied to yearless values. Falls back to the current year if none of
// the rows carried a year.
func inferDefaultYear(parsed []parsedDate) int {
	counts := map[int]int{}
	for _, p := range parsed {
		if p.ok && p.hasYear {
			counts[p.t.Year()]++
		}
	}
	bestYear, bestCount := 0, 0
	for y, c := range counts {
		if c > bestCount || (c == bestCount && y > bestYear) {
			bestYear, bestCount = y, c
		}
	}
	if bestYear == 0 {
		return time.Now().Year()
	}
	return bestYear
}

// resolveDates parses every date_text and returns a slice of *time.Time aligned
// with the input. Yearless dates get the inferred default year.
func resolveDates(dateTexts []string) []*time.Time {
	parsed := make([]parsedDate, len(dateTexts))
	for i, dt := range dateTexts {
		parsed[i] = parseDateText(dt)
	}
	defaultYear := inferDefaultYear(parsed)

	out := make([]*time.Time, len(dateTexts))
	for i, p := range parsed {
		if !p.ok {
			continue // leave NULL
		}
		t := p.t
		if !p.hasYear {
			t = time.Date(defaultYear, t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
		}
		tt := t
		out[i] = &tt
	}
	return out
}

package handlers

import "strings"

// audUsdByYear holds annual-average AUD->USD rates. These are approximations
// sufficient for bookkeeping; per-transaction-date rates are not used.
var audUsdByYear = map[int]float64{
	2022: 0.695,
	2023: 0.665,
	2024: 0.66,
	2025: 0.645,
	2026: 0.703,
}

// fxRateToUSD returns the multiplier to convert an amount in `currency` for the
// given year into USD. USD (and unknown/blank currencies) return 1.0. For AUD,
// the year is clamped to the nearest year we have a rate for, so out-of-range
// years (e.g. 2021, 2030) still convert sensibly instead of failing.
func fxRateToUSD(currency string, year int) float64 {
	switch strings.ToUpper(strings.TrimSpace(currency)) {
	case "", "USD":
		return 1.0
	case "AUD":
		if r, ok := audUsdByYear[year]; ok {
			return r
		}
		// Clamp to nearest available year.
		minY, maxY := 0, 0
		for y := range audUsdByYear {
			if minY == 0 || y < minY {
				minY = y
			}
			if y > maxY {
				maxY = y
			}
		}
		if year < minY {
			return audUsdByYear[minY]
		}
		return audUsdByYear[maxY]
	default:
		// Unknown currency: don't guess, treat as already-USD.
		return 1.0
	}
}

package handlers

import "testing"

func TestFxRateToUSD(t *testing.T) {
	cases := []struct {
		cur  string
		year int
		want float64
	}{
		{"USD", 2023, 1.0},
		{"", 2023, 1.0},
		{"usd", 2023, 1.0},
		{"AUD", 2022, 0.695},
		{"aud", 2024, 0.66},
		{"AUD", 2026, 0.703},
		{"AUD", 2020, 0.695}, // clamp below -> earliest (2022)
		{"AUD", 2030, 0.703}, // clamp above -> latest (2026)
		{"EUR", 2023, 1.0},   // unknown -> treat as USD
	}
	for _, c := range cases {
		got := fxRateToUSD(c.cur, c.year)
		if got != c.want {
			t.Errorf("fxRateToUSD(%q,%d)=%v want %v", c.cur, c.year, got, c.want)
		}
	}
}

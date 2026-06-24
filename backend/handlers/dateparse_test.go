package handlers

import "testing"

func TestParseDateText(t *testing.T) {
	cases := []struct {
		in      string
		wantMD  string // expected MM-DD (year-agnostic)
		hasYear bool
		ok      bool
	}{
		{"Sep 06", "09-06", false, true},
		{"10/22/2020", "10-22", true, true},
		{"02/08/20", "02-08", true, true},
		{"12/01", "12-01", false, true},
		{"11/20 11/21", "11-20", false, true},  // double, take first
		{"12/03\n12/02", "12-03", false, true}, // newline double
		{"", "", false, false},
		{"garbage", "", false, false},
	}
	for _, c := range cases {
		p := parseDateText(c.in)
		if p.ok != c.ok {
			t.Errorf("%q: ok=%v want %v", c.in, p.ok, c.ok)
			continue
		}
		if !c.ok {
			continue
		}
		if p.hasYear != c.hasYear {
			t.Errorf("%q: hasYear=%v want %v", c.in, p.hasYear, c.hasYear)
		}
		got := p.t.Format("01-02")
		if got != c.wantMD {
			t.Errorf("%q: md=%s want %s", c.in, got, c.wantMD)
		}
	}
}

func TestResolveDatesYearInference(t *testing.T) {
	in := []string{"10/22/2020", "Sep 06", "12/01", "11/20 11/21"}
	out := resolveDates(in)
	if out[0] == nil || out[0].Year() != 2020 {
		t.Fatalf("row0 year: %v", out[0])
	}
	// yearless rows should inherit 2020
	for i := 1; i < len(out); i++ {
		if out[i] == nil || out[i].Year() != 2020 {
			t.Errorf("row%d expected year 2020, got %v", i, out[i])
		}
	}
}

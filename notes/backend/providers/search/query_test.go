package search

import "testing"

func TestBuildQuery(t *testing.T) {
	tests := []struct{ name, input, want string }{
		{"empty", "  !!! ", ""},
		{"prefix", "café reu", `"café" AND "reu"*`},
		{"operator is data", "one OR two", `"one" AND "OR" AND "two"*`},
		{"phrase", `"café com leite"`, `"café com leite"`},
		{"escaped phrase", `"a "quoted" phrase"`, `"a ""quoted"" phrase"`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := BuildQuery(tt.input); got != tt.want {
				t.Fatalf("BuildQuery(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestStripMarkdown(t *testing.T) {
	got := StripMarkdown("# Café **task** [link](https://example.test)\n`code`")
	want := " Café task link\ncode"
	if got != want {
		t.Fatalf("StripMarkdown() = %q, want %q", got, want)
	}
}

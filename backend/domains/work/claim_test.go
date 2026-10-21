package work

import "testing"

func TestScopesOverlap(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"backend/*", "backend/domains/canon/*", true},
		{"docs/*", "backend/*", false},
		{"backend/import/*", "backend/import/*", true},
		{"backend/import/*.go", "backend/import/git.go", true},
		{"backend/import/*.go", "backend/import/README.md", false},
		{"backend/**", "backend/a/b/c.go", true},
		{"**/*.sql", "backend/platform/db/0018.sql", true},
		{"**/*.sql", "docs/spec.md", true}, // a literal path may be a folder; over-report on purpose
		{"src/a?c/*", "src/abc/x", true},
		{"src/[ab]/*", "src/c/x", true}, // classes over-report on purpose
		{"backend/import.go", "backend/export.go", false},
		{"", "backend/*", false},
		{"backend/*", "", false},
		{"/backend/*/", "backend/x", true},
	}
	for _, tc := range cases {
		if got := ScopesOverlap(tc.a, tc.b); got != tc.want {
			t.Errorf("ScopesOverlap(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
		if got := ScopesOverlap(tc.b, tc.a); got != tc.want {
			t.Errorf("ScopesOverlap(%q, %q) = %v, want %v (swapped)", tc.b, tc.a, got, tc.want)
		}
	}
}

func TestScopesOverlapAcrossRepos(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"api:src/auth/*", "api:src/auth/login.go", true},
		{"api:src/auth/*", "web:src/auth/*", false},
		{"api:src/**", "src/auth/*", false}, // no prefix is the project root
		{"src/auth/*", "src/auth/x.go", true},
		{"api:src/*", "api:docs/*", false},
		{"api:", "api:src/*", false},
	}
	for _, tc := range cases {
		if got := ScopesOverlap(tc.a, tc.b); got != tc.want {
			t.Errorf("ScopesOverlap(%q, %q) = %v, want %v", tc.a, tc.b, got, tc.want)
		}
		if got := ScopesOverlap(tc.b, tc.a); got != tc.want {
			t.Errorf("ScopesOverlap(%q, %q) = %v, want %v (swapped)", tc.b, tc.a, got, tc.want)
		}
	}
}

func TestQualifyAndSplitScope(t *testing.T) {
	if got := QualifyScope("api", "src/auth/*"); got != "api:src/auth/*" {
		t.Fatalf("qualify = %q", got)
	}
	if got := QualifyScope("", "src/*"); got != "src/*" {
		t.Fatalf("root qualify = %q", got)
	}
	if got := QualifyScope("api", ""); got != "" {
		t.Fatalf("empty glob = %q", got)
	}
	if repo, glob := SplitScope("api:src/auth/*"); repo != "api" || glob != "src/auth/*" {
		t.Fatalf("split = %q %q", repo, glob)
	}
	if repo, glob := SplitScope("src/auth/*"); repo != "" || glob != "src/auth/*" {
		t.Fatalf("root split = %q %q", repo, glob)
	}
}

package git

import "testing"

func TestParseGitHubRemote(t *testing.T) {
	cases := map[string]string{
		"git@github.com:polterware/polterware.git":       "polterware/polterware",
		"https://github.com/polterware/polterware":        "polterware/polterware",
		"https://github.com/polterware/polterware.git":    "polterware/polterware",
		"ssh://git@github.com/polterware/polterware.git":  "polterware/polterware",
		"https://token@github.com/polterware/polterware/": "polterware/polterware",
		"git@gitlab.com:polterware/polterware.git":        "",
		"https://github.com/polterware":                   "",
		"":                                                "",
	}
	for remote, want := range cases {
		got, ok := ParseGitHubRemote(remote)
		if want == "" {
			if ok {
				t.Errorf("ParseGitHubRemote(%q) = %q, want none", remote, got)
			}
			continue
		}
		if !ok || got != want {
			t.Errorf("ParseGitHubRemote(%q) = %q, %v; want %q", remote, got, ok, want)
		}
	}
}

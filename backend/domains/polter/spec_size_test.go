package polter

import (
	"testing"

	contextpkg "github.com/polterware/polterware/backend/domains/context"
)

func TestSpecCoreMatchesItsDeclaredSize(t *testing.T) {
	got := contextpkg.EstimateTokens(SpecCore)
	if got*10 < SpecCoreTokens*9 || got*10 > SpecCoreTokens*11 {
		t.Fatalf("SpecCore is %d tokens; SpecCoreTokens declares %d (keep them within 10%%)", got, SpecCoreTokens)
	}
	for _, name := range SpecTopicNames {
		text, err := FormatSpec(name)
		if err != nil || text == "" {
			t.Fatalf("topic %s: %q %v", name, text, err)
		}
		t.Logf("%-9s %d tokens", name, contextpkg.EstimateTokens(text))
	}
	if len(SpecTopics) != len(SpecTopicNames) {
		t.Fatalf("SpecTopicNames lists %d topics, SpecTopics has %d", len(SpecTopicNames), len(SpecTopics))
	}
	if _, err := FormatSpec("nope"); err == nil {
		t.Fatal("an unknown topic must fail")
	}
}

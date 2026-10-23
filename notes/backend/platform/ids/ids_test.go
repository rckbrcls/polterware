package ids

import (
	"strings"
	"sync"
	"testing"
)

func TestConcurrentULIDs(t *testing.T) {
	values := make(chan string, 2000)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := 0; j < 100; j++ {
				values <- Generator{}.New()
			}
		}()
	}
	wg.Wait()
	close(values)
	seen := map[string]bool{}
	for id := range values {
		if len(id) != 26 || id[0] > '7' || seen[id] {
			t.Fatalf("invalid/colliding ULID: %s", id)
		}
		for _, r := range id {
			if !strings.ContainsRune(crockford, r) {
				t.Fatalf("invalid alphabet: %s", id)
			}
		}
		seen[id] = true
	}
}

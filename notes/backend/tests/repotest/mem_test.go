package repotest

import "testing"

func TestMemSuite(t *testing.T) {
	Run(t, "mem", func(t *testing.T) (Repos, func()) {
		return NewMem().Repos(), func() {}
	})
}

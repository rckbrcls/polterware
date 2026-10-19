package core

import (
	"testing"
	"time"
)

func TestRequestBodyDeadlinesPreserveStreaming(t *testing.T) {
	_, _, server := sqliteLoopback(t)
	for name, h := range map[string]struct{ read, write time.Duration }{
		"connect": {server.http.ReadTimeout, server.http.WriteTimeout},
		"mcp":     {server.mcpHTTP.ReadTimeout, server.mcpHTTP.WriteTimeout},
	} {
		if h.read <= 0 || h.read > 15*time.Second {
			t.Fatalf("%s has no bounded body read deadline: %s", name, h.read)
		}
		if h.write != 0 {
			t.Fatalf("%s interrupts long-lived streams", name)
		}
	}
}

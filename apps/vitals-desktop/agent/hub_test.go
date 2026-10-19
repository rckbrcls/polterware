package main

import (
	"bytes"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type gateWriter struct {
	started chan struct{}
	gate    chan struct{}
	first   int32
	mu      sync.Mutex
	got     [][]byte
}

func (g *gateWriter) Write(p []byte) (int, error) {
	if atomic.CompareAndSwapInt32(&g.first, 0, 1) {
		close(g.started)
		<-g.gate
	}
	g.mu.Lock()
	g.got = append(g.got, append([]byte(nil), p...))
	g.mu.Unlock()
	return len(p), nil
}

func TestHubDropsIntermediateMetrics(t *testing.T) {
	g := &gateWriter{started: make(chan struct{}), gate: make(chan struct{})}
	h := newHub()
	errc := make(chan error, 1)
	go func() { errc <- h.loop(g) }()

	h.pushMetric([]byte("A"))
	select {
	case <-g.started:
	case <-time.After(2 * time.Second):
		t.Fatal("write did not start")
	}
	h.pushMetric([]byte("B"))
	h.pushMetric([]byte("C"))
	h.pushCtrl([]byte("D"))
	close(g.gate)

	time.Sleep(50 * time.Millisecond)
	h.close()
	if err := <-errc; err != nil {
		t.Fatal(err)
	}

	g.mu.Lock()
	defer g.mu.Unlock()
	var lines []string
	for _, p := range g.got {
		lines = append(lines, string(bytes.TrimRight(p, "\n")))
	}
	if len(lines) != 3 || lines[0] != "A" || lines[1] != "D" || lines[2] != "C" {
		t.Fatalf("lines %q", lines)
	}
}

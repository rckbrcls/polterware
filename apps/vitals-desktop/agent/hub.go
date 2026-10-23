package main

import (
	"io"
	"sync"
)

// hub is the only stdout writer. Control lines are delivered in order.
// Metrics frames are not queued: a newer frame replaces one that has not
// been written yet.
type hub struct {
	mu       sync.Mutex
	cond     *sync.Cond
	ctrl     [][]byte
	metric   []byte
	closed   bool
	writeErr error
}

func newHub() *hub {
	h := &hub{}
	h.cond = sync.NewCond(&h.mu)
	return h
}

func (h *hub) pushCtrl(line []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.ctrl = append(h.ctrl, append([]byte(nil), line...))
	h.cond.Signal()
}

func (h *hub) pushMetric(line []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.closed {
		return
	}
	h.metric = append([]byte(nil), line...)
	h.cond.Signal()
}

func (h *hub) close() {
	h.mu.Lock()
	h.closed = true
	h.cond.Broadcast()
	h.mu.Unlock()
}

func (h *hub) loop(w io.Writer) error {
	for {
		h.mu.Lock()
		for len(h.ctrl) == 0 && h.metric == nil && !h.closed {
			h.cond.Wait()
		}
		if len(h.ctrl) == 0 && (h.closed || h.metric == nil) {
			err := h.writeErr
			h.mu.Unlock()
			return err
		}
		var line []byte
		if len(h.ctrl) > 0 {
			line = h.ctrl[0]
			h.ctrl = h.ctrl[1:]
		} else {
			line = h.metric
			h.metric = nil
		}
		h.mu.Unlock()

		if err := writeLine(w, line); err != nil {
			h.mu.Lock()
			h.writeErr = err
			h.closed = true
			h.cond.Broadcast()
			h.mu.Unlock()
			return err
		}
	}
}

func writeLine(w io.Writer, line []byte) error {
	buf := make([]byte, len(line)+1)
	copy(buf, line)
	buf[len(buf)-1] = '\n'
	return writeFull(w, buf)
}

func writeFull(w io.Writer, p []byte) error {
	for len(p) > 0 {
		n, err := w.Write(p)
		if n > 0 {
			p = p[n:]
		}
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
	}
	return nil
}

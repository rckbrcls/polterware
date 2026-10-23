//go:build linux

package main

import (
	"errors"
	"io"
	"os"
	"syscall"
)

const maxProcRead = 4 << 20

// procFile keeps a /proc (or fixture) file open and rereads it with pread
// into a reused buffer. The returned slice is invalid after the next Read.
type procFile struct {
	f       *os.File
	path    string
	buf     []byte
	noPread bool
}

func openProc(path string) (*procFile, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	return &procFile{f: f, path: path, buf: make([]byte, 0, 8192)}, nil
}

func (p *procFile) Close() error {
	if p == nil || p.f == nil {
		return nil
	}
	return p.f.Close()
}

func (p *procFile) Read() ([]byte, error) {
	buf := p.buf
	if cap(buf) < 4096 {
		buf = make([]byte, 8192)
	}
	buf = buf[:cap(buf)]
	n := 0
	for {
		if n == len(buf) {
			if n >= maxProcRead {
				return nil, errors.New(p.path + ": proc read too large")
			}
			next := len(buf) * 2
			if next > maxProcRead {
				next = maxProcRead
			}
			grown := make([]byte, next)
			copy(grown, buf[:n])
			buf = grown
		}
		r, err := p.readAt(buf[n:], int64(n))
		n += r
		if r == 0 || errors.Is(err, io.EOF) {
			break
		}
		if errors.Is(err, syscall.EINTR) {
			continue
		}
		if err != nil {
			return nil, err
		}
	}
	p.buf = buf
	return buf[:n], nil
}

func (p *procFile) readAt(buf []byte, off int64) (int, error) {
	fd := int(p.f.Fd())
	if !p.noPread {
		n, err := syscall.Pread(fd, buf, off)
		if err == nil || !preadRejected(err) {
			return n, err
		}
		// Some proc files reject pread. Keep the same fd and buffer.
		p.noPread = true
	}
	if _, err := p.f.Seek(off, io.SeekStart); err != nil {
		return 0, err
	}
	return p.f.Read(buf)
}

func preadRejected(err error) bool {
	return errors.Is(err, syscall.EINVAL) || errors.Is(err, syscall.ESPIPE) || errors.Is(err, syscall.ENOTSUP)
}

// preadFile reads up to len(buf) bytes at offset 0. n == len(buf) means the
// caller should treat the result as possibly truncated.
func preadFile(path string, buf []byte) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	n, err := syscall.Pread(int(f.Fd()), buf, 0)
	if n > 0 && (err == nil || errors.Is(err, io.EOF) || errors.Is(err, syscall.EINVAL) || errors.Is(err, syscall.ESPIPE)) {
		if errors.Is(err, syscall.EINVAL) || errors.Is(err, syscall.ESPIPE) {
			if _, seekErr := f.Seek(0, io.SeekStart); seekErr == nil {
				n, err = f.Read(buf)
			}
		}
		if errors.Is(err, io.EOF) {
			err = nil
		}
		return n, err
	}
	if err != nil && !errors.Is(err, io.EOF) {
		if _, seekErr := f.Seek(0, io.SeekStart); seekErr == nil {
			return f.Read(buf)
		}
		return n, err
	}
	return n, nil
}

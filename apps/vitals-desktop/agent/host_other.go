//go:build !linux && !darwin && !(windows && (amd64 || arm64))

package main

import (
	"context"
	"fmt"
	"io"
)

func runAgent(ctx context.Context, in io.Reader, out io.Writer) error {
	return fmt.Errorf("vitals-agent supports linux, darwin and windows (amd64, arm64) only")
}

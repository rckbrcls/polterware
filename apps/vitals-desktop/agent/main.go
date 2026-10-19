package main

import (
	"context"
	"fmt"
	"os"
)

func main() {
	if err := runAgent(context.Background(), os.Stdin, os.Stdout); err != nil {
		fmt.Fprintf(os.Stderr, "vitals-agent: %s\n", err)
		os.Exit(1)
	}
}

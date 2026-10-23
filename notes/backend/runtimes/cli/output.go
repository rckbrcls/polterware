package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"

	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// jsonMarshal encodes RPC responses as protobuf JSON mapping (camelCase names,
// int64 as strings). Shape version: pwnotes.cli.json.v1 (contracts v1.6).
var jsonMarshal = protojson.MarshalOptions{
	UseProtoNames:   false,
	EmitUnpopulated: true,
}

func useColor() bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	if strings.EqualFold(os.Getenv("TERM"), "dumb") {
		return false
	}
	return false
}

func writeJSON(out io.Writer, msg proto.Message) error {
	raw, err := jsonMarshal.Marshal(msg)
	if err != nil {
		return err
	}
	return writeJSONBytes(out, raw)
}

// writeJSONBytes prints compact JSON. protojson deliberately injects random
// whitespace that varies with the binary, so compacting is what keeps --json
// output byte-stable across builds (golden tests and scripts rely on it).
func writeJSONBytes(out io.Writer, raw []byte) error {
	var compact bytes.Buffer
	if err := json.Compact(&compact, raw); err != nil {
		return err
	}
	_, err := fmt.Fprintln(out, compact.String())
	return err
}

func formatStamp(ts *timestamppb.Timestamp) string {
	if ts == nil {
		return "-"
	}
	t := ts.AsTime().UTC()
	if t.IsZero() {
		return "-"
	}
	return t.Format("2006-01-02T15:04:05.000Z")
}

func dash(s string) string {
	if strings.TrimSpace(s) == "" {
		return "-"
	}
	return s
}

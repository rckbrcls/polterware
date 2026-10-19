// Package token mints and privately persists local bearer tokens.
package token

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"os"
	"strings"

	"github.com/polterware/polterware/notes/backend/platform/runstate"
)

func Mint() (string, error) {
	var raw [32]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", fmt.Errorf("mint bearer: %w", err)
	}
	return hex.EncodeToString(raw[:]), nil
}

// Equal compares fixed-size digests, including for different length inputs.
func Equal(a, b string) bool {
	x, y := sha256.Sum256([]byte(a)), sha256.Sum256([]byte(b))
	return a != "" && subtle.ConstantTimeCompare(x[:], y[:]) == 1
}

// LoadOrMint is called while the core owns its database lock.
func LoadOrMint(path string) (string, error) {
	if raw, err := os.ReadFile(path); err == nil {
		value := strings.TrimSpace(string(raw))
		bytes, decodeErr := hex.DecodeString(value)
		if decodeErr != nil || len(bytes) != 32 {
			return "", fmt.Errorf("invalid stored bearer")
		}
		if err := os.Chmod(path, 0o600); err != nil {
			return "", fmt.Errorf("protect stored bearer: %w", err)
		}
		return value, nil
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("read bearer: %w", err)
	}
	return Rotate(path)
}
func Rotate(path string) (string, error) {
	value, err := Mint()
	if err != nil {
		return "", err
	}
	if err := runstate.WriteFile(path, []byte(value+"\n")); err != nil {
		return "", err
	}
	return value, nil
}

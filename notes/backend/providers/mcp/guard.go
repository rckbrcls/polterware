// Package mcp contains Polterware Notes's local MCP provider primitives.
package mcp

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// NewGuard returns a fail-closed gate for the actual IPv4 loopback listener
// port. The static form is useful for standalone listeners.
// It adds no CORS headers and never logs credentials or request contents.
func NewGuard(token string, port int, maxBodyBytes int64) (func(http.Handler) http.Handler, error) {
	if token == "" || strings.ContainsAny(token, " \t\r\n") || port < 1 || port > 65535 || maxBodyBytes < 1 {
		return nil, errors.New("invalid MCP security configuration")
	}
	return NewLiveGuard(func() (string, error) { return token, nil }, port, maxBodyBytes)
}

// NewLiveGuard reads the current bearer for each authorization decision. The
// source must publish complete tokens atomically and fails closed on read errors.
func NewLiveGuard(current func() (string, error), port int, maxBodyBytes int64) (func(http.Handler) http.Handler, error) {
	if current == nil || port < 1 || port > 65535 || maxBodyBytes < 1 {
		return nil, errors.New("invalid MCP security configuration")
	}
	wantPort := strconv.Itoa(port)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := r.Header.Values("Authorization")
			if len(auth) != 1 || len(auth[0]) < 7 || !strings.EqualFold(auth[0][:7], "Bearer ") {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			token, err := current()
			if err != nil || token == "" || strings.ContainsAny(token, " \t\r\n") {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			wantToken := sha256.Sum256([]byte(token))
			gotToken := sha256.Sum256([]byte(auth[0][7:]))
			if subtle.ConstantTimeCompare(gotToken[:], wantToken[:]) != 1 {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			if !allowedHost(r.Host, wantPort) {
				http.Error(w, "forbidden host", http.StatusForbidden)
				return
			}
			origins := r.Header.Values("Origin")
			if len(origins) > 1 || (len(origins) == 1 && !allowedOrigin(origins[0])) {
				http.Error(w, "forbidden origin", http.StatusForbidden)
				return
			}
			// Read before dispatch so chunked requests cannot mutate anything
			// before a late body-limit error is discovered by the SDK.
			if r.Body != nil {
				limited := http.MaxBytesReader(w, r.Body, maxBodyBytes)
				body, err := io.ReadAll(limited)
				_ = limited.Close()
				if err != nil {
					var tooLarge *http.MaxBytesError
					if errors.As(err, &tooLarge) {
						http.Error(w, "request body too large", http.StatusRequestEntityTooLarge)
					} else {
						http.Error(w, "invalid request body", http.StatusBadRequest)
					}
					return
				}
				r.Body = io.NopCloser(bytes.NewReader(body))
			}
			next.ServeHTTP(w, r)
		})
	}, nil
}

func allowedHost(host, port string) bool {
	name, gotPort, err := net.SplitHostPort(host)
	return err == nil && gotPort == port && (name == "127.0.0.1" || name == "localhost")
}

func allowedOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.ForceQuery || u.Fragment != "" || strings.Contains(origin, "#") {
		return false
	}
	// Never resolve names: a domain that resolves to loopback is still rejected.
	host := u.Hostname()
	if host != "localhost" && host != "127.0.0.1" && host != "::1" {
		return false
	}
	if host == "::1" && !strings.HasPrefix(u.Host, "[::1]") {
		return false
	}
	if strings.HasSuffix(u.Host, ":") {
		return false
	}
	if port := u.Port(); port != "" {
		n, err := strconv.Atoi(port)
		if err != nil || n < 1 || n > 65535 {
			return false
		}
	}
	return true
}

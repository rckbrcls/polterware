package mcp

import (
	"bytes"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGuard(t *testing.T) {
	const token = "private-test-token"
	wrap, err := NewGuard(token, 47600, 16)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name, host, auth, origin, body string
		want                           int
	}{
		{"valid", "127.0.0.1:47600", "Bearer " + token, "", "{}", 204},
		{"localhost", "localhost:47600", "bearer " + token, "http://localhost:47600", "{}", 204},
		{"loopback origin", "127.0.0.1:47600", "Bearer " + token, "https://[::1]:8443", "", 204},
		{"missing bearer", "127.0.0.1:47600", "", "", "", 401},
		{"wrong bearer", "127.0.0.1:47600", "Bearer invalid", "", "", 401},
		{"empty bearer", "127.0.0.1:47600", "Bearer ", "", "", 401},
		{"extra whitespace", "127.0.0.1:47600", "Bearer " + token + " ", "", "", 401},
		{"other scheme", "127.0.0.1:47600", "Basic " + token, "", "", 401},
		{"rebinding host", "rebind.example:47600", "Bearer " + token, "", "", 403},
		{"loopback domain", "127.0.0.1.nip.io:47600", "Bearer " + token, "", "", 403},
		{"wrong port", "localhost:80", "Bearer " + token, "", "", 403},
		{"missing port", "localhost", "Bearer " + token, "", "", 403},
		{"ipv6 host", "[::1]:47600", "Bearer " + token, "", "", 403},
		{"alternate loopback", "127.0.0.2:47600", "Bearer " + token, "", "", 403},
		{"forwarded host", "evil.example:47600", "Bearer " + token, "", "", 403},
		{"cross origin", "127.0.0.1:47600", "Bearer " + token, "https://evil.example", "", 403},
		{"rebinding origin", "127.0.0.1:47600", "Bearer " + token, "http://localhost.evil.example:47600", "", 403},
		{"null origin", "127.0.0.1:47600", "Bearer " + token, "null", "", 403},
		{"origin userinfo", "127.0.0.1:47600", "Bearer " + token, "http://evil@localhost:47600", "", 403},
		{"origin path", "127.0.0.1:47600", "Bearer " + token, "http://localhost:47600/path", "", 403},
		{"origin query", "127.0.0.1:47600", "Bearer " + token, "http://localhost:47600?x", "", 403},
		{"empty query", "127.0.0.1:47600", "Bearer " + token, "http://localhost:47600?", "", 403},
		{"fragment", "127.0.0.1:47600", "Bearer " + token, "http://localhost:47600#", "", 403},
		{"origin empty port", "127.0.0.1:47600", "Bearer " + token, "http://localhost:", "", 403},
		{"origin invalid port", "127.0.0.1:47600", "Bearer " + token, "http://localhost:99999", "", 403},
		{"origin list", "127.0.0.1:47600", "Bearer " + token, "http://localhost https://evil.example", "", 403},
		{"body limit", "127.0.0.1:47600", "Bearer " + token, "", strings.Repeat("x", 17), 413},
		{"body at limit", "127.0.0.1:47600", "Bearer " + token, "", strings.Repeat("x", 16), 204},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			called := false
			h := wrap(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				called = true
				b, err := io.ReadAll(r.Body)
				if err != nil || string(b) != tc.body {
					t.Errorf("body changed: %q, %v", b, err)
				}
				w.WriteHeader(204)
			}))
			r := httptest.NewRequest("POST", "http://127.0.0.1:47600/mcp", strings.NewReader(tc.body))
			r.Host = tc.host
			r.Header.Set("Authorization", tc.auth)
			r.Header.Set("X-Forwarded-Host", "localhost:47600")
			if tc.origin != "" {
				r.Header.Set("Origin", tc.origin)
			}
			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)
			if w.Code != tc.want || called != (tc.want == 204) {
				t.Fatalf("status %d, called %v; want %d", w.Code, called, tc.want)
			}
			if strings.Contains(w.Body.String(), token) {
				t.Fatal("token in response")
			}
			for key := range w.Header() {
				if strings.HasPrefix(strings.ToLower(key), "access-control-") {
					t.Fatal("CORS header emitted")
				}
			}
		})
	}
}

func TestGuardRejectsDuplicateAndEmptyHeaders(t *testing.T) {
	wrap, _ := NewGuard("token", 47600, 16)
	for _, tc := range []struct {
		name, header string
		values       []string
		want         int
	}{
		{"duplicate auth", "Authorization", []string{"Bearer token", "Bearer token"}, 401},
		{"duplicate origin", "Origin", []string{"http://localhost", "http://localhost"}, 403},
		{"empty origin", "Origin", []string{""}, 403},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest("POST", "http://localhost:47600/mcp", nil)
			r.Header.Set("Authorization", "Bearer token")
			r.Header[tc.header] = tc.values
			w := httptest.NewRecorder()
			wrap(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("rejected request dispatched") })).ServeHTTP(w, r)
			if w.Code != tc.want {
				t.Fatalf("got %d, want %d", w.Code, tc.want)
			}
		})
	}
}

func TestGuardInvalidConfiguration(t *testing.T) {
	for _, tc := range []struct {
		token string
		port  int
		limit int64
	}{
		{"", 47600, 16}, {"has space", 47600, 16}, {"token", 0, 16}, {"token", 65536, 16}, {"token", 47600, 0},
	} {
		if _, err := NewGuard(tc.token, tc.port, tc.limit); err == nil {
			t.Fatal("invalid config accepted")
		}
	}
}

func TestGuardChunkedAndTokenNeverLogged(t *testing.T) {
	const token = "secret-not-for-logs"
	var logs bytes.Buffer
	s := httptest.NewUnstartedServer(nil)
	port := s.Listener.Addr().(*net.TCPAddr).Port
	wrap, err := NewGuard(token, port, 16)
	if err != nil {
		t.Fatal(err)
	}
	s.Config.ErrorLog = log.New(&logs, "", 0)
	s.Config.Handler = wrap(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("oversized request dispatched") }))
	s.Start()
	defer s.Close()
	r, _ := http.NewRequest("POST", s.URL+"/mcp", io.NopCloser(strings.NewReader(strings.Repeat("x", 17))))
	r.Header.Set("Authorization", "Bearer "+token)
	r.ContentLength = -1
	res, err := s.Client().Do(r)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	res.Body.Close()
	s.Close()
	if res.StatusCode != 413 {
		t.Fatalf("status %d", res.StatusCode)
	}
	if strings.Contains(logs.String()+string(body), token) {
		t.Fatal("credential exposed")
	}
}

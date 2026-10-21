package listen

import "testing"

func TestLoopbackOnly(t *testing.T) {
	for _, bad := range []string{"0.0.0.0:0", ":0", "localhost:0", "[::]:0", "[::1]:0", "127.0.0.1:-1", "127.0.0.1:65536"} {
		t.Run(bad, func(t *testing.T) {
			if ln, _, err := Open(bad); err == nil {
				ln.Close()
				t.Fatal("accepted non-loopback/invalid address")
			}
		})
	}
	ln, endpoint, err := Open("127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	if err := ValidateEndpoint(endpoint); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"https://127.0.0.1:1234", "http://localhost:1234", "http://example.com:1234", "http://127.0.0.1:1234/path", "http://secret@127.0.0.1:1234", "http://127.0.0.1:1234?x=1", "http://127.0.0.1:0", "http://127.0.0.1"} {
		if err := ValidateEndpoint(bad); err == nil {
			t.Fatalf("accepted endpoint %s", bad)
		}
	}
}

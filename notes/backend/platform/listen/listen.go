// Package listen binds the local API strictly to IPv4 loopback.
package listen

import (
	"fmt"
	"net"
	"net/url"
	"strconv"
)

func ValidateEndpoint(endpoint string) error {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "http" || u.Hostname() != "127.0.0.1" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return fmt.Errorf("core endpoint must be an HTTP IPv4 loopback origin")
	}
	p, err := strconv.Atoi(u.Port())
	if err != nil || p < 1 || p > 65535 {
		return fmt.Errorf("core endpoint requires a valid port")
	}
	return nil
}
func Open(address string) (net.Listener, string, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil || host != "127.0.0.1" {
		return nil, "", fmt.Errorf("listen address must be 127.0.0.1:<port>")
	}
	p, err := strconv.Atoi(port)
	if err != nil || p < 0 || p > 65535 {
		return nil, "", fmt.Errorf("invalid listen port")
	}
	ln, err := net.Listen("tcp4", address)
	if err != nil {
		return nil, "", fmt.Errorf("listen loopback: %w", err)
	}
	return ln, "http://" + ln.Addr().String(), nil
}

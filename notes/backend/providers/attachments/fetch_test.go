package attachments

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"sync/atomic"
	"testing"
	"time"
)

type stubResolver struct {
	lookup func(ctx context.Context, network, host string) ([]netip.Addr, error)
}

func (s stubResolver) LookupNetIP(ctx context.Context, network, host string) ([]netip.Addr, error) {
	return s.lookup(ctx, network, host)
}

func TestSSRFGuardRejectsPrivateDestinations(t *testing.T) {
	for _, raw := range []string{"http://127.0.0.1/", "http://10.0.0.1/", "http://169.254.1.2/", "http://[::1]/", "http://localhost/", "http://0.0.0.0/", "http://[::]/", "http://[::ffff:0.0.0.0]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/", "http://2130706433/", "http://0177.0.0.1/", "http://0x7f000001/", "http://user:pass@example.com/"} {
		t.Run(raw, func(t *testing.T) {
			u, e := url.Parse(raw)
			if e != nil {
				t.Fatal(e)
			}
			if e = validatePublicURL(context.Background(), u); e == nil {
				t.Fatal("private destination accepted")
			}
		})
	}
}

func TestSSRFGuardRejectsPrivateResolvedAddress(t *testing.T) {
	if !blocked(netip.MustParseAddr("192.168.1.2")) {
		t.Fatal("private resolved address not blocked")
	}
}

func TestSSRFGuardRejectsDNSRebindingToPrivateIP(t *testing.T) {
	old := lookupIPs
	t.Cleanup(func() { lookupIPs = old })
	lookupIPs = stubResolver{lookup: func(context.Context, string, string) ([]netip.Addr, error) {
		return []netip.Addr{netip.MustParseAddr("192.168.50.1")}, nil
	}}
	u, err := url.Parse("http://rebind.example/")
	if err != nil {
		t.Fatal(err)
	}
	if err = validatePublicURL(context.Background(), u); err == nil {
		t.Fatal("hostname resolving to private IP accepted")
	}
}

func TestSSRFGuardRejectsRebindingAtDialTime(t *testing.T) {
	old := lookupIPs
	t.Cleanup(func() { lookupIPs = old })
	var lookups atomic.Int32
	lookupIPs = stubResolver{lookup: func(context.Context, string, string) ([]netip.Addr, error) {
		if lookups.Add(1) == 1 {
			return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
		}
		return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
	}}
	u, err := url.Parse("http://rebind.example/")
	if err != nil {
		t.Fatal(err)
	}
	if err = validatePublicURL(context.Background(), u); err != nil {
		t.Fatalf("expected first lookup to pass validation: %v", err)
	}
	if _, err = dialPublic(context.Background(), "tcp", "rebind.example:80"); err == nil {
		t.Fatal("dial accepted private address after DNS rebinding")
	}
}

func TestSSRFGuardRejectsRedirectToPrivateDestination(t *testing.T) {
	for _, target := range []string{"http://127.0.0.1/", "http://10.0.0.1/", "http://192.168.0.1/", "http://169.254.0.1/"} {
		t.Run(target, func(t *testing.T) {
			next, err := http.NewRequest(http.MethodGet, target, nil)
			if err != nil {
				t.Fatal(err)
			}
			if err = checkPublicRedirect(next, []*http.Request{{URL: &url.URL{Scheme: "http", Host: "example.com"}}}); err == nil {
				t.Fatal("redirect to private destination accepted")
			}
		})
	}
}

func TestSSRFGuardRedirectDialRevalidatesResolvedIP(t *testing.T) {
	old := lookupIPs
	t.Cleanup(func() { lookupIPs = old })
	var lookups atomic.Int32
	lookupIPs = stubResolver{lookup: func(_ context.Context, _, host string) ([]netip.Addr, error) {
		if host != "private.example" {
			return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
		}
		if lookups.Add(1) == 1 {
			return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
		}
		return []netip.Addr{netip.MustParseAddr("10.0.0.5")}, nil
	}}
	redirect, err := url.Parse("http://private.example/")
	if err != nil {
		t.Fatal(err)
	}
	req := &http.Request{URL: redirect}
	if err = checkPublicRedirect(req, []*http.Request{{URL: &url.URL{Scheme: "http", Host: "redirect.example"}}}); err != nil {
		t.Fatalf("public redirect hop rejected: %v", err)
	}
	if _, err = dialPublic(context.Background(), "tcp", net.JoinHostPort("private.example", "80")); err == nil {
		t.Fatal("dial accepted private address on redirect target")
	}
}

func TestTitleValidationSharesDeadline(t *testing.T) {
	old := lookupIPs
	t.Cleanup(func() { lookupIPs = old })
	lookupIPs = stubResolver{lookup: func(ctx context.Context, _, _ string) ([]netip.Addr, error) {
		deadline, ok := ctx.Deadline()
		if !ok || time.Until(deadline) > 5*time.Second {
			t.Error("missing shared title deadline")
		}
		<-ctx.Done()
		return nil, ctx.Err()
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	if _, err := FetchTitle(ctx, "https://slow.example"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("validation cancellation: %v", err)
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, "https://slow.example", nil)
	if err := checkPublicRedirect(req, nil); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("redirect cancellation: %v", err)
	}
}

func TestTitleDialSharesValidationDeadline(t *testing.T) {
	old := lookupIPs
	t.Cleanup(func() { lookupIPs = old })
	var deadline time.Time
	var calls int
	done := make(chan struct{})
	lookupIPs = stubResolver{lookup: func(ctx context.Context, _, _ string) ([]netip.Addr, error) {
		calls++
		current, ok := ctx.Deadline()
		if !ok {
			t.Error("DNS has no deadline")
		}
		if calls == 1 {
			deadline = current
			return []netip.Addr{netip.MustParseAddr("93.184.216.34")}, nil
		}
		if !current.Equal(deadline) {
			t.Error("dial reset the title deadline")
		}
		<-ctx.Done()
		close(done)
		return nil, ctx.Err()
	}}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	if _, err := FetchTitle(ctx, "https://slow-dial.example/"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("dial cancellation: %v", err)
	}
	// Join the resolver before restoring the injected resolver.
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("dial DNS did not finish")
	}
}

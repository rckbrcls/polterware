package attachments

import (
	"net/netip"
	"testing"
)

func TestPublicFetchRejectsSharedSpaceAndIPv4Translators(t *testing.T) {
	for _, address := range []string{"100.64.0.1", "100.100.100.200", "198.18.0.1", "0.1.2.3", "240.0.0.1", "64:ff9b::7f00:1", "64:ff9b:1::a9fe:a9fe", "2002:7f00:1::", "2001:db8::1", "::ffff:127.0.0.1"} {
		if !blocked(netip.MustParseAddr(address)) {
			t.Fatalf("accepted non-public fetch target %s", address)
		}
	}
	for _, address := range []string{"8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"} {
		if blocked(netip.MustParseAddr(address)) {
			t.Fatalf("blocked public target %s", address)
		}
	}
}

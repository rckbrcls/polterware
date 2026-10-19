package activity

import (
	"context"
	"fmt"
	"github.com/polterware/polterware/notes/backend/domains/actor"
	"github.com/polterware/polterware/notes/backend/domains/clock"
	"github.com/polterware/polterware/notes/backend/domains/fault"
	"github.com/polterware/polterware/notes/backend/domains/ids"
	"github.com/polterware/polterware/notes/backend/domains/tx"
	"sort"
	"strings"
	"unicode/utf8"
)

// Audit joins each mutation and its event in the same transaction.
// The core supplies the clock, ULID generator, repository and transaction manager.
type Audit struct {
	Repository   Repository
	Transactions tx.Manager
	Clock        clock.Clock
	IDs          ids.Generator
}

func (a Audit) Write(ctx context.Context, who actor.Actor, entity, id, op, summary string, fn func(context.Context) error) error {
	if who.Raw != "ui" && who.Raw != "cli" && who.Raw != "system" && !(strings.HasPrefix(who.Raw, "mcp:") && len(who.Raw) > 4) {
		return fault.Invalid(fault.Violation{Field: "actor", Reason: "unknown actor"})
	}
	return a.Transactions.Within(ctx, func(ctx context.Context) error {
		if err := fn(ctx); err != nil {
			return fmt.Errorf("%s %s: %w", op, entity, err)
		}
		if err := a.Repository.Append(ctx, Event{ID: a.IDs.New(), At: a.Clock.Now().UTC(), Actor: who.Raw, Entity: entity, EntityID: id, Op: op, Summary: summary}); err != nil {
			return fmt.Errorf("append activity: %w", err)
		}
		return nil
	})
}

type service struct{ repository Repository }

func NewService(r Repository) Service { return &service{r} }
func (s *service) List(ctx context.Context, cursor, actor string, limit int) (Page, error) {
	if limit == 0 {
		limit = 50
	}
	if limit < 1 || limit > 500 {
		return Page{}, Invalid("limit", "must be between 1 and 500")
	}
	return s.repository.List(ctx, cursor, actor, limit)
}
func Invalid(field, reason string) error {
	return fault.Invalid(fault.Violation{Field: field, Reason: reason})
}
func ValidateName(field, value string, max int) error {
	if strings.TrimSpace(value) == "" || utf8.RuneCountInString(value) > max {
		return Invalid(field, fmt.Sprintf("must contain 1 to %d characters", max))
	}
	return nil
}
func ValidateColor(value *string) error {
	if value == nil {
		return nil
	}
	if len(*value) != 7 || (*value)[0] != '#' {
		return Invalid("color", "must be #RRGGBB")
	}
	for _, c := range (*value)[1:] {
		if !strings.ContainsRune("0123456789abcdefABCDEF", c) {
			return Invalid("color", "must be #RRGGBB")
		}
	}
	return nil
}

// Lookup resolves an exact case-insensitive name; suggestions are deterministic.
func Lookup(name string, names map[string]string) (string, error) {
	var suggestions []string
	for id, n := range names {
		if strings.EqualFold(n, name) {
			return id, nil
		}
		if strings.Contains(strings.ToLower(n), strings.ToLower(name)) || strings.Contains(strings.ToLower(name), strings.ToLower(n)) {
			suggestions = append(suggestions, n)
		}
	}
	sort.Strings(suggestions)
	return "", &fault.Error{Code: fault.CodeNotFound, Message: fmt.Sprintf("name %q not found; did you mean: %s", name, strings.Join(suggestions, ", "))}
}

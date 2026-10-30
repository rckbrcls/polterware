package canon

import (
	"testing"
)

func TestNewFactDeclaredAndNoObserved(t *testing.T) {
	fact, err := NewFact("proj", "go.mod declares module polterware", "", "polterware", "system", "")
	if err != nil {
		t.Fatal(err)
	}
	if fact.ID == "" || fact.TruthClass != TruthDeclared {
		t.Fatalf("%+v", fact)
	}
	if err := ValidateFact(fact); err != nil {
		t.Fatal(err)
	}
	if _, err := NewFact("proj", "seen in a file", TruthObserved, "import:go.mod", "system", ""); err != ErrInvalid {
		t.Fatalf("observed facts are retired, got %v", err)
	}
}

func TestNewFactVerifiedRequiresActor(t *testing.T) {
	_, err := NewFact("proj", "API gateway owns auth", TruthVerified, "human", "system", "")
	if err != ErrVerifiedRequiresActor {
		t.Fatalf("expected ErrVerifiedRequiresActor, got %v", err)
	}
	fact, err := NewFact("proj", "API gateway owns auth", TruthVerified, "human", "erick", "ent-1")
	if err != nil {
		t.Fatal(err)
	}
	if fact.Actor != "erick" || fact.EntityID != "ent-1" {
		t.Fatalf("%+v", fact)
	}
}

func TestFactRejectsOperational(t *testing.T) {
	_, err := NewFact("proj", "run succeeded", TruthOperational, "ops", "system", "")
	if err != ErrInvalid {
		t.Fatalf("operational must be invalid on facts, got %v", err)
	}
}

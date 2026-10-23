package canon

import "testing"

func TestNewFactObserved(t *testing.T) {
	fact, err := NewFact("proj", "go.mod declares module polterware", TruthObserved, "import:go.mod", "system", "")
	if err != nil {
		t.Fatal(err)
	}
	if fact.ID == "" || fact.TruthClass != TruthObserved {
		t.Fatalf("%+v", fact)
	}
	if err := ValidateFact(fact); err != nil {
		t.Fatal(err)
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

func TestNewEvidence(t *testing.T) {
	ev, err := NewEvidence("proj", EvidenceKindFile, "go.mod module line", "fs", "go.mod", "system")
	if err != nil {
		t.Fatal(err)
	}
	if err := ValidateEvidence(ev); err != nil {
		t.Fatal(err)
	}
	_, err = NewEvidence("proj", "bogus", "x", "fs", "", "system")
	if err != ErrInvalid {
		t.Fatalf("expected invalid kind, got %v", err)
	}
}

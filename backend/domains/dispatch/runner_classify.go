package dispatch

import (
	"fmt"
	"path/filepath"

	adapter "github.com/polterware/polterware/backend/providers/dispatch/adapters"
)

func (d Deps) classifierPath() string {
	dir := d.stateDir()
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, "classifier.json")
}

func (d Deps) classifyRequest(rec *Run, promote bool) {
	t := adapter.Tier(rec.Tier)
	if !t.Valid() {
		return // provider/model-only runs have no known requested difficulty
	}
	rec.RequestedTier = rec.Tier
	in := Input{Prompt: rec.Prompt, Dir: rec.Dir, ReadOnly: rec.ReadOnly, Tier: t}
	f := Extract(in)
	m, _ := LoadClassifier(d.classifierPath()) // an I/O error also returns the prior
	p := m.Predict(t, f, false)
	if promote && f.Sensitive() && Higher(t) != t {
		rec.Tier = string(Higher(t))
		rec.Note = joinNote(rec.Note, fmt.Sprintf("sensitive code: tier %s -> %s", t, rec.Tier))
	} else if p.SuggestedTier != t {
		rec.Note = joinNote(rec.Note, fmt.Sprintf("classifier warning: suggests tier %s above %s (failure score %.3f)", p.SuggestedTier, t, p.Score))
	}
	rec.FeatureSchema = FeatureSchema
	rec.ClassifyFeatures = append([]float64(nil), f[:]...)
}

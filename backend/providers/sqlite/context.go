package sqlite

import (
	"strings"

	"github.com/polterware/polterware/backend/domains/canon"
	contextpkg "github.com/polterware/polterware/backend/domains/context"
	"github.com/polterware/polterware/backend/domains/knowledge"
	"github.com/polterware/polterware/backend/domains/structure"
)

const (
	contextSampleEntityLimit = 8
	contextSampleFactLimit   = 8
)

func (s *Store) CompileContext(req contextpkg.Request) (contextpkg.Package, error) {
	candidates := make([]contextpkg.Item, 0, 32)

	if req.EntityID != "" {
		entity, err := s.GetCanonEntity(req.EntityID)
		if err == nil {
			candidates = append(candidates, contextpkg.Item{
				Kind: "entity", ID: entity.ID, Title: entity.Title,
				Excerpt:    entity.Kind + " · " + entity.RefKind + "/" + entity.RefID,
				TruthClass: entity.TruthClass, Source: entity.Source, Path: canon.FormatPath(entity),
				Reasons: []string{contextpkg.ReasonExactEntity},
			})
			links, err := s.ListKnowledgeLinks(req.ProjectID, "", entity.ID)
			if err != nil {
				return contextpkg.Package{}, err
			}
			for _, link := range links {
				item, err := s.getActiveKnowledge(link.KnowledgeID)
				if err != nil {
					continue
				}
				candidates = append(candidates, contextpkg.Item{
					Kind: item.Kind, ID: item.ID, Title: item.Title,
					Excerpt:    contextpkg.Excerpt(firstNonEmpty(item.Summary, item.Body), 280),
					TruthClass: link.TruthClass, Source: link.Source,
					Path:    "knowledge/" + item.Kind + "/" + item.ID,
					Reasons: []string{contextpkg.ReasonKnowledgeLink},
				})
			}
			rels, err := s.ListCanonRelationships(req.ProjectID, entity.ID)
			if err != nil {
				return contextpkg.Package{}, err
			}
			for _, rel := range rels {
				otherID := rel.ObjectEntityID
				if otherID == entity.ID {
					otherID = rel.SubjectEntityID
				}
				other, err := s.GetCanonEntity(otherID)
				if err != nil {
					continue
				}
				candidates = append(candidates, contextpkg.Item{
					Kind: "entity", ID: other.ID, Title: other.Title,
					Excerpt:    rel.Predicate + " · " + other.Kind,
					TruthClass: rel.TruthClass, Source: rel.Source, Path: canon.FormatPath(other),
					Reasons: []string{contextpkg.ReasonRelationshipHop},
				})
			}
			factItems, err := s.factContextItems(req.ProjectID, req.EntityID, "", contextpkg.ReasonFactForEntity, 0)
			if err != nil {
				return contextpkg.Package{}, err
			}
			candidates = append(candidates, factItems...)
		}
	}

	if strings.TrimSpace(req.Query) != "" {
		hits, err := s.SearchKnowledge(req.ProjectID, req.Query, "", 12)
		if err != nil {
			return contextpkg.Package{}, err
		}
		for _, hit := range hits {
			candidates = append(candidates, contextpkg.Item{
				Kind: hit.Item.Kind, ID: hit.Item.ID, Title: hit.Item.Title,
				Excerpt:    contextpkg.Excerpt(firstNonEmpty(hit.Snippet, hit.Item.Summary, hit.Item.Body), 280),
				TruthClass: hit.TruthClass, Source: hit.Source,
				Path:    "knowledge/" + hit.Item.Kind + "/" + hit.Item.ID,
				Reasons: []string{contextpkg.ReasonFTSHit},
			})
		}
		entities, err := s.ListCanonEntities(req.ProjectID, "")
		if err != nil {
			return contextpkg.Package{}, err
		}
		needle := strings.ToLower(strings.TrimSpace(req.Query))
		for _, entity := range entities {
			if !strings.Contains(strings.ToLower(entity.Title), needle) &&
				!strings.Contains(strings.ToLower(entity.RefID), needle) {
				continue
			}
			candidates = append(candidates, contextpkg.Item{
				Kind: "entity", ID: entity.ID, Title: entity.Title,
				Excerpt:    entity.Kind + " · " + entity.RefID,
				TruthClass: entity.TruthClass, Source: entity.Source, Path: canon.FormatPath(entity),
				Reasons: []string{contextpkg.ReasonTitleMatch},
			})
		}
		factItems, err := s.factContextItems(req.ProjectID, "", req.Query, contextpkg.ReasonFactQueryMatch, 0)
		if err != nil {
			return contextpkg.Package{}, err
		}
		candidates = append(candidates, factItems...)
	}

	if len(candidates) == 0 && req.EntityID == "" && strings.TrimSpace(req.Query) == "" {
		entities, err := s.ListCanonEntities(req.ProjectID, "")
		if err != nil {
			return contextpkg.Package{}, err
		}
		for i, entity := range entities {
			if i >= contextSampleEntityLimit {
				break
			}
			candidates = append(candidates, contextpkg.Item{
				Kind: "entity", ID: entity.ID, Title: entity.Title,
				Excerpt:    entity.Kind + " · " + entity.RefID,
				TruthClass: entity.TruthClass, Source: entity.Source, Path: canon.FormatPath(entity),
				Reasons: []string{contextpkg.ReasonProjectSample},
			})
		}
		factItems, err := s.factContextItems(req.ProjectID, "", "", contextpkg.ReasonImportedFact, contextSampleFactLimit)
		if err != nil {
			return contextpkg.Package{}, err
		}
		candidates = append(candidates, factItems...)
	}

	candidates, err := s.scopeContextItems(req, candidates)
	if err != nil {
		return contextpkg.Package{}, err
	}
	return contextpkg.Compile(req, dedupeContextItems(candidates)), nil
}

// scopeContextItems drops knowledge and fact candidates scoped outside the
// request's nodes (the union of each node). Entities and unscoped items stay.
func (s *Store) scopeContextItems(req contextpkg.Request, items []contextpkg.Item) ([]contextpkg.Item, error) {
	ids := req.ScopeIDs()
	if len(ids) == 0 {
		return items, nil
	}
	resolved, err := s.LoadScopes(req.ProjectID, structure.MultiScope{NodeIDs: ids, Exact: req.ScopeExact})
	if err != nil {
		return nil, err
	}
	maps := map[string]map[string][]string{}
	for _, kind := range []string{ScopeKnowledge, ScopeFact} {
		m, err := s.ScopeMap(req.ProjectID, kind)
		if err != nil {
			return nil, err
		}
		maps[kind] = m
	}
	out := make([]contextpkg.Item, 0, len(items))
	for _, item := range items {
		var nodes []string
		switch item.Kind {
		case "fact":
			nodes = maps[ScopeFact][item.ID]
		case knowledge.KindDecision, knowledge.KindDoc:
			nodes = maps[ScopeKnowledge][item.ID]
		}
		if resolved.MatchesAny(nodes) {
			out = append(out, item)
		}
	}
	return out, nil
}

func (s *Store) factContextItems(projectID, entityID, query, reason string, limit int) ([]contextpkg.Item, error) {
	facts, err := s.ListCanonFacts(projectID, entityID)
	if err != nil {
		return nil, err
	}
	needle := strings.ToLower(strings.TrimSpace(query))
	out := make([]contextpkg.Item, 0, len(facts))
	for _, fact := range facts {
		if needle != "" && !strings.Contains(strings.ToLower(fact.Statement), needle) {
			continue
		}
		itemReason := reason
		if itemReason == contextpkg.ReasonImportedFact || itemReason == "" {
			itemReason = factSampleReason(fact)
		}
		evidence, err := s.ListCanonEvidenceForFact(fact.ID)
		if err != nil {
			return nil, err
		}
		refs := make([]contextpkg.EvidenceRef, 0, len(evidence))
		for _, ev := range evidence {
			refs = append(refs, contextpkg.EvidenceRef{
				ID: ev.ID, Kind: ev.Kind, Summary: ev.Summary, Path: ev.Path, Source: ev.Source,
			})
		}
		out = append(out, contextpkg.Item{
			Kind: "fact", ID: fact.ID, Title: contextpkg.Excerpt(fact.Statement, 120),
			Excerpt:    contextpkg.Excerpt(fact.Statement, 280),
			TruthClass: fact.TruthClass, Source: fact.Source,
			Path: "canon/fact/" + fact.ID, Reasons: []string{itemReason}, Evidence: refs,
		})
		if limit > 0 && len(out) >= limit {
			break
		}
	}
	return out, nil
}

func factSampleReason(fact canon.Fact) string {
	if fact.TruthClass == canon.TruthObserved || strings.HasPrefix(fact.Source, "import:") {
		return contextpkg.ReasonImportedFact
	}
	return contextpkg.ReasonProjectSample
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func dedupeContextItems(items []contextpkg.Item) []contextpkg.Item {
	seen := map[string]int{}
	out := make([]contextpkg.Item, 0, len(items))
	for _, item := range items {
		key := item.Kind + ":" + item.ID
		if idx, ok := seen[key]; ok {
			out[idx].Reasons = contextpkg.MergeReasons(out[idx].Reasons, item.Reasons...)
			if len(out[idx].Evidence) == 0 && len(item.Evidence) > 0 {
				out[idx].Evidence = item.Evidence
			}
			continue
		}
		seen[key] = len(out)
		out = append(out, item)
	}
	return out
}

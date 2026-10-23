package mcp

import "fmt"

func (s *Server) evidenceGet(args map[string]any) (string, error) {
	id := stringFrom(args["id"])
	if id == "" {
		return "", fmt.Errorf("id is required")
	}
	evidence, err := s.Store.GetCanonEvidence(id)
	if err != nil {
		return "", err
	}
	return marshalPretty(evidence)
}

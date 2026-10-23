package mcp

import "fmt"

func (s *Server) entityGet(args map[string]any) (string, error) {
	id := stringFrom(args["id"])
	if id == "" {
		return "", fmt.Errorf("id is required")
	}
	entity, err := s.Store.GetCanonEntity(id)
	if err != nil {
		return "", err
	}
	return marshalPretty(entity)
}

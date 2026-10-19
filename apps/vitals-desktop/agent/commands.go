package main

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
)

// authorizeKill allows TERM or KILL only for a pid > 1 owned by the agent uid.
func authorizeKill(pid, agentUID, ownerUID int, ownerErr error, sig string) error {
	if pid <= 1 {
		return errors.New("pid must be greater than 1")
	}
	if sig != "TERM" && sig != "KILL" {
		return errors.New("signal must be TERM or KILL")
	}
	if ownerErr != nil {
		return ownerErr
	}
	if ownerUID != agentUID {
		return errors.New("pid belongs to another user")
	}
	return nil
}

func strictPID(raw json.RawMessage) (int, error) {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return 0, errors.New("pid must be an integer")
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, errors.New("pid must be an integer")
	}
	return n, nil
}

func dispatch(line []byte, kill func(pid int, sig string) error) (resp []byte, warn string) {
	var raw struct {
		Cmd    string          `json:"cmd"`
		PID    json.RawMessage `json:"pid"`
		Signal string          `json:"signal"`
		ID     string          `json:"id"`
	}
	if err := json.Unmarshal(line, &raw); err != nil {
		return nil, "invalid command"
	}
	switch raw.Cmd {
	case "ping":
		b, err := marshal(pongMsg{Type: "pong"})
		if err != nil {
			return nil, "invalid command"
		}
		return b, ""
	case "kill":
		result := killResultMsg{Type: "kill_result", ID: raw.ID}
		pid, err := strictPID(raw.PID)
		if err != nil {
			result.Error = err.Error()
		} else if err := kill(pid, raw.Signal); err != nil {
			result.Error = err.Error()
		} else {
			result.OK = true
		}
		b, err := marshal(result)
		if err != nil {
			return nil, "invalid command"
		}
		return b, ""
	default:
		return nil, ""
	}
}

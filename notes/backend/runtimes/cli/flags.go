package main

import (
	"flag"
	"strings"
)

type boolFlag interface {
	IsBoolFlag() bool
}

func isBoolFlag(fs *flag.FlagSet, name string) bool {
	f := fs.Lookup(name)
	if f == nil {
		return false
	}
	bf, ok := f.Value.(boolFlag)
	return ok && bf.IsBoolFlag()
}

func flagName(arg string) (name string, ok bool) {
	if arg == "-" || !strings.HasPrefix(arg, "-") {
		return "", false
	}
	name = strings.TrimLeft(arg, "-")
	name, _, _ = strings.Cut(name, "=")
	return name, name != ""
}

// parseCommand accepts flags before or after positional arguments, matching
// `pwnotes add "title" --due today` and `pwnotes rm <id> --yes`.
func parseCommand(fs *flag.FlagSet, args []string) ([]string, error) {
	var flags, pos []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if a == "--" {
			pos = append(pos, args[i+1:]...)
			break
		}
		name, isFlag := flagName(a)
		if !isFlag {
			pos = append(pos, a)
			continue
		}
		flags = append(flags, a)
		if strings.Contains(a, "=") || isBoolFlag(fs, name) {
			continue
		}
		if name == "repeat" && i+1 < len(args) && strings.EqualFold(args[i+1], "every") {
			parts := []string{"every"}
			i++
			if i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
				i++
				parts = append(parts, args[i])
				if isUint(args[i]) && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-") {
					i++
					parts = append(parts, args[i])
				}
			}
			flags = append(flags, strings.Join(parts, " "))
			continue
		}
		if i+1 < len(args) {
			flags = append(flags, args[i+1])
			i++
		}
	}
	if err := fs.Parse(flags); err != nil {
		return nil, err
	}
	return pos, nil
}

func isUint(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

package main

import (
	"fmt"
	"io"
	"strings"
)

const (
	completionZsh = `#compdef pwnotes
local -a commands
commands=(
  'serve:run the local core'
  'mcp:MCP stdio bridge'
  'status:core health'
  'doctor:diagnostics'
  'add:create a note'
  'list:list notes'
  'show:show a note'
  'done:complete a note'
  'rm:delete a note'
  'space:manage spaces'
  'tag:list tags'
  'search:full-text search'
  'today:today'\''s occurrences'
  'agenda:occurrences in a range'
  'review:streak and totals'
  'export:export a zip'
  'backup:copy the database'
  'completion:print shell completion'
)
_arguments -C \
  '(-h --help)'{-h,--help}'[show help]' \
  '-db[SQLite database path]:path:_files' \
  '1:command:->cmds' \
  '*::arg:->args'
case $state in
  cmds)
    _describe -t commands 'pwnotes command' commands
    ;;
  args)
    case $words[1] in
      add)
        _arguments '--space[Space name or id]' '--due[RFC 3339, YYYY-MM-DD, today, tomorrow, +2h]' '--repeat[daily|weekly|monthly|yearly or every N unit]'
        ;;
      list)
        _arguments '--json[JSON output]' '--status[active|completed]' '--space[Space name or id]' '--inbox[inbox only]' '--limit[page size]'
        ;;
      show|search|today|review)
        _arguments '--json[JSON output]'
        ;;
      agenda)
        _arguments '--json[JSON output]' '--from[range start]' '--to[range end]'
        ;;
      rm)
        _arguments '--yes[confirm deletion]'
        ;;
      space)
        local -a mindcmds
        mindcmds=('add:create' 'ls:list' 'rm:delete')
        _describe -t commands 'space command' mindcmds
        ;;
      tag)
        local -a tagcmds
        tagcmds=('ls:list tags')
        _describe -t commands 'tag command' tagcmds
        ;;
      mcp)
        local -a mcpcmds
        mcpcmds=('config:print client snippets')
        _describe -t commands 'mcp command' mcpcmds
        ;;
      completion)
        _values 'shell' zsh bash fish
        ;;
    esac
    ;;
esac
`

	completionBash = `# bash completion for pwnotes
_notes() {
  local cur prev
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"
  local commands="serve mcp status doctor add list show done rm space tag search today agenda review export backup completion"
  if [[ ${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "${commands}" -- "${cur}") )
    return 0
  fi
  case "${COMP_WORDS[1]}" in
    list|show|search|today|agenda|review|status|doctor)
      COMPREPLY=( $(compgen -W "--json --status --space --inbox --limit --from --to" -- "${cur}") )
      ;;
    add)
      COMPREPLY=( $(compgen -W "--space --due --repeat" -- "${cur}") )
      ;;
    rm)
      COMPREPLY=( $(compgen -W "--yes" -- "${cur}") )
      ;;
    space)
      COMPREPLY=( $(compgen -W "add ls rm --yes --parent --json" -- "${cur}") )
      ;;
    tag)
      COMPREPLY=( $(compgen -W "ls --json" -- "${cur}") )
      ;;
    mcp)
      COMPREPLY=( $(compgen -W "config claude cursor claude-desktop --json" -- "${cur}") )
      ;;
    completion)
      COMPREPLY=( $(compgen -W "zsh bash fish" -- "${cur}") )
      ;;
    export|backup)
      COMPREPLY=( $(compgen -W "--out" -- "${cur}") )
      ;;
  esac
}
complete -F _notes pwnotes
`

	completionFish = `# fish completion for pwnotes
complete -c pwnotes -f
complete -c pwnotes -s h -l help -d 'Show help'
complete -c pwnotes -l db -r -d 'SQLite database path'
complete -c pwnotes -n '__fish_use_subcommand' -a serve -d 'Run the local core'
complete -c pwnotes -n '__fish_use_subcommand' -a mcp -d 'MCP stdio bridge'
complete -c pwnotes -n '__fish_use_subcommand' -a status -d 'Core health'
complete -c pwnotes -n '__fish_use_subcommand' -a doctor -d 'Diagnostics'
complete -c pwnotes -n '__fish_use_subcommand' -a add -d 'Create a note'
complete -c pwnotes -n '__fish_use_subcommand' -a list -d 'List notes'
complete -c pwnotes -n '__fish_use_subcommand' -a show -d 'Show a note'
complete -c pwnotes -n '__fish_use_subcommand' -a done -d 'Complete a note'
complete -c pwnotes -n '__fish_use_subcommand' -a rm -d 'Delete a note'
complete -c pwnotes -n '__fish_use_subcommand' -a space -d 'Manage spaces'
complete -c pwnotes -n '__fish_use_subcommand' -a tag -d 'List tags'
complete -c pwnotes -n '__fish_use_subcommand' -a search -d 'Full-text search'
complete -c pwnotes -n '__fish_use_subcommand' -a today -d "Today's occurrences"
complete -c pwnotes -n '__fish_use_subcommand' -a agenda -d 'Occurrences in a range'
complete -c pwnotes -n '__fish_use_subcommand' -a review -d 'Streak and totals'
complete -c pwnotes -n '__fish_use_subcommand' -a export -d 'Export a zip'
complete -c pwnotes -n '__fish_use_subcommand' -a backup -d 'Copy the database'
complete -c pwnotes -n '__fish_use_subcommand' -a completion -d 'Print shell completion'
complete -c pwnotes -n '__fish_seen_subcommand_from list show search today agenda review status doctor tag space' -l json -d 'JSON output'
complete -c pwnotes -n '__fish_seen_subcommand_from add' -l space -d 'Space name or id'
complete -c pwnotes -n '__fish_seen_subcommand_from add' -l due -d 'Due date'
complete -c pwnotes -n '__fish_seen_subcommand_from add' -l repeat -d 'Recurrence'
complete -c pwnotes -n '__fish_seen_subcommand_from rm space' -l yes -d 'Confirm deletion'
complete -c pwnotes -n '__fish_seen_subcommand_from space' -a 'add ls rm'
complete -c pwnotes -n '__fish_seen_subcommand_from tag' -a ls
complete -c pwnotes -n '__fish_seen_subcommand_from mcp' -a 'config'
complete -c pwnotes -n '__fish_seen_subcommand_from completion' -a 'zsh bash fish'
`
)

func runCompletion(args []string, out, _ io.Writer) error {
	if len(args) != 1 {
		return usagef("usage: pwnotes completion zsh|bash|fish")
	}
	switch strings.ToLower(args[0]) {
	case "zsh":
		_, err := fmt.Fprint(out, completionZsh)
		return err
	case "bash":
		_, err := fmt.Fprint(out, completionBash)
		return err
	case "fish":
		_, err := fmt.Fprint(out, completionFish)
		return err
	default:
		return usagef("usage: pwnotes completion zsh|bash|fish")
	}
}

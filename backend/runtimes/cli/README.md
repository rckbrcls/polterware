# polterware CLI

```bash
cd backend
go build -o ../dist/polterware ./runtimes/cli
# or: pnpm build:cli

../dist/polterware -db /tmp/polterware-test.db init --name Demo --path /path/to/repo
../dist/polterware -db /tmp/polterware-test.db scan --project <id>
../dist/polterware -db /tmp/polterware-test.db context --project <id> --json
../dist/polterware -db /tmp/polterware-test.db query "commits <slug>"
```

Run `../dist/polterware` with no subcommand in a terminal for the status TUI (core start/stop, MCP setup for Claude Code / Codex / Cursor, sessions, runs, history).

`serve` runs the local core server the Desktop attaches to; `mcp` runs the MCP stdio server for coding agents. Other commands open SQLite in-process. Run `polterware --help` for every command.

# @easybits.cloud/cli

The official CLI for [EasyBits](https://www.easybits.cloud), the cloud for AI agents:
sandboxes, hosting, custom domains, SQL databases, agents and files from your terminal.
Built for people and for coding agents — every command takes `--json` and exit codes are stable.

## Install

```bash
npm i -g @easybits.cloud/cli        # installs `easybits`
npx -y @easybits.cloud/cli --help   # or run it without installing
```

Requires Node 22+.

## Log in

```bash
easybits login                       # opens your browser (OAuth2 + PKCE); session renews itself
easybits login --no-browser          # only print the sign-in URL
easybits login - < key.txt           # or save an API key, read from stdin (never in argv)
printenv EB_KEY | easybits login --with-token   # same as -
easybits usage
easybits logout
```

Running a command without a session in a terminal starts the login automatically;
without a terminal (agents, CI) it exits `3`. Precedence: `EASYBITS_API_KEY` env var >
`--token <key>` > browser session > saved API key. Keys: https://www.easybits.cloud/dash/developer.
In CI and agents, `EASYBITS_API_KEY` needs no login at all. `EASYBITS_URL` points the CLI at
another server (default `https://www.easybits.cloud`; `baseUrl` in `~/.easybitsrc` works too).

## Commands

```bash
# Sandboxes (alias: sb)
easybits sandboxes ls
easybits sandboxes create --template node --name scratch --dotenv .env
easybits sandboxes create --size m --timeout 1800 --no-wait   # size s|m|l|xl (plan-gated)
easybits sandboxes get sb_abc123
easybits sandboxes exec sb_abc123 -- npm test
easybits sandboxes logs sb_abc123 --unit myapp --lines 100 --since "10 min ago" --grep ERROR
easybits sandboxes files ls sb_abc123 /data/work
easybits sandboxes files read sb_abc123 /etc/os-release
easybits sandboxes files write sb_abc123 /data/work/app.js ./app.js
easybits sandboxes suspend sb_abc123
easybits sandboxes resume sb_abc123
easybits sandboxes snapshot sb_abc123 --name before-upgrade
easybits sandboxes destroy sb_abc123 --yes

# Hosting: permanent machines (alias: deploy)
easybits machines ls
easybits machines deploy sb_abc123 -m "v1.2"
easybits machines releases sb_abc123 --limit 5
easybits machines logs sb_abc123 --lines 100 --grep ERROR
easybits machines rollback sb_abc123 rel_789
easybits machines secrets ls sb_abc123
easybits machines secrets set sb_abc123 --dotenv .env.production   # - reads stdin
easybits machines secrets unset sb_abc123 DATABASE_URL
easybits init --port 3000            # GitHub Actions workflow that deploys on every push

# Domains
easybits domains ls sb_abc123
easybits domains add sb_abc123 shop.example.com --port 3000
easybits domains verify sb_abc123 shop.example.com
easybits domains rm sb_abc123 shop.example.com --yes

# Databases
easybits db ls
easybits db create leads
easybits db tables leads             # tables, row counts, columns
easybits db query leads "SELECT * FROM leads" --json
easybits db rm leads --yes

# Agents
easybits agents ls
easybits agents create --template goose --name helper --dotenv .env
easybits agents get helper          # by name or id
easybits agents message helper "hello"
easybits agents message helper "and now?" --session ses_456   # continue a conversation
easybits agents destroy helper --yes

# Files, websites, account
easybits files ls
easybits files upload ./report.pdf
easybits files delete FILE_ID --yes
easybits websites ls
easybits providers                   # storage provider (Tigris by default)
easybits usage

# MCP, SSH, docs
easybits config        # MCP config (streamable HTTP)
easybits mcp           # MCP config (stdio)
easybits ssh-key       # public key for sandbox SSH
easybits docs cli      # a docs section as markdown (--en for English)
easybits docs --open   # open the docs in your browser
```

**Names or ids.** Wherever a command takes an agent, a sandbox/machine or a database, you can
pass its name instead of the id (`easybits sb exec scratch -- ls`, `easybits domains ls shop`).
The match is exact and case-insensitive; if two share the name the CLI exits 2 and lists the ids.

Every command has help with examples: `easybits <command> <subcommand> --help`
(or `easybits help <command> <subcommand>`). A typo gets a "Did you mean" suggestion.

**Destructive commands** (`db rm`, `agents destroy`, `sandboxes destroy`, `domains rm`,
`files delete`) ask before acting in a terminal: `[y/N]`, or typing the name/id for
irreversible ones (a database, an agent, a permanent sandbox). Without a terminal they
never prompt — and neither do they with `--json`: pass `--yes` / `-y`, or they exit `2`.

**Secrets** go in a dotenv file or on stdin, never in argv (visible in `ps` and shell
history): `--dotenv <path>` (`KEY=VALUE` lines, `-` = stdin) on `sandboxes create|exec|resume`,
`agents create` and `machines secrets set`. `--env K=V` stays for non-secret values and wins
over the file. (It is not called `--env-file` because Node 22 intercepts that flag name.)

## SSH over 443

Add to `~/.ssh/config`, then `ssh <sandbox-name>.ghosty`:

```
Host *.ghosty
    ProxyCommand easybits ssh-proxy %h
    User root
```

## For coding agents

- `--json`: stdout is JSON only, errors included: `{"error":"…","code":3,"hint":"…"}` (`code` = exit code).
- Exit codes: `0` ok · `1` API error · `2` usage error · `3` no session, expired or rejected.
- Login for a person: `easybits login --json` prints `{"event":"login_url","url":…}` first (show it to them), then `{"event":"logged_in","email":…}`.
- Destructive commands need `--yes`, also with `--json` (no TTY or `--json` means no prompt: exit `2` with the exact command to rerun).
- `sandboxes exec` without `--json` exits with the remote command's code; with `--json` it exits 0 and reports `exitCode`.
- Skill: `npx skills add https://easybits.cloud` (includes `easybits-cli`).

Full reference: https://www.easybits.cloud/docs#cli · https://www.easybits.cloud/en/docs/cli.md

## Changes in 0.6.1

- Help: `--yes` is no longer listed as a global flag; it lives on each destructive command
  (and the global help says it is required without a terminal or with `--json`).
- `easybits init` suggests `machines secrets set <id> --dotenv …` instead of `KEY=VALUE` in argv.

## Changes in 0.6.0

- **Breaking for scripts:** `db rm`, `agents destroy`, `sandboxes destroy`, `domains rm` and
  `files delete` now require `--yes` when not running in a terminal (exit `2` otherwise).
- `--dotenv <path|->` for env vars and secrets; `easybits login -` / `--with-token` reads the key from stdin.
  `login <api-key>` and `secrets set KEY=VALUE` still work but are no longer advertised.
- `easybits db tables <db>`: tables with row counts and columns (`--json`: `[{name, rows, columns:[{name,type,pk}]}]`).
- "Did you mean" for unknown commands and subcommands; `easybits help <command> <subcommand>`.

## License

MIT

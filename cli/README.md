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
easybits login eb_sk_live_YOUR_KEY   # saved to ~/.easybitsrc
easybits usage
```

Get a key at https://www.easybits.cloud/dash/developer. Precedence:
`EASYBITS_API_KEY` env var > `--token <key>` > `~/.easybitsrc`.

## Commands

```bash
# Sandboxes (alias: sb)
easybits sandboxes ls
easybits sandboxes create --template node --name scratch
easybits sandboxes get sb_abc123
easybits sandboxes exec sb_abc123 -- npm test
easybits sandboxes logs sb_abc123 --unit myapp --lines 100
easybits sandboxes files ls sb_abc123 /data/work
easybits sandboxes files read sb_abc123 /etc/os-release
easybits sandboxes files write sb_abc123 /data/work/app.js ./app.js
easybits sandboxes suspend sb_abc123
easybits sandboxes resume sb_abc123
easybits sandboxes snapshot sb_abc123 --name before-upgrade
easybits sandboxes destroy sb_abc123

# Hosting: permanent machines (alias: deploy)
easybits machines ls
easybits machines deploy sb_abc123 -m "v1.2"
easybits machines releases sb_abc123
easybits machines logs sb_abc123 --grep ERROR
easybits machines rollback sb_abc123 rel_789
easybits machines secrets ls sb_abc123
easybits machines secrets set sb_abc123 DATABASE_URL=postgres://...
easybits machines secrets unset sb_abc123 DATABASE_URL
easybits init --port 3000            # GitHub Actions workflow that deploys on every push

# Domains
easybits domains ls sb_abc123
easybits domains add sb_abc123 shop.example.com --port 3000
easybits domains verify sb_abc123 shop.example.com
easybits domains rm sb_abc123 shop.example.com

# Databases
easybits db ls
easybits db create leads
easybits db query leads "SELECT * FROM leads" --json
easybits db rm leads

# Agents
easybits agents ls
easybits agents create --template goose --name helper
easybits agents message ag_123 "hello"
easybits agents destroy ag_123

# Files, websites, account
easybits files ls
easybits files upload ./report.pdf
easybits files delete FILE_ID
easybits websites ls
easybits usage

# MCP, SSH, docs
easybits config        # MCP config (streamable HTTP)
easybits mcp           # MCP config (stdio)
easybits ssh-key       # public key for sandbox SSH
easybits docs cli      # a docs section as markdown (--en for English)
```

Every command has help with examples: `easybits <command> <subcommand> --help`.

## SSH over 443

Add to `~/.ssh/config`, then `ssh <sandbox-name>.ghosty`:

```
Host *.ghosty
    ProxyCommand easybits ssh-proxy %h
    User root
```

## For coding agents

- `--json`: stdout is JSON only; errors go to stderr as `{"error":{"code","message","status","hint","exitCode"}}`.
- Exit codes: `0` ok · `1` API error · `2` usage error · `3` not logged in or key rejected.
- `sandboxes exec` without `--json` exits with the remote command's code; with `--json` it exits 0 and reports `exitCode`.
- Skill: `npx skills add https://easybits.cloud` (includes `easybits-cli`).

Full reference: https://www.easybits.cloud/docs#cli · https://www.easybits.cloud/en/docs/cli.md

## License

MIT

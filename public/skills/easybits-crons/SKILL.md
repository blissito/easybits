---
name: easybits-crons
description: "Schedule work on EasyBits from a coding agent - recurring or one-off crons that hit a URL, message one of the person's agents, or run a command with files and vault secrets in a throwaway box - and prove each one works with a real green run before saying it is done. Use when the person says things like every morning, every hour, on Mondays, at 11pm, remind me, schedule, cron job, nightly backup or recurring task, or mentions EasyBits crons."
license: MIT
compatibility: Needs Node 22+ (npx is enough), network access to https://www.easybits.cloud and an EasyBits session (easybits login) or API key
metadata:
  author: easybits
  version: "1.1"
---

# Schedule work with EasyBits crons

A cron lives in the person's EasyBits account and keeps running when your session ends.
Use the CLI (`npx -y @easybits.cloud/cli`, binary `easybits`) with `--json`; the REST API
(`/api/v2/crons`) and MCP (`create_cron`) take the same fields if you have no shell.
Check the session first: `easybits usage --json` (exit 3 = run `easybits login --json`).

## 1. Pick the action

| They want | Action | Flags |
|---|---|---|
| Call an endpoint they own | http | `--url https://… [--method POST --body '{…}'] [--secret NAME]` |
| Ask one of their agents to do something | agent message | `--agent <fleetAgentId> --prompt "…"` |
| Run code (scrape, backup, report, check) | command | `--run "<command>" [--file ./script.py] [--secret NAME] [--template python\|node\|bun\|ubuntu] [--timeout 300]` |

A command runs in a NEW box each time that is destroyed afterwards: nothing persists between runs
except what the script writes elsewhere (a URL, an EasyBits database, a file upload). Success = exit 0.

## 2. Schedule

- Recurring: `--cron "30 8 * * 1-5"` (5 fields, read in `--tz`, default America/Mexico_City). Minimum every 5 minutes.
- One-off: `--at 23:00` (today; a past time is an error, never "tomorrow"), `--at 2026-11-01T09:00`, or `--in 2h`.
- Stop on its own: `--until 2026-12-31` or `--times 10`.
- Always confirm the local time first: `easybits crons create … --dry-run --json` → `{nextRuns:[{local}]}`. Say those times back to the person.

## 3. Secrets — never in the command

- A vault secret by name: `--secret API_TOKEN` → env var `$API_TOKEN` for a command, or the auth header for a URL.
  List names with `easybits secrets ls --json`; if one is missing, ask the person to run `easybits secrets set NAME` (it prompts) — never ask them to paste a value to you.
- A key file only this cron can read: `--secret-file KEY_P8:~/.keys/AuthKey.p8` (uploaded once, written at the same path in the box).
- Never put a value in `--run`, `--body`, `--prompt` or a `--file`.
- The data of one of their apps: `--machine <id|name>` runs the command with that machine's config
  (its env and secrets, e.g. `DATABASE_URL` / `EASYBITS_DB_URL`), resolved on every run. Don't copy a
  machine's secret into the vault: rotating it on the machine already applies to the cron.

## 4. Prove it works (required)

```bash
easybits crons create "Nightly report" --cron "0 23 * * *" --run "python3 report.py" --file ./report.py --secret DB_URL --json
easybits crons run "Nightly report" --json          # start one now
easybits crons wait "Nightly report" --timeout 15m --json   # blocks; exits with the run's code
easybits crons runs "Nightly report" --logs --limit 1 --json   # {ok, exitCode, summary, error, logs}
```

If it failed, read `error`, `exitCode` and the last lines of `logs`, fix the script or the cron
(`easybits crons update <id> --run … --file …`), and run it again. Do not tell the person the cron
is ready until a run came back `ok: true`. Show them the schedule (`nextRunLocal`) and the green run.

## 5. Let them know when it matters

`--notify push,email --notify-on failure` (default) or `always`; `inbox:<name>` delivers each result to an
event inbox they can `easybits inbox listen`. They can also see, run and edit everything in
https://www.easybits.cloud/dash/developer/crons, where Bittor (the panel assistant) can explain a failure.

## Limits

Byte 3 crons, Mega 20, Tera 100 (one-offs that already ran don't count). `--timeout` ≤ 600 s.
Files ≤ 512 KB total. URLs must be public https. 20 failures in a row turn a cron off (`enabled:false`).
Manage: `easybits crons ls|get|runs|update|pause|resume|rm <id|name> --json` (`rm` needs `--yes`).

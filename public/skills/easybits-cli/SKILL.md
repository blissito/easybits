---
name: easybits-cli
description: "Drive EasyBits from the terminal with the easybits CLI (npm @easybits.cloud/cli) - sandboxes, exec, sandbox files, permanent machines and releases, secrets, custom domains, site-builder sites, documents (HTML pages → URL, PDF, PNG), video projects (HTML scenes → MP4), SQL databases, agents (prompt, skills, MCP, files, clone) and files, all with --json and stable exit codes. Use when a coding agent has a shell and needs to create or operate EasyBits resources without writing HTTP calls, or when the user mentions the easybits CLI."
license: MIT
compatibility: Needs Node 22+ (npx is enough), network access to https://www.easybits.cloud and an EasyBits API key
metadata:
  author: easybits
  version: "1.22"
---

# Use the EasyBits CLI

`easybits` wraps the EasyBits REST API v2 in commands. Prefer it over hand-written `curl`
when you have a shell: arguments are validated, output is stable JSON with `--json`, and
the exit code tells you what went wrong.

## Setup

```bash
npx -y @easybits.cloud/cli --version      # no install needed
npm i -g @easybits.cloud/cli              # or install once → `easybits`
easybits usage --json                     # exit 3 = no session yet
```

### Log the person in (you drive it, they click)

```bash
easybits login --json
# → {"event":"login_url","url":"https://www.easybits.cloud/oauth/authorize?…"}   (immediately)
# → {"event":"logged_in","email":"…","method":"oauth"}                         (after they sign in)
```

Show the `login_url` link to the person and keep the command running until
`logged_in` arrives (it opens their browser too; `--no-browser` skips that). The
session renews itself (before expiry, and once on a 401). It uses a loopback redirect, so the browser must be on the same
machine as the CLI; otherwise ask for an API key.

Alternatives: `EASYBITS_API_KEY` (preferred in CI, needs no login), or save a key read from
stdin — never put it in argv (`ps` and shell history see it):

```bash
easybits login - < key.txt                       # validated before it is saved
printenv EB_KEY | easybits login --with-token     # same thing
easybits logout                                   # forget session and key
```

Precedence: `EASYBITS_API_KEY` > `--token` > browser session > saved key. Keys come from
https://www.easybits.cloud/dash/developer — never invent one. `EASYBITS_URL` points the CLI
at another server (default https://www.easybits.cloud).

## Rules for agents

0. Output language follows the locale (`LANG=es_*` → Spanish). Parse `--json` keys and exit
   codes, never prose; pass `--lang en` if you need to match English text.
   (`easybits completion zsh|bash|fish` is for people at a terminal; you don't need it.)

1. Always pass `--json`. stdout is then JSON only, errors included:
   `{"error":"…","code":3,"hint":"…"}` (`code` is the exit code). Read only stdout.
2. Branch on the exit code:

   | Exit | Meaning | What to do |
   |---|---|---|
   | 0 | ok | continue |
   | 1 | API error (4xx/5xx) | read `error.message`/`hint`; 404 → wrong id, 402 → plan limit |
   | 2 | usage error | fix the command; run `easybits <cmd> <sub> --help` |
   | 3 | no session / expired / rejected | run `easybits login --json` (above) or ask for a key |

   Named API errors come inside `error` (e.g. `API error 409: SandboxBusy: …`) with a `hint`:
   `SandboxBusy` 409 (snapshot/fork running — `easybits sb get <id>` shows `activity`; retry
   in minutes), `SandboxNotReady` 409 (wait for running), `SandboxUnreachable` 409 (retry, else
   destroy), `SandboxHostTimeout` 504 (may still be running; check before repeating),
   `SandboxHostError` 502 (retry), `AgentLimitReached` 403 (plan full of persistent agents:
   Byte 1, Mega 2, Tera 5 — delete one or upgrade; do not retry), `SQL_ERROR` 400 (fix the SQL), `DATABASE_STORAGE_MISSING` 409
   (data gone; `db rm` and recreate), `DATABASE_BACKEND_ERROR` 502 (retry).
3. `sandboxes exec` without `--json` exits with the remote command's code. With `--json`
   it exits 0 and reports `exitCode`, `stdout`, `stderr`. Put the command after `--`.
4. Put flags after the subcommand: `easybits sb create --template node`, not
   `easybits --template node sb create`.
5. Deletes need `--yes`: `sb destroy`, `machines rm`, `agents destroy`, `db rm`, `domains rm`, `files rm`,
   `agents files rm`, `agents skills rm`, `documents rm|rm-page`, `video projects|scenes rm`.
   With `--json` (or no terminal) they never prompt; without `--yes` they exit 2.
6. Names work where ids do: any agent, sandbox/machine, database, site, document or video project argument takes its name
   (`easybits agents get helper`, `easybits sb exec scratch -- ls`, `easybits db query leads …`).
   Exact match, case-insensitive. Two with the same name → exit 2, `error` says so and `hint`
   lists the ids: retry with one. For destructive commands prefer the id you got back on create.
7. Command shape is `easybits <noun> <verb>` (like `gh`). Old spellings (`easybits config`,
   `easybits mcp`, `deploy ls`, `machines release`, `sb create --timeout`) still run but print the
   new form on stderr; use the new one: `mcp config [--stdio]`, `machines ls`, `deploy <machine>`,
   `sb create --ttl`. `easybits whoami --json` tells you which account and credential are in use.
8. Agent writes (`agents set|create|files put|rm|skills add|rm|mcp set`) take `--dry-run`: preview
   first, then run it, then verify with `easybits agents try <agent> "…" --json` (one full turn as
   text) or `easybits agents doctor <agent> --json` (exit 1 on a problem). `easybits doctor --json`
   checks the CLI itself (Node, version, credential, API).
9. Destroy what you create. Sandboxes you did not create belong to the user: do not
   suspend, exec into or destroy them unless asked.

## Sandboxes (Firecracker microVMs, alias `sb`)

```bash
ID=$(easybits sb create --template node --name scratch --ttl 1800 --json | jq -r .sandboxId)
easybits sb ls --json
easybits sb get "$ID" --json                                 # status, expiresAt, activity
easybits sb exec "$ID" --json -- 'cd /data/work && npm ci && npm test'
easybits sb files write "$ID" /data/work/app.js ./app.js     # or --content '...', or stdin
easybits sb files read  "$ID" /data/work/out.json            # --out file for binaries; 8 MB cap (exit 1 "truncated": gzip/split it with exec first)
easybits sb files ls    "$ID" /data/work --json
easybits sb files mkdir "$ID" /data/work/out && easybits sb files mv "$ID" /data/work/a.txt /data/work/out/a.txt
easybits sb files rm "$ID" /data/work/tmp -r --yes --json
easybits sb bg start "$ID" --cwd /data/work --json -- npm run dev   # {execId}: anything that must outlive the call
easybits sb bg status "$ID" "$EXEC" --json     # {status: running|exited, exitCode, stdout, stderr}
easybits sb bg ls "$ID" --json                 # {processes:[{execId, command, status…}]}: recover a lost execId
easybits sb bg kill "$ID" "$EXEC" --json       # whole process group
easybits sb git clone "$ID" --repo "$REPO" --dir /data/work/app --git-token '$secret:GITHUB_TOKEN' --json
easybits sb git status "$ID" --dir /data/work/app --json   # {branch, ahead, behind, clean, staged, modified, untracked, conflicted}
easybits sb git commit "$ID" --dir /data/work/app --all -m "msg" --json   # {sha} or {nothingToCommit:true} (not an error)
easybits sb git push "$ID" --dir /data/work/app --git-token '$secret:GITHUB_TOKEN' --json
easybits sb git pull|checkout|log "$ID" --dir /data/work/app …   # pull exits 1 on conflicts
easybits sb logs "$ID" --unit myapp --lines 100 --since "10 min ago" --grep ERROR
easybits sb suspend "$ID" && easybits sb resume "$ID"
easybits sb snapshot "$ID" --name checkpoint
easybits sb destroy "$ID" --json --yes
```

Never `nohup cmd &` inside `exec`: it dies with the call. Use `bg start`. For git tokens use
`$secret:NAME` (store it first with `easybits secrets set`), never a literal token.

`create` flags: `--size s|m|l|xl` (plan-gated), `--no-wait` (return before running),
`--dotenv <path|->` for env (`--env K=V` only for non-secret values).

Templates: `ubuntu` (default), `python`, `node`, `bun`, `code-interpreter`… Full list:
`easybits docs agents`.

## Hosting (permanent machines, alias `deploy`)

```bash
easybits machines ls --json
easybits machines launch --repo "$REPO" --tier micro --json      # new machine + deploy (--archive <url|file> too)
easybits machines launch --machine "$ID" --archive ./build.tgz --prebuilt -m v2   # redeploy prebuilt code
easybits machines deploy "$ID" -m "v1.2"            # publish a release of the current code
easybits machines releases "$ID" --limit 5 --json
easybits machines rollback "$ID" "$RELEASE_ID"
easybits machines logs "$ID" --lines 100 --grep ERROR
easybits machines secrets set "$ID" --dotenv .env.production     # KEY=VALUE lines
printf 'DATABASE_URL=%s\n' "$DATABASE_URL" | easybits machines secrets set "$ID" --dotenv -
easybits machines secrets unset "$ID" DATABASE_URL
easybits machines secrets ls "$ID" --json           # names only; values are never readable
easybits machines restart "$ID" --json              # apply new secrets/runspec: restart, no build (exit 1 if it fails)
easybits machines get "$ID" --json                  # {tier, vcpus, memoryMb, diskMb, monthlyMxn, sleep, status…}
easybits machines tiers --json                      # catalog {tiers:[{key, vcpus, memoryMb, diskMb, priceShared, priceReserved, minPlan}], diskAddon}
easybits machines runspec get "$ID" --json          # {runspec:{appDir, buildCommand, startCommand, unit, port, prebuilt, dataPaths, excludes, env}}
easybits machines runspec set "$ID" --data /app/data --json   # merges; --file rs.json|- takes `runspec get --json` output
easybits machines backups "$ID" --json              # {items:[{id, stamp, status, bytes, consistency, expiresAt}]}
easybits machines backup "$ID" --json               # take one now
easybits machines redeploy "$ID" --tier focus --replace --yes --json   # resize/recover: NEW machine from the newest release
easybits machines rm "$ID" --yes --json             # release: stops billing, last backup, destroys it
easybits init --port 3000                           # GitHub Actions: deploy on every push
```

- Nothing is backed up until the runspec has `dataPaths` (`runspec set --data <path>`).
- `redeploy` makes a NEW machine (new id) with no data; `--replace` releases the old one once the
  new one runs, otherwise both are billed. `rm` and `redeploy --replace` are irreversible: confirm
  with the person first, then pass `--yes`.

## Account secrets (vault)

```bash
easybits secrets ls --json                                   # {items:[{id, name, createdAt, lastUsedAt}]}; never values
easybits secrets set --dotenv .env.production --json         # KEY=VALUE lines (- = stdin) → {saved:[names]}
printf '%s' "$TOKEN" | easybits secrets set GITHUB_TOKEN --json   # one value from stdin
easybits secrets rm GITHUB_TOKEN --yes --json
```

Use a stored secret by name: `$secret:NAME` (agent MCP headers, `--repo-token`), or
`machines launch --secret NAME`. Never put a value in argv. Never print or log a value you were
given; if the person pastes one in chat, store it and refer to it by name from then on.

## Your crons (any account)

```bash
easybits crons create "Ping" --cron "*/15 * * * *" --url https://my-app.com/api/ping --json   # → {id, schedule, nextRunAt, …}
easybits crons create "Nudge" --cron "30 8 * * *" --url https://www.ghosty.studio/api/v2/me/push \
  --method POST --body '{"title":"Study time"}' --secret GHOSTY_PUSH_TOKEN --json
easybits crons create "Report" --cron "0 9 * * 1" --agent <fleetAgentId> --prompt "Send the weekly summary" --json
easybits crons ls --json                                     # {items:[{id, name, cron, timezone, schedule, enabled, action, nextRunAt, lastOk, lastError}]}
easybits crons update <id|name> --cron "0 7 * * 1-5" --json
easybits crons run <id|name> --json                          # in the background; then:
easybits crons runs <id|name> --json                         # {items:[{startedAt, ok, status, trigger, summary, error}]}
easybits crons pause <id|name> --json                        # resume to turn it back on
easybits crons rm <id|name> --yes --json
```

Cron = 5 fields in `--tz` (default America/Mexico_City); at most every 5 min (more often → 400).
The URL must be public https; secrets go by vault NAME (`--secret`), never the value. Limit per plan:
Byte 3, Mega 20, Tera 100. After 20 failures in a row a cron turns itself off (`enabled:false`).

## Platform crons (platform admins only)

```bash
easybits crons ls --platform --json                          # {items:[{key, name, schedule, status, paused, running, nextRunAt, lastRun}]}
easybits crons runs backup-machines --json                   # {items:[{startedAt, ok, status, durationMs, trigger, summary, error}]}
easybits crons run purge-notifications --json                # runs now in the background (trigger "manual")
easybits crons pause check-hosting --json                    # scheduled runs answer {"skipped":"paused"}
easybits crons resume check-hosting --json
```

Needs a key with the ADMIN scope and a platform-superuser account; otherwise 403 — don't retry,
tell the person. `status`: al-dia (ok), tarde (late), fallo (failed), pausado, nuevo (no runs yet).
Schedules live in code: you can't change them from the CLI.

## Domains

Account domains serve your websites at `<slug>.example.com` and, with `apex`, at the root:

```bash
easybits domains add example.com --json        # {id, domain, txtToken, dns: [{name, type, values}]}
easybits domains verify example.com            # exit 1 with the missing record until the TXT resolves
easybits domains dns-auto example.com          # DNS in Mailmask: writes + verifies; exit 1 + connect link if not connected
easybits domains apex example.com my-shop      # website (slug or id) at the root and www; --clear removes it
easybits domains ls --json
easybits domains rm example.com --json --yes
```

A domain on a sandbox or machine PORT is `sandboxes domains` (the old `domains add <sandbox> …` still works):

```bash
easybits sandboxes domains add "$ID" shop.example.com --port 3000 --json   # returns the DNS record
easybits sandboxes domains verify "$ID" shop.example.com                   # exit 1 until ready
easybits sandboxes domains ls "$ID" --json
easybits sandboxes domains rm "$ID" shop.example.com --json --yes
```

## Web (search, read, extract, crawl)

Metered in web queries; out of them → exit 1, `code: 1`, hint with the buy link (not a plan limit).

```bash
easybits web search "dentista polanco" --country mx --json   # {query, engine, results: {organic: [{title, link, …}]}}
easybits web fetch https://example.com --markdown --main     # clean markdown on stdout; --json → {url, statusCode, format, body}
easybits web extract google_maps --input '[{"keyword":"dentista Polanco CDMX","country":"MX"}]' --limit 50 --wait --json
easybits web extract instagram_profiles --url https://instagram.com/x --json   # {jobId, status: "running"} (30-120 s)
easybits web extract-status "$JOB" --json                    # {status: running|done|error, records}; 1 query per record
easybits web crawl https://docs.example.com --max-pages 5 --main --json   # {pages: [{url, markdown}], pending}
```

## Webhooks and API keys

```bash
easybits webhooks create https://example.com/hook --event file.created,form.submitted --json   # {id, url, events, secret} — secret ONLY here
easybits webhooks ls --json
easybits webhooks update "$WH" --pause            # --resume resets failCount; --url, --event to change
easybits webhooks rm "$WH" --json --yes
easybits keys create ci --scopes READ,WRITE --json   # {id, prefix, raw, scopes} — raw ONLY here; store it in a secret
easybits keys ls --json                            # prefix, scopes, status; never the key
easybits keys revoke ci --json --yes               # id, name or prefix
```

A key cannot mint a key with more scopes than its own (400 `your credential cannot grant: …`).

## Site-builder sites (/dash/sitios)

```bash
easybits sites ls --json      # [{ id, name, kind: static|webapp, engine, stack, url, websiteId, sandboxId, archivedAt }]
easybits sites create --prompt "Landing for my dental clinic" --json   # {id, name, kind, stack, template, previewUrl, url: null, editorUrl}
easybits sites create --prompt "Task tracker with login" --stack next --json
easybits sites create --name "Promo" --kind static --json
easybits sites theme get "$SITE" --json                          # {supported, colors:{primary:"#…",…}}
easybits sites theme set "$SITE" --theme dracula --json          # or --colors file.json|- (every token)
```

`create` makes the site and hands it to its builder agent; give the person `editorUrl` to keep
building it. `url` stays `null` until they publish from the editor (building is free; a web app is
charged when published). `--stack`: tanstack (default), next, react-router, remix, nuxt, sveltekit,
astro, elysia; `--template` (consultorio, despacho, portafolio, lanzamiento) only for tanstack and
react-router — without it the prompt picks one. `theme` takes the site's name or id; `no_tokens`
(409) = the site predates themes, `invalid_theme` (400) = unknown palette or a missing token.

"My sites" means this list: what the user built in /dash/sitios, with the engine that builds
each one. A static site's files are in its website (`websiteId`); a web app's code is in its
machine (`sandboxId`, use `machines`/`sandboxes`). `websites ls` is broader: every static
website of the account, including documents and pages that agents published.

## Static websites (`/s/<slug>/`)

```bash
easybits websites ls --json
easybits websites create "My shop" --slug my-shop --json       # slug optional; generated if omitted
easybits websites slug my-shop my-store --json                  # by id or current slug; old URL 301s
easybits websites deploy my-store ./dist --json                  # {websiteId, url, uploaded: [{path, fileId, url}], skippedEmpty}
easybits websites upload my-store ./hero.jpg --path img/hero.jpg --json
easybits websites files ls my-store --json                       # [{path, size, contentType, …}]
easybits websites get my-store --json
easybits websites rm my-store --json --yes                       # deletes the site and its files
```

`deploy` keeps relative paths (`css/app.css`), so link a site's own files relatively. It skips
hidden files (`.env`), `.git` and `node_modules`; an existing path is replaced, nothing is pruned.

Slug: lowercase a-z, 0-9 and single hyphens, 3-60 chars, not reserved (api, admin, www…), unique.
Errors come back as `slug_invalid` (exit 1, HTTP 400) or `slug_taken` (HTTP 409): pick another.

## Documents (/dash/documents)

You write each page's HTML; the CLI never generates it with AI (no "generate"/"refine" here on
purpose: write the HTML, then set it).

```bash
easybits documents ls --search quote --json   # {total, items:[{id, name, pageCount, shareUrl, pdfUrl, …}]}
easybits documents create --name "ACME quote" --html cover.html --html prices.html --json
                                              # {id, name, format, pages:[{id,label}], editorUrl}
easybits documents create --name "Carousel" --format ig-feed --json   # one blank 1080x1350 page
easybits documents get "$DOC" --json          # full record: metadata.format, sections[{id,order,html,label}]
easybits documents pages ls "$DOC" --json     # [{n, id, label, size}]
easybits documents pages get "$DOC" 2 --out page2.html
easybits documents pages set "$DOC" 2 page2.html --json   # {success, pageId, noop?}; - reads stdin
easybits documents add-page "$DOC" annex.html --after 2 --label Annex --json
easybits documents rm-page "$DOC" 3 --yes --json
easybits documents reorder "$DOC" 1 3 2 --json            # every page once, by number or id
easybits documents deploy "$DOC" --json       # {url, slug, websiteId, pdfUrl}
easybits documents export pdf "$DOC" --out doc.pdf --json # {file, bytes}
easybits documents export png "$DOC" --out ./slides --json   # {files:[{file, url, bytes}]}
easybits documents rm "$DOC" --yes --json
```

Pages are 1-based numbers (as in the editor) or ids. `--format`: letter (default), ig-feed,
li-feed, ig-square, fb-square, ig-story, wsp-status, tiktok, slide-16-9, or `WxH` px. Design each
page edge to edge at that size; a full HTML document is normalized into a page. Edit one page at a
time with `pages get` → change the file → `pages set`, and verify with `export png` before
`deploy`. `export` renders on the server, so sizes are exact.

## Video projects (HTML + GSAP scenes → MP4)

```bash
easybits video projects create --name "Fall promo" --format square --json   # {id, width, height, fps, status:"draft", …}
easybits video projects ls --json             # {total, items:[{id, name, sceneCount, durationSec, status, lastRenderUrl}]}
easybits video projects get "$VID" --json     # + scenes[{id, order, label, durationSec, html, timeline, narration}], failReason
easybits video scenes add "$VID" scene.html --timeline "tl.from('#t',{opacity:0,duration:.5})" --narration "…" --json
easybits video scenes ls "$VID" --json        # [{n, id, label, durationSec, narration}]
easybits video scenes set "$VID" 2 scene2.html --duration 4 --json   # {scene, changed}
easybits video scenes reorder "$VID" 2 1 --json
easybits video scenes rm "$VID" 2 --yes --json
easybits video music set "$VID" https://…/bed.mp3 --json   # none removes it
easybits video render "$VID" --wait --out promo.mp4 --json # status ready + lastRenderUrl; failed → exit 1
easybits video projects rm "$VID" --yes --json
easybits video ls --json                      # AI-generated clips (video_create), not projects
```

Scene HTML is absolutely positioned to fill the frame (no `<script>`, media as `assets/<name>`);
`--timeline` is a file or the GSAP code against the paused `tl`. Narration is synthesized at render
(voices em_santa, em_alex, ef_dora) and the scene stretches to fit it. `render` without `--wait`
only starts it: poll `video projects get --json` until `status` is `ready` or `failed`. Music must be
a public URL (`easybits files upload song.mp3 --public` first).

## Databases (libSQL)

```bash
easybits db create leads --json
easybits db query leads "SELECT * FROM leads WHERE name = ?" --arg Ana --json
easybits db tables leads --json          # [{name, rows, columns:[{name,type,pk}], links:[{column,permanent,expiring,external,empty}]}]
easybits db photos put catalog --table products --key-column sku --dir photos/ --dry-run --json   # plan per file
easybits db photos put catalog --table products --key-column sku --dir photos/ --json             # {results:[{key,file,url|error}]}
easybits db ls --json
easybits db rename leads prospects --dry-run --json   # {from,to,references:[{agentId,agent,refs:[{line,text}]}],skipped}
easybits db rename leads prospects --json             # {rewritten:[agentId], failed:[{agentId,error}]}
easybits db rm leads --dry-run --json                 # {tables:[{name,rows}]}: what would be lost
easybits db rm leads --json --yes
```

`query` and `tables` resolve id or name and never create a database from a typo.

Rename: the id does not change (the `db_*` tools go by id), so nothing breaks; what goes stale is a
prompt that says "use the leads database". `db rename` rewrites the name in your ghosty-lite/goose
agents' prompts as a standalone word only (`leads.com`, `@leads`, `leads_test` and `LEADS` stay).
`--skip-prompts` renames only. Skills and env are not scanned: grep them yourself. Exit 1 if a
prompt failed to rewrite (the rename stays; `failed` says which).

Photos: name each file after its row key (`SKU-123.jpg` → `sku = SKU-123`). The link written is a
permanent public one; rows that already have one are kept unless `--replace`. Read `!` lines:
no matching row, not a JPEG/PNG/WebP, or over 10 MB.

## Agents and files

```bash
easybits agents create --template goose --name helper --json
easybits agents ls --json
easybits agents get helper --json                                  # by name or id
easybits agents message "$AGENT_ID" "summarize the README" --json   # { content, tokens }
easybits agents message "$AGENT_ID" "now the tests" --session "$SID" --json
easybits agents destroy "$AGENT_ID" --json --yes
easybits files upload ./report.pdf --json
easybits files upload ./logo.png --public --json   # .url = open CDN link; private (no url) by default
easybits files ls --json
easybits files rm "$FILE_ID" --json --yes     # 7-day trash
easybits providers --json                         # storage provider
```

## Configure an agent (ghosty-lite, goose)

Same contract as the Ghosty Studio `ghosty` CLI. Other templates answer
`agente_sin_maquina`.

```bash
easybits agents get helper --fields systemPrompt,systemPromptMode,skills,mcpServers --json
easybits agents get helper --prompt-out PROMPT.md --json        # long prompt → file; JSON has {file, bytes}
easybits agents set helper --prompt-file PROMPT.md --dry-run --json   # {changes:{systemPrompt:{from,to}}}
easybits agents set helper --prompt-file PROMPT.md --prompt-mode replace --json   # no reboot
easybits agents files put helper catalog.pdf prices.csv --to docs --json   # into /data/work
easybits agents files ls helper --json
easybits agents skills add helper --dir ./skills/quotes --restart --json   # folder with SKILL.md
easybits agents skills ls helper --json
easybits agents mcp set helper --file servers.json --json   # replaces ALL servers, restarts
easybits agents try helper "which skills do you have?" --json   # {text, error, session, ms}
easybits agents doctor helper --json                            # {ok, checks:[{check,ok,detail,hint}]}
easybits agents logs helper --since "10 min ago" --json          # the runtime's journal
easybits agents restart helper --json                           # new session; skills and MCP reload
easybits agents get helper --fields status,lastError --json     # status "error" + lastError = the runtime did not start (fix, then agents restart)
easybits agents create --like helper --name helper-2 --dry-run --json   # plan: template, prompt, MCP, skills
easybits agents create --like helper --name helper-2 --copy-files --json
```

- A skill enters after a restart (`--restart`, or `agents restart`), which starts a new session.
  A SKILL.md with an unquoted `: ` in `name:`/`description:` is refused (the engine would drop it).
- Cloning copies template, prompt, MCP servers and skills (`--copy-files`: files too), never the
  env: pass the engine keys with `--dotenv`. `--from` needs an export made with `--show-secrets`
  if the MCP servers carry literal secrets (`$secret:NAME` references are fine).

## The agent as a file (export → edit → apply)

```bash
easybits agents export helper --out ./helper --json      # agent.yaml + skills/<slug>/ + files/
easybits apply ./helper --dry-run --json                 # {plan:[{op,what}]}: + add, ~ change, - remove, ! skipped
ANTHROPIC_API_KEY="$KEY" easybits apply ./helper --yes --json   # {applied, failed?, backup}
easybits apply ./helper --create --name helper-2 --yes --json   # {agentId, plan, applied}
```

- Declarative: fields missing from the file are left alone; removing needs `--prune`. Read the
  `!` lines: they say what was NOT applied and why (a `${VAR}` you did not export, a template
  change, a skill with no folder).
- Secrets are never in the file (`${NAME}`); export the variable before `apply` to set it, or
  leave it unset to keep today's value. Prefer `$secret:NAME` (vault) inside MCP headers.
- `failed` in the result = stopped at that step (exit 1); `backup` is the file to roll back with
  `easybits apply <backup> --agent <agent> --yes`.

## Fleet agents (WhatsApp, WABA, Teams, web)

```bash
easybits fleet ls --json                                  # [{id, name, assistantName, workerTemplate, hasOwnNumber, createdAt}]
easybits fleet get soporte --json                         # {systemPrompt, model, effort, engine, channels, skills, customMcps…}
easybits fleet capabilities soporte --json                # full catalog + per-channel state
easybits fleet configure soporte --prompt-file PROMPT.md --json   # {applied:[actions]}
easybits fleet configure soporte --model claude-sonnet-5-5 --effort high --recycle --json
easybits fleet message soporte "test question" --config-group web --json   # {reply, groupId}
```

- `--config-group` decides which channel's tools/MCP/prompt load; omit it and the agent may answer
  without its connectors (looks like a broken MCP). Reuse `groupId` to continue a conversation.
- Changes reach running boxes only after `--recycle` (or when they sleep). Verify with a
  `fleet message` turn instead of trusting the agent's own claims about its tools.
- Fleet agents are different from `agents` (one box per agent, ghosty-lite/goose).

## More

- `easybits --help`, `easybits <command> <sub> --help` or `easybits help <command> <sub>`
- `easybits docs cli --en` prints the full CLI reference as markdown; `easybits docs <section>`
  prints any docs section (hosting, agents, databases…); `easybits docs --open` opens the browser.
- `easybits mcp config` prints MCP config JSON (`--stdio` for the npx proxy) if the task is better served by the MCP tools.

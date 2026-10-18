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
easybits sandboxes create --size m --ttl 1800 --no-wait   # size s|m|l|xl (plan-gated)
easybits sandboxes get sb_abc123
easybits sandboxes exec sb_abc123 -- npm test
easybits sandboxes logs sb_abc123 --unit myapp --lines 100 --since "10 min ago" --grep ERROR
easybits sandboxes files ls sb_abc123 /data/work
easybits sandboxes files read sb_abc123 /etc/os-release
easybits sandboxes files read sb_abc123 /data/app.db --out app.db   # tope 8 MB: más grande sale con código 1 ("truncated")
easybits sandboxes files write sb_abc123 /data/work/app.js ./app.js
easybits sandboxes files mkdir sb_abc123 /data/work/out
easybits sandboxes files mv sb_abc123 /data/work/a.txt /data/work/out/a.txt
easybits sandboxes files rm sb_abc123 /data/work/tmp -r --yes
easybits sandboxes bg start sb_abc123 --cwd /data/work -- npm run dev   # prints an execId
easybits sandboxes bg ls sb_abc123
easybits sandboxes bg status sb_abc123 exec_123    # status, exit code, its stdout/stderr
easybits sandboxes bg kill sb_abc123 exec_123      # the whole process group
easybits sandboxes git clone sb_abc123 --repo https://github.com/you/app.git --dir /data/work/app --git-token '$secret:GITHUB_TOKEN'
easybits sandboxes git status sb_abc123 --dir /data/work/app
easybits sandboxes git commit sb_abc123 --dir /data/work/app --all -m "fix: checkout"
easybits sandboxes git push sb_abc123 --dir /data/work/app --git-token '$secret:GITHUB_TOKEN'
easybits sandboxes git pull|checkout|log sb_abc123 --dir /data/work/app …
easybits sandboxes suspend sb_abc123
easybits sandboxes resume sb_abc123
easybits sandboxes snapshot sb_abc123 --name before-upgrade
easybits sandboxes destroy sb_abc123 --yes

# Hosting: permanent machines (alias: deploy)
easybits machines ls
easybits machines launch --repo https://github.com/you/shop.git --tier micro --domain shop.example.com
easybits machines launch --machine shop --archive ./build.tgz --prebuilt -m v2   # redeploy
easybits machines deploy sb_abc123 -m "v1.2"   # publish a release of the current code
easybits deploy sb_abc123 -m "v1.2"            # same thing, shorter
easybits machines releases sb_abc123 --limit 5
easybits machines logs sb_abc123 --lines 100 --grep ERROR
easybits machines rollback sb_abc123 rel_789
easybits machines secrets ls sb_abc123
easybits machines secrets set sb_abc123 --dotenv .env.production   # - reads stdin
easybits machines secrets unset sb_abc123 DATABASE_URL
easybits machines restart shop       # restart the app with the current secrets/runspec (no build)
easybits machines get shop           # tier, size, MXN/month, whether it sleeps
easybits machines tiers              # the catalog: sizes and prices in MXN
easybits machines runspec get shop
easybits machines runspec set shop --data /app/data --start 'node server.js' --port 8080   # merges
easybits machines backups shop       # daily data backups (7 days)
easybits machines backup shop        # one now
easybits machines redeploy shop --tier focus --replace   # resize: new machine from the newest release
easybits machines rm shop --yes      # release: stops billing, last backup, destroys the box
easybits init --port 3000            # GitHub Actions workflow that deploys on every push

# Domains of your account (serve your websites at <slug>.example.com and the root)
easybits domains ls
easybits domains add example.com             # prints the DNS records to create
easybits domains verify example.com          # TXT found → certificate issued
easybits domains dns-auto example.com        # DNS in Mailmask? writes the records for you (--undo restores)
easybits domains apex example.com mi-tienda  # serve a website at example.com and www (--clear removes it)
easybits domains rm example.com --yes

# Domains on a sandbox or machine port (was `easybits domains … <sandbox>`; that still works)
easybits sandboxes domains ls sb_abc123
easybits sandboxes domains add sb_abc123 shop.example.com --port 3000
easybits sandboxes domains verify sb_abc123 shop.example.com   # exit 1 until it is ready
easybits sandboxes domains rm sb_abc123 shop.example.com --yes

# Web (metered in web queries; out of them → exit 1 with the link to buy a pack)
easybits web search dentista polanco --country mx            # organic results: # / title / url
easybits web fetch https://example.com --markdown --main      # body to stdout (--out page.md to save it)
easybits web extract google_maps --input '[{"keyword":"dentista Polanco CDMX","country":"MX"}]' --limit 50 --wait
easybits web extract instagram_profiles --url https://instagram.com/easybits   # async: prints the jobId
easybits web extract-status j_abc123                          # records as JSON lines once done
easybits web crawl https://docs.example.com --max-pages 5 --main

# Webhooks (HMAC-signed POSTs when your files, websites or forms change)
easybits webhooks ls
easybits webhooks create https://example.com/hook --event file.created --event form.submitted   # secret shown ONCE
easybits webhooks update 66f0c2a1b2c3d4e5f6a7b8c9 --event file.created,file.deleted   # --pause / --resume / --url
easybits webhooks rm 66f0c2a1b2c3d4e5f6a7b8c9 --yes

# API keys
easybits keys ls                                    # prefix only
easybits keys create ci-deploy --scopes READ,WRITE --expires 2027-01-31   # prints the key ONCE
easybits keys revoke ci-deploy --yes                # by id, name or prefix

# Account secrets vault (values never come back; used by name: $secret:NAME, --secret NAME)
easybits secrets ls
easybits secrets set --dotenv .env.production   # KEY=VALUE lines; - reads stdin
printf '%s' "$TOKEN" | easybits secrets set GITHUB_TOKEN   # one value from stdin
easybits secrets rm GITHUB_TOKEN --yes

# Your crons: call a public https URL or message one of your agents, repeating (at most every 5 min) or once
easybits crons create "Study reminder" --cron "30 8 * * *" --url https://www.ghosty.studio/api/v2/me/push \
  --method POST --body '{"title":"Study time"}' --secret GHOSTY_PUSH_TOKEN
easybits crons create "Weekly report" --cron "0 9 * * 1" --agent <agentId> --prompt "Send me the sales summary"
easybits crons create "Heads-up" --at 23:00 --url https://my-app.com/api/notice --method POST --dry-run  # once, today 23:00 in --tz
easybits crons create "Heads-up" --in 2h --url https://my-app.com/api/notice --method POST              # once; --until/--times end repeating ones
easybits crons ls
easybits crons update "Study reminder" --cron "0 7 * * 1-5"
easybits crons run "Study reminder"       # id or exact name
easybits crons runs "Study reminder"
easybits crons pause "Study reminder"
easybits crons rm "Study reminder" --yes

# Platform crons (platform admins only; key with the ADMIN scope)
easybits crons ls --platform
easybits crons runs backup-machines
easybits crons run purge-notifications
easybits crons pause check-hosting
easybits crons resume check-hosting

# Databases
easybits db ls
easybits db create leads
easybits db tables leads             # tables, row counts, columns, permanent vs external links
easybits db photos put catalog --table products --key-column sku --dir photos/   # SKU-123.jpg → row sku=SKU-123
easybits db query leads "SELECT * FROM leads" --json
easybits db rename leads prospects --dry-run   # which agent prompts name it
easybits db rm leads --dry-run                 # tables and rows that would be lost
easybits db rm leads --yes

# Agents
easybits agents ls
easybits agents create --template goose --name helper --dotenv .env
easybits agents get helper          # by name or id: record + prompt, MCP, skills, files
easybits agents get helper --fields status,systemPromptMode --json
easybits agents get helper --prompt-out PROMPT.md
easybits agents message helper "hello"
easybits agents message helper "and now?" --session ses_456   # continue a conversation
easybits agents destroy helper --yes

# Configure an agent with a machine (ghosty-lite, goose) — every write takes --dry-run
easybits agents set helper --prompt-file PROMPT.md [--prompt-mode append|replace]
easybits agents files ls|get|put|rm helper [path|local-files…] [--to DIR] [--out FILE]
easybits agents skills ls|get|add|rm helper [slug…] [--dir FOLDER | --file SKILL.md] [--restart]
easybits agents mcp get|set helper [--file servers.json|-]   # set replaces the list and restarts
easybits agents restart helper                  # restart its runtime (new session; skills and MCP load)
easybits agents try helper "who are you?"      # one full turn as text: verify what you set up
easybits agents logs helper --since "10 min ago"
easybits agents doctor helper                   # exits 1 on a problem; status "error" shows why it did not start
easybits agents export helper --out ./helper      # the agent as a folder: agent.yaml + skills/ + files/
easybits apply ./helper --dry-run                 # after editing: the plan (+ ~ - !); --prune also removes
easybits apply ./helper --create --name helper-2  # a new agent from the folder
easybits agents create --like helper --name helper-2 [--copy-files] --dry-run   # clone its setup, never its env
easybits agents create --from helper.json --name helper-3

# Fleet agents (one agent, many conversations: WhatsApp, WABA, Teams, web)
easybits fleet ls
easybits fleet get soporte                          # engine, model, effort, channels, prompt
easybits fleet capabilities soporte --json          # engines, models, tool buckets, MCPs, skills, channels
easybits fleet configure soporte --prompt-file PROMPT.md --model claude-sonnet-5-5 --recycle
easybits fleet message soporte "¿qué horarios tienen?" --config-group web   # prints the reply

# Files, websites, account
easybits files ls
easybits files upload ./report.pdf
easybits files upload ./logo.png --public   # open CDN URL; private by default
easybits files rm FILE_ID --yes
easybits sites ls                    # your site-builder sites (/dash/sitios): kind, engine, URL
easybits sites create --prompt "Landing for my dental clinic"   # web app (TanStack) in its own machine
easybits sites create --prompt "Task tracker with login" --stack next --json
easybits sites create --name "Promo" --kind static              # CDN website instead of a machine
easybits sites theme get my-clinic                              # site by name or id
easybits sites theme set my-clinic --theme dracula              # or --colors theme.json (every token)
easybits websites ls                 # every static website (also documents and agent-published pages)
easybits websites create "My shop" --slug my-shop   # slug optional
easybits websites slug my-shop my-store             # change it; the old URL 301s
easybits websites get my-store                      # slug or id: files, size, URL
easybits websites deploy my-store ./dist            # upload a folder keeping its paths (--dry-run lists it)
easybits websites upload my-store ./hero.jpg --path img/hero.jpg
easybits websites files ls my-store                 # paths inside the site
easybits websites rm my-store                       # type the slug to confirm (--yes without a terminal)
easybits providers                   # storage provider (Tigris by default)
easybits usage

# Documents: pages of HTML you write (page = number 1… or id)
easybits documents ls --search quote
easybits documents create --name "ACME quote" --html cover.html --html prices.html
easybits documents create --name "Carousel" --format ig-feed   # one blank 1080x1350 page
easybits documents get "ACME quote"                # format, URL and pages
easybits documents pages ls "ACME quote"
easybits documents pages get "ACME quote" 2 --out prices.html
easybits documents pages set "ACME quote" 2 prices.html        # - reads stdin
easybits documents add-page "ACME quote" annex.html --after 2
easybits documents rm-page "ACME quote" 3 --yes
easybits documents reorder "ACME quote" 1 3 2
easybits documents deploy "ACME quote"             # public URL (+ PDF)
easybits documents export pdf "ACME quote" --out quote.pdf
easybits documents export png Carousel --out ./slides   # one PNG per page, exact size
easybits documents rm "ACME quote" --yes

# Video: HTML + GSAP scenes with narration, rendered to MP4 (scene = number 1… or id)
easybits video projects create --name "Fall promo" --format square   # portrait 1080x1920 by default
easybits video projects ls
easybits video projects get "Fall promo"           # scenes, music, status, last MP4
easybits video scenes add "Fall promo" intro.html --timeline intro.js --narration "Fall is here"
easybits video scenes ls "Fall promo"
easybits video scenes set "Fall promo" 1 --duration 4 --voice ef_dora
easybits video scenes reorder "Fall promo" 2 1
easybits video scenes rm "Fall promo" 2 --yes
easybits video music set "Fall promo" https://cdn.example.com/bed.mp3   # none removes it
easybits video render "Fall promo" --wait --out promo.mp4   # without --wait: starts and returns
easybits video projects rm "Fall promo" --yes
easybits video ls                                  # AI-generated clips

# MCP, SSH, docs
easybits whoami        # account and where the credential comes from
easybits doctor        # Node, CLI version, credential, API; exits 1 on a problem
easybits mcp config    # MCP config (streamable HTTP)
easybits mcp config --stdio   # MCP config (stdio)
easybits ssh-key       # public key for sandbox SSH
easybits docs cli      # a docs section as markdown (--en for English)
easybits docs --open   # open the docs in your browser
```

**Names or ids.** Wherever a command takes an agent, a sandbox/machine, a database, a site, a document or a video project, you can
pass its name instead of the id (`easybits sb exec scratch -- ls`, `easybits sb domains ls shop`).
The match is exact and case-insensitive; if two share the name the CLI exits 2 and lists the ids.

Shell completion: `source <(easybits completion zsh)` (or `bash`, `fish`).

Help and messages follow your locale (`LANG=es_*` → Spanish) or `--lang es|en`.

Every command has help with examples: `easybits <command> <subcommand> --help`
(or `easybits help <command> <subcommand>`). A typo gets a "Did you mean" suggestion.

**Destructive commands** (every `rm` and `destroy`: `machines rm`, `db rm`, `agents destroy`,
`sandboxes destroy`, `domains rm`, `files rm`…) ask before acting in a terminal: `[y/N]`, or typing the name/id for
irreversible ones (a database, an agent, a permanent sandbox). Without a terminal they
never prompt — and neither do they with `--json`: pass `--yes` / `-y`, or they exit `2`.

**Dry runs.** Writes that change an agent (`agents set`, `files put|rm`, `skills add|rm`,
`mcp set`, `create`) take `--dry-run`: they print what would change and touch nothing.

**Updates.** Every hour at most the CLI checks npm and, in a terminal, says on stderr when a newer
version is out (never with `--json`). `EASYBITS_NO_UPDATE_CHECK=1` or `CI` turns it off.

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

## Changes in 0.17.1

- `easybits crons ls|runs|run|pause|resume`: EasyBits' scheduled jobs, the same as the
  /dash/admin/crons panel (platform admins only; key with the ADMIN scope).

## Changes in 0.17.0

- `sites create --prompt … [--kind webapp|static] [--stack …] [--template …]` and
  `sites theme get|set <site> [--theme <id> | --colors <file|->]`; a site goes by name or id.
  Unknown stacks or templates are rejected before calling the API.
- Machines: `machines get|restart|tiers`, `machines runspec get|set` (merges; `--file` takes the
  output of `runspec get --json`), `machines backups|backup`, `machines redeploy` (recovery and
  resize: `--tier … --replace`) and `machines rm` (release). `launch --machine --tier` now points to
  `machines redeploy`.
- `easybits secrets ls|set|rm`: your account vault (new REST `GET/POST /api/v2/secrets`,
  `DELETE /api/v2/secrets/:name`). Values come from a dotenv file or stdin, never argv.
- Sandboxes: `files rm|mv|mkdir`, `bg start|ls|status|kill` (background processes) and
  `git clone|status|commit|push|pull|checkout|log` (`--git-token '$secret:NAME'`).
- `easybits fleet ls|get|capabilities|configure|message`: fleet agents with your account credential.
- `easybits domains …` now manages your account's domains (`/api/v2/domains`); a sandbox's
  domains moved to `sandboxes domains` (the old form still works and says so on stderr).
- `easybits web search|fetch|extract|extract-status|crawl`.
- `easybits webhooks ls|create|update|rm` and `easybits keys ls|create|revoke` (`keys create` prints
  the key once). Creating a key now needs WRITE and can't grant more than your own key has.
- `easybits websites get|files ls|upload|deploy|rm` (`deploy` uploads a whole folder keeping paths).
- `easybits documents …`: ls, get, create (`--html` per page or a blank `--format`), pages
  ls|get|set, add-page, rm-page, reorder, deploy, export pdf|png, rm. You write the HTML and set it;
  no AI generate/refine from the CLI.
- `easybits video …`: projects ls|get|create|rm, scenes ls|add|set|rm|reorder, music set,
  render (`--wait`, `--out`, `--timeout`) and ls.
- `init` defaults to `--app-dir /app`, like `machines launch` (it was `/srv/app`).
- The update notice checks npm at most once an hour (the docs said once a day).

## Changes in 0.16.0

- `sites ls`: the sites of the site builder (/dash/sitios) — static sites and web apps,
  with the engine that builds each one and its public URL (`--json` for agents). Different
  from `websites ls`, which lists every static website of the account.

## Changes in 0.15.1

- After a `--dry-run`, the last line is the real command (`To apply: …`); without a terminal it
  already carries `--yes` when the command asks for confirmation.
- A 404 with a reason prints the reason; a bare «Not found» says it may also be missing access
  (another account's resource) and points to `easybits whoami`.
- The «new version» notice checks npm every hour (it was once a day), and asks again when the
  cache is older than what you have installed.

## Changes in 0.15.0

- `db rename <db> <new-name> [--skip-prompts] [--dry-run]` (alias `mv`): renames the database (the
  id does not change, so the `db_*` tools keep working) and rewrites the name in your ghosty-lite /
  goose agents' prompts where it appears as a standalone word — never inside `x.com`, `@x`, `x_test`
  or in capitals. `--dry-run` lists each prompt and line; a prompt that fails is reported (exit 1)
  and the rename stays. New API: `PATCH /api/v2/databases/:dbId { name?, description? }`.
- `db rm --dry-run`: the tables and row counts you would lose.
- `agents create --prompt/--prompt-file` prints which prompt was applied and its size.

## Changes in 0.14.1

- `machines launch --machine` takes a name too, like every other command.

## Changes in 0.14.0

- `machines launch` (aliases `create`, `new`): create a permanent machine and put an app on it in
  one step — the CLI side of `launch_app`. Source is `--repo`, `--archive <url|file>` (a local file
  is uploaded first) or `--machine` (redeploy onto an existing one). `--tier`, `--prebuilt`,
  `--start`, `--port`, `--env K=V`, `--secret NAME`, `--data <path>`, `--domain`.
  Without a plan it prints the checkout link instead of failing.

## Changes in 0.13.0

- Catalog photos: `db photos put <db> --table T --key-column sku --dir photos/ [--column C]
  [--replace] [--dry-run]` uploads each photo as a public file with a permanent link and writes it
  in the matching row (real type by bytes, JPEG/PNG/WebP, 10 MB; one upload per distinct photo).
- `db tables` shows, per text column with links, how many are permanent, expiring (signed),
  external or empty (`--json`: `links`).

## Changes in 0.12.0

- `easybits completion zsh|bash|fish`: TAB completes commands, subcommands, flags and the names of
  your agents, sandboxes and databases (cached 5 min in `~/.cache/easybits/`).

## Changes in 0.11.0

- **Spanish or English, following your locale** (`LANG=es_*` → Spanish; otherwise English), or
  `--lang es|en` / `EASYBITS_LANG`. Help, errors, hints and human output; `--json` keys and exit
  codes never change. Known API messages are shown in the same language.

## Changes in 0.10.0

- **The agent as a file**: `agents export <agent> [--out DIR|file.yaml|file.json]` and
  `easybits apply <file|dir> [--agent X] [--create] [--prune] [--dry-run] [--yes]`. Declarative
  plan computed by the server (`+ ~ - !`; removing needs `--prune`), secrets exported as `${NAME}`
  and filled from your environment, previous file saved to `~/.easybits/backups/`.
  `create --from <file>` accepts the new files too.
- `agents create --timeout` is now `--ttl` (the old flag still works and says so).

## Changes in 0.9.0

- Configure agents with a machine (ghosty-lite, goose) from the terminal, same contract as
  Ghosty Studio's `ghosty` CLI: `agents set` (system prompt), `agents files`, `agents skills`,
  `agents mcp`, `agents restart`, `agents try` (one turn as text), `agents logs`, `agents doctor`.
- `agents get` shows the prompt, MCP servers (secrets masked), skills and files;
  `--fields a,b` and `--prompt-out FILE` (write a long prompt to a file instead of the terminal).
- `agents export` and `agents create --like <agent> | --from <export.json>`: clone an agent's
  setup (template, prompt, MCP, skills, optionally files). Never its env: pass keys with `--dotenv`.
- `agents create --prompt | --prompt-file | --prompt-mode | --mcp-file`. A multi-line prompt is
  written once the machine is up (the box env cannot hold newlines).
- `--dry-run` on every agent write; `files rm` and `skills rm` take several at once (one confirmation).
- New `easybits doctor`; a daily update notice on stderr; an unknown flag on an old version says to update.

## Changes in 0.8.0

- One naming rule (like `gh`): `easybits <noun> <verb>`. Old spellings still work and print the new
  one on stderr (never with `--json`):
  `easybits config` → `easybits mcp config`; `easybits mcp` → `easybits mcp config --stdio`;
  `easybits deploy <machine>` is now the verb (= `machines deploy`), so `deploy ls` → `machines ls`;
  `machines release` → `machines deploy` (it clashed with `releases`);
  `sandboxes create --timeout` → `--ttl` (`--timeout` stays in `exec`, where it caps the command).
- `files rm` is the name (`delete` still works), like `db rm` and `domains rm`.
- New `easybits whoami`: account email and where the credential comes from.

## Changes in 0.7.0

- Agents, sandboxes/machines and databases by **name** anywhere an id goes; `easybits agents get`.

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

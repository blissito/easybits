// Traducción EN de la sección `cli` de reference.ts (el CLI @easybits.cloud/cli). Mantener en paralelo.
export const EN_CLI = `## CLI

\`easybits\` is EasyBits from your terminal: sandboxes, hosting, domains, databases, agents and files without writing a single \`curl\`. It is built for people **and for coding agents**: every command takes \`--json\` and the exit codes are stable.

### For your coding agent

Install the EasyBits skills in your agent (Claude Code, Codex, Cursor…). They include \`easybits-cli\`, which teaches it this CLI, and the rest (\`easybits-sandbox\`, \`easybits-agent\`…):

\`\`\`bash
npx skills add https://easybits.cloud
\`\`\`

Then paste this prompt, changing the end to whatever you need:

\`\`\`text
Install the EasyBits skill (npx skills add https://easybits.cloud) and use the CLI (npx -y @easybits.cloud/cli) to create a node sandbox, run my tests inside it and tell me the result. If there is no session, run \`easybits login --json\` and give me the link.
\`\`\`

The agent will hand you a link to sign in the first time; it does the rest.

### Install

\`\`\`bash
npm i -g @easybits.cloud/cli       # installs the \`easybits\` command
npx -y @easybits.cloud/cli --help  # no install (handy in CI and inside an agent)
\`\`\`

Requires Node 22 or later.

### Log in

\`\`\`bash
easybits login                                  # opens the browser; sign in and you're done
easybits login --no-browser                     # only print the URL (e.g. for an agent to relay it)
easybits login - < key.txt                      # alternative: an API key on stdin, no browser
printenv EB_KEY | easybits login --with-token   # same as \`-\`
easybits usage                                  # check it works: plan and storage
easybits logout                                 # forget the session and the key
\`\`\`

\`easybits login\` uses OAuth2 with PKCE: it opens the browser, also prints the URL, and waits for you to come back; the session (with a refresh token) is stored in \`~/.easybitsrc\` and renews itself. The session renews itself before it expires, and once more if the API answers 401. If you run a command without a session from a terminal, the login starts on its own; without a terminal or with \`--json\` (an agent, CI) it exits with code \`3\`.

Get an API key from the [Developer Dashboard](https://www.easybits.cloud/dash/developer). Precedence: the \`EASYBITS_API_KEY\` env var > the \`--token\` flag > the browser session > a key saved with \`login -\`. In CI, use the env var. The key never goes in argv: \`ps\` and your shell history would see it (that is why \`login -\` reads it from stdin and validates it before saving).

\`EASYBITS_URL\` points the CLI at another server (default \`https://www.easybits.cloud\`); \`baseUrl\` in \`~/.easybitsrc\` works too.

### Sandboxes

\`\`\`bash
easybits sandboxes create --template node --name scratch   # waits until running
easybits sandboxes create --template node --size m --ttl 1800 --no-wait --dotenv .env
easybits sandboxes ls
easybits sandboxes get sb_abc123                            # status, expiry, activity in progress
easybits sandboxes exec sb_abc123 -- npm test               # exits with the command's code
easybits sandboxes logs sb_abc123 --unit myapp --lines 100 --since "10 min ago" --grep ERROR
easybits sandboxes files ls sb_abc123 /data/work
easybits sandboxes files write sb_abc123 /data/work/app.js ./app.js
easybits sandboxes files read sb_abc123 /data/out.png --out out.png   # 8 MB cap: larger files exit 1 ("truncated")
easybits sandboxes files mkdir sb_abc123 /data/work/out
easybits sandboxes files mv sb_abc123 /data/work/a.txt /data/work/out/a.txt
easybits sandboxes files rm sb_abc123 /data/work/tmp -r --yes          # -r for a folder
easybits sandboxes bg start sb_abc123 --cwd /data/work -- npm run dev   # background process; prints an execId
easybits sandboxes bg ls sb_abc123                                      # recover an execId you lost
easybits sandboxes bg status sb_abc123 exec_123                         # status, exit code, its stdout/stderr
easybits sandboxes bg kill sb_abc123 exec_123                           # SIGTERM to the whole group, SIGKILL after --grace
easybits sandboxes git clone sb_abc123 --repo https://github.com/you/app.git --dir /data/work/app --git-token '$secret:GITHUB_TOKEN'
easybits sandboxes git status sb_abc123 --dir /data/work/app
easybits sandboxes git commit sb_abc123 --dir /data/work/app --all -m "fix: checkout"
easybits sandboxes git push sb_abc123 --dir /data/work/app --git-token '$secret:GITHUB_TOKEN'
easybits sandboxes git pull sb_abc123 --dir /data/work/app --rebase       # exits 1 if there are conflicts
easybits sandboxes git checkout sb_abc123 --dir /data/work/app --branch feature/x --create
easybits sandboxes git log sb_abc123 --dir /data/work/app --limit 5
easybits sandboxes suspend sb_abc123      # sleeps to disk; resume wakes it
easybits sandboxes resume sb_abc123
easybits sandboxes snapshot sb_abc123 --name before-upgrade
easybits sandboxes destroy sb_abc123 --yes
\`\`\`

Alias: \`easybits sb …\`. Everything after \`--\` in \`exec\` is the command, verbatim. On \`create\`: \`--template\` (default \`ubuntu\`), \`--size s|m|l|xl\` (gated by plan), \`--ttl <s>\` (lifetime before auto-destroy; \`--timeout\` in \`exec\` caps the command) and \`--no-wait\` (return without waiting for \`running\`). \`bg\` is for what outlives a call (a dev server, a long build): \`exec\` waits, \`bg start\` returns an \`execId\` right away; \`nohup\` inside \`exec\` does not survive. \`git\` runs inside the box with structured output: the token for a private repo goes in \`--git-token\`, best as \`$secret:NAME\` from your vault (a literal token is accepted with a warning: argv shows up in \`ps\`); a commit with no changes answers \`nothingToCommit\`, not an error. \`logs\` returns 200 lines by default; \`--since\` takes \`journalctl\` syntax.

### Hosting: permanent machines

\`\`\`bash
easybits machines ls
easybits machines launch --repo https://github.com/you/shop.git --tier micro      # create the machine and deploy (= launch_app)
easybits machines launch --machine shop --archive ./build.tgz --prebuilt -m v2   # redeploy
easybits deploy sb_abc123 -m "v1.2"                      # publish a release (= machines deploy)
easybits machines releases sb_abc123 --limit 5
easybits machines logs sb_abc123 --lines 100 --grep ERROR
easybits machines rollback sb_abc123 rel_789             # same machine, data untouched
easybits machines secrets ls sb_abc123
easybits machines secrets set sb_abc123 --dotenv .env.production   # KEY=VALUE lines
printf 'API_KEY=%s\\n' "$API_KEY" | easybits machines secrets set sb_abc123 --dotenv -
easybits machines secrets unset sb_abc123 API_KEY
easybits machines restart sb_abc123                      # restart the app with the current secrets and runspec (seconds, no build)
easybits machines get shop                               # tier, size, MXN/month, whether it sleeps
easybits machines tiers                                  # the catalog: sizes and monthly prices in MXN
easybits machines runspec get shop
easybits machines runspec set shop --data /app/data --start 'node server.js' --port 8080   # merges with what is there
easybits machines backups shop                           # daily data backups, kept 7 days
easybits machines backup shop                            # take one now
easybits machines redeploy shop --tier focus --replace   # resize: a new machine from the newest release
easybits machines rm shop --yes                          # release: stops billing, last backup, destroys the box
easybits init --port 3000                                # GitHub Actions workflow: deploy on every push
\`\`\`

\`easybits deploy <machine>\` is short for \`machines deploy <machine>\`. Secrets go in a dotenv file or on stdin (\`--dotenv -\`), never in argv: \`ps\` and your shell history would see them. \`secrets ls\` shows names only; values are never readable.

**Runspec** = how the app is built, started and backed up: \`appDir\`, \`buildCommand\`, \`startCommand\` or \`unit\`, \`port\`, \`prebuilt\`, \`dataPaths\`, \`excludes\`, \`env\` (non-secret). \`runspec set\` merges (env by key) and applies on the next deploy or restart; \`--file rs.json\` takes the output of \`runspec get --json\` as is, and flags win over it. **Without \`--data\` (dataPaths) nothing is backed up.** \`redeploy\` is recovery and resize at once (there is no in-place resize): it builds a NEW machine from \`--release\` (default: the newest) at \`--tier\`; \`--replace\` releases the old one once the new one runs (it asks you to type the id), otherwise you pay for both. The new machine starts with no data. \`rm\` asks you to type the id too: it stops billing, takes a last backup and destroys the box.

### Account secrets (vault)

\`\`\`bash
easybits secrets ls                                         # names and dates; values never come back
easybits secrets set --dotenv .env.production               # KEY=VALUE lines (- reads stdin)
printf '%s' "$TOKEN" | easybits secrets set GITHUB_TOKEN    # one value from stdin
easybits secrets rm GITHUB_TOKEN --yes
\`\`\`

The vault of your account (the same as /dash/developer/secrets and the \`secret_*\` MCP tools). A secret is used by name: \`$secret:NAME\` in an agent's MCP config or \`--repo-token\`, \`machines launch --secret NAME\`. Names are \`[A-Z_][A-Z0-9_]*\`; the same name replaces the value. Values never go in argv (\`ps\` and your shell history see it). \`machines secrets\` is different: values for ONE machine, which win over the vault.

### Domains

Two kinds. Your **account's** domains serve your websites at \`<slug>.example.com\` and, if you assign one, at the root:

\`\`\`bash
easybits domains ls
easybits domains add example.com             # prints the DNS records to create
easybits domains verify example.com          # TXT found → certificate issued
easybits domains dns-auto example.com        # DNS in Mailmask? writes the records for you (--undo restores)
easybits domains apex example.com my-shop    # serve a website at example.com and www (--clear removes it)
easybits domains rm example.com --yes
\`\`\`

A **sandbox's** domains point a domain at a port of a sandbox or machine:

\`\`\`bash
easybits sandboxes domains add sb_abc123 shop.example.com --port 3000   # prints the DNS record to create
easybits sandboxes domains verify sb_abc123 shop.example.com            # exits 1 until it is ready
easybits sandboxes domains ls sb_abc123
easybits sandboxes domains rm sb_abc123 shop.example.com --yes
\`\`\`

\`easybits domains <ls|add|verify|rm> <sandbox> …\` (the old form) still works: it runs \`sandboxes domains\` and says so on stderr. \`domains dns-auto\` without Mailmask connected exits 1 with the link to connect it once in a browser.

### Web

Search, read, extract and crawl the web. Metered in **web queries** (packs at \`/dash/packs?tab=web\`); out of them it exits 1 with the link to buy.

\`\`\`bash
easybits web search dentist polanco --country mx              # organic results: # / title / url (1 query)
easybits web fetch https://example.com --markdown --main      # body to stdout; --out page.md saves it (1 query)
easybits web extract google_maps --input '[{"keyword":"dentist Polanco CDMX","country":"MX"}]' --limit 50 --wait
easybits web extract mercadolibre --input '{"query":"iphone 15"}' --json   # answers right away
easybits web extract instagram_profiles --url https://instagram.com/easybits   # async: prints the jobId
easybits web extract-status j_abc123                          # once done: one JSON record per line
easybits web crawl https://docs.example.com --max-pages 5 --main             # 1 query per page
\`\`\`

\`extract\` charges 1 query per record returned (not per attempt) and most sources take 30-120 s: without \`--wait\` it returns the \`jobId\` and you check it with \`extract-status\`. Sources: \`google_maps\`, \`mercadolibre\`, \`amazon_product\`, \`instagram_profiles\`, \`linkedin_company\`… (or \`--dataset <id>\` from the catalog).

### Webhooks and API keys

\`\`\`bash
easybits webhooks ls
easybits webhooks create https://example.com/hook --event file.created --event form.submitted   # prints the secret ONCE
easybits webhooks update 66f0c2a1b2c3d4e5f6a7b8c9 --event file.created,file.deleted   # or --url, --pause, --resume
easybits webhooks rm 66f0c2a1b2c3d4e5f6a7b8c9 --yes

easybits keys ls                                    # prefix only
easybits keys create ci-deploy --scopes READ,WRITE --expires 2027-01-31   # prints the key ONCE
easybits keys revoke ci-deploy --yes                # by id, name or prefix
\`\`\`

The webhook secret (\`whsec_…\`) and the new key (\`eb_sk_live_…\`) only appear at creation: with \`--json\` they come in \`secret\` and \`raw\`. A key can never create one with more permissions than its own (a READ key cannot mint a WRITE one, and only the dashboard or an ADMIN key grants ADMIN). \`keys revoke\` warns if it is the key the CLI itself is using.

### Sites (site builder)

\`\`\`bash
easybits sites ls                                              # your /dash/sitios sites: kind, engine, URL
easybits sites create --prompt "Landing for my dental clinic"  # web app (TanStack) in its own machine
easybits sites create --prompt "Task tracker with login" --stack next --json
easybits sites create --name "Promo" --kind static             # CDN website instead of a machine
easybits sites theme get my-clinic                             # current colors (by name or id)
easybits sites theme set my-clinic --theme dracula             # a palette, no model turn
jq .colors theme.json | easybits sites theme set my-clinic --colors -   # or every token as #rrggbb
\`\`\`

\`create\` returns \`{id, name, kind, stack, template, previewUrl, url, editorUrl}\`; \`url\` is \`null\` until you publish from the editor (building is free; a web app is charged when published). \`--kind webapp\` (default) gets its own machine with \`--stack\` \`tanstack\` (default), \`next\`, \`react-router\`, \`remix\`, \`nuxt\`, \`sveltekit\`, \`astro\` or \`elysia\`; \`--template\` (\`consultorio\`, \`despacho\`, \`portafolio\`, \`lanzamiento\`) only exists for TanStack and React Router, and without it the prompt picks one. \`--kind static\` is a website on the CDN. The CLI rejects an unknown stack or template before calling the API.

\`theme\` is the editor's «Tema» button: it rewrites the site's theme file (web app: \`eb-theme.css\`; static: the \`eb-theme\` block of \`index.html\`) and the preview picks it up. \`--colors\` needs every token (\`primary\`, \`primary-light\`, \`primary-dark\`, \`secondary\`, \`accent\`, \`surface\`, \`surface-alt\`, \`surface-deep\`, \`on-surface\`, \`on-surface-muted\`, \`on-surface-deep\`, \`on-primary\`, \`on-secondary\`, \`on-accent\`); an unknown palette answers \`invalid_theme\` and a site older than themes answers \`no_tokens\` (409).

### Documents

Pages of HTML you write (the \`/dash/documents\` editor), published at a public URL and exported to PDF or PNG. The CLI does not generate with AI: write each page's HTML and set it.

\`\`\`bash
easybits documents ls --search quote                     # newest first; --limit up to 100
easybits documents create --name "ACME quote" --html cover.html --html prices.html   # one page per file
easybits documents create --name "Carousel" --format ig-feed   # one blank 1080x1350 page
easybits documents get "ACME quote"                      # format, URL and pages (by name or id)
easybits documents pages ls "ACME quote"
easybits documents pages get "ACME quote" 2 --out prices.html
easybits documents pages set "ACME quote" 2 prices.html  # - reads stdin
easybits documents add-page "ACME quote" annex.html --after 2 --label Annex
easybits documents rm-page "ACME quote" 3 --yes
easybits documents reorder "ACME quote" 1 3 2            # every page, by number or id
easybits documents deploy "ACME quote"                   # public URL (+ PDF)
easybits documents export pdf "ACME quote" --out quote.pdf
easybits documents export png Carousel --out ./slides --pages 1,2
easybits documents rm "ACME quote" --yes
\`\`\`

A page is given by its number (1 = the first, as in the editor) or its id. \`--format\` is \`letter\` (default), \`ig-feed\`, \`li-feed\`, \`ig-square\`, \`fb-square\`, \`ig-story\`, \`wsp-status\`, \`tiktok\`, \`slide-16-9\` or \`WxH\` in px (100-10000); without \`--html\` the document starts with one blank page of that size. Pages go through the same path as \`set_page_html\`: a full HTML document (doctype, \`<style>\`) is normalized into a page. \`export\` renders on the server (Chromium), so sizes are exact whatever your machine: \`pdf\` writes one file (default \`<name>.pdf\`), \`png\` one file per page into a folder (default \`.\`) and also keeps them in your Files. \`rm\` deletes the document for good.

### Video

A video project is an ordered list of scenes: each one is HTML (absolutely positioned to fill the frame; media as \`assets/<name>\`), an optional GSAP snippet against a paused timeline \`tl\`, and optional narration that is synthesized at render time (kokoro: \`em_santa\` by default). The server compiles it to a HyperFrames composition and renders the MP4 on your on-demand box.

\`\`\`bash
easybits video projects create --name "Fall promo" --format square   # portrait (default 1080x1920), landscape, WxH…
easybits video projects ls
easybits video projects get "Fall promo"                             # scenes, music, status, last MP4
easybits video scenes add "Fall promo" intro.html --timeline intro.js --narration "Fall is here"
easybits video scenes add "Fall promo" offer.html --duration 4 --after 1 --voice ef_dora
easybits video scenes ls "Fall promo"
easybits video scenes set "Fall promo" 2 offer-v2.html --duration 5  # HTML and/or flags
easybits video scenes reorder "Fall promo" 2 1
easybits video scenes rm "Fall promo" 2 --yes
easybits video music set "Fall promo" https://cdn.example.com/bed.mp3   # none removes it
easybits video render "Fall promo" --wait --out promo.mp4
easybits video projects rm "Fall promo" --yes
easybits video ls                                                    # AI-generated clips (video_create)
\`\`\`

A scene is given by its number (1 = the first) or its id; the project by its name or id. \`--timeline\` takes a file or the GSAP code itself; \`--narration ""\` removes the voiceover and \`--duration\` (0.3-120 s) defaults to what the narration needs. \`render\` without \`--wait\` starts the render and returns once the server marks it \`rendering\`; with \`--wait\` it shows a spinner (plain lines without a terminal, nothing with \`--json\`) until the project is \`ready\` (prints the MP4 URL, \`--out\` downloads it) or \`failed\` (exit 1 with the reason). If a proxy cuts the long request, the CLI keeps following the project's status (\`--timeout\`, 15 min by default). Music is a public URL: upload a local file first with \`easybits files upload song.mp3 --public\`.

### Databases

\`\`\`bash
easybits db create leads
easybits db query leads "CREATE TABLE leads (id INTEGER PRIMARY KEY, name TEXT)"
easybits db query leads "INSERT INTO leads(name) VALUES (?)" --arg Ana
easybits db query leads "SELECT * FROM leads" --json
easybits db tables leads                             # tables, row counts, columns, links
easybits db photos put catalog --table products --key-column sku --dir photos/ --dry-run
easybits db ls
easybits db rename leads prospects --dry-run         # which agent prompts name it
easybits db rm leads --dry-run                       # tables and rows that would be lost
easybits db rm leads --yes
\`\`\`

\`query\` and \`tables\` take the id or the name, and never create a database from a mistyped name. With \`--json\`, \`tables\` returns \`[{name, rows, columns:[{name,type,pk}], links:[{column, permanent, expiring, external, empty}]}]\`: for each text column holding links, how many are **permanent** (EasyBits public storage), **expiring** (signed URLs), from elsewhere or empty.

**Rename**: \`db rename <db> <new-name> [--skip-prompts] [--dry-run]\` changes the name (the id stays, so the \`db_*\` tools keep working) and rewrites it in your ghosty-lite/goose agents' prompts where it appears as a standalone word: never inside \`x.com\`, \`@x\`, \`x_test\` or in capitals (the brand). \`--dry-run\` shows each prompt and line; a prompt that fails is reported (exit 1) and the new name stays. Skills and env are not scanned.

**Catalog photos**: \`db photos put <db> --table T --key-column sku --dir photos/ [--column C] [--replace] [--dry-run]\` puts \`SKU-123.jpg\` in the row whose \`sku\` is \`SKU-123\`: it checks the real type by its bytes (JPEG, PNG, WebP; max 10 MB; warns over 5 MB, WhatsApp\'s limit by link), uploads it as a **public file with a permanent link** (the same photo for two rows is uploaded once) and writes the link in the column (default \`image_url\`, \`photo_url\`, \`imagen\`…). A row that already has a permanent link is kept unless \`--replace\`; files that aren\'t photos or have no matching row are listed with the reason.

### Agents

\`\`\`bash
easybits agents create --template goose --name helper
easybits agents get helper                         # by name or id
easybits agents message helper "summarize the README"   # the reply streams in
easybits agents message helper "and the tests?" --session ses_456   # continue the same conversation
easybits agents ls
easybits agents destroy helper --yes
\`\`\`

**Configure an agent with a machine** (\`ghosty-lite\`, \`goose\`; same contract as Ghosty Studio's \`ghosty\` CLI). Every write takes \`--dry-run\`:

\`\`\`bash
easybits agents get helper --fields status,systemPromptMode --json   # record + prompt, MCP (masked), skills, files
easybits agents get helper --prompt-out PROMPT.md                  # a long prompt goes to a file
easybits agents set helper --prompt-file PROMPT.md --prompt-mode replace --dry-run
easybits agents files put helper catalog.pdf prices.csv --to docs  # to /data/work; ls|get|rm too
easybits agents skills add helper --dir ./skills/quotes --restart  # ls|get|rm too; enters after a restart
easybits agents mcp set helper --file servers.json                 # replaces the list and restarts
easybits agents try helper "who are you?"                          # one full turn as text, to verify
easybits agents logs helper --since "10 min ago"
easybits agents restart helper                                     # restart the runtime: new session, skills and MCP reload
easybits agents doctor helper                                      # exits 1 on a problem
easybits agents get helper --fields status,lastError --json        # status "error" carries why the runtime did not start
easybits agents create --like helper --name helper-2 --copy-files --dry-run
\`\`\`

Cloning (\`--like\` / \`--from\`) copies template, prompt, MCP servers and skills (\`--copy-files\`: the files too), **never the env**: pass the engine keys with \`--dotenv\`. \`export\` masks MCP secrets unless \`--show-secrets\`; \`$secret:NAME\` references travel as is.

### Fleet agents

\`\`\`bash
easybits fleet ls
easybits fleet get soporte                                   # engine, model, effort, number mode, channels, prompt
easybits fleet get soporte --prompt-out PROMPT.md            # a long prompt goes to a file
easybits fleet capabilities soporte --json                   # catalog + state: engines, models, buckets, MCPs, skills, channels
easybits fleet configure soporte --prompt-file PROMPT.md     # system prompt for every channel
easybits fleet configure soporte --model claude-sonnet-5-5 --effort high --recycle
easybits fleet configure soporte --name Nik --own-number on
easybits fleet message soporte "what are your hours?" --config-group web
easybits fleet message soporte "and saturday?" --group cli-1234 --config-group web   # same conversation
\`\`\`

A fleet agent routes each conversation (WhatsApp, WABA, Teams, web) to a short-lived box; create one and pair its channels at /dash/flota. The CLI uses your account credential, never the agent's token. \`configure\` applies one change at a time (engine before model; \`--recycle\` last): a change reaches sleeping boxes when they wake and a running one when it sleeps, or right away with \`--recycle\` (\`--engine\` recycles by itself). \`--name\` changes both the display name and the name the agent goes by. \`message\` sends one turn and prints the reply; without \`--group\` it starts a new \`cli-<uuid>\` conversation and tells you its id on stderr. **Pass \`--config-group\`** (\`web\`, \`waba:<id>\`, a WhatsApp group) to load that channel's tools, MCP and prompt: without it the turn may run without the channel's connectors.

### The agent as a file

\`\`\`bash
easybits agents export helper --out ./helper     # agent.yaml + skills/ + files/, versionable in git
easybits apply ./helper --dry-run                # after editing: the plan
ANTHROPIC_API_KEY=… easybits apply ./helper      # shows the plan, asks, applies
easybits apply ./helper --prune --dry-run        # also what would be REMOVED
easybits apply ./helper --create --name helper-2 # a new agent from the folder
\`\`\`

\`agent.yaml\` holds \`template\`, \`name\`, \`prompt\` + \`promptMode\`, \`env\` (non-secret), \`mcp\`, \`skills\` and \`files\` (\`--out file.yaml\` or \`.json\` writes just the file; without \`--out\` it goes to stdout). **Secrets never leave**: keys that look secret (KEY, TOKEN, AUTH…) and URLs with a password are exported as \`\${NAME}\`; on apply, the CLI sends only the values of the \`\${NAME}\` the file mentions that exist in your environment, and one without a value keeps today's. \`$secret:NAME\` (vault) travels as is. The platform's own env (the agent's EasyBits key, internal tokens) is never exported nor touched.

The plan: \`+\` add, \`~\` change, \`-\` remove, \`!\` not applied and why. **Declarative**: what the file doesn't mention is left alone; removing what the file no longer lists needs \`--prune\`. The plan is computed by the server (it is the only one that sees the current env and MCP values). Env, MCP and skills restart the agent once at the end. Before applying, the previous file is saved to \`~/.easybits/backups/\` (roll back with \`easybits apply <backup> --agent <agent>\`). Limits: an agent can't change template (use \`--create\`), and agents without their own machine only take \`name\`. \`--show-secrets\` / \`--with-files\` keep producing the 0.9 clone JSON for \`create --from\`.

### Shell completion

\`\`\`bash
source <(easybits completion zsh)      # in ~/.zshrc, after compinit
eval "$(easybits completion bash)"     # in ~/.bashrc (bash 3.2 on macOS works)
easybits completion fish > ~/.config/fish/completions/easybits.fish
\`\`\`

TAB completes commands, subcommands and flags (from the same table as the help) and the **names** of your agents, sandboxes/machines and databases wherever one goes (\`easybits agents get <TAB>\`, \`easybits db query <TAB>\`, \`--agent <TAB>\`). Names are cached for 5 minutes in \`~/.cache/easybits/\`.

### Language

The CLI speaks Spanish or English following your locale: \`LANG=es_MX.UTF-8\` (or \`LC_ALL\`/\`LC_MESSAGES\`) → Spanish, anything else → English. Force it with \`--lang es|en\` or \`EASYBITS_LANG\`. It changes help, errors, hints and human output; **\`--json\` keys and exit codes never change** (\`error\` and \`hint\` are prose, so they follow the language).

### Naming

One rule, like \`gh\`: \`easybits <noun> <verb>\`. Older spellings keep working and print the new one on stderr (never with \`--json\`): \`easybits config\` → \`mcp config\`, \`easybits mcp\` → \`mcp config --stdio\`, \`deploy ls\` → \`machines ls\` (\`easybits deploy <machine>\` is the verb), \`machines release\` → \`machines deploy\`, \`sandboxes create --timeout\` → \`--ttl\`.

### Names instead of ids

Every command that takes an agent, a sandbox or machine, a database, a site, a document or a video project accepts its **name** as well as its id: \`easybits sb exec scratch -- ls\`, \`easybits sb domains ls shop\`, \`easybits machines deploy shop -m "v2"\`. An id (\`sb_…\`, or the 24-character id of agents, databases, sites, documents and video projects) passes straight through; a name is matched exactly, case-insensitive, against your list (one request per run). If two share the name the CLI exits 2 and lists the ids; if none matches it exits 1 with the \`ls\` to run.

### Files, websites and account

\`\`\`bash
easybits files upload ./report.pdf
easybits files upload ./logo.png --public   # open CDN URL; private by default
easybits files ls
easybits files rm FILE_ID --yes   # to the trash for 7 days
easybits websites ls                   # every static website (also documents and agent-published pages)
easybits websites create "My shop" --slug my-shop   # slug optional
easybits websites slug my-shop my-store             # change it; the old URL 301s
easybits websites get my-store                      # slug or id: files, size, URL
easybits websites deploy my-store ./dist            # upload a folder keeping its paths (--dry-run lists it)
easybits websites upload my-store ./hero.jpg --path img/hero.jpg
easybits websites files ls my-store                 # paths inside the site
easybits websites rm my-store                       # type the slug to confirm (--yes without a terminal)
easybits providers                     # storage provider (Tigris by default)
easybits usage
\`\`\`

### MCP, SSH and docs

\`\`\`bash
easybits whoami            # account and where the credential comes from
easybits doctor            # Node, CLI version, credential, API; exits 1 on a problem
easybits mcp config        # MCP JSON (streamable HTTP) with your key
easybits mcp config --stdio   # MCP JSON over stdio
easybits ssh-key           # your public key to enable SSH on a box
easybits docs hosting      # one section of these docs as markdown
easybits docs cli --en     # this page
easybits docs --open       # open the docs in your browser
easybits help db query     # = easybits db query --help
\`\`\`

SSH over 443 — add to \`~/.ssh/config\` and connect with \`ssh <name>.ghosty\`:

\`\`\`
Host *.ghosty
    ProxyCommand easybits ssh-proxy %h
    User root
\`\`\`

### \`--json\` and exit codes

With \`--json\`, stdout carries **JSON only** (no banner, no tables), **errors included**: \`{"error":"…","code":3,"hint":"…"}\`, where \`code\` is the exit code. It is the only channel an agent needs to read; human notices go to stderr.

| Code | Meaning |
|---|---|
| \`0\` | ok |
| \`1\` | API error (4xx/5xx), or \`domains verify\` not ready yet |
| \`2\` | usage error: unknown or missing command, subcommand or argument |
| \`3\` | not logged in (non-interactive), session expired, or credentials rejected (401) |

Deliberate exception: \`sandboxes exec\` without \`--json\` exits with the remote command's code (like \`ssh\`); with \`--json\` it exits 0 and the code travels in \`exitCode\`.

### Deletes: \`--yes\`

Every \`rm\` and \`destroy\` (\`sandboxes destroy\`, \`machines rm\`, \`agents destroy\`, \`db rm\`, \`domains rm\`, \`files rm\`…) and \`machines redeploy --replace\` ask before acting in a terminal: \`[y/N]\`, or typing the name/id for irreversible ones (a database, an agent, a machine or permanent sandbox). **Without a terminal or with \`--json\` they never prompt**: pass \`--yes\` (\`-y\`) or they exit \`2\` with a hint holding the exact command.

At most once an hour it checks npm and, in a terminal, the CLI says on stderr when a newer version is out (never with \`--json\`; \`EASYBITS_NO_UPDATE_CHECK=1\` or \`CI\` turn it off).

\`easybits --help\`, \`easybits <command> <subcommand> --help\` and \`easybits help <command> <subcommand>\` show usage, flags and examples. A typo gets a "Did you mean".

### For coding agents

- Always pass \`--json\` and branch on the exit code, not on the text.
- With no session, run \`easybits login --json\`: the first line is \`{"event":"login_url","url":…}\` — show that link to the person — and \`{"event":"logged_in","email":…}\` arrives once they sign in. \`--no-browser\` skips opening this machine's browser.
- In CI, or when the person gives you a key, use \`EASYBITS_API_KEY\`.
- Chain with \`jq\`: \`ID=$(easybits sb create --template node --json | jq -r .sandboxId)\`.
- In \`exec\`, separate the command with \`--\` and use \`--json\` to read \`stdout\`, \`stderr\` and \`exitCode\` together.
- Deleting with \`--json\` requires \`--yes\`; without it the command exits \`2\`.
- Before touching an agent's config, preview with \`--dry-run\`; after, verify with \`easybits agents try <agent> "…"\` instead of assuming it worked.
- Destroy what you create: \`easybits sb destroy $ID --json --yes\`.
- Ready-made skill: \`npx skills add https://easybits.cloud\` (includes \`easybits-cli\`).
`;

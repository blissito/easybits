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
easybits sandboxes files read sb_abc123 /data/out.png --out out.png
easybits sandboxes suspend sb_abc123      # sleeps to disk; resume wakes it
easybits sandboxes resume sb_abc123
easybits sandboxes snapshot sb_abc123 --name before-upgrade
easybits sandboxes destroy sb_abc123 --yes
\`\`\`

Alias: \`easybits sb …\`. Everything after \`--\` in \`exec\` is the command, verbatim. On \`create\`: \`--template\` (default \`ubuntu\`), \`--size s|m|l|xl\` (gated by plan), \`--ttl <s>\` (lifetime before auto-destroy; \`--timeout\` in \`exec\` caps the command) and \`--no-wait\` (return without waiting for \`running\`). \`logs\` returns 200 lines by default; \`--since\` takes \`journalctl\` syntax.

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
easybits init --port 3000                                # GitHub Actions workflow: deploy on every push
\`\`\`

\`easybits deploy <machine>\` is short for \`machines deploy <machine>\`. Secrets go in a dotenv file or on stdin (\`--dotenv -\`), never in argv: \`ps\` and your shell history would see them. \`secrets ls\` shows names only; values are never readable.

### Domains

\`\`\`bash
easybits domains add sb_abc123 shop.example.com --port 3000   # prints the DNS record to create
easybits domains verify sb_abc123 shop.example.com            # exits 1 until it is ready
easybits domains ls sb_abc123
easybits domains rm sb_abc123 shop.example.com --yes
\`\`\`

### Databases

\`\`\`bash
easybits db create leads
easybits db query leads "CREATE TABLE leads (id INTEGER PRIMARY KEY, name TEXT)"
easybits db query leads "INSERT INTO leads(name) VALUES (?)" --arg Ana
easybits db query leads "SELECT * FROM leads" --json
easybits db tables leads                             # tables, row counts, columns, links
easybits db photos put catalog --table products --key-column sku --dir photos/ --dry-run
easybits db ls
easybits db rm leads --yes
\`\`\`

\`query\` and \`tables\` take the id or the name, and never create a database from a mistyped name. With \`--json\`, \`tables\` returns \`[{name, rows, columns:[{name,type,pk}], links:[{column, permanent, expiring, external, empty}]}]\`: for each text column holding links, how many are **permanent** (EasyBits public storage), **expiring** (signed URLs), from elsewhere or empty.

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
easybits agents doctor helper                                      # exits 1 on a problem
easybits agents get helper --fields status,lastError --json        # status "error" carries why the runtime did not start
easybits agents create --like helper --name helper-2 --copy-files --dry-run
\`\`\`

Cloning (\`--like\` / \`--from\`) copies template, prompt, MCP servers and skills (\`--copy-files\`: the files too), **never the env**: pass the engine keys with \`--dotenv\`. \`export\` masks MCP secrets unless \`--show-secrets\`; \`$secret:NAME\` references travel as is.

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

Every command that takes an agent, a sandbox or machine, or a database accepts its **name** as well as its id: \`easybits sb exec scratch -- ls\`, \`easybits domains ls shop\`, \`easybits machines deploy shop -m "v2"\`. An id (\`sb_…\`, or the 24-character id of agents and databases) passes straight through; a name is matched exactly, case-insensitive, against your list (one request per run). If two share the name the CLI exits 2 and lists the ids; if none matches it exits 1 with the \`ls\` to run.

### Files, websites and account

\`\`\`bash
easybits files upload ./report.pdf
easybits files ls
easybits files rm FILE_ID --yes   # to the trash for 7 days
easybits websites ls
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

\`sandboxes destroy\`, \`agents destroy\`, \`db rm\`, \`domains rm\` and \`files rm\` ask before acting in a terminal: \`[y/N]\`, or typing the name/id for irreversible ones (a database, an agent, a permanent sandbox). **Without a terminal or with \`--json\` they never prompt**: pass \`--yes\` (\`-y\`) or they exit \`2\` with a hint holding the exact command.

Once a day, in a terminal, the CLI says on stderr when a newer version is out (never with \`--json\`; \`EASYBITS_NO_UPDATE_CHECK=1\` or \`CI\` turn it off).

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

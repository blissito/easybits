// Traducción EN de la sección `cli` de reference.ts (el CLI @easybits.cloud/cli). Mantener en paralelo.
export const EN_CLI = `## CLI

\`easybits\` is EasyBits from your terminal: sandboxes, hosting, domains, databases, agents and files without writing a single \`curl\`. It is built for people **and for coding agents**: every command takes \`--json\` and the exit codes are stable.

### Install

\`\`\`bash
npm i -g @easybits.cloud/cli       # installs the \`easybits\` command
npx -y @easybits.cloud/cli --help  # no install (handy in CI and inside an agent)
\`\`\`

Requires Node 22 or later.

### Log in

\`\`\`bash
easybits login                       # opens the browser; sign in and you're done
easybits login eb_sk_live_YOUR_KEY   # alternative: an API key, no browser
easybits usage                       # check it works: plan and storage
easybits logout                      # forget the session and the key
\`\`\`

\`easybits login\` uses OAuth2 with PKCE: it opens the browser, also prints the URL, and waits for you to come back; the session (with a refresh token) is stored in \`~/.easybitsrc\` and renews itself. If you run a command without a session from a terminal, the login starts on its own; without a terminal (an agent, CI) it exits with code \`3\`.

Get an API key from the [Developer Dashboard](https://www.easybits.cloud/dash/developer). Precedence: the \`EASYBITS_API_KEY\` env var > the \`--token\` flag > the browser session > a key saved with \`login <key>\`. In CI, use the env var.

### Sandboxes

\`\`\`bash
easybits sandboxes create --template node --name scratch   # waits until running
easybits sandboxes ls
easybits sandboxes exec sb_abc123 -- npm test               # exits with the command's code
easybits sandboxes logs sb_abc123 --unit myapp --lines 100
easybits sandboxes files ls sb_abc123 /data/work
easybits sandboxes files write sb_abc123 /data/work/app.js ./app.js
easybits sandboxes files read sb_abc123 /data/out.png --out out.png
easybits sandboxes suspend sb_abc123      # sleeps to disk; resume wakes it
easybits sandboxes resume sb_abc123
easybits sandboxes snapshot sb_abc123 --name before-upgrade
easybits sandboxes destroy sb_abc123
\`\`\`

Alias: \`easybits sb …\`. Everything after \`--\` in \`exec\` is the command, verbatim.

### Hosting: permanent machines

\`\`\`bash
easybits machines ls
easybits machines deploy sb_abc123 -m "v1.2"             # publish a release of the current code
easybits machines releases sb_abc123
easybits machines logs sb_abc123 --grep ERROR
easybits machines rollback sb_abc123 rel_789             # same machine, data untouched
easybits machines secrets ls sb_abc123
easybits machines secrets set sb_abc123 DATABASE_URL=postgres://… API_KEY=xyz
easybits machines secrets unset sb_abc123 API_KEY
easybits init --port 3000                                # GitHub Actions workflow: deploy on every push
\`\`\`

Alias: \`easybits deploy …\`. Note: \`secrets set\` leaves values in your shell history; in scripts pass them from variables.

### Domains

\`\`\`bash
easybits domains add sb_abc123 shop.example.com --port 3000   # prints the DNS record to create
easybits domains verify sb_abc123 shop.example.com            # exits 1 until it is ready
easybits domains ls sb_abc123
easybits domains rm sb_abc123 shop.example.com
\`\`\`

### Databases

\`\`\`bash
easybits db create leads
easybits db query leads "CREATE TABLE leads (id INTEGER PRIMARY KEY, name TEXT)"
easybits db query leads "INSERT INTO leads(name) VALUES (?)" --arg Ana
easybits db query leads "SELECT * FROM leads" --json
easybits db ls
easybits db rm leads
\`\`\`

\`query\` takes the id or the name, and never creates a database from a mistyped name.

### Agents

\`\`\`bash
easybits agents create --template goose --name helper
easybits agents message ag_123 "summarize the README"   # the reply streams in
easybits agents ls
easybits agents destroy ag_123
\`\`\`

### Files, websites and account

\`\`\`bash
easybits files upload ./report.pdf
easybits files ls
easybits files delete FILE_ID
easybits websites ls
easybits usage
\`\`\`

### MCP, SSH and docs

\`\`\`bash
easybits config            # MCP JSON (streamable HTTP) with your key
easybits mcp               # MCP JSON over stdio
easybits ssh-key           # your public key to enable SSH on a box
easybits docs hosting      # one section of these docs as markdown
easybits docs cli --en     # this page
\`\`\`

SSH over 443 — add to \`~/.ssh/config\` and connect with \`ssh <name>.ghosty\`:

\`\`\`
Host *.ghosty
    ProxyCommand easybits ssh-proxy %h
    User root
\`\`\`

### \`--json\` and exit codes

With \`--json\`, stdout is **JSON only** (no banner, no tables) and errors go to stderr as \`{"error":{"code","message","status","hint","exitCode"}}\`.

| Code | Meaning |
|---|---|
| \`0\` | ok |
| \`1\` | API error (4xx/5xx), or \`domains verify\` not ready yet |
| \`2\` | usage error: unknown or missing command, subcommand or argument |
| \`3\` | not logged in (non-interactive), session expired, or credentials rejected (401) |

Deliberate exception: \`sandboxes exec\` without \`--json\` exits with the remote command's code (like \`ssh\`); with \`--json\` it exits 0 and the code travels in \`exitCode\`.

\`easybits --help\` and \`easybits <command> <subcommand> --help\` show usage, flags and examples.

### For coding agents

- Always pass \`--json\` and branch on the exit code, not on the text.
- With no session, run \`easybits login --json\`: the first line is \`{"event":"login_url","url":…}\` — show that link to the person — and \`{"event":"logged_in",…}\` arrives once they sign in. \`--no-browser\` skips opening this machine's browser.
- In CI, or when the person gives you a key, use \`EASYBITS_API_KEY\`.
- Chain with \`jq\`: \`ID=$(easybits sb create --template node --json | jq -r .sandboxId)\`.
- In \`exec\`, separate the command with \`--\` and use \`--json\` to read \`stdout\`, \`stderr\` and \`exitCode\` together.
- Destroy what you create: \`easybits sb destroy $ID\`.
- Ready-made skill: \`npx skills add https://easybits.cloud\` (includes \`easybits-cli\`).
`;

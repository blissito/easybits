import { CodeBlock } from "~/components/mdx/CodeBlock";
import { useState } from "react";

const tabs = ["MCP", "REST API", "CLI"] as const;
type Tab = (typeof tabs)[number];

export default function SetupPage() {
  const [active, setActive] = useState<Tab>("MCP");

  return (
    <div className="max-w-3xl">
      {/* Hero */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-2">
          Conecta tu app, agente o CLI
        </h2>
        <p className="text-gray-500 text-sm">
          Easybits expone tus archivos via REST, MCP y CLI.
          Un solo API key para todo.
        </p>
      </div>

      {/* Tabs — neobrutalism pill buttons */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActive(tab)}
            className={`group rounded-xl ${active === tab ? "bg-black" : "bg-transparent"}`}
          >
            <span
              className={`block px-4 py-2 text-sm font-semibold rounded-xl border-2 border-black transition-all ${
                active === tab
                  ? "bg-brand-500 -translate-x-1 -translate-y-1"
                  : "bg-white hover:-translate-x-1 hover:-translate-y-1"
              }`}
            >
              {tab}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="space-y-6">
        {active === "MCP" && <McpSection />}
        {active === "REST API" && <RestSection />}
        {active === "CLI" && <CliSection />}
      </div>
    </div>
  );
}

function McpSection() {
  return (
    <>
      <Card
        title="Streamable HTTP (recomendado)"
        description="Para Claude Code, Cursor, Windsurf y cualquier client MCP con soporte HTTP."
      >
        <CodeBlock language="json" title="mcp config" showLineNumbers={false}>
{`{
  "mcpServers": {
    "easybits": {
      "type": "streamable-http",
      "url": "https://easybits.cloud/api/mcp",
      "headers": {
        "Authorization": "Bearer eb_sk_live_YOUR_KEY"
      }
    }
  }
}`}
        </CodeBlock>
      </Card>

      <Card
        title="Claude Desktop — stdio"
        description="Si prefieres stdio, usa el paquete @easybits.cloud/mcp."
      >
        <CodeBlock language="json" title="claude_desktop_config.json" showLineNumbers={false}>
{`{
  "mcpServers": {
    "easybits": {
      "command": "npx",
      "args": ["-y", "@easybits.cloud/mcp"],
      "env": {
        "EASYBITS_API_KEY": "eb_sk_live_YOUR_KEY"
      }
    }
  }
}`}
        </CodeBlock>
      </Card>

      <Card
        title="Tools disponibles"
        description="Tu agente AI puede usar estas herramientas:"
      >
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: "list_files", desc: "Listar archivos" },
            { name: "get_file", desc: "Obtener archivo + URL firmada" },
            { name: "upload_file", desc: "Subir archivo nuevo" },
            { name: "delete_file", desc: "Eliminar archivo" },
            { name: "share_file", desc: "Compartir con otro usuario" },
            { name: "search_files", desc: "Buscar con lenguaje natural" },
            { name: "list_providers", desc: "Ver storage providers" },
          ].map((t) => (
            <div
              key={t.name}
              className="flex items-start gap-2 p-2 rounded-lg border-2 border-black bg-white"
            >
              <code className="text-xs font-mono bg-brand-aqua px-1.5 py-0.5 rounded border border-black shrink-0">
                {t.name}
              </code>
              <span className="text-xs text-gray-600">{t.desc}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function RestSection() {
  return (
    <>
      <Card
        title="SDK — TypeScript"
        description="Usa @easybits.cloud/sdk para integrar desde tu app."
      >
        <CodeBlock language="bash" title="instalar" showLineNumbers={false}>
{`npm install @easybits.cloud/sdk`}
        </CodeBlock>
        <CodeBlock language="typescript" title="uso" showLineNumbers={false}>
{`import { EasybitsClient } from "@easybits.cloud/sdk";

const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });
const { items } = await eb.listFiles();
const file = await eb.getFile("file_id");`}
        </CodeBlock>
      </Card>

      <Card
        title="Autenticación"
        description="Todas las requests usan Bearer token."
      >
        <CodeBlock language="bash" title="Header" showLineNumbers={false}>
{`Authorization: Bearer eb_sk_live_YOUR_KEY`}
        </CodeBlock>
      </Card>

      <Card
        title="Listar archivos"
        description="GET /api/v2/files"
      >
        <CodeBlock language="bash" title="curl" showLineNumbers={false}>
{`curl -H "Authorization: Bearer eb_sk_live_..." \\
  https://easybits.cloud/api/v2/files`}
        </CodeBlock>
      </Card>

      <Card
        title="Subir archivo"
        description="POST /api/v2/files — devuelve presigned URL para PUT."
      >
        <CodeBlock language="bash" title="curl" showLineNumbers={false}>
{`curl -X POST \\
  -H "Authorization: Bearer eb_sk_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"fileName":"doc.pdf","contentType":"application/pdf","size":1024}' \\
  https://easybits.cloud/api/v2/files`}
        </CodeBlock>
      </Card>

      <Card
        title="Obtener archivo"
        description="GET /api/v2/files/:fileId — metadata + URL de descarga firmada."
      >
        <CodeBlock language="bash" title="curl" showLineNumbers={false}>
{`curl -H "Authorization: Bearer eb_sk_live_..." \\
  https://easybits.cloud/api/v2/files/FILE_ID`}
        </CodeBlock>
      </Card>

      <Card
        title="Eliminar archivo"
        description="DELETE /api/v2/files/:fileId"
      >
        <CodeBlock language="bash" title="curl" showLineNumbers={false}>
{`curl -X DELETE \\
  -H "Authorization: Bearer eb_sk_live_..." \\
  https://easybits.cloud/api/v2/files/FILE_ID`}
        </CodeBlock>
      </Card>
    </>
  );
}

function CliSection() {
  return (
    <>
      <Card
        title="Instalar"
        description="Instala el CLI globalmente."
      >
        <CodeBlock language="bash" title="terminal" showLineNumbers={false}>
{`npm install -g @easybits.cloud/cli`}
        </CodeBlock>
      </Card>

      <Card
        title="Login"
        description="Guarda tu API key localmente."
      >
        <CodeBlock language="bash" title="terminal" showLineNumbers={false}>
{`easybits login eb_sk_live_YOUR_KEY`}
        </CodeBlock>
      </Card>

      <Card
        title="Comandos"
        description="Todo desde tu terminal."
      >
        <CodeBlock language="bash" title="terminal" showLineNumbers={false}>
{`# Listar archivos
easybits files list

# Subir un archivo
easybits files upload ./mi-documento.pdf

# Eliminar
easybits files delete FILE_ID

# Ver providers configurados
easybits providers list

# Imprimir config MCP (streamable HTTP)
easybits config

# Imprimir config MCP (stdio)
easybits mcp`}
        </CodeBlock>
      </Card>
    </>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-2 border-black rounded-xl p-5 space-y-3 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      <div>
        <h3 className="font-bold text-sm">{title}</h3>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      {children}
    </div>
  );
}

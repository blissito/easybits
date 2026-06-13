import { CodeBlock } from "~/components/mdx/CodeBlock";
import { useState } from "react";
import { Link } from "react-router";

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
          Un solo API key para todo.{" "}
          <Link to="/docs" className="underline font-medium text-black hover:text-brand-500">
            Ver documentación completa
          </Link>
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

const mcpEditors = ["Ghosty Code", "Claude Code", "Cursor", "VS Code + Copilot", "Windsurf", "OpenClaw", "NanoClaw", "stdio"] as const;
type McpEditor = (typeof mcpEditors)[number];

function McpSection() {
  const [editor, setEditor] = useState<McpEditor>("Ghosty Code");

  return (
    <>
      <Card
        title="Conecta tu editor"
        description={<>Elige tu editor y sigue las instrucciones. <Link to="/dash/developer" className="underline font-medium text-black hover:text-brand-500">Obtén tu API key aquí</Link>.</>}
      >
        <div className="flex flex-wrap gap-1.5 mb-4">
          {mcpEditors.map((e) => (
            <button
              key={e}
              onClick={() => setEditor(e)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border-2 transition-all ${
                editor === e
                  ? "bg-black text-white border-black"
                  : "bg-white text-black border-gray-300 hover:border-black"
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        {editor === "Ghosty Code" && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Ghosty Code v0.0.4+ ya trae EasyBits <strong>preinstalado</strong> vía HTTP. Solo configura tu API key:
            </p>
            <CodeBlock language="bash" title="terminal" showLineNumbers={false}>
{`export EASYBITS_API_KEY=eb_sk_live_YOUR_KEY
ghosty`}
            </CodeBlock>
            <p className="text-xs text-gray-400 mt-2">
              EasyBits aparece como <code className="bg-gray-100 px-1 rounded text-gray-600">easybits</code> en tu lista de MCPs. Nada que instalar.{" "}
              <Link to="/docs" className="underline">Ver herramientas disponibles</Link>.
            </p>
          </>
        )}

        {editor === "Claude Code" && (
          <>
            <p className="text-xs text-gray-500 mb-2">Un comando en tu terminal:</p>
            <CodeBlock language="bash" title="terminal" showLineNumbers={false}>
{`claude mcp add easybits -- npx -y @easybits.cloud/mcp --key eb_sk_live_YOUR_KEY`}
            </CodeBlock>
            <p className="text-xs text-gray-400 mt-2">
              Agrega <code className="bg-gray-100 px-1 rounded text-gray-600">--tools docs,slides</code> para habilitar grupos adicionales de herramientas.{" "}
              <Link to="/docs" className="underline">Ver grupos disponibles</Link>.
            </p>
          </>
        )}

        {editor === "Cursor" && (
          <>
            <p className="text-xs text-gray-500 mb-2">Agrega a <code className="bg-gray-100 px-1 rounded">.cursor/mcp.json</code> en tu proyecto:</p>
            <CodeBlock language="json" title=".cursor/mcp.json" showLineNumbers={false}>
{`{
  "mcpServers": {
    "easybits": {
      "type": "streamable-http",
      "url": "https://www.easybits.cloud/api/mcp",
      "headers": {
        "Authorization": "Bearer eb_sk_live_YOUR_KEY"
      }
    }
  }
}`}
            </CodeBlock>
          </>
        )}

        {editor === "VS Code + Copilot" && (
          <>
            <p className="text-xs text-gray-500 mb-2">Agrega a <code className="bg-gray-100 px-1 rounded">.vscode/mcp.json</code> en tu proyecto:</p>
            <CodeBlock language="json" title=".vscode/mcp.json" showLineNumbers={false}>
{`{
  "mcpServers": {
    "easybits": {
      "type": "streamable-http",
      "url": "https://www.easybits.cloud/api/mcp",
      "headers": {
        "Authorization": "Bearer eb_sk_live_YOUR_KEY"
      }
    }
  }
}`}
            </CodeBlock>
          </>
        )}

        {editor === "Windsurf" && (
          <>
            <p className="text-xs text-gray-500 mb-2">Agrega en Windsurf Settings → MCP, o en <code className="bg-gray-100 px-1 rounded">~/.codeium/windsurf/mcp_config.json</code>:</p>
            <CodeBlock language="json" title="mcp_config.json" showLineNumbers={false}>
{`{
  "mcpServers": {
    "easybits": {
      "type": "streamable-http",
      "url": "https://www.easybits.cloud/api/mcp",
      "headers": {
        "Authorization": "Bearer eb_sk_live_YOUR_KEY"
      }
    }
  }
}`}
            </CodeBlock>
          </>
        )}

        {editor === "NanoClaw" && (
          <>
            <p className="text-xs text-gray-500 mb-2">
              Usa el{" "}
              <a href="https://github.com/blissito/nanoclaw" target="_blank" rel="noopener noreferrer" className="underline font-medium text-black hover:text-brand-500">
                fork con soporte EasyBits
              </a>
              . Agrega tu key en <code className="bg-gray-100 px-1 rounded">.env</code>:
            </p>
            <CodeBlock language="bash" title="terminal" showLineNumbers={false}>
{`# Agregar key
ssh root@TU_IP "echo 'EASYBITS_API_KEY=eb_sk_live_YOUR_KEY' \\
  >> /home/nanoclaw/app/.env"

# Activar para un grupo
ssh root@TU_IP "sqlite3 /home/nanoclaw/app/store/messages.db \\
  \\"UPDATE registered_groups \\
  SET container_config = '{\\\\\"mcpServers\\\\\":[\\\\\"easybits\\\\\"]}' \\
  WHERE folder = 'main';\\""`}
            </CodeBlock>
          </>
        )}

        {editor === "OpenClaw" && (
          <>
            <p className="text-xs text-gray-500 mb-2">Agrega a tu archivo <code className="bg-gray-100 px-1 rounded">mcp.json</code> de OpenClaw:</p>
            <CodeBlock language="json" title="mcp.json" showLineNumbers={false}>
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
          </>
        )}

        {editor === "stdio" && (
          <>
            <p className="text-xs text-gray-500 mb-2">Para Claude Desktop u otros clientes que usan stdio:</p>
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
          </>
        )}
      </Card>

      <Card
        title="30+ herramientas MCP"
        description={<>Archivos, bases de datos, documentos, landings, presentaciones y más. <Link to="/docs#mcp-tools" className="underline font-medium text-black hover:text-brand-500">Ver lista completa en docs</Link></>}
      >
        <p className="text-xs text-gray-500">
          Una vez conectado, tu agente puede subir archivos, crear bases de datos, generar documentos con AI, publicar websites y más — todo desde el chat.
        </p>
      </Card>
    </>
  );
}

function RestSection() {
  return (
    <>
      <Card
        title="SDK — TypeScript"
        description={<>Usa @easybits.cloud/sdk para integrar desde tu app. <Link to="/docs#sdk" className="underline font-medium text-black hover:text-brand-500">Ver referencia completa del SDK</Link></>}
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
  https://www.easybits.cloud/api/v2/files`}
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
  https://www.easybits.cloud/api/v2/files`}
        </CodeBlock>
      </Card>

      <Card
        title="Obtener archivo"
        description="GET /api/v2/files/:fileId — metadata + URL de descarga firmada."
      >
        <CodeBlock language="bash" title="curl" showLineNumbers={false}>
{`curl -H "Authorization: Bearer eb_sk_live_..." \\
  https://www.easybits.cloud/api/v2/files/FILE_ID`}
        </CodeBlock>
      </Card>

      <Card
        title="Eliminar archivo"
        description="DELETE /api/v2/files/:fileId"
      >
        <CodeBlock language="bash" title="curl" showLineNumbers={false}>
{`curl -X DELETE \\
  -H "Authorization: Bearer eb_sk_live_..." \\
  https://www.easybits.cloud/api/v2/files/FILE_ID`}
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
  description: React.ReactNode;
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

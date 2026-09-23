import { Link } from "react-router";
import type { Route } from "./+types/developers";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { Footer } from "~/components/common/Footer";
import { PLANS, formatPrice, effectivePrice } from "~/lib/plans";
import { CodeBlock } from "~/components/mdx/CodeBlock";
import { useState, type ReactNode } from "react";
import { SkillsInstall } from "~/components/docs/SkillsInstall";

export const meta = () =>
  getBasicMetaTags({
    title: "EasyBits para Developers — La nube para agentes de IA",
    description:
      "Sandboxes, web, archivos, bases de datos, documentos y hosting desde una REST API v2, un SDK tipado y un endpoint MCP. Tu agente lo instala solo: npx skills add https://easybits.cloud. Precios en MXN.",
  });

const LANG_MAP: Record<string, string> = {
  curl: "bash",
  sdk: "typescript",
  rest: "bash",
};

function TabbedCode({ tabs }: { tabs: { label: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div className="border-2 border-black rounded-xl overflow-hidden">
      <div className="flex bg-gray-800">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={`px-4 py-1.5 text-xs font-bold uppercase transition-colors ${
              active === i
                ? "bg-gray-950 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <CodeBlock bare language={LANG_MAP[tabs[active].label.toLowerCase()] || "typescript"}>
        {tabs[active].code}
      </CodeBlock>
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <section className="overflow-hidden w-full">
      {/* Nav */}
      <nav className="border-b-2 border-black px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link to="/inicio" className="flex items-center gap-2">
            <img src="/icons/easybits-logo.svg" alt="EasyBits" className="w-8 h-8" />
            <span className="font-bold text-xl">EasyBits</span>
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/docs" className="text-sm font-medium hover:underline">
              Docs
            </Link>
            <Link to="/status" className="text-sm font-medium hover:underline">
              Status
            </Link>
            <Link to="/blog" className="text-sm font-medium hover:underline">
              Blog
            </Link>
            <Link
              to="/login"
              className="bg-black text-white px-4 py-2 rounded-xl text-sm font-bold border-2 border-black hover:translate-y-[-2px] transition-transform"
            >
              Obtener API Key
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-white border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
          <h1 className="text-4xl md:text-6xl font-bold max-w-3xl leading-tight">
            La nube que{" "}
            <span className="bg-yellow-300 px-2 -rotate-1 inline-block">
              tus agentes ya saben usar
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mt-6 max-w-2xl">
            Sandboxes, web, archivos, bases de datos, documentos y hosting desde
            una REST API v2, un SDK tipado y un endpoint MCP. En MXN.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="#instalar"
              className="bg-black text-white px-8 py-3 rounded-xl font-bold border-2 border-black hover:translate-y-[-2px] transition-transform text-lg"
            >
              Instálalo en tu agente
            </a>
            <Link
              to="/docs"
              className="bg-white text-black px-8 py-3 rounded-xl font-bold border-2 border-black hover:translate-y-[-2px] transition-transform text-lg"
            >
              Leer los Docs
            </Link>
          </div>
        </div>
      </div>

      {/* Code comparison — SDK vs REST */}
      <div className="bg-gray-50 border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            3 líneas, no 30
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Una caja con root e internet, y una app en producción, con el SDK tipado o con curl. Sin configurar VPCs, imágenes ni credenciales de cloud.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                <span className="bg-green-200 text-green-900 text-xs px-2 py-0.5 rounded-full font-bold">
                  EasyBits
                </span>
                SDK + REST
              </h3>
              <TabbedCode
                tabs={[
                  {
                    label: "SDK",
                    code: `import { EasybitsClient } from "@easybits.cloud/sdk";

const eb = new EasybitsClient({ apiKey });
const sb = await eb.sandboxes.create({ template: "node", suspendOnIdle: true });
const { stdout } = await sb.exec("node -v");

// De un repo a una URL pública, con release de recuperación
const { url } = await eb.machines.launch({ repo: "https://github.com/tu/app.git" });`,
                  },
                  {
                    label: "cURL",
                    code: `# 1. Una caja con root e internet
curl -X POST https://www.easybits.cloud/api/v2/sandboxes \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json" \\
  -d '{"template":"node","suspendOnIdle":true}'

# 2. Una app en producción en una llamada
curl -X POST https://www.easybits.cloud/api/v2/machines/launch \\
  -H "Authorization: Bearer $EASYBITS_API_KEY" -H "Content-Type: application/json" \\
  -d '{"repo":"https://github.com/tu/app.git"}'`,
                  },
                ]}
              />
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                <span className="bg-red-200 text-red-900 text-xs px-2 py-0.5 rounded-full font-bold">
                  Cloud tradicional
                </span>
                30+ líneas de setup
              </h3>
              <div className="border-2 border-black rounded-xl overflow-hidden">
                <CodeBlock bare language="typescript">
                  {`import { EC2Client, RunInstancesCommand } from "@aws-sdk/client-ec2";

const ec2 = new EC2Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
await ec2.send(new RunInstancesCommand({
  ImageId: "ami-…", InstanceType: "t3.micro",
  MinCount: 1, MaxCount: 1,
  SecurityGroupIds: ["sg-…"], SubnetId: "subnet-…",
}));
// + esperar el boot, SSH, instalar Node, clonar, build,
// + reverse proxy, TLS, systemd, backups, monitoreo...`}
                </CodeBlock>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skills + MCP — before features, it's the main differentiator */}
      <div id="instalar" className="bg-yellow-50 border-b-2 border-black scroll-mt-16">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Tu agente ya sabe usarlo
              </h2>
              <p className="text-lg text-gray-600 mb-4">
                <strong>No configures nada a mano.</strong> Tu agente de código instala
                los skills de EasyBits y aprende solo cuándo usar REST, SDK o MCP.
              </p>
              <p className="text-base text-gray-500 mb-6">
                Claude Code, Cursor, Codex, Ghosty Code, Goose o cualquier cliente MCP.
                Sin prompting, sin wrappers.
              </p>
              <div className="space-y-3 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Un sandbox con root e internet que duerme y despierta en menos de un segundo</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Web sin bloqueos: buscar, leer cualquier página, extraer registros</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Archivos por CDN y una base SQL por cliente</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Una app en producción, con release de recuperación, en una sola llamada</span>
                </div>
              </div>
            </div>
            <div>
              <SkillsInstall compact />
              <div className="mt-4">
                <TabbedCode
                  tabs={[
                    {
                      label: "Claude Code",
                      code: `claude mcp add easybits -- npx -y @easybits.cloud/mcp \\
  --key $EASYBITS_API_KEY --tools core,sandbox`,
                    },
                    {
                      label: "Ghosty Code",
                      code: `# Trae EasyBits preinstalado
export EASYBITS_API_KEY=eb_sk_live_YOUR_KEY
ghosty`,
                    },
                    {
                      label: "Cursor / Codex",
                      code: `{
  "mcpServers": {
    "easybits": {
      "type": "streamable-http",
      "url": "https://www.easybits.cloud/api/mcp/core,sandbox",
      "headers": { "Authorization": "Bearer $EASYBITS_API_KEY" }
    }
  }
}`,
                    },
                    {
                      label: "Claude.ai",
                      code: `# Settings → Connectors → Add custom connector
https://www.easybits.cloud/api/mcp/core
# OAuth 2.1: sin API key`,
                    },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Features grid */}
      <div className="bg-white border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            Todo lo que tu agente necesita
          </h2>
          <p className="text-center text-gray-500 mb-12 max-w-xl mx-auto">
            Cada feature tiene endpoint REST, método SDK y herramienta MCP.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              title="Sandboxes"
              description="MicroVMs Firecracker con root e internet. exec, procesos en background, snapshots y forks copy-on-write, URL pública por puerto."
              badge="POST /v2/sandboxes"
            />
            <FeatureCard
              title="Web"
              description="Buscar en Google, leer cualquier página aunque bloquee bots, extraer registros con esquema (Maps, Mercado Libre, Amazon) y rastrear sitios."
              badge="POST /v2/web/*"
            />
            <FeatureCard
              title="Hosting"
              description="De un repo, un zip o una caja a una URL pública con TLS, release de recuperación y backups diarios. Una llamada."
              badge="POST /v2/machines/launch"
            />
            <FeatureCard
              title="Bases de datos"
              description="SQLite-as-a-service: una base aislada por cliente o por app, con query, batch e import masivo."
              badge="POST /v2/databases"
            />
            <FeatureCard
              title="Archivos"
              description="Hasta 5 GB por archivo, CDN, versiones, links temporales, webhooks firmados y transformación de imágenes."
              badge="POST /v2/files"
            />
            <FeatureCard
              title="Agentes"
              description="Agentes persistentes en su propia microVM (ghosty-lite, goose, claude-code), una flota en WhatsApp, Teams y web, y el provider de sandboxes para eve (@easybits.cloud/eve-sandbox)."
              badge="POST /v2/agents"
            />
          </div>
        </div>
      </div>

      {/* Pricing summary */}
      <div className="bg-white border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Precios simples
          </h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <PricingCard
              title={PLANS.Byte.name}
              price={formatPrice(PLANS.Byte.price)}
              features={PLANS.Byte.features}
            />
            <PricingCard
              title={PLANS.Mega.name}
              price={
                <>
                  <span className="text-iron text-xl font-normal line-through mr-2">
                    {formatPrice(PLANS.Mega.price)}
                  </span>
                  {formatPrice(effectivePrice("Mega"))} mxn/mes
                </>
              }
              features={PLANS.Mega.features}
              highlighted
            />
            <PricingCard
              title={PLANS.Tera.name}
              price={`${formatPrice(effectivePrice("Tera"))} mxn/mes`}
              features={PLANS.Tera.features}
            />
          </div>
          <p className="text-center mt-8 text-gray-500">
            <Link to="/planes" className="underline hover:text-black">
              Ver todos los detalles de precios
            </Link>
          </p>
        </div>
      </div>

      {/* CTA */}
      <div className="bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Tu agente puede tener su primera caja en 2 minutos
          </h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            Crea una cuenta, genera tu API key y dile a tu agente{" "}
            <code className="font-mono text-white">npx skills add https://easybits.cloud</code>.
            Sin tarjeta de crédito.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/dash/developer/setup"
              className="bg-white text-black px-8 py-3 rounded-xl font-bold border-2 border-white hover:translate-y-[-2px] transition-transform text-lg inline-block"
            >
              Empezar Gratis
            </Link>
            <Link
              to="/docs"
              className="bg-transparent text-white px-8 py-3 rounded-xl font-bold border-2 border-white hover:translate-y-[-2px] transition-transform text-lg inline-block"
            >
              Leer los Docs
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </section>
  );
}

function FeatureCard({
  title,
  description,
  badge,
}: {
  title: string;
  description: string;
  badge: string;
}) {
  return (
    <div className="border-2 border-black rounded-xl p-6 hover:translate-y-[-2px] transition-transform">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-lg">{title}</h3>
        <code className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full text-gray-500 font-mono">
          {badge}
        </code>
      </div>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

function PricingCard({
  title,
  price,
  features,
  highlighted,
}: {
  title: string;
  price: ReactNode;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`border-2 border-black rounded-xl p-6 ${
        highlighted ? "bg-yellow-50 ring-2 ring-yellow-300" : "bg-white"
      }`}
    >
      <h3 className="font-bold text-lg">{title}</h3>
      <p className="text-3xl font-bold mt-2 mb-4">{price}</p>
      <ul className="space-y-2 text-sm text-gray-600">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2">
            <span className="text-green-600 font-bold">✓</span> {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

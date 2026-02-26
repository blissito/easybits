import { Link } from "react-router";
import type { Route } from "./+types/developers";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { Footer } from "~/components/common/Footer";
import { PLANS, formatPrice } from "~/lib/plans";
import { CodeBlock } from "~/components/mdx/CodeBlock";
import { useState } from "react";

export const meta = () =>
  getBasicMetaTags({
    title: "EasyBits para Developers — Agentic-First File Storage",
    description:
      "La infraestructura de archivos que tus agentes de IA ya saben usar. SDK tipado, 33+ herramientas MCP, REST API v2.",
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
          <Link to="/inicio" className="font-bold text-xl">
            EasyBits
          </Link>
          <div className="flex items-center gap-6">
            <Link to="/docs" className="text-sm font-medium hover:underline">
              Docs
            </Link>
            <Link to="/status" className="text-sm font-medium hover:underline">
              Status
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
            La infra de archivos que{" "}
            <span className="bg-yellow-300 px-2 -rotate-1 inline-block">
              tus agentes ya saben usar
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mt-6 max-w-2xl">
            SDK tipado, 33+ herramientas MCP y REST API v2. Tus agentes suben,
            optimizan y comparten archivos sin necesitar prompting.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/docs"
              className="bg-black text-white px-8 py-3 rounded-xl font-bold border-2 border-black hover:translate-y-[-2px] transition-transform text-lg"
            >
              Leer los Docs
            </Link>
            <Link
              to="/login"
              className="bg-white text-black px-8 py-3 rounded-xl font-bold border-2 border-black hover:translate-y-[-2px] transition-transform text-lg"
            >
              Empezar Gratis
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
            Sube un archivo con el SDK tipado o con curl. Sin configurar buckets, regiones ni credenciales de cloud.
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
const { file, putUrl } = await eb.uploadFile({
  fileName: "photo.jpg",
  contentType: "image/jpeg",
  size: buffer.length,
});
await fetch(putUrl, { method: "PUT", body: buffer });`,
                  },
                  {
                    label: "cURL",
                    code: `# 1. Crear registro y obtener URL presignada
curl -X POST https://api.easybits.cloud/v2/files \\
  -H "Authorization: Bearer eb_..." \\
  -d '{"fileName":"photo.jpg","contentType":"image/jpeg","size":48120}'

# 2. Subir el archivo
curl -X PUT "<putUrl>" --data-binary @photo.jpg`,
                  },
                ]}
              />
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                <span className="bg-red-200 text-red-900 text-xs px-2 py-0.5 rounded-full font-bold">
                  AWS S3
                </span>
                30+ líneas de setup
              </h3>
              <div className="border-2 border-black rounded-xl overflow-hidden">
                <CodeBlock bare language="typescript">
                  {`import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const client = new S3Client({
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const command = new PutObjectCommand({
  Bucket: "my-bucket",
  Key: "photo.jpg",
  ContentType: "image/jpeg",
});
const url = await getSignedUrl(client, command);
// + DB record, access control, CDN config, ...`}
                </CodeBlock>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MCP Section — before features, it's the main differentiator */}
      <div className="bg-yellow-50 border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Tu agente ya sabe usarlo
              </h2>
              <p className="text-lg text-gray-600 mb-6">
                EasyBits incluye un servidor MCP con 33+ herramientas. Claude,
                Cursor, ChatGPT y cualquier cliente MCP manejan tus archivos de
                forma nativa — sin prompting, sin wrappers.
              </p>
              <div className="space-y-3 text-sm text-gray-700">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Subir, descargar, optimizar, transformar imágenes</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Compartir con links temporales y permisos granulares</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Búsqueda semántica con lenguaje natural</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold mt-0.5">✓</span>
                  <span>Webhooks, sitios estáticos, bulk operations</span>
                </div>
              </div>
            </div>
            <div>
              <TabbedCode
                tabs={[
                  {
                    label: "SDK",
                    code: `// Tu agente optimiza una imagen en 2 líneas
const { file, originalSize, optimizedSize } =
  await eb.optimizeImage({ fileId, format: "webp" });

// Genera un link temporal para compartir
const { url } = await eb.generateShareToken({
  fileId: file.id,
  expiresIn: 3600,
});`,
                  },
                  {
                    label: "cURL",
                    code: `# Optimizar imagen a WebP
curl -X POST https://api.easybits.cloud/v2/images/optimize \\
  -H "Authorization: Bearer eb_..." \\
  -d '{"fileId":"file_abc","format":"webp"}'

# Generar link temporal (1 hora)
curl -X POST https://api.easybits.cloud/v2/share-tokens \\
  -H "Authorization: Bearer eb_..." \\
  -d '{"fileId":"file_abc","expiresIn":3600}'`,
                  },
                ]}
              />
              <div className="mt-4 border-2 border-black rounded-xl overflow-hidden">
                <div className="flex items-center justify-between bg-gray-800 px-4 py-2">
                  <span className="text-white font-medium text-sm">MCP Setup</span>
                  <span className="text-gray-400 text-xs uppercase font-mono">bash</span>
                </div>
                <CodeBlock bare language="bash">
                  {`npx -y @easybits.cloud/mcp`}
                </CodeBlock>
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
              title="File Storage"
              description="Archivos de hasta 5 GB. URLs presignadas, acceso público o privado, metadata custom."
              badge="POST /v2/files"
            />
            <FeatureCard
              title="Imágenes"
              description="Optimiza a WebP/AVIF, redimensiona, rota, recorta y aplica grayscale. El original no se modifica."
              badge="POST /v2/images/*"
            />
            <FeatureCard
              title="Búsqueda Semántica"
              description="Busca archivos con lenguaje natural. Powered by tu propia API key de Anthropic u OpenAI."
              badge="POST /v2/search"
            />
            <FeatureCard
              title="Sharing"
              description="Links temporales con expiración configurable. Permisos granulares por usuario y archivo."
              badge="POST /v2/share-tokens"
            />
            <FeatureCard
              title="Webhooks"
              description="Notificaciones en tiempo real con HMAC signing. Auto-pause tras 5 fallos consecutivos."
              badge="POST /v2/webhooks"
            />
            <FeatureCard
              title="Sitios Estáticos"
              description="Despliega HTML/CSS/JS en tu-slug.easybits.cloud. Ideal para landing pages y demos."
              badge="POST /v2/websites"
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
              title={PLANS.Spark.name}
              price={formatPrice(PLANS.Spark.price)}
              features={PLANS.Spark.features}
            />
            <PricingCard
              title={PLANS.Flow.name}
              price={`${formatPrice(PLANS.Flow.price)} mxn/mes`}
              features={PLANS.Flow.features}
              highlighted
            />
            <PricingCard
              title={PLANS.Studio.name}
              price={`${formatPrice(PLANS.Studio.price)} mxn/mes`}
              features={PLANS.Studio.features}
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
            Tu agente puede empezar a subir archivos en 2 minutos
          </h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            Crea una cuenta, genera tu API key y conecta el SDK o el MCP server.
            Sin tarjeta de crédito.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/login"
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
  price: string;
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

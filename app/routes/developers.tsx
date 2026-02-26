import { Link } from "react-router";
import type { Route } from "./+types/developers";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { Footer } from "~/components/common/Footer";
import { PLANS, formatPrice } from "~/lib/plans";

export const meta = () =>
  getBasicMetaTags({
    title: "EasyBits para Developers — File Storage con IA",
    description:
      "Sube, optimiza y comparte archivos con una API simple. Búsqueda con IA, transformación de imágenes e integración MCP incluidos.",
  });

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
            File storage con{" "}
            <span className="bg-yellow-300 px-2 -rotate-1 inline-block">
              superpoderes de IA
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mt-6 max-w-2xl">
            Sube, optimiza, transforma y comparte archivos con una API simple.
            Búsqueda con IA e integración MCP incluidos.
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

      {/* Code comparison */}
      <div className="bg-gray-50 border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            3 líneas, no 30
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            <CodeBlock
              title="EasyBits SDK"
              badge="3 líneas"
              badgeColor="bg-green-200"
              code={`import { EasybitsClient } from "@easybits.cloud/sdk";

const eb = new EasybitsClient({ apiKey });
const { file, putUrl } = await eb.uploadFile({
  fileName: "photo.jpg",
  contentType: "image/jpeg",
  size: buffer.length,
});
await fetch(putUrl, { method: "PUT", body: buffer });`}
            />
            <CodeBlock
              title="AWS S3"
              badge="30+ líneas"
              badgeColor="bg-red-200"
              code={`import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
// + DB record, access control, CDN, ...`}
            />
          </div>
        </div>
      </div>

      {/* Features grid */}
      <div className="bg-white border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Todo lo que necesitas, nada que no
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              title="File Storage"
              description="Sube archivos de hasta 5GB. Acceso público o privado. URLs presignadas para subidas seguras."
            />
            <FeatureCard
              title="Optimización de Imágenes"
              description="Convierte a WebP/AVIF al vuelo. Redimensiona, recorta, rota, voltea y escala de grises."
            />
            <FeatureCard
              title="Búsqueda con IA"
              description="Busca archivos con lenguaje natural. Sin necesidad de tags manuales."
            />
            <FeatureCard
              title="Compartir"
              description="Genera links temporales. Permisos granulares por archivo."
            />
            <FeatureCard
              title="Sitios Estáticos"
              description="Despliega sitios estáticos en tu-nombre.easybits.cloud en segundos."
            />
            <FeatureCard
              title="Papelera"
              description="7 días de retención. Restaura archivos con una sola llamada a la API."
            />
          </div>
        </div>
      </div>

      {/* MCP Section */}
      <div className="bg-yellow-50 border-b-2 border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Tu agente de IA ya sabe usarlo
            </h2>
            <p className="text-lg text-gray-600 mb-8">
              EasyBits incluye un servidor Model Context Protocol (MCP). Claude,
              Cursor y cualquier agente compatible con MCP puede manejar tus
              archivos de forma nativa — sin prompting.
            </p>
            <div className="bg-black text-green-400 rounded-xl p-6 font-mono text-left text-sm">
              <span className="text-gray-500">$</span> npx -y @easybits.cloud/mcp
            </div>
            <p className="text-sm text-gray-500 mt-4">
              22 herramientas disponibles: subir, descargar, optimizar, transformar, compartir, buscar y más.
            </p>
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
            Empieza a construir en minutos
          </h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            Crea una cuenta, obtén tu API key y empieza a subir archivos.
            Sin tarjeta de crédito.
          </p>
          <Link
            to="/login"
            className="bg-white text-black px-8 py-3 rounded-xl font-bold border-2 border-white hover:translate-y-[-2px] transition-transform text-lg inline-block"
          >
            Empezar Gratis
          </Link>
        </div>
      </div>

      <Footer />
    </section>
  );
}

function CodeBlock({
  title,
  badge,
  badgeColor,
  code,
}: {
  title: string;
  badge: string;
  badgeColor: string;
  code: string;
}) {
  return (
    <div className="border-2 border-black rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b-2 border-black">
        <span className="font-bold text-sm">{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${badgeColor}`}>
          {badge}
        </span>
      </div>
      <pre className="p-4 text-sm overflow-x-auto bg-gray-950 text-gray-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="border-2 border-black rounded-xl p-6 hover:translate-y-[-2px] transition-transform">
      <h3 className="font-bold text-lg mb-2">{title}</h3>
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

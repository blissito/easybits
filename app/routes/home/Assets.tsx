import { Card } from "./Card";

// Grid de capacidades: mismas tarjetas y colores del diseño original, ahora
// con los productos de la nube. Tags cortos: el Tag capitaliza y tres nombres
// de tool no caben en la tarjeta (se desbordaban).
export const Assets = () => {
  return (
    <section className="max-w-7xl mx-auto py-20 md:py-40 px-4 md:px-[5%] xl:px-0">
      <h2 className="text-3xl md:text-5xl font-bold text-center mb-12 md:mb-20">
        Qué corre en EasyBits
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-6 md:gap-y-12">
        <Card
          img="/home/code.svg"
          title="Sandboxes"
          description="Una microVM por agente: root, Bash e internet. Duerme sola y despierta en menos de un segundo."
          className="bg-[#93E6EB]"
          tags={["microVM", "Exec", "Releases"]}
        />
        <Card
          img="/home/cloud.svg"
          title="Web"
          description="Busca, lee y extrae registros de cualquier sitio, aunque bloquee bots. Se paga por consulta."
          className="bg-[#D4EB93]"
          tags={["Buscar", "Leer", "Extraer"]}
        />
        <Card
          img="/home/science.svg"
          title="Bases de datos"
          description="Una base SQL por cliente o por caja, sin pooling que administrar. Backup y restore incluidos."
          className="bg-[#CDB8F9]"
          tags={["SQL", "Por cliente", "Backup"]}
        />
        <Card
          img="/home/template.svg"
          title="Archivos"
          description="Storage con CDN, versiones, share links y webhooks. Lo que tu agente produce, ya tiene dónde vivir."
          className="bg-[#DCE2F0]"
          tags={["CDN", "Versiones", "Share links"]}
        />
        <Card
          img="/home/book.svg"
          title="Documentos"
          description="Cotizaciones, reportes, landings y presentaciones en PDF o HTML, con tu brand kit."
          className="bg-[#E0AC6E]"
          tags={["PDF", "Landings", "Slides"]}
        />
        <Card
          img="/home/micro.svg"
          title="Voz y video"
          description="Transcribe, sintetiza voz y arma reels con avatar desde el mismo conector."
          className="bg-[#FCCCBD]"
          tags={["TTS", "Reels", "Subtítulos"]}
        />
        <Card
          img="/home/rocket.svg"
          title="Hosting"
          description="Del repo a una URL pública en 12 s: build, releases, backups diarios y dominio propio."
          className="bg-[#F7E1FD]"
          tags={["Repo → URL", "Rollback", "Backups"]}
        />
        <Card
          img="/home/support.svg"
          title="Agentes en WhatsApp"
          description="Tu número o el del cliente. Cada agente en su caja, con su prompt y sus conectores."
          className="bg-[#B2DAD8]"
          tags={["Flota", "Coexistencia", "Voz"]}
        />
        <Card
          img="/home/foco.svg"
          title="Modelos LLM"
          description="Claude, DeepSeek y más con tu misma llave de EasyBits. Cualquier cliente OpenAI funciona sin cambiar código; pagas tokens en MXN."
          className="bg-[#FADB6F]"
          tags={["Claude", "DeepSeek", "Sin cuenta aparte"]}
        />
      </div>
    </section>
  );
};

import { Banners, Robot } from "~/components/common/Banner";
import { BasicGallery } from "~/components/galleries/BasicGallery";
import { AuthNav } from "~/components/login/auth-nav";
import { Pricing } from "./plans/Pricing";
import { Benefits } from "./plans/Benefits";
import { Faq } from "./plans/Faq";
import { Footer } from "~/components/common/Footer";
import type { Route } from "./+types/planes";
import getBasicMetaTags from "~/utils/getBasicMetaTags";
import { FloatingChat } from "~/components/ai/FloatingChat";
import { ThankYouModal } from "~/components/common/ThankYouModal";
import { useSearchParams } from "react-router";

export const clientLoader = async () => {
  const user = await fetch("/api/v1/user?intent=self").then((r) => r.json());
  return { user };
};

export const meta = () =>
  getBasicMetaTags({
    title: "Planes — La nube para expertos IA | EasyBits",
    description:
      "Planes en MXN para sandboxes, web, archivos, datos y agentes. Empieza gratis; los packs valen para cualquier plan y no caducan.",
  });

export default function Planes({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  const [params, setParams] = useSearchParams();
  const justPaid = params.get("success") === "1";
  const dismissThanks = () => {
    const next = new URLSearchParams(params);
    next.delete("success");
    setParams(next, { replace: true });
  };
  return (
    <section className="overflow-hidden">
      {justPaid && <ThankYouModal kind="plan" onClose={dismissThanks} />}
      <AuthNav user={user} />
      <Pricing />
      <BasicGallery
        className="bg-brand-grass border-[2px] border-black"
        items={[
          {
            src: "/client.png",
            text: "Nuestro agente cotiza desde el catálogo y mueve los pedidos en el tablero solo. Antes eso era una persona todo el día en WhatsApp.",
            name: "Dirección comercial, distribuidor industrial · CDMX",
          },
          {
            src: "/client.png",
            text: "Cada consultorio tiene su agente en su propia caja. Si nadie escribe, duerme y no me cuesta; si escriben cincuenta, despiertan cincuenta.",
            name: "Fundador, agenda para consultorios · MX",
          },
          {
            src: "/client.png",
            text: "En el taller conecté el MCP en Claude Code y en la misma tarde mi agente ya tenía sandbox, base de datos y leía sitios que me bloqueaban.",
            name: "Alumno del taller de agentes",
          },
        ]}
      />
      <Benefits />
      <Banners rotation={0}>
        <>
          Sandboxes <Robot /> Web <Robot /> Archivos <Robot /> Bases de datos{" "}
          <Robot /> Agentes en WhatsApp <Robot /> Un solo MCP <Robot />{" "}
          Sandboxes <Robot /> Web <Robot /> Archivos <Robot /> Bases de datos{" "}
          <Robot /> Agentes en WhatsApp <Robot /> Un solo MCP <Robot />{" "}
          Sandboxes <Robot /> Web <Robot /> Archivos <Robot /> Bases de datos{" "}
          <Robot /> Agentes en WhatsApp <Robot /> Un solo MCP <Robot />
        </>
      </Banners>
      <Faq />
      <Footer />
      <FloatingChat />
    </section>
  );
}

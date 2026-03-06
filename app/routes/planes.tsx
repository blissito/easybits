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

export const clientLoader = async () => {
  const user = await fetch("/api/v1/user?intent=self").then((r) => r.json());
  return { user };
};

export const meta = () =>
  getBasicMetaTags({
    title: "Planes flexibles para cada etapa de tu negocio creativo",
    description: "Elige tu plan y vende tu primer asset",
  });

export default function Planes({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <section className="overflow-hidden">
      <AuthNav user={user} />
      <Pricing />
      <BasicGallery
        className="bg-brand-grass border-[2px] border-black"
        items={[
          {
            src: "/client.png",
            text: "Conecté mi agente de IA a EasyBits con el MCP y en minutos ya estaba subiendo y organizando archivos automáticamente. Es el storage que siempre quise para mis workflows de AI.",
            name: "Daniel R. — AI Developer",
          },
          {
            src: "/client.png",
            text: "Usamos EasyBits como backend de archivos para nuestra app. El SDK es limpio, los webhooks nos notifican al instante, y el streaming HLS resolvió nuestro problema de video sin complicaciones.",
            name: "Mariana L. — CTO, Startup SaaS",
          },
          {
            src: "/client.png",
            text: "Antes usaba Cloudinary y pagaba de más por features que no necesitaba. Con EasyBits subo archivos, genero links de descarga y tengo preview inline, todo desde la API. Simple y funcional.",
            name: "Carlos V. — Fullstack Engineer",
          },
        ]}
      />
      <Benefits />
      <Banners rotation={0}>
        <>
          Crea una cuenta gratis <Robot /> Vende tu primer asset <Robot />{" "}
          Almacena tus archivos <Robot /> Crea una cuenta gratis <Robot /> Vende
          tu primer asset <Robot /> Almacena tus archivos <Robot /> Crea una
          cuenta gratis <Robot /> Vende tu primer asset <Robot /> Almacena tus
          archivos <Robot /> Crea una cuenta gratis <Robot /> Vende tu primer
          asset <Robot /> Almacena tus archivos <Robot />
        </>
      </Banners>
      <Faq />
      <Footer />
      <FloatingChat />
    </section>
  );
}

import { Banners, Robot } from "~/components/common/Banner";
import { Footer } from "~/components/common/Footer";
import { BasicGallery } from "~/components/galleries/BasicGallery";
import { AuthNav } from "~/components/login/auth-nav";
import { Hero } from "./Hero";
import { Quote } from "./Quote";
import { Bento } from "./Bento";
import { ItemList } from "./ItemList";
import { Invite } from "./Invite";
import { Assets } from "./Assets";
import type { Route } from "./+types/home";

export const clientLoader = async () => {
  const user = await fetch("/api/v1/user?intent=self").then((r) => r.json());
  return { user };
};

export default function Home({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <section className="overflow-hidden w-full">
      <AuthNav user={user} />
      <Hero />
      <Banners rotation={2}>
        <>
          Crea una cuenta gratis <Robot /> Vende tu primer asset <Robot />{" "}
          Almacena tus archivos <Robot /> Crea una cuenta gratis <Robot /> Vende
          tu primer asset <Robot /> Almacena tus archivos <Robot /> Crea una
          cuenta gratis <Robot /> Vende tu primer asset <Robot /> Almacena tus
          archivos <Robot /> Crea una cuenta gratis <Robot /> Vende tu primer
          asset <Robot /> Almacena tus archivos <Robot />
        </>
      </Banners>
      <Quote />
      <Bento
        title="Vende lo que quieras"
        position="right"
        image="https://i.imgur.com/JjN1Q0l.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          Desde cursos en video y libros hasta ilustraciones, fotografías,
          plantillas o lo que sea. ¡Sí, lo que sea!{" "}
        </p>

        <ItemList title="Tu set de fotografías" />
        <ItemList title="Tu libro de diseño" />
        <ItemList title="Tu paquete de ilustraciones" />
        <ItemList title="Tu curso de inglés" />
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Y más... mucho más.
        </p>
      </Bento>
      <Bento
        title="Vende a quien quieras donde quieras"
        image="https://i.imgur.com/R8qvNsB.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          ¿Ya tienes clientes o un sequito de seguidores? Comparte tu tienda y
          permite que tu comunidad, seguidores o clientes compren fácilmente.
        </p>
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Y además, llega a más personas siendo parte de la comunidad EasyBits.
        </p>
      </Bento>
      <Bento
        position="right"
        title="Recibe tus pagos fácilmente"
        image="https://i.imgur.com/lEOVfUp.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          Acepta distintas formas de pago que se adecúen a tu audiencia, incluso
          pagos internacionales seguros y rápidos.
        </p>
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Además, recibe tus pagos directamente en tu cuenta bancaria cada 48
          hrs.
        </p>
      </Bento>
      <Bento
        title="Y además ¡Almacena tus archivos! "
        image="https://i.imgur.com/hn9dN49.png"
      >
        <p className="text-iron text-xl lg:text-2xl mt-4 mb-8 ">
          Usa EasyBits para almacenar todo tipo de archivos y compartirlos con
          tus amigos o clientes, o incluso, consumirlos desde tu propio sitio
          web.
        </p>
        <p className="text-iron text-xl lg:text-2xl mt-4 ">
          Y para hacerlo aún más fácil, usa nuestra API para agregar o eliminar
          archivos desde tu plataforma.
        </p>
      </Bento>
      <BasicGallery
        className="bg-munsell"
        items={[
          {
            src: "/client.png",
            text: "quam voluptas. Illum dolor dignissimos rerum explicabo facere inventore illo sunt consequuntur exercitationem, libero corrupti sequi voluptas provident rem. Lorem ipsum dolor sit amet consectetur adipisicing elit. Sed cum pariatur ",
            name: "pelusina",
          },
          {
            src: "/client.png",
            text: " consectetur adipisicing elit. Sed cum pariatur quam voluptas. Illum dolor dignissimos rerum explicabo facere Lorem ipsum dolor sit amet inventore illo sunt consequuntur exercitationem,",
            name: "pelusino",
          },
          {
            src: "/client.png",
            text: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Sed cum pariatur quam voluptas. Illum dolor dignissimos rerum explicabo facere inventore illo sunt consequuntur exercitationem, libero corrupti sequi voluptas provident rem.",
            name: "pelusine",
          },
        ]}
      />
      <Assets />
      <Invite />
      <Footer />
    </section>
  );
}

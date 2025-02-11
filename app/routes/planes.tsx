import { Banners, Robot } from "~/components/common/Banner";
import { BasicGallery } from "~/components/galleries/BasicGallery";
import { AuthNav } from "~/components/login/auth-nav";
import { Pricing } from "./plans/Pricing";
import { Benefits } from "./plans/Benefits";
import { Faq } from "./plans/Faq";
import { Footer } from "~/components/common/Footer";

export default function Planes() {
  return (
    <section className="overflow-hidden">
      <AuthNav />
      <Pricing />
      <BasicGallery
        className="bg-brand-grass border-[1px] border-black"
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
      <Benefits />
      <Banners bgClass="bg-munsell" rotation={0}>
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
    </section>
  );
}

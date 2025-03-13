import { GridBackground } from "~/components/common/backgrounds/GridBackground";
import StartComponent from "~/components/start/StartComponent";
import { PerkItem } from "./plans/Pricing";
import { Button } from "~/components/common/Button";
import { BrutalButton } from "~/components/common/BrutalButton";
import { cn } from "~/utils/cn";

export default function Profile() {
  return (
    <article className=" min-h-screen w-full relative box-border inline-block p-10">
      <h2 className="text-4xl font-semibold">Perfil</h2>
      <ProfileCard />
      <SuscriptionCard />
    </article>
  );
}

const SuscriptionCard = () => {
  return (
    <section
      className={cn(
        "border bg-white max-w-2xl border-black rounded-2xl p-4  mt-8 flex flex-col items-start gap-1",
        "md:p-8 md:gap-2 md:px-6 md:pt-6 md:pb-4"
      )}
    >
      <div
        className={cn(
          "flex flex-wrap w-full justify-between mb-4 gap-3 ",
          "md:flex-nowrap md:gap-0"
        )}
      >
        <h3 className={cn("font-semibold text-xl", "md:text-2xl")}>
          Plan Profesional
        </h3>
        <span className={cn("text-xl font-semibold", "md:text-2xl")}>
          $199.00 mxn/mes
        </span>
      </div>
      <PerkItem perk="Hasta 10 assets" />
      <PerkItem perk="Hasta 10 assets" />
      <PerkItem perk="Hasta 10 assets" />
      <PerkItem perk="Hasta 10 assets" />
      <PerkItem perk="Hasta 10 assets" />
      <PerkItem perk="Hasta 10 assets" />
      <hr className={cn("bg-tale h-[1px] border-none my-4 w-full", "my-2")} />
      <div
        className={cn(
          "flex justify-between items-center w-full flex-wrap  gap-3",
          "md:flex-nowrap"
        )}
      >
        <p className="text-marengo">Próxima fecha de pago 18 Agosto 2025</p>
        <Button mode="primary" className="w-full">
          Administrar plan
        </Button>
      </div>
    </section>
  );
};

const ProfileCard = () => {
  return (
    <section className="border flex-wrap md:flex-nowrap bg-white max-w-2xl border-black rounded-2xl p-4 md:p-8 mt-8 flex items-center gap-3 md:gap-6">
      <img
        className="w-12 h-12 md:w-24 md:h-24 rounded-full"
        src="https://images.pexels.com/photos/4839763/pexels-photo-4839763.jpeg?auto=compress&cs=tinysrgb&w=1200"
      />
      <div>
        <h2 className="text-xl md:text-2xl font-semibold">Brenda Lozano</h2>
        <p className="md:text-base text-sm text-marengo font-light">
          blendi_lozano_lonez@gmail.com
        </p>
      </div>
    </section>
  );
};

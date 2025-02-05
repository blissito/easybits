import { BrutalButton } from "~/components/common/BrutalButton";
import { MagicWand } from "~/components/illustrations/MagicWand";

export const Empty = ({ onClick }: { onClick?: () => void }) => {
  return (
    <section className="z-20 relative grid place-content-center place-items-center min-h-[70vh]">
      <div className="mb-10">
        <MagicWand />
      </div>
      <h2 className="text-2xl font-bold mb-4">Agrega tu primer producto</h2>
      <p className="text-lg text-brand-gray text-center mb-10">
        No lo pienses más, no tiene que se perfecto. <br />
        ¡No sabrás si funciona si no lo intentas!
      </p>

      <BrutalButton onClick={onClick} className="bg-brand-500">
        + Agregar
      </BrutalButton>
    </section>
  );
};

import type { ReactNode } from "react";
import { BrutalButton } from "~/components/common/BrutalButton";
import { MagicWand } from "~/components/illustrations/MagicWand";

export const Empty = ({
  onClick,
  illustration,
  title,
  text,
  footer,
}: {
  footer?: ReactNode;
  title?: ReactNode;
  text?: ReactNode;
  illustration?: ReactNode;
  onClick?: () => void;
}) => {
  return (
    <section className="z-10 relative grid max-w-2xl mx-auto place-content-center place-items-center min-h-[60vh] md:min-h-[80vh] ">
      <div className="w-48 mx-auto md:w-52 flex justify-center">
        {illustration ? illustration : <MagicWand />}
      </div>
      <h2 className="text-2xl font-bold mt-4 mb-3">
        {title ? title : "Agrega tu primer producto"}
      </h2>
      <p className="text-lg text-iron text-center mb-10">
        {text ? (
          text
        ) : (
          <>
            {" "}
            No lo pienses más, no tiene que se perfecto. <br />
            ¡No sabrás si funciona si no lo intentas!
          </>
        )}
      </p>

      {footer ? (
        footer
      ) : (
        <BrutalButton onClick={onClick} className="bg-brand-500">
          + Agregar
        </BrutalButton>
      )}
    </section>
  );
};

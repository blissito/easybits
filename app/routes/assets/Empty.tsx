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
    <section className="z-20 relative grid place-content-center place-items-center min-h-[70vh]">
      <div className="mb-10">{illustration ? illustration : <MagicWand />}</div>
      <h2 className="text-2xl font-bold mb-4">
        {title ? title : "Agrega tu primer producto"}
      </h2>
      <p className="text-lg text-brand-gray text-center mb-10">
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

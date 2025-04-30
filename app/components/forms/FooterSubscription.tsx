import { Form } from "react-router";
import { Input } from "../common/Input";
import { BrutalButton } from "../common/BrutalButton";
import type { Asset } from "@prisma/client";

export const FooterSuscription = ({
  isLoading,
  asset,
  onSubmit,
}: {
  onSubmit?: () => void;
  asset: Asset;
  isLoading?: boolean;
}) => {
  const getPriceString = () => `$${asset.price} ${asset.currency}`;
  return (
    <Form
      onSubmit={onSubmit}
      className="md:hidden border-t-[2px] border-x-[2px] border-black fixed bottom-0 bg-black w-full h-16 flex justify-between items-center"
    >
      <p className="text-white font-bold whitespace-pre px-4">
        {getPriceString()}
      </p>
      <input type="hidden" name="assetId" value={asset.id} />
      <Input
        required
        placeholder="Escribe tu email"
        name="email"
        className="min-h-full m-0"
        inputClassName="border-0 border-b-2 rounded-none"
      />
      <BrutalButton
        isLoading={isLoading}
        type="submit"
        containerClassName="rounded-lg"
        className="h-10 min-h-10 max-h-10 rounded-lg min-w-28 text-base  font-medium mx-4"
      >
        {asset.template?.ctaText
          ? asset.template.ctaText
          : (asset.price || 0) <= 0
          ? "Suscribirse gratis"
          : "Comprar"}
      </BrutalButton>
    </Form>
  );
};

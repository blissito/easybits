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
  const { hexColor } = (asset as any)?.user?.storeConfig || {};
  
  return (
    <Form
      onSubmit={onSubmit}
      className="md:hidden border-t-[2px]  border-black fixed bottom-0 bg-black w-full h-16 flex justify-between items-center"
    >
      <p className="text-white font-bold whitespace-pre px-4">
        {getPriceString()}
      </p>
      <input type="hidden" name="assetId" value={asset.id} />
      {(asset.price || 0) <= 0 && (
        <Input
          required
          placeholder="Escribe tu email"
          name="email"
        inputClassName="h-10 "
        />
      )}
      <BrutalButton
        isLoading={isLoading}
        type="submit"
        className="h-10 min-h-10 max-h-10  min-w-28 text-base  font-medium mx-4 border-none "
        style={{ 
          background: hexColor
        }}
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

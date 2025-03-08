import { Form } from "react-router";
import { Button } from "~/components/common/Button";
import { LayoutGroup } from "motion/react";
import { LiveOrFiles } from "./LiveOrFiles";
import { Plantilla } from "./Plantilla";
import { GalleryUploader } from "./GalleryUploader";
import { ExtrasConfig } from "./ExtrasConfig";
import { MarkEditor } from "../../.client/MarkEditor";
import { PriceInput } from "./PriceInput";
import type { Asset } from "@prisma/client";
import { BrutalButton } from "~/components/common/BrutalButton";

export const EditAssetForm = ({
  host,
  asset,
}: {
  asset: Asset;
  host: string;
}) => {
  return (
    <LayoutGroup>
      <Form className="flex-1 w-0 bg-white min-w-[320px]">
        <MarkEditor />
        <GalleryUploader />
        <HR />
        <PriceInput />
        <HR />
        <LiveOrFiles />
        <HR />
        <Plantilla host={host} slug={asset.slug} />
        <HR />
        <ExtrasConfig />
        <HR />
        <Footer />
      </Form>
    </LayoutGroup>
  );
};

const Footer = () => {
  return (
    <nav className="mb-8 flex justify-end gap-4">
      <Button>Cancelar</Button>
      <BrutalButton>Guardar y publicar</BrutalButton>
    </nav>
  );
};

const HR = () => {
  return <hr className="my-10" />;
};

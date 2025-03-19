import { Form, Link, useFetcher } from "react-router";
import { Button } from "~/components/common/Button";
import { LayoutGroup } from "motion/react";
import { LiveOrFiles } from "./LiveOrFiles";
import { Plantilla } from "./Plantilla";
import { GalleryUploader } from "./GalleryUploader";
import { ExtraConfig } from "./ExtraConfig";
import { MarkEditor } from "./MarkEditor";
import { PriceInput } from "./PriceInput";
import type { Asset } from "@prisma/client";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useState, type ChangeEvent, type FormEvent } from "react";
import { z, ZodError } from "zod";
import { Input } from "~/components/common/Input";
import { FilesPicker } from "./FilesPicker";

export const assetSchema = z.object({
  id: z.string().min(3),
  slug: z.string().min(3),
  userId: z.string().min(3),
  title: z.string().min(3),

  note: z.string().optional().nullable(),
  tags: z.string().optional(),
  metadata: z
    .object({
      numberOfSessions: z.coerce.number().optional().nullable(),
    })
    .optional()
    .nullable(),
  eventDate: z.coerce.date().optional().nullable(),
  description: z.string().optional(),
  price: z.coerce.number({
    required_error: "Debes colocar un precio para tu Asset",
  }),
  currency: z.string().default("mxn"),
  gallery: z.array(z.string()).default([]),
  fileIds: z.array(z.string()).default([]),
  template: z
    .object({
      ctaText: z.string().min(3),
      templateName: z.string().default("default"),
      host: z.string().min(3),
      slug: z.string().min(3),
    })
    .optional()
    .nullable(),
  published: z.boolean().default(false),
  publicLink: z.string().optional().nullable(),
  extra: z
    .object({
      stock: z.coerce.number(),
      showSold: z.boolean().default(false),
      showReviews: z.boolean().default(true),
    })
    .optional()
    .nullable(),
});

const assetClientSchema = assetSchema.omit({
  id: true,
  slug: true,
  userId: true,
});

export const EditAssetForm = ({
  host,
  asset,
}: {
  asset: Asset;
  host: string;
}) => {
  const [form, setForm] = useState<Asset>(asset);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setState = (obj: {
    [x: string]:
      | number
      | boolean
      | string
      | Date
      | Record<string, string | number | boolean | Date>;
  }) => {
    setForm((f) => ({ ...f, ...obj }));
  };

  const handleChange = (name: string) => (value: string) =>
    setState({ [name]: value });

  const formatErrors = (error?: ZodError) => {
    if (!error) return setErrors({});
    const errors = error.issues.reduce((acc, issue) => {
      acc[issue.path[0]] = issue.message;
      return acc;
    }, {} as Record<string, string>);
    setErrors(errors);
  };

  const fetcher = useFetcher();
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const { error, success } = assetClientSchema.safeParse(form);
    formatErrors(error);
    if (!success) return;

    // console.log("Data", form);
    // return;

    fetcher.submit(
      {
        data: JSON.stringify({ ...form, slug: asset.slug, id: asset.id }),
        intent: "update_asset",
      },
      {
        method: "POST",
        action: "/api/v1/assets",
      }
    );
  };
  const isLoading = fetcher.state !== "idle";

  const handleEventChange = (eventDate: Date) => {
    setState({ eventDate });
  };

  const handleMetadataChange = ({
    numberOfSessions,
  }: {
    numberOfSessions: number;
  }) => {
    setState({ metadata: { numberOfSessions } });
  };

  return (
    <LayoutGroup>
      <Form
        onSubmit={handleSubmit}
        className="flex-1 w-0 bg-white min-w-[320px]"
      >
        <h2 className="text-2xl my-4">Detalles de tu Asset</h2>
        <Input
          defaultValue={asset.title}
          onChange={(ev) => handleChange("title")(ev.currentTarget.value)}
          label="Título"
          name="title"
        />

        <Input
          onChange={(ev) => handleChange("tags")(ev.currentTarget.value)}
          label="Tags"
          placeholder="curso, programación"
        />
        <MarkEditor
          defaultValue={asset.description}
          onChange={handleChange("description")}
          name="description"
        />
        <GalleryUploader asset={asset} host={host} />
        <HR />
        <PriceInput
          defaultPrice={asset.price}
          defaultCurrency={asset.currency}
          error={errors.price}
          onInputChange={handleChange("price")}
          onCurrencyChange={handleChange("currency")}
        />
        <Input
          onChange={(ev) => handleChange("note")(ev.currentTarget.value)}
          label="Nota sobre el producto"
          placeholder="Ej.: En la compra de este curso te enviaremos también tu playera oficial"
        />
        <HR />

        {(asset.type === "VOD_COURSE" || asset.type === "WEBINAR") && (
          <LiveOrFiles
            onChangeEventDate={handleEventChange}
            defaultEventDate={asset.eventDate}
            type={asset.type}
            asset={asset}
            onChangeMetadata={handleMetadataChange}
          />
        )}

        {asset.type === "DOWNLOADABLE" && <FilesPicker />}

        <HR />
        <Plantilla
          onChange={handleChange("template")}
          host={host}
          slug={asset.slug}
          template={asset.template}
          error={errors.template}
        />
        <HR />
        <ExtraConfig onChange={handleChange("extra")} extra={asset.extra} />
        <HR />
        <Footer isLoading={isLoading} />
      </Form>
    </LayoutGroup>
  );
};

const Footer = ({ isLoading }: { isLoading?: boolean }) => {
  return (
    <nav className="mb-8 flex justify-end gap-4">
      <Link to="/dash/assets">
        <Button isDisabled={isLoading}>Cancelar</Button>
      </Link>
      <BrutalButton isLoading={isLoading} type="submit">
        Guardar y publicar
      </BrutalButton>
    </nav>
  );
};

const HR = () => {
  return <hr className="my-10" />;
};

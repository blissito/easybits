import { Form, Link, useFetcher } from "react-router";
import { LayoutGroup } from "motion/react";
import { LiveOrFiles } from "./LiveOrFiles";
import { Plantilla } from "./Plantilla";
import { GalleryUploader } from "./GalleryUploader";
import { ExtraConfig } from "./ExtraConfig";
import { PriceInput } from "./PriceInput";
import type { Asset, File } from "@prisma/client";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Suspense, useRef, useState, type FormEvent } from "react";
import { z, ZodError } from "zod";
import { Input } from "~/components/common/Input";
import { FilesPicker } from "./FilesPicker";
import { useImageResize } from "~/hooks/useImageResize";
import { useControlSave } from "~/hooks/useControlSave";
import toast from "react-hot-toast";
import { EbookFields } from "./EbookFields";
import { useUploader } from "~/hooks/useUploader";
import { MarkEditor } from "./MarkEditor.client";
import Spinner from "~/components/common/Spinner";

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
  description: z.string().optional().nullable(),
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
      stock: z.coerce.number().default(0),
      showSold: z.boolean().default(false).nullable(),
      showReviews: z.boolean().default(true).nullable(),
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
  assetFiles,
  // files = [],
  onUpdate,
}: {
  onUpdate?: (arg0: Partial<Asset>) => void;
  assetFiles?: File[];
  asset: Asset;
  host: string;
}) => {
  const [srcset, setSrcset] = useState<string[]>([]);
  const filesRef = useRef<any[]>([]);
  const [forceSpinner, setForceSpinner] = useState(false);
  const [form, setForm] = useState<Asset>(asset);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // resize
  const { resize } = useImageResize({
    async callback(blob) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "metaImage.webp";
      a.click();
    },
  });

  const setState = (obj: {
    [x: string]:
      | number
      | boolean
      | string
      | Date
      | Record<string, string | number | boolean | Date>;
  }) => {
    const update = { ...form, ...obj };
    setForm(update);
    onUpdate?.(update);
  };

  const handleChange = (name: string) => (value: string) =>
    setState({ [name]: value });

  const handleMetadata = (name: string) => (value: string) => {
    const update = {
      [name]: value,
    };
    setState({ ...form, metadata: { ...form.metadata, ...update } });
  };

  const formatErrors = (error?: ZodError) => {
    if (!error) return setErrors({});
    const errors = error.issues.reduce((acc, issue) => {
      acc[issue.path[0]] = issue.message;
      return acc;
    }, {} as Record<string, string>);
    setErrors(errors);
  };

  // Main SUBMIT :: :: :: : :: :: : : : ::: : : : : :: :: :::: : :: : :: :: :: : :::
  const fetcher = useFetcher();
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setForceSpinner(true);

    const { error, success } = assetClientSchema.safeParse(form);
    formatErrors(error);

    if (!success) {
      console.error(error);
      return;
    }
    // gallery update
    const uploaded = await getUploadedLinks();
    console.log("Are three? ", uploaded);
    let gallery = [...form.gallery, ...uploaded];
    const removedLinks = (await removeFromList()) || [];
    console.log("REMOVED?", removedLinks);
    gallery = [...gallery.filter((la) => !removedLinks.includes(la))];
    // gallery update

    setForceSpinner(false);

    console.info("WTF", gallery);

    // return;

    await fetcher.submit(
      {
        data: JSON.stringify({
          ...form,
          gallery,
          slug: asset.slug,
          id: asset.id,
        }),
        intent: "update_asset",
      },
      {
        method: "POST",
        action: "/api/v1/assets",
      }
    );
    setForceSpinner(false);
    toast.success("Tu Asset se ha guardado");
  };

  // Main SUBMIT :: :: :: : :: :: : : : ::: : : : : :: :: :::: : :: : :: :: ::

  const isLoading = forceSpinner || fetcher.state !== "idle";

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

  useControlSave(() => handleSubmit({ preventDefault: () => {} }));

  const removeFile = (index: number) => {
    const list = [...filesRef.current];
    console.log("LIST:", list);
    list.splice(index, 1);
    filesRef.current = list;
    console.log("ora?", index, filesRef.current);
    updateSrcset();
  };
  const { upload } = useUploader({
    assetId: asset.id,
    defaultLinks: asset.gallery,
  });
  const uploadGallery = async (): Promise<(string | null)[]> => {
    // console.log("ABOUT_TO_UPLOAD::", filesRef.current);
    // return;
    const promises = filesRef.current.map((file) => upload(file, asset.id));
    return Promise.all(promises);
  };
  const getUploadedLinks = async () => {
    const uploaded = await uploadGallery();
    if (!uploaded || uploaded.length < 1) return [];

    filesRef.current = []; // clear files after upload
    return uploaded.filter((f) => f !== null);
  };

  const handleAddFiles = (newFiles: any[]) => {
    filesRef.current = [...filesRef.current, ...newFiles];
    updateSrcset();
  };

  const updateSrcset = () => {
    const links = filesRef.current.map((file) => URL.createObjectURL(file));
    setSrcset(links);
  };

  // links
  const [gallery, setGallery] = useState(asset.gallery);
  const removeListRef = useRef<any[]>([]);
  const handleAddLinkToRemove = (link: string) => {
    setGallery((l) => [...l.filter((li) => li !== link)]); // removed from preview
    removeListRef.current = [...removeListRef.current, link]; // added to remove list
  };

  const { onRemove: removeFromS3 } = useUploader();
  const removeFromList = async () => {
    for await (let link of removeListRef.current) {
      removeFromS3(link, asset.id);
    }
    return removeListRef.current;
  };

  // console.log("::ASSET::GALLERY::", asset.gallery);

  return (
    <article className="w-full px-4">
      <LayoutGroup>
        <Form onSubmit={handleSubmit} className="bg-white w-full">
          <h2 className="text-2xl mt-6 mb-4 font-bold">Detalles de tu Asset</h2>
          <Input
            defaultValue={asset.title}
            onChange={(ev) => handleChange("title")(ev.currentTarget.value)}
            label="Título"
            name="title"
            className="mb-6"
          />

          <Input
            defaultValue={asset.tags}
            onChange={(ev) => handleChange("tags")(ev.currentTarget.value)}
            label="Tags"
            placeholder="curso, programación"
            className="mb-3"
          />
          <Suspense fallback={<Spinner />}>
            <MarkEditor
              defaultValue={asset.description}
              onChange={handleChange("description")}
              error={errors.description}
            />
          </Suspense>
          <GalleryUploader
            limit={3}
            asset={asset}
            gallery={gallery}
            host={host}
            onAddFiles={handleAddFiles}
            onRemoveLink={handleAddLinkToRemove}
            onRemoveFile={removeFile}
            srcset={srcset}
          />
          <HR />
          <PriceInput
            defaultPrice={asset.price}
            defaultCurrency={asset.currency}
            error={errors.price}
            onInputChange={handleChange("price")}
            onCurrencyChange={handleChange("currency")}
          />
          <Input
            defaultValue={asset.note}
            onChange={(ev) => handleChange("note")(ev.currentTarget.value)}
            label="Nota sobre el producto"
            placeholder="Ej.: En la compra de este curso te enviaremos también tu playera oficial"
          />
          <HR />

          {(asset.type === "EMAIL_COURSE" ||
            asset.type === "VOD_COURSE" || // @todo get buttons outside of here
            asset.type === "WEBINAR") && (
            <LiveOrFiles
              onTypeChange={(type) => {
                setState({ type });
              }}
              files={filesRef.current}
              onChangeEventDate={handleEventChange}
              defaultEventDate={asset.eventDate}
              type={asset.type}
              asset={asset}
              onChangeMetadata={handleMetadataChange}
              vode_course={
                <FilesPicker assetFiles={assetFiles} asset={asset} />
              }
            />
          )}

          {asset.type === "DOWNLOADABLE" && (
            <>
              <FilesPicker assetFiles={assetFiles} asset={asset} />
            </>
          )}

          {asset.type === "EBOOK" && (
            <>
              <EbookFields
                files={filesRef.current}
                asset={asset}
                onChange={handleMetadata}
              />
            </>
          )}

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
    </article>
  );
};

const Footer = ({ isLoading }: { isLoading?: boolean }) => {
  return (
    <nav className="py-4 md:py-6 flex justify-end gap-4 sticky bottom-0 pr-16 md:pr-0 bg-white">
      <Link prefetch="intent" to="/dash/assets">
        <BrutalButton mode="ghost" isDisabled={isLoading}>
          Cancelar
        </BrutalButton>
      </Link>
      <BrutalButton isLoading={isLoading} type="submit">
        Guardar
      </BrutalButton>
    </nav>
  );
};

const HR = () => {
  return <hr className="my-8" />;
};

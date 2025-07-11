import { Form, Link, useFetcher } from "react-router";
import { LayoutGroup } from "motion/react";
import { LiveOrFiles } from "./LiveOrFiles";
import { Plantilla } from "./Plantilla";
import { GalleryUploader } from "./GalleryUploader";
import { ExtraConfig } from "./ExtraConfig";
import { PriceInput } from "./PriceInput";
import type { Asset, File as PrismaFile } from "@prisma/client";
import { BrutalButton } from "~/components/common/BrutalButton";
import {
  createContext,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { z, ZodError } from "zod";
import { Input } from "~/components/common/Input";
import { FilesPicker } from "./FilesPicker";
import { useImageResize } from "~/hooks/useImageResize";
import { useControlSave } from "~/hooks/useControlSave";
import { EbookFields } from "./EbookFields";
import { useUploader } from "~/hooks/useUploader";
import { MarkEditor } from "./MarkEditor.client";
import Spinner from "~/components/common/Spinner";
import { useBrutalToast } from "~/hooks/useBrutalToast";
import { useVideoCover, VideoCover } from "./VideoCover";

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

export const EbookContext = createContext({});

export const EditAssetForm = ({
  host,
  asset,
  assetFiles,
  stripeAccountId,
  onUpdate,
}: {
  stripeAccountId?: string;
  onUpdate?: (arg0: Partial<Asset>) => void;
  assetFiles?: PrismaFile[];
  asset: Asset;
  host: string;
}) => {
  const [gallery, setGallery] = useState(asset.gallery);
  const galleryRef = useRef<(string | null)[]>(asset.gallery);
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

  const descriptionRef = useRef("");
  const handleChange = (name: string) => (value: any) => {
    if (name === "description") {
      descriptionRef.current = value;
    }
    setState({ [name]: value });
  };

  const formatErrors = (error?: ZodError) => {
    if (!error) return setErrors({});
    const errors = error.issues.reduce((acc, issue) => {
      acc[issue.path[0]] = issue.message;
      return acc;
    }, {} as Record<string, string>);
    setErrors(errors);
  };

  const removeFilePreviews = () => {
    removeListRef.current = []; // removed
    filesRef.current = []; // clear files after upload
    updateSrcset();
  };

  const { upload } = useUploader({
    assetId: asset.id,
    defaultLinks: asset.gallery,
  });

  // Main SUBMIT :: :: :: : :: :: : : : ::: : : : : :: :: :::: : :: : :: :: :: : :::
  const brutalToast = useBrutalToast();
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
    const removedList = await removeBucketObjects();
    const uploaded = await getUploadedLinks();
    const updatedGallery = [...galleryRef.current, ...uploaded].filter(
      (link) => !removedList.includes(link)
    ) as string[];
    //

    // @todo upload ebook files
    const promises = Object.values(ebookFiles).map((file) =>
      upload(file, asset.id, {
        isPrivate: true,
        storageKey: `${asset.id}/ebooks/${file.name}`,
      })
    );
    // DEV
    await onSave(asset.id); // Video cover
    return; // REMOVE! JUST DEV
    await fetcher.submit(
      {
        data: JSON.stringify({
          ...form,
          description: descriptionRef.current, // ensure description is always updated
          gallery: updatedGallery,
          id: asset.id,
          slug: asset.slug,
          s3ObjectsToDelete,
        }),
        intent: "update_asset",
        // @todo very custom revisit
      },
      {
        method: "POST",
        action: "/api/v1/assets",
      }
    );
    setForceSpinner(false);
    brutalToast("Tu Asset se ha guardado");
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

  useControlSave(() => {
    handleSubmit({ preventDefault: () => {} });
  });

  const removeFile = (index: number) => {
    const list = [...filesRef.current];

    list.splice(index, 1);
    filesRef.current = list;

    updateSrcset();
  };

  const uploadGallery = async (): Promise<(string | null)[]> => {
    // console.log("ABOUT_TO_UPLOAD::", filesRef.current);
    // return;
    const promises = filesRef.current.map((file) => upload(file, asset.id));
    return Promise.all(promises);
  };
  const getUploadedLinks = async () => {
    const uploaded = await uploadGallery();

    if (!uploaded || uploaded.length < 1) return [];

    return uploaded;
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

  const removeListRef = useRef<any[]>([]);
  const handleAddLinkToRemove = (link: string) => {
    setGallery((l) => [...l.filter((li) => li !== link)]); // removed from preview
    removeListRef.current.push(link); // added to remove list
  };

  const { onRemove: removeFromS3 } = useUploader();
  const removeBucketObjects = async () => {
    const promises = removeListRef.current.map((link) =>
      removeFromS3(link, asset.id)
    );
    await Promise.all(promises);
    return [...removeListRef.current];
  };

  // when save finishes
  useEffect(() => {
    galleryRef.current = asset.gallery;
    removeFilePreviews();
    setGallery(asset.gallery);
  }, [asset]);

  // Ebook files ========================================================== Ebook Files
  const [ebookFiles, setEbookFiles] = useState<Record<string, File>>({});
  const [s3ObjectsToDelete, setS3ObjectsToDelete] = useState<string[]>([]);
  const { Provider: EbookProvider } = EbookContext;
  const addEbookFile = (file: any) => {
    setEbookFiles((fs) => ({ ...fs, [file.type]: file }));
  };
  const removeEbookFile = (key: string) => {
    const fs = { ...ebookFiles };
    delete fs[key];
    setEbookFiles(fs);
  };
  const handleEbookChange = (file: any) => {
    addEbookFile(file);
  };
  const enqueueDelete = (storageKey: string) => {
    setS3ObjectsToDelete((l) => [...l, storageKey]);
  };
  // const handleDelete = () => {
  //   removeFile(0);
  //   fetcher.submit(
  //     {
  //       intent: "delete_file",
  //       storageKey: localFile?.storageKey,
  //     },
  //     {
  //       method: "post",
  //       action: "/api/v1/files",
  //     }
  //   );
  // };
  // ========================================================== Ebook Files

  //============================================== Gallery Supporting Video
const galleryComponent = (
<GalleryUploader
  limit={12}
  asset={asset}
  gallery={gallery}
  host={host}
  onAddFiles={handleAddFiles}
  onRemoveLink={handleAddLinkToRemove}
  onRemoveFile={removeFile}
  srcset={srcset}
/>)
  // =========================

  return (
    <article className="w-full px-4 col-span-12 md:col-span-8">
      <LayoutGroup>
        <Form onSubmit={handleSubmit} className="bg-white w-full mt-6">
          <Input
            defaultValue={asset.title}
            onChange={(ev) => handleChange("title")(ev.currentTarget.value)}
            label="Título"
            name="title"
            className="mb-5"
          />

          <Input
            defaultValue={asset.tags}
            onChange={(ev) => handleChange("tags")(ev.currentTarget.value)}
            label="Tags"
            placeholder="curso, inglés, profesional,"
            className="mb-3"
          />
          <Suspense fallback={<Spinner />}>
            <MarkEditor
              assetTitle={asset.title}
              defaultValue={asset.description}
              onChange={handleChange("description")}
              error={errors.description}
            />
          </Suspense>
         {galleryComponent}
          <HR />
          {/* <VideoCover
            assetFiles={assetFiles}
            src={previewSrc}
            ref={videoFileInputRef}
          /> */}
          <PriceInput
            stripeAccountId={stripeAccountId}
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
            <EbookProvider
              value={{
                ebookFiles,
                handleEbookChange,
                addEbookFile,
                removeEbookFile,
                enqueueDelete,
                s3ObjectsToDelete,
              }}
            >
              <EbookFields assetFiles={assetFiles} asset={asset} />
            </EbookProvider>
          )}

          <HR />
          <Plantilla
            onChange={handleChange("template")}
            host={host}
            slug={asset.slug}
            template={asset.template as any}
            error={errors.template}
          />
          <HR />
          <ExtraConfig onChange={handleChange("extra")} extra={asset.extra} />
          <br />
          <nav className="py-4 md:py-6 flex flex-wrap justify-between items-center gap-4 sticky bottom-0 pr-16 md:pr-0 bg-white border-t-2 border-t-black">
            <div className="flex gap-2 items-center flex-wrap lg:flex-nowrap">
              <p>Estatus:</p>
              <div
                id="status"
                className="flex border border-black rounded-lg gap-0 relative overflow-hidden"
              >
                <span
                  className={`text-sm lg:text-base rounded-l-none p-1 px-1 lg:px-3 cursor-pointer transition-all duration-300 ease-in-out transform ${
                    form.published
                      ? "bg-black text-white shadow-md "
                      : "bg-white text-black hover:bg-gray-50 "
                  }`}
                  onClick={() => setState({ published: true })}
                >
                  Publicado
                </span>
                <span
                  className={`text-sm lg:text-base  rounded-r-none p-1 px-1 lg:px-3 cursor-pointer transition-all duration-300 ease-in-out transform ${
                    !form.published
                      ? "bg-black text-white shadow-md"
                      : "bg-white text-black hover:bg-gray-50 "
                  }`}
                  onClick={() => setState({ published: false })}
                >
                  Sin publicar
                </span>
                {/* Animated background indicator */}
                <div
                  className={`absolute top-0 h-full bg-black transition-all duration-300 ease-in-out rounded-md ${
                    form.published ? "left-0 w-1/2" : "left-1/2 w-1/2"
                  }`}
                  style={{ zIndex: -1 }}
                />
              </div>
            </div>
            <div className="flex gap-6">
              <Link prefetch="intent" to="/dash/assets">
                <BrutalButton mode="ghost" isDisabled={isLoading}>
                  Cancelar
                </BrutalButton>
              </Link>
              <BrutalButton isLoading={isLoading} type="submit">
                Guardar
              </BrutalButton>
            </div>
          </nav>
        </Form>
      </LayoutGroup>
    </article>
  );
};

const HR = () => {
  return <hr className="my-8" />;
};

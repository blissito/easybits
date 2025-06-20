import { HeaderIconButton } from "../common/HeaderIconButton";
import GlobeIcon from "/icons/globe.svg";
import EditIcon from "/icons/edit.svg";
import OpenIcon from "/icons/open.svg";
import SeoIcon from "/icons/seo.svg";
import ShareIcon from "/icons/share.svg";
import { Link } from "react-router";
import { useState, type ReactNode, useRef, type ChangeEvent, useEffect } from "react";
import { cn } from "~/utils/cn";
import type { Asset, User } from "@prisma/client";
import { Sharing } from "~/routes/assets/AssetPreview";
import { Modal } from "../common/Modal";
import { Input } from "../common/Input";
import StoreConfigForm from "./StoreConfigForm";
import { StoreTemplate } from "~/routes/store/storeTemplate";
import { useOpenLink } from "~/hooks/useOpenLink";
import { ImageIcon } from "~/components/icons/image";
import { IoClose } from "react-icons/io5";
import { BrutalButton } from "../common/BrutalButton";
import { useFetcher } from "react-router";
import React from "react";

const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export default function StoreComponent({
  assets = [],
  cta,
  user: rootUser,
  isPublic,
  variant,
}: {
  isPublic?: boolean;
  user?: User; // this component is used in SEO public views (no user present)
  assets: Asset[];
  cta?: ReactNode;
  variant: string;
}) {
  const [currentFilter, setCurrentFilter] = useState();
  const assetId = assets?.[0]?.id;
  const user = rootUser || assets?.[0]?.user || {};
  const [isOpen, setIsOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isSeoOpen, setIsSeoOpen] = useState(false);
  
  const handleModal = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSeoOpen = () => {
    setIsSeoOpen(true);
  };

  const handleSeoClose = () => {
    setIsSeoOpen(false);
  };

  // @todo if domain? This always work, with domains it could be malconfig
  const { handleOpenLink } = useOpenLink({
    localLink: `http://${user.host}.localhost:3000/tienda`,
    publicLink: `https://${user.host}.easybits.cloud/tienda`,
  });

  return (
    <>
      <div
        className={cn(
          " min-h-screen w-full relative box-border inline-block max-w-7xl mx-auto px-4 md:pl-28 md:pr-8 2xl:px-0 ",
          LAYOUT_PADDING
        )}
      >
        <div className="flex justify-between h-12 mb-8  w-full">
          <h2 className="text-3xl lg:text-4xl font-semibold my-auto">
            Mi tienda
          </h2>
          <div className="flex gap-3">
      
            <HeaderIconButton>
              {cta ? (
                cta
              ) : (
                <div className="bg-white border-[2px] border-black rounded-xl p-1 w-[48px] h-[48px]">
                  <img className="w-full" src={GlobeIcon} />
                </div>
              )}
            </HeaderIconButton>
            <HeaderIconButton>
              <div
                className="bg-white border-[2px] border-black grid place-content-center rounded-xl p-1 w-[48px] h-[48px] cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={handleSeoOpen}
              >
                <img className="w-full" src={SeoIcon} />
              </div>
            </HeaderIconButton>
            <HeaderIconButton>
              <div
                className="bg-white border-[2px] border-black rounded-xl p-1 w-[48px] h-[48px]"
                onClick={() => setIsConfigOpen(true)}
              >
                <img className="w-full" src={EditIcon} />
              </div>
            </HeaderIconButton>
            <HeaderIconButton>
              <div
                onClick={handleModal}
                className="bg-white border-[2px] border-black rounded-xl p-1 w-[48px] h-[48px]"
              >
                <img className="w-full" src={ShareIcon} />
              </div>
            </HeaderIconButton>
            <button onClick={handleOpenLink}>
              <HeaderIconButton>
                <div className="bg-white border-[2px] border-black rounded-xl p-1 w-[48px] h-[48px]">
                  <img className="w-full" src={OpenIcon} />
                </div>
              </HeaderIconButton>
            </button>
          </div>
        </div>
        <StoreTemplate user={user} assets={assets} variant="slim" />
      </div>
      <ShareStoreLink
        onClose={handleClose}
        isOpen={isOpen}
        link={`https://${user.host}.easybits.cloud/tienda`}
      />
      <StoreConfigForm
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        storeConfig={user?.storeConfig}
        assetId={assetId}
      />
      <SeoDrawer
        isOpen={isSeoOpen}
        onClose={handleSeoClose}
        user={user}
      />
    </>
  );
}

const ShareStoreLink = ({
  isOpen,
  onClose,
  link,
}: {
  isOpen: boolean;
  onClose?: () => void;
  link: string;
}) => {
  return (
    <>
      <Modal
        key="selector"
        containerClassName="z-50 text-black text-center "
        isOpen={isOpen}
        className="min-h-fit"
        title={"¡Comparte tu website!"}
        onClose={onClose}
      >
        <div className="mt-4 text-iron">
          <p className="mb-8">
            Es hora de que tus seguidores se enteren de que tus productos ya
            están disponibles. Comparte ya en tus redes sociales.
          </p>
          <Input disabled defaultValue={link} className="disabled:opacity-75" />
          <Sharing link={link} />
        </div>
      </Modal>
    </>
  );
};
const SeoDrawer = ({
  isOpen,
  onClose,
  user,
}: {
  isOpen: boolean;
  onClose?: () => void;
  user: any;
}) => {
  const fetcher = useFetcher();
  const formRef = useRef<HTMLFormElement>(null);
  const [descriptionLength, setDescriptionLength] = useState(0);
  const wasSubmitted = useRef(false);

  const handleDescriptionChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= 155) {
      setDescriptionLength(value.length);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    wasSubmitted.current = true;
    const formData = new FormData(formRef.current!);
    formData.append("intent", "update_seo_metadata");


    fetcher.submit(formData, {
      method: "post",
      action: "/api/v1/store-config"
    });
  };

  const isLoading = fetcher.state === "submitting";

  // Close modal when update is successful
  useEffect(() => {
    if (wasSubmitted.current && fetcher.state === "idle" && fetcher.data?.success) {
      wasSubmitted.current = false;
      onClose?.();
    }
  }, [fetcher.state, fetcher.data, onClose]);

  return (
    <Modal
      mode="drawer"
      key="seo-drawer"
      containerClassName="z-50 text-black"
      isOpen={isOpen}
      className="w-full max-w-md h-full overflow-y-auto"
      title="Configura el SEO de tu tienda"
      onClose={onClose}
    >
      <fetcher.Form ref={formRef} onSubmit={handleSubmit} className="flex flex-col justify-between h-full min-h-[700px]">
        <div className="flex flex-col gap-8 mb-8">
          <Input 
            name="metaTitle"
            label="Escribe el título para tu tienda"
            placeholder="Weteros: las mejores ilustraciones de la web"
            defaultValue={user?.storeConfig?.metadata?.metaTitle || user?.host || ""}
          />
          <div className="space-y-0 relative">
            <Input 
              name="metaDescription"
              type="textarea"
              label="Agrega una descripción (máximo 155 caracteres)"
              placeholder="Descripción que aparecerá en Google y todas las redes sociales"
              className="h-fit"
              inputClassName="h-32"
              defaultValue={user?.storeConfig?.metadata?.metaDescription || ""}
              onChange={handleDescriptionChange}
              maxLength={155}
            />
            <div className="text-sm text-gray-500 text-right absolute bottom-3 right-2">
              {descriptionLength}/155 caracteres
            </div>
          </div>
          <Input 
            name="keywords"
            label="Incluye algunas palabras clave separadas por comas"
            placeholder="libros, arte, historia"
            defaultValue={Array.isArray(user?.storeConfig?.metadata?.keywords) 
              ? user?.storeConfig?.metadata?.keywords?.join(', ') 
              : user?.storeConfig?.metadata?.keywords || ""}
          />
          
    
        </div>
        <div className="mt-auto">
          <BrutalButton 
            type="submit"
            className="w-full" 
            containerClassName="w-full"
            isLoading={isLoading}
          >
            {isLoading ? "Guardando..." : "Actualizar"}
          </BrutalButton>
        </div>
      </fetcher.Form>
    </Modal>
  );
};

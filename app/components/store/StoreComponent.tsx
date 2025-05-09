import { HeaderIconButton } from "../common/HeaderIconButton";
import GlobeIcon from "/icons/globe.svg";
import EditIcon from "/icons/edit.svg";
import OpenIcon from "/icons/open.svg";
import ShareIcon from "/icons/share.svg";

import {
  FaFacebookF,
  FaInstagram,
  FaLinkedin,
  FaTiktok,
  FaYoutube,
  FaXTwitter,
  FaLink,
} from "react-icons/fa6";
import { Link } from "react-router";
import { AssetList } from "~/routes/assets/AssetList";
import { useState, type ReactNode } from "react";
import { cn } from "~/utils/cn";
import type { Asset, User } from "@prisma/client";
import { DEFAULT_PIC } from "~/routes/profile/profileComponents";
import { Sharing, SocialMedia } from "~/routes/assets/AssetPreview";
import { Modal } from "../common/Modal";
import { Input } from "../common/Input";
import { AssetCard } from "~/routes/assets/AssetCard";
import StoreConfigForm from "./StoreConfigForm";

const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export default function StoreComponent({
  assets = [],
  cta,
  user: rootUser,
  isPublic,
}: {
  isPublic?: boolean;
  user?: User; // this component is used in SEO public views (no user present)
  assets: Asset[];
  cta?: ReactNode;
}) {
  const [currentFilter, setCurrentFilter] = useState();
  const user = rootUser || assets?.[0]?.user || {};
  const [isOpen, setIsOpen] = useState(false);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const {
    instagram,
    facebook,
    x,
    youtube,
    website,
    linkedin,
    tiktok,
    hexColor,
    colorMode,
    logoImage,
    portadaImage,
    showProducts,
    socialNetworks,
  } = user?.storeConfig || {};

  const handleModal = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };
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
            <Link to={`https://${user.host}.easybits.cloud/tienda`}>
              <HeaderIconButton>
                <div className="bg-white border-[2px] border-black rounded-xl p-1 w-[48px] h-[48px]">
                  <img className="w-full" src={OpenIcon} />
                </div>
              </HeaderIconButton>
            </Link>
          </div>
        </div>
        <div className="overflow-hidden">
          <div
            className="w-full h-[200px] relative bg-brand-500"
            style={{ backgroundColor: hexColor }}
          >
            {portadaImage && (
              <img className="object-cover w-full h-full" src={portadaImage} />
            )}

            <div className="absolute w-[150px] h-[150px] inset-0 bg-black rounded-full scale-100 translate-x-2 opacity-100 top-[calc(100%-75px)] left-[calc(50%-75px)]" />
            <div className="absolute z-10 rounded-full w-[150px] h-[150px] overflow-hidden top-[calc(100%-75px)] left-[calc(50%-75px)]">
              <img
                onError={(e) => {
                  e.currentTarget.onerror = null;
                  e.currentTarget.src = DEFAULT_PIC;
                }}
                className="object-cover w-full h-full"
                src={user.picture || logoImage || DEFAULT_PIC}
              />
            </div>
          </div>
          <div className="mt-20 flex justify-center mb-6">
            <div>
              <p className="font-semibold text-center mb-3">
                {user.displayName}
              </p>
              {socialNetworks && (
                <div className="flex justify-center gap-3">
                  {/* check if RRSS and display them */}
                  {instagram && (
                    <Link to={instagram}>
                      <FaInstagram />
                    </Link>
                  )}
                  {facebook && (
                    <Link to={facebook}>
                      <FaFacebookF />
                    </Link>
                  )}
                  {x && (
                    <Link to={x}>
                      <FaXTwitter />
                    </Link>
                  )}
                  {youtube && (
                    <Link to={youtube}>
                      <FaYoutube />
                    </Link>
                  )}
                  {tiktok && (
                    <Link to={tiktok}>
                      <FaTiktok />
                    </Link>
                  )}
                  {linkedin && (
                    <Link to={linkedin}>
                      <FaLinkedin />
                    </Link>
                  )}
                  {website && (
                    <Link to={website}>
                      <FaLink />
                    </Link>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-center gap-3 mb-6">
            {/* review which categories to show and display cause notr everyone publishes from all categories */}
            {["Todos", "Nuevos", "Assets", "Libros"].map((f, i) => (
              <button
                key={i}
                className={cn(
                  "rounded-full p-3 border border-black cursor-pointer",
                  {
                    "bg-black text-white": f === currentFilter,
                  }
                )}
                onClick={() => setCurrentFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          {showProducts && (
            <div className="p-4">
              <AssetList isPublic={isPublic} assets={assets}>
                {assets.map((asset) => (
                  <AssetCard key={asset.id} asset={asset} />
                ))}
              </AssetList>
            </div>
          )}
        </div>
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

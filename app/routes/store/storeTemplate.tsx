import type { Asset, User } from "@prisma/client";
import { useState, type ReactNode } from "react";
import { AssetList } from "../assets/AssetList";
import { AssetCard } from "../assets/AssetCard";
import { Link } from "react-router";
import { DEFAULT_PIC } from "~/routes/profile/profileComponents";

import {
  FaFacebookF,
  FaInstagram,
  FaLink,
  FaLinkedin,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import { cn } from "~/utils/cn";

export const StoreTemplate = ({
  assets = [],
  cta,
  user: rootUser,
  isPublic,
}: {
  isPublic?: boolean;
  user?: User; // this component is used in SEO public views (no user present)
  assets: Asset[];
  cta?: ReactNode;
}) => {
  const [currentFilter, setCurrentFilter] = useState();
  const user = rootUser || assets?.[0]?.user || {};
  const {
    instagram,
    facebook,
    x,
    youtube,
    website,
    linkedin,
    tiktok,
    hexColor,
    typography,
    logoImage,
    portadaImage,
    showProducts,
    socialNetworks,
  } = user?.storeConfig || {};
  return (
    <section className="h-full">
      <div className="overflow-hidden mb-20 ">
        <div
          className="w-full h-[224px] border-2 border-black relative bg-brand-500"
          style={{ backgroundColor: hexColor, fontFamily: typography }}
        >
          {portadaImage && (
            <img className="object-cover w-full h-full" src={portadaImage} />
          )}
        </div>
        <div className="w-44 h-44 bg-black rounded-full mx-auto -mt-20 z-10 relative">
          <img
            onError={(e) => {
              e.currentTarget.onerror = null;
              e.currentTarget.src = DEFAULT_PIC;
            }}
            className="object-cover rounded-full w-full h-full -translate-y-1 -translate-x-1 bg-white border-2 border-black"
            src={user.picture || logoImage || DEFAULT_PIC}
          />
        </div>
        <div className="mt-4 text-2xl flex justify-center mb-6">
          <div>
            <p className="font-semibold text-center mb-3">{user.displayName}</p>
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
        <div className="flex justify-center gap-3 mb-10">
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
          <div className=" max-w-7xl mx-auto">
            <AssetList isPublic={isPublic} assets={assets}>
              {assets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} />
              ))}
            </AssetList>
          </div>
        )}
      </div>
      <StoreTemplateFooter />
    </section>
  );
};

const StoreTemplateFooter = () => {
  return (
    <div className="border-t-2 h-10 border-black flex gap-1 justify-center items-center  w-full bg-white fixed bottom-0">
      <div className="flex gap-1 items-center">
        <img className="w-6" src="/logo-purple.svg" />
        <span className="text-xs">by</span>
        <span className="font-jersey text-xl">EasyBits</span>
      </div>
    </div>
  );
};

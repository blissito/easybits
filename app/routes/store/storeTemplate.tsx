import type { Asset, User } from "@prisma/client";
import { useState } from "react";
import { AssetList } from "../assets/AssetList";
import { AssetCard } from "../assets/AssetCard";
import { Link } from "react-router";
import { DEFAULT_PIC } from "~/routes/profile/profileComponents";
import {
  FaFacebookF,
  FaLink,
  FaLinkedin,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import { cn } from "~/utils/cn";
import { AiFillInstagram } from "react-icons/ai";
import { useOpenLink } from "~/hooks/useOpenLink";
import { IoOpenOutline } from "react-icons/io5";

export const StoreTemplate = ({
  assets = [],
  user: rootUser,
  isPublic,
  variant = "full",
}: {
  isPublic?: boolean;
  user?: User; // this component is used in SEO public views (no user present)
  assets: Asset[];
  variant?: string;
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
    <section className="h-full" style={{ fontFamily: typography }}>
      <div
        className={cn("overflow-hidden mb-32 ", {
          "mb-0 overflow-visible": variant === "slim",
        })}
      >
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
            <p
              style={{ fontFamily: typography }}
              className="font-semibold text-center mb-3"
            >
              {user.displayName}
            </p>
            {socialNetworks && (
              <div className="flex justify-center gap-3 text-lg">
                {/* check if RRSS and display them */}
                {instagram && (
                  <a href={instagram} target="_blank" rel="noopener">
                    <AiFillInstagram />
                  </a>
                )}
                {facebook && (
                  <a href={facebook} target="_blank" rel="noopener">
                    <FaFacebookF />
                  </a>
                )}
                {x && (
                  <a href={x} target="_blank" rel="noopener">
                    <FaXTwitter />
                  </a>
                )}
                {youtube && (
                  <a href={youtube} target="_blank" rel="noopener">
                    <FaYoutube />
                  </a>
                )}
                {tiktok && (
                  <a href={tiktok} target="_blank" rel="noopener">
                    <FaTiktok />
                  </a>
                )}
                {linkedin && (
                  <a href={linkedin} target="_blank" rel="noopener">
                    <FaLinkedin />
                  </a>
                )}
                {website && (
                  <a href={website} target="_blank" rel="noopener">
                    <FaLink />
                  </a>
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
              style={{ fontFamily: typography }}
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
          <div
            style={{ fontFamily: typography }}
            className=" max-w-7xl mx-auto px-4 md:px-[5%] xl:px-0"
          >
            <AssetList isPublic={isPublic} assets={assets}>
              {assets.map((asset) => (
                <PublicCardBox key={asset.id} asset={asset} user={user} />
              ))}
            </AssetList>
          </div>
        )}
      </div>
      {variant === "slim" ? null : <StoreTemplateFooter />}
    </section>
  );
};

const PublicCardBox = ({ user, asset }: { user: User; asset: Asset }) => {
  const { url } = useOpenLink({
    localLink: `http://${user.host}.localhost:3000/tienda/${asset.slug}`,
    publicLink: `https://${user.host}.easybits.cloud/tienda/${asset.slug}`,
  });
  const { typography } = user?.storeConfig || {};
  
  return (
    <div style={{ fontFamily: typography }}>
      <AssetCard to={url} key={asset.id} asset={asset} right={<></>} />
    </div>
  );
};

const StoreTemplateFooter = () => {
  return (
    <div className="border-t-2 h-10 border-black flex gap-1 justify-center items-center  w-full bg-white fixed bottom-0">
      <div className="flex gap-1 items-center">
        <span className="text-sm">Powered by</span>
        <img alt="isotipo easybits" className="w-6" src="/logo-purple.svg" />
        <Link to="/" className="mt-1">
          <img alt="isotipo easybits" src="/logo-eb.svg" />{" "}
        </Link>
      </div>
    </div>
  );
};

import { HeaderIconButton } from "../common/HeaderIconButton";
import GlobeIcon from "/icons/globe.svg";
import EditIcon from "/icons/edit.svg";
import OpenIcon from "/icons/open.svg";
import ShareIcon from "/icons/share.svg";

import {
  FaFacebookF,
  FaLinkedinIn,
  FaInstagram,
  FaTiktok,
  FaGlobe,
} from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { Link } from "react-router";
import { AssetList } from "~/routes/assets/AssetList";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { cn } from "~/utils/cn";
import type { Asset, User } from "@prisma/client";
import { DEFAULT_PIC } from "~/routes/profile/profileComponents";
const LAYOUT_PADDING = "py-16 md:py-10"; // to not set padding at layout level (so brendi's design can be acomplished)

export default function StoreComponent({
  assets = [],
  cta,
  user: rootUser,
}: {
  user?: User; // this component is used in SEO public views (no user present)
  assets: Asset[];
  cta?: ReactNode;
}) {
  const [currentFilter, setCurrentFilter] = useState();
  const user = rootUser || assets?.[0]?.user || {};
  return (
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
            <div className="bg-white border-[2px] border-black rounded-xl p-1 w-[48px] h-[48px]">
              <img className="w-full" src={EditIcon} />
            </div>
          </HeaderIconButton>
          <HeaderIconButton>
            <div className="bg-white border-[2px] border-black rounded-xl p-1 w-[48px] h-[48px]">
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
      <div className="border-[2px] border-black rounded-2xl overflow-hidden">
        <div className="w-full h-[200px] relative ">
          <img
            className="object-cover w-full h-full"
            src={
              "https://imgs.search.brave.com/bSUGXZesc43Z_H_5LgsRNW3pZgEsA1ISXD9RcT7noMs/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly90NC5m/dGNkbi5uZXQvanBn/LzA3Lzg4LzMzLzU3/LzM2MF9GXzc4ODMz/NTc0MF9GdklvSlR1/NWgzOVF4Y1Q1Wkl3/ZldZMHNvQ2NtU1hS/Ty5qcGc"
            }
          />

          <div className="absolute w-[150px] h-[150px] inset-0 bg-black rounded-full scale-100 translate-x-2 opacity-100 top-[calc(100%-75px)] left-[calc(50%-75px)]" />
          <div className="absolute z-10 rounded-full w-[150px] h-[150px] overflow-hidden top-[calc(100%-75px)] left-[calc(50%-75px)]">
            <img
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = DEFAULT_PIC;
              }}
              className="object-cover w-full h-full"
              src={
                user.picture ||
                DEFAULT_PIC ||
                "https://imgs.search.brave.com/QU-6LktECopmY-f2KpSBiKk7DPVCnp6Xk0iE6jh-IuU/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly90My5m/dGNkbi5uZXQvanBn/LzA5LzY3LzA3LzE2/LzM2MF9GXzk2NzA3/MTY4M19yR1dPaGxj/YUo2c2Z0WEMxdXRE/Y2ttN0s2MzdJTUxW/Wi5qcGc"
              }
            />
          </div>
        </div>
        <div className="mt-20 flex justify-center mb-6">
          <div>
            <p className="font-semibold text-center mb-3">{user.displayName}</p>
            <div className="flex justify-center gap-3">
              <Link to="/RRSS">
                <FaFacebookF />
              </Link>
              <Link to="/RRSS">
                <FaLinkedinIn />
              </Link>
              <Link to="/RRSS">
                <FaInstagram />
              </Link>
              <Link to="/RRSS">
                <FaTiktok />
              </Link>
              <Link to="/RRSS">
                <FaXTwitter />
              </Link>
              <Link to="/RRSS">
                <FaGlobe />
              </Link>
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-3 mb-6">
          {["Todos", "Nuevos", "Assets", "Libros"].map((f, i) => (
            <button
              key={i}
              className={clsx(
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
        <div className="p-4">
          <AssetList isPublic assets={assets} />
        </div>
      </div>
    </div>
  );
}

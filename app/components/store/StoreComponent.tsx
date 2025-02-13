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
import { useState } from "react";
import clsx from "clsx";

export default function StoreComponent({ assets }) {
  const [currentFilter, setCurrentFilter] = useState();
  return (
    <div className="mt-5">
      <div className="flex justify-between mb-12">
        <p className="text-4xl font-semibold">Mi tienda</p>
        <div className="flex gap-3">
          <HeaderIconButton>
            <div className="bg-white border border-black rounded-lg p-1 w-[48px] h-[48px]">
              <img className="w-full" src={GlobeIcon} />
            </div>
          </HeaderIconButton>
          <HeaderIconButton>
            <div className="bg-white border border-black rounded-lg p-1 w-[48px] h-[48px]">
              <img className="w-full" src={EditIcon} />
            </div>
          </HeaderIconButton>
          <HeaderIconButton>
            <div className="bg-white border border-black rounded-lg p-1 w-[48px] h-[48px]">
              <img className="w-full" src={ShareIcon} />
            </div>
          </HeaderIconButton>
          <HeaderIconButton>
            <div className="bg-white border border-black rounded-lg p-1 w-[48px] h-[48px]">
              <img className="w-full" src={OpenIcon} />
            </div>
          </HeaderIconButton>
        </div>
      </div>

      <div className="w-full h-[200px] relative">
        <img
          className="object-cover w-full h-full"
          src="https://imgs.search.brave.com/bSUGXZesc43Z_H_5LgsRNW3pZgEsA1ISXD9RcT7noMs/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly90NC5m/dGNkbi5uZXQvanBn/LzA3Lzg4LzMzLzU3/LzM2MF9GXzc4ODMz/NTc0MF9GdklvSlR1/NWgzOVF4Y1Q1Wkl3/ZldZMHNvQ2NtU1hS/Ty5qcGc"
        />

        <div className="absolute w-[150px] h-[150px] inset-0 bg-black rounded-full scale-100 translate-x-2 opacity-100 top-[calc(100%-75px)] left-[calc(50%-75px)]" />
        <div className="absolute z-10 rounded-full w-[150px] h-[150px] overflow-hidden top-[calc(100%-75px)] left-[calc(50%-75px)]">
          <img
            className="object-cover w-full h-full"
            src="https://imgs.search.brave.com/QU-6LktECopmY-f2KpSBiKk7DPVCnp6Xk0iE6jh-IuU/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly90My5m/dGNkbi5uZXQvanBn/LzA5LzY3LzA3LzE2/LzM2MF9GXzk2NzA3/MTY4M19yR1dPaGxj/YUo2c2Z0WEMxdXRE/Y2ttN0s2MzdJTUxW/Wi5qcGc"
          />
        </div>
      </div>
      <div className="mt-20 flex justify-center mb-6">
        <div>
          <p className="font-semibold text-center mb-3">La padelera</p>
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
        {["Todos", "Nuevos", "Assets", "Libros"].map((f) => (
          <button
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

      <AssetList assets={assets} />
    </div>
  );
}

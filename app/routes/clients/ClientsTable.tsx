import type { File } from "@prisma/client";
import {
  FaCat,
  FaChair,
  FaDog,
  FaHammer,
  FaRegImage,
  FaVideo,
} from "react-icons/fa";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useFetcher } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { Copy } from "~/components/common/Copy";
import { FaBook } from "react-icons/fa6";
import { useState } from "react";
import { useStartVersioningFlyMachine } from "~/hooks/useStartVersioningFlyMachine";
import toast, { Toaster } from "react-hot-toast";
import Spinner from "~/components/common/Spinner";
import { DotsMenu } from "../files/DotsMenu";
import { IconRenderer } from "../files/IconRenderer";

const toMB = (bytes: number) => (bytes / 1000000).toFixed(2) + " mb";

export const ClientsTable = ({
  files,
  onClick,
  onTokenClick,
  onDetail,
}: {
  onDetail?: (arg0: File) => void;
  onTokenClick?: (arg0: File) => void;
  onClick?: () => void;
  files?: File[];
}) => {
  const fetcher = useFetcher();
  const [fileToDelete, setFileToDelete] = useState<File | null>(null);

  const handleDownload = (file: File) => {
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.url;
    a.click();
  };

  const openConfirm = (f: File) => {
    setFileToDelete(f);
  };

  const closeConfirm = () => {
    setFileToDelete(null);
  };

  const handleDelete = () => {
    if (!fileToDelete) return;
    setForceWorkingSpinner(fileToDelete.id);

    fetcher.submit(
      {
        intent: "delete_file",
      },
      {
        method: "post",
        action: `/api/v1/files?storageKey=${fileToDelete.storageKey}`,
      }
    );
  };

  const { requestHLS } = useStartVersioningFlyMachine();
  const [forceWorkingSpinner, setForceWorkingSpinner] = useState("");
  const handleHLS = async (file: File) => {
    setForceWorkingSpinner(file.id);
    toast.success("Procesando todas las versiones para: " + file.name, {
      position: "bottom-center",
      duration: 15000,
    });

    const machineInfo = await requestHLS(file.storageKey);
    console.log("INFO::", machineInfo);

    toast("Esto tomará algún tiempo, puedes olvidarte, yo me encargo. 🤖", {
      position: "bottom-center",
      icon: "⏲️",
      duration: 20000,
    });
  };

  return (
    <>
      <article className="bg-white border-2 rounded-xl border-black text-xs overflow-hidden">
        <section className="grid grid-cols-12 pl-4 py-2 border-b border-black">
          <span className=""></span>
          <span className=" col-span-2 md:col-span-1">Foto</span>
          <span className="col-span-5 md:col-span-2">Email</span>
          <span className="col-span-2 hidden md:block ">Nombre</span>
          <span className="col-span-1">Compras</span>
          <span className="col-span-2 hidden md:block">Fecha de registro</span>
          <span className="col-span-2  hidden md:block">Última compra</span>
          <span className="col-span-1"></span>
        </section>

        <AnimatePresence>
          <motion.section
            layout
            initial={{ x: 10, opacity: 0 }}
            exit={{ x: -10, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            key=""
            className={cn(
              "pl-4",
              "hover:bg-gray-100 ",
              "grid grid-cols-12  py-3 border-b items-center"
            )}
          >
            <span className="">
              <input
                type="checkbox"
                className="text-brand-500 focus:outline-brand-500"
              />
            </span>
            <button className="truncate font-semibold col-span-2 md:col-span-1 text-left flex flex-col">
              <img
                className="h-10 w-10 rounded-full"
                src="https://images.pexels.com/photos/4839763/pexels-photo-4839763.jpeg?auto=compress&cs=tinysrgb&w=1200"
                alt="user"
              />
            </button>
            <div className="text-brand-gray col-span-5 md:col-span-2 flex flex-col">
              <span className="text-black"> fulanitolopex@gmail.com</span>
              <span className="block md:hidden"> Fulanito Lopez</span>
            </div>

            <span className="text-brand-gray col-span-2 hidden md:block">
              {" "}
              Fulanito Lopez
            </span>
            <span className="text-brand-gray col-span-2 md:col-span-1 ">1</span>
            <span className=" items-center  col-span-2 hidden md:flex">
              {" "}
              10 nov 2024
            </span>
            <span className=" items-center  col-span-2 hidden md:flex">
              15 dic 2024
            </span>

            <DotsMenu>
              <button className="w-full p-3 rounded-lg hover:bg-gray-100 text-xs text-brand-red transition-all">
                Eliminar
              </button>
            </DotsMenu>
          </motion.section>
        </AnimatePresence>
      </article>
    </>
  );
};

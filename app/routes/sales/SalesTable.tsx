import type { File } from "@prisma/client";
import { useFetcher } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "~/utils/cn";
import { useState } from "react";
import { useStartVersioningFlyMachine } from "~/hooks/useStartVersioningFlyMachine";
import toast from "react-hot-toast";
import { DotsMenu } from "../files/DotsMenu";

export const SalesTable = ({}: {}) => {
  const fetcher = useFetcher();

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
      <article className="bg-white border-[1px] rounded-xl border-black text-xs ">
        <section className="grid grid-cols-12 pl-4 py-2 border-b border-black">
          <span className=" col-span-2 md:col-span-1 hidden md:block"></span>
          <span className="col-span-5 md:col-span-2">Email</span>
          <span className="col-span-2 hidden md:block ">Nombre</span>
          <span className="col-span-3 md:col-span-2">Asset</span>
          <span className="col-span-2 hidden md:block">Fecha </span>
          <span className="col-span-3 md:col-span-2 block">Precio</span>
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
              "grid grid-cols-12 py-2 md:py-3 border-b items-center"
            )}
          >
            <button className="truncate font-semibold col-span-2 md:col-span-1 text-left  flex-col hidden md:flex">
              <img
                className="h-10 w-10 rounded-xl"
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
            <span className="text-black col-span-3 md:col-span-2 ">
              Template UI
            </span>
            <span className=" items-center text-brand-gray col-span-2 hidden md:flex">
              {" "}
              10 nov 2024
            </span>
            <span className=" items-center  col-span-3  md:col-span-2 flex">
              $399.00 MXN
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

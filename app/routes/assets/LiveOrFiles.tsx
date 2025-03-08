import { Input } from "~/components/common/Input";
import { Switch } from "./Switch";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FilesForm } from "~/components/forms/files/FilesForm";

export const LiveOrFiles = () => {
  const [isLive, setIsLive] = useState(true);
  return (
    <section className="mt-8 mb-3">
      <h2 className="text-2xl">¿Tu curso es en vivo o pre-grabado?</h2>
      <nav className="flex gap-4 items-center mb-2 ">
        <p className="py-3">Pre-grabado</p>
        <Switch
          onChange={setIsLive}
          defaultChecked={isLive}
          holderClassName="bg-brand-yellow"
        />
        <p className="py-3">En vivo</p>
      </nav>
      <AnimatePresence mode="wait">
        {isLive && (
          <>
            <motion.div
              key={"live"}
              initial={{ opacity: 0, filter: "blur(4px)" }}
              exit={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
            >
              <p>Selecciona la fecha y hora del evento</p>
              <div className="flex gap-4">
                <Input type="date" className="w-full" />
                <Input type="time" className="w-full" />
              </div>
            </motion.div>
          </>
        )}
        {!isLive && ( // @todo make another componente without privacy selection
          <motion.div
            key={"vod"}
            initial={{ opacity: 0, filter: "blur(4px)" }}
            exit={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
          >
            <FilesForm />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

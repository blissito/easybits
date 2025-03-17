import { Input } from "~/components/common/Input";
import { Switch } from "./Switch";
import { useEffect, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FilesForm } from "~/components/forms/files/FilesForm";
import type { Asset } from "@prisma/client";

export const LiveOrFiles = ({
  onChangeEventDate,
  onChangeMetadata,
  asset,
  type,
  defaultEventDate = new Date(),
}: {
  onChangeMetadata?: (arg0: unknown) => void;
  asset: Asset;
  type?: "WEBINAR";
  onChangeEventDate?: (arg0: string) => void;
  defaultEventDate?: Date;
}) => {
  const [isLive, setIsLive] = useState(type === "WEBINAR");
  const [eventDate, setEventDate] = useState<Date>(defaultEventDate);

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    const date = new Date(`${v}T00:00`);
    date.setHours(eventDate.getHours());
    date.setMinutes(eventDate.getMinutes());
    setEventDate(date);
  };

  const handleTimeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value;
    const time = v.split(":");
    const current = new Date(eventDate);
    current.setHours(Number(time[0]));
    current.setMinutes(Number(time[1]));
    setEventDate(current);
  };

  useEffect(() => {
    onChangeEventDate?.(eventDate);
  }, [eventDate]);

  const defaultTime = eventDate
    .toLocaleString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    })
    .split(" ")[0];

  // revisit
  const defaultDate = eventDate.toISOString().split("T")[0];

  return (
    <section className="mt-8 mb-3">
      <h2 className="text-2xl">¿Tu curso es en vivo o pre-grabado?</h2>
      <nav className="flex gap-4 items-center mb-2 ">
        <p className="py-3">Pre-grabado</p>
        <Switch
          onChange={setIsLive}
          defaultChecked={true}
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
                <Input
                  onChange={handleDateChange}
                  type="date"
                  className="w-full"
                  defaultValue={defaultDate}
                />
                <Input
                  defaultValue={defaultTime}
                  onChange={handleTimeChange}
                  type="time"
                  className="w-full"
                />
              </div>
              <p>Coloca el número de sesiones</p>
              <Input
                min="1"
                type="number"
                defaultValue={asset.metadata?.numberOfSessions || "1"}
                onChange={(ev) =>
                  onChangeMetadata?.({
                    numberOfSessions: Number(ev.currentTarget.value),
                  })
                }
                className="w-full"
              />
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

import { Input } from "~/components/common/Input";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FilesForm } from "~/components/forms/files/FilesForm";
import type { Asset, File as AssetFile } from "@prisma/client";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useFetcher } from "react-router";
import { NewsLetterMicroApp } from "~/components/forms/NewsLetterForm";
import { FilesPicker } from "./FilesPicker";

export const LiveOrFiles = ({
  onChangeEventDate,
  onChangeMetadata,
  asset,
  type,
  files,
  defaultEventDate = new Date(),
  vode_course,
  onTypeChange,
}: {
  onTypeChange?: (type: string) => void;
  vode_course?: ReactNode;
  onChangeMetadata?: (arg0: unknown) => void;
  asset: Asset;
  files: AssetFile[];
  type?: "WEBINAR" | "EMAIL_COURSE" | "VOD_COURSE";
  onChangeEventDate?: (arg0: string) => void;
  defaultEventDate?: Date;
}) => {
  const [eventDate, setEventDate] = useState<Date>(defaultEventDate);
  const fetcher = useFetcher();

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
    ?.toLocaleString("es-MX", {
      hour: "2-digit",
      minute: "2-digit",
    })
    .split(" ")[0];

  // revisit
  const defaultDate = eventDate?.toISOString().split("T")[0];

  const isEmailCourse = type === "EMAIL_COURSE";
  const isLive = type === "WEBINAR";
  const isVOD = type === "VOD_COURSE";

  const [localType, setLocalType] = useState<string>(type);
  useEffect(() => {
    setLocalType(type);
  }, [type]);
  const handleTypeUpdate = (type: string) => () => {
    setLocalType(type);
    fetcher.submit(
      {
        intent: "update_asset",
        data: JSON.stringify({
          type,
          id: asset.id,
        }),
      },
      { method: "post", action: "/api/v1/assets" }
    );
    onTypeChange?.(type);
  };

  return (
    <section className="mt-8 mb-3">
      <h2 className="text-2xl mb-3">¿Tu curso es en vivo o pre-grabado?</h2>
      <nav className="flex flex-wrap gap-4 items-center mb-4 ">
        <BrutalButton
          onClick={handleTypeUpdate("VOD_COURSE")}
          mode={localType === "VOD_COURSE" ? "brand" : "ghost"}
        >
          Pre-grabado
        </BrutalButton>
        <BrutalButton
          onClick={handleTypeUpdate("WEBINAR")}
          mode={localType === "WEBINAR" ? "brand" : "ghost"}
        >
          En vivo
        </BrutalButton>
        <BrutalButton
          onClick={handleTypeUpdate("EMAIL_COURSE")}
          mode={localType === "EMAIL_COURSE" ? "brand" : "ghost"}
        >
          Por correo
        </BrutalButton>
      </nav>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={type}
          initial={{
            scale: 0.8,
            opacity: 0,
            filter: "blur(4px)",
          }}
          exit={{
            scale: 0.8,
            opacity: 0,
            filter: "blur(4px)",
          }}
          animate={{
            scale: 1,
            opacity: 1,
            filter: "blur(0px)",
          }}
        >
          {isLive && (
            <>
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
            </>
          )}
          {isEmailCourse && ( // @todo make another componente without privacy selection
            <motion.div
              key={"vod"}
              initial={{
                scale: 0.8,
                opacity: 0,
                filter: "blur(4px)",
              }}
              exit={{
                scale: 0.8,
                opacity: 0,
                filter: "blur(4px)",
              }}
              animate={{
                scale: 1,
                opacity: 1,
                filter: "blur(0px)",
              }}
            >
              <NewsLetterMicroApp files={files} asset={asset} />
            </motion.div>
          )}
          {isVOD && vode_course}
        </motion.div>
      </AnimatePresence>
    </section>
  );
};

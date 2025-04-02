import { Input } from "~/components/common/Input";
import { useEffect, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FilesForm } from "~/components/forms/files/FilesForm";
import type { Asset } from "@prisma/client";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useFetcher } from "react-router";
import { NewsLetterMicroApp } from "~/components/forms/NewsLetterForm";

export const LiveOrFiles = ({
  onChangeEventDate,
  onChangeMetadata,
  asset,
  type,
  defaultEventDate = new Date(),
}: {
  onChangeMetadata?: (arg0: unknown) => void;
  asset: Asset;
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

  const handleTypeUpdate = (type: string) => () => {
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
  };

  return (
    <section className="mt-8 mb-3">
      <h2 className="text-2xl mb-3">¿Tu curso es en vivo o pre-grabado?</h2>
      <nav className="flex gap-4 items-center mb-4 ">
        <BrutalButton
          onClick={handleTypeUpdate("VOD_COURSE")}
          mode={type === "VOD_COURSE" ? "brand" : "ghost"}
          className="py-3"
        >
          Pre-grabado
        </BrutalButton>
        <BrutalButton
          onClick={handleTypeUpdate("WEBINAR")}
          mode={type === "WEBINAR" ? "brand" : "ghost"}
          className="py-3"
        >
          En vivo
        </BrutalButton>
        <BrutalButton
          onClick={handleTypeUpdate("EMAIL_COURSE")}
          mode={type === "EMAIL_COURSE" ? "brand" : "ghost"}
          className="py-3"
        >
          Por correo
        </BrutalButton>
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
            {isEmailCourse ? (
              <NewsLetterMicroApp asset={asset} />
            ) : (
              <FilesForm
                mode={isEmailCourse ? "private_by_default" : undefined}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

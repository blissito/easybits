import type { File } from "@prisma/client";
import { Modal } from "~/components/common/Modal";
import { Input } from "../Input";
import { SelectInput } from "../SelectInput";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useEffect, useState, type ChangeEvent } from "react";
import { useDateCalculations } from "~/hooks/useDateCalculations";
import { useFetcher } from "react-router";

export const ShareTokensModal = ({
  onClose,
  tokenFor,
}: {
  tokenFor?: File | null;
  onClose?: () => void;
}) => {
  const { getDisplayTime, getDisplayDate } = useDateCalculations();
  const [date, setDate] = useState(
    new Date(new Date().setDate(new Date().getDate() + 1))
  );
  const [number, setNumber] = useState(1);
  const [type, setType] = useState("h");
  const [expInSecs, setExpInSecs] = useState(86400); // 1h

  useEffect(() => {
    const d = new Date();
    if (type === "h") {
      d.setHours(d.getHours() + number);
      setDate(d);
    }
    if (type === "m") {
      d.setMinutes(d.getMinutes() + number);
      setDate(d);
    }
    setExpInSecs((d.getTime() - Date.now()) / 1000); // gold... and gragile...
  }, [number, type]);

  const fetcher = useFetcher();
  const onGenerate = () => {
    if (!tokenFor) return;

    fetcher.submit(
      {
        intent: "generate_token",
        fileId: tokenFor.id,
        expInSecs,
      },
      { method: "post", action: "/api/v1/tokens" }
    );
  };

  const url = fetcher.data?.url || "-- Genera un token primero --";

  return (
    <Modal onClose={onClose} isOpen={!!tokenFor} title="Crea tokens de acceso">
      <p>
        Como tu archivo es privado, necesitas un token para consumirlo.
        Recuerda, el máximo es{" "}
        <strong className="text-brand-500">168 horas</strong> (7 días).
      </p>

      <section className="flex gap-7 mt-8">
        <div className="flex flex-col">
          <p>Define la duración del token</p>
          <div className="flex gap-4 items-center">
            <Input
              min="1"
              max="168"
              type="number"
              defaultValue={number}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setNumber(Number(event.currentTarget.value));
              }}
            />
            <SelectInput
              placeholder="Horas"
              onChange={(value) => setType(value)}
              className="w-40"
              options={[
                {
                  label: "Horas",
                  value: "h",
                },
                {
                  label: "Minutos",
                  value: "m",
                },
              ]}
            />
          </div>
          <Input readOnly value={url} copyText={url} />
        </div>
        <div className="bg-black w-full rounded-2xl mb-4 flex flex-col gap-3 text-center py-8">
          <p className="text-gray-400">Token válido hasta:</p>
          <h2 className="text-white text-3xl">{getDisplayDate(date)}</h2>
          <h4 className="text-white text-lg">{getDisplayTime(date)}</h4>
        </div>
      </section>
      <section>
        <p className="text-xs text-brand-500">
          Esta es una única ocación en la que verás este token, guárdalo bien.
          🗝️
        </p>
      </section>
      <nav className="mt-10 mb-6 flex gap-6">
        <BrutalButton onClick={onClose} mode="ghost">
          Cancelar
        </BrutalButton>
        <BrutalButton onClick={onGenerate} containerClassName="w-full">
          Generar nuevo token
        </BrutalButton>
      </nav>
    </Modal>
  );
};

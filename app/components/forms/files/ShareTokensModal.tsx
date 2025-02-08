import type { File } from "@prisma/client";
import { Modal } from "~/components/common/Modal";
import { Input } from "../Input";
import { SelectInput } from "../SelectInput";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useEffect, useState, type ChangeEvent } from "react";
import { useDateCalculations } from "~/hooks/useDateCalculations";

export const ShareTokensModal = ({
  onClose,
  tokenFor,
}: {
  tokenFor?: File | null;
  onClose?: () => void;
}) => {
  const { getDisplayTime, getDisplayDate } = useDateCalculations();
  const [date, setDate] = useState(
    new Date().setDate(new Date().getDate() + 1)
  );
  const [number, setNumber] = useState(1);
  const [type, setType] = useState("d");
  const [exp, setExp] = useState("1d");
  const [expInSecs, setExpInSecs] = useState(86400);

  useEffect(() => {
    setExp(`${number}${type}`);
    const d = new Date();
    if (type === "d") {
      d.setDate(d.getDate() + number);
      setDate(d);
    }
    if (type === "h") {
      d.setHours(d.getHours() + number);
      setDate(d);
    }
    if (type === "m") {
      d.setMinutes(d.getMinutes() + number);
      setDate(d);
    }
    setExpInSecs(d.getTime() / 1000);
    console.log("SECS?", Math.floor(d.getTime() / 1000));
  }, [number, type]);

  console.log("ExpiresIn::", exp);

  return (
    <Modal onClose={onClose} isOpen={!!tokenFor} title="Crea tokens de acceso">
      <p>
        Como tu archivo es privado, necesitas un token para consumirlo.
        Recuerda, que{" "}
        <strong className="text-brand-500">
          cada token nuevo invalida el anterior.
        </strong>
      </p>

      <section className="flex gap-7 mt-8">
        <div className="flex flex-col">
          <p>Define la duración del token</p>
          <div className="flex gap-4 items-center">
            <Input
              min="1"
              type="number"
              defaultValue={number}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setNumber(Number(event.currentTarget.value));
              }}
            />
            <SelectInput
              onChange={(value) => setType(value)}
              className="w-40"
              options={[
                {
                  label: "Días",
                  value: "d",
                },
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
          <Input
            placeholder={tokenFor?.url}
            copyText={`${tokenFor?.url}?token="perro"`}
          />
        </div>
        <div className="bg-black w-full rounded-2xl mb-4 flex flex-col gap-3 text-center py-8">
          <p className="text-gray-400">Token válido hasta:</p>
          <h2 className="text-white text-3xl">{getDisplayDate(date)}</h2>
          <h4 className="text-white text-lg">{getDisplayTime(date)}</h4>
        </div>
      </section>
      <nav className="mt-10 flex gap-6">
        <BrutalButton onClick={onClose} mode="ghost">
          Cancelar
        </BrutalButton>
        <BrutalButton containerClassName="w-full">
          Generar nuevo token
        </BrutalButton>
      </nav>
    </Modal>
  );
};

import { Modal } from "~/components/common/Modal";
import { Input } from "../Input";
import { SelectInput } from "../SelectInput";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useEffect, useState, type ChangeEvent } from "react";
import { useDateCalculations } from "~/hooks/useDateCalculations";
import { useFetcher } from "react-router";

type TokenFile = { id: string; name: string };

export const ShareTokensModal = ({
  onClose,
  tokenFor,
}: {
  onChange?: () => void;
  tokenFor?: TokenFile | null;
  onClose?: () => void;
}) => {
  const { getDisplayTime, getDisplayDate } = useDateCalculations();
  const [url, setUrl] = useState("-- Genera un token primero --");
  const [number, setNumber] = useState(15);
  const [type, setType] = useState("m");

  const expInSecs = type === "h" ? number * 3600 : number * 60;
  const date = new Date(Date.now() + expInSecs * 1000);
  const maxValue = type === "h" ? 168 : 10080;

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
  const isFetching = fetcher.state !== "idle";

  const handleClose = () => {
    setUrl("-- Genera un token primero --");
    onClose?.();
  };

  useEffect(() => {
    if (fetcher.data?.url) {
      setUrl(fetcher.data.url);
    }
  }, [fetcher.data]);

  return (
    <Modal
      onClose={handleClose}
      isOpen={!!tokenFor}
      title="Crea tokens de acceso"
    >
      <p className="mb-2 truncate">
        Para:{" "}
        <strong className="text-lg font-semibold">{tokenFor?.name}</strong>
      </p>
      <p>
        Como tu archivo es privado, necesitas un token para consumirlo.
        Recuerda, el máximo es{" "}
        <strong className="text-brand-500">168 horas</strong> (7 días).
      </p>

      <section className="flex flex-col gap-6 mt-8">
        <div className="flex flex-col gap-2">
          <p className="font-medium">Define la duración del token</p>
          <div className="flex gap-4 items-start">
            <Input
              min="1"
              max={String(maxValue)}
              type="number"
              defaultValue={number}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setNumber(Number(event.currentTarget.value));
              }}
            />
            <SelectInput
              name="type"
              defaultValue="m"
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
        </div>
        <div className="bg-black rounded-2xl flex flex-col gap-3 text-center py-6 px-4">
          <p className="text-gray-400 text-sm">Token válido hasta:</p>
          <h2 className="text-white text-2xl md:text-3xl">{getDisplayDate(date)}</h2>
          <h4 className="text-white text-lg">{getDisplayTime(date)}</h4>
        </div>
        <div>
          <Input readOnly className="select-none w-full text-sm" value={url} copyText={url} />
          <p className="text-xs text-brand-500 mt-1">
            Esta es la única ocasión en la que verás este token, guárdalo bien.
          </p>
        </div>
      </section>
      <nav className="mt-10 mb-6 flex gap-6">
        <BrutalButton onClick={handleClose} mode="ghost">
          Cerrar
        </BrutalButton>
        <BrutalButton
          isLoading={isFetching}
          onClick={onGenerate}
          containerClassName="w-full"
        >
          Generar nuevo token
        </BrutalButton>
      </nav>
    </Modal>
  );
};

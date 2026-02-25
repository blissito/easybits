import { Modal } from "~/components/common/Modal";
import { BrutalButton } from "~/components/common/BrutalButton";
import { useEffect, useState } from "react";
import { useDateCalculations } from "~/hooks/useDateCalculations";
import { useFetcher } from "react-router";
import { Copy } from "~/components/common/Copy";
import { cn } from "~/utils/cn";
import { IoTime } from "react-icons/io5";
import { HiClipboardDocument } from "react-icons/hi2";

type TokenFile = { id: string; name: string };

const UNITS = [
  { label: "Minutos", value: "m", max: 10080, multiplier: 60 },
  { label: "Horas", value: "h", max: 168, multiplier: 3600 },
] as const;

export const ShareTokensModal = ({
  onClose,
  tokenFor,
}: {
  onChange?: () => void;
  tokenFor?: TokenFile | null;
  onClose?: () => void;
}) => {
  const { getDisplayTime, getDisplayDate } = useDateCalculations();
  const [url, setUrl] = useState("");
  const [number, setNumber] = useState(15);
  const [unitIdx, setUnitIdx] = useState(0);

  const unit = UNITS[unitIdx];
  const expInSecs = number * unit.multiplier;
  const date = new Date(Date.now() + expInSecs * 1000);

  const fetcher = useFetcher();
  const isFetching = fetcher.state !== "idle";

  const onGenerate = () => {
    if (!tokenFor) return;
    fetcher.submit(
      { intent: "generate_token", fileId: tokenFor.id, expInSecs },
      { method: "post", action: "/api/v1/tokens" }
    );
  };

  const handleClose = () => {
    setUrl("");
    setNumber(15);
    setUnitIdx(0);
    onClose?.();
  };

  useEffect(() => {
    if (fetcher.data?.url) {
      setUrl(fetcher.data.url);
    }
  }, [fetcher.data]);

  const hasUrl = !!url;

  return (
    <Modal
      onClose={handleClose}
      isOpen={!!tokenFor}
      title="Token de acceso"
    >
      <div className="flex flex-col flex-1">
        {/* File info */}
        <div className="flex items-center gap-2 mb-6 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
          <HiClipboardDocument className="text-gray-400 shrink-0" />
          <span className="truncate text-sm text-gray-600">
            {tokenFor?.name}
          </span>
        </div>

        {/* Duration picker */}
        <p className="text-sm font-medium text-gray-500 mb-2">Duración</p>
        <div className="flex gap-2 items-center mb-6">
          <input
            min={1}
            max={unit.max}
            type="number"
            value={number}
            onChange={(e) => {
              const v = Math.max(1, Math.min(unit.max, Number(e.target.value) || 1));
              setNumber(v);
            }}
            className={cn(
              "border border-gray-300 rounded-xl px-4 py-3 h-12 w-24 text-center text-lg font-semibold",
              "focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
            )}
          />
          <div className="flex bg-gray-100 rounded-xl p-1">
            {UNITS.map((u, i) => (
              <button
                key={u.value}
                type="button"
                onClick={() => {
                  setUnitIdx(i);
                  // Clamp number to new max
                  setNumber((prev) => Math.min(prev, u.max));
                }}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  i === unitIdx
                    ? "bg-white border border-gray-300 shadow-sm text-black"
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* Expiry preview */}
        <div className="bg-black rounded-2xl px-5 py-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <IoTime className="text-brand-500" />
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Válido hasta
            </span>
          </div>
          <p className="text-white text-2xl font-bold">
            {getDisplayDate(date)}
          </p>
          <p className="text-gray-400 text-lg">
            {getDisplayTime(date)}
          </p>
        </div>

        {/* Generated URL */}
        {hasUrl && (
          <div className="mb-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <p className="text-sm font-medium text-gray-500 mb-2">URL generada</p>
            <div className="relative flex items-center bg-gray-50 border border-gray-200 rounded-xl">
              <input
                readOnly
                value={url}
                className="w-full bg-transparent text-xs text-gray-700 px-4 py-3 pr-10 rounded-xl select-all focus:outline-none"
                onFocus={(e) => e.target.select()}
              />
              <div className="absolute right-2">
                <Copy text={url} />
              </div>
            </div>
            <p className="text-xs text-brand-500 mt-1.5">
              Guarda este enlace — no se mostrará de nuevo.
            </p>
          </div>
        )}

        {/* Actions — pushed to bottom */}
        <nav className="mt-auto flex gap-3 pt-4">
          <BrutalButton onClick={handleClose} mode="ghost">
            Cerrar
          </BrutalButton>
          <BrutalButton
            isLoading={isFetching}
            onClick={onGenerate}
            containerClassName="w-full"
          >
            {hasUrl ? "Regenerar token" : "Generar token"}
          </BrutalButton>
        </nav>
      </div>
    </Modal>
  );
};

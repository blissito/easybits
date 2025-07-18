import { useRef, useState, type ChangeEvent } from "react";
import { Link } from "react-router";
import { Input } from "~/components/common/Input";

export const PriceInput = ({
  onCurrencyChange,
  onInputChange,
  error,
  defaultPrice,
  defaultCurrency = "mxn",
  stripeAccountId,
  onboardingDone,
}: {
  onboardingDone?: boolean;
  stripeAccountId?: string;
  defaultPrice?: string | number;
  defaultCurrency?: string;
  onCurrencyChange?: (arg0: string) => void;
  onInputChange?: (arg0: string) => void;
  error?: string;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [earn, setEarn] = useState(0);

  const handlePriceChange = ({
    currentTarget: { value },
  }: ChangeEvent<HTMLInputElement>) => {
    onInputChange?.(value);
    setEarn((Number(value) * 0.95).toFixed(2));
  };

  return (
    <section>
      <h2 className="text-2xl font-bold">Precio</h2>
      <p className="pt-2 pb-2">Ponle precio a tu asset</p>
      <div className="flex items-center gap-4">
        <Input
          disabled={!onboardingDone}
          inputClassName="flex-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
          onChange={handlePriceChange}
          ref={inputRef}
          placeholder="$300.00"
          type="number"
          min={0}
          isError={!!error}
          defaultValue={defaultPrice}
        />
        <select
          onChange={(e) => onCurrencyChange?.(e.currentTarget.value)}
          defaultValue={defaultCurrency}
          className="rounded-xl h-12 bg-black border-none text-white focus:ring-0"
        >
          <option value="usd">USD</option>
          <option value="mxn">MXN</option>
        </select>
      </div>
      {!onboardingDone && (
        <p className="text-xs text-red-500">
          Para activar el precio, debes conectar tu cuenta de Stripe{" "}
          <Link to="/dash/ventas" className="underline">
            aquí
          </Link>
        </p>
      )}
      <div className="h-5">
        {Number(earn) > 0 && (
          <p className="text-xs text-brand-gray">¡Ganarás ${earn} por venta!</p>
        )}
        {error && <p className="text-red-500 text-xs">{error}</p>}{" "}
      </div>
    </section>
  );
};

import { useRef, useState, type ChangeEvent } from "react";
import { Input } from "~/components/common/Input";

export const PriceInput = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [earn, setEarn] = useState(0);
  const handlePriceChange = ({
    currentTarget: { value },
  }: ChangeEvent<HTMLInputElement>) => {
    setEarn((Number(value) * 0.95).toFixed(2));
  };
  return (
    <section>
      <h2 className="text-2xl">Precio</h2>
      <p className="py-3">Establece el precio de tu Asset digital</p>
      <div className="flex items-center gap-4">
        <Input
          className="flex-1"
          onChange={handlePriceChange}
          ref={inputRef}
          placeholder="$300.00"
          type="number"
          min={0}
        />
        <select
          defaultValue={"mxn"}
          className="rounded-2xl h-[53px] bg-black text-white"
        >
          <option value="usd">USD</option>
          <option value="mxn">MXN</option>
        </select>
      </div>
      {Number(earn) > 0 && (
        <p className="text-xs text-brand-gray">¡Ganarás ${earn} por venta!</p>
      )}
    </section>
  );
};

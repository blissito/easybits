import { Switch } from "./Switch";
import { Input } from "~/components/common/Input";
import { useEffect, useState, type ChangeEvent } from "react";
type Extra = {
  stock: number; // 0 will be no limit
  showSold: boolean;
  showReviews: boolean;
};
export const ExtraConfig = ({
  extra = { stock: 0, showSold: false, showReviews: true },
  onChange,
}: {
  onChange?: (arg0: Extra) => void;
  extra: Extra;
}) => {
  const [state, setState] = useState(extra || { stock: 0 });
  const [isStockActive, setIsStockActive] = useState(state.stock > 0);
  const handleChange = (field: string) => (value: boolean | string) =>
    setState((st) => ({ ...st, [field]: value }));

  useEffect(() => {
    onChange?.(state);
  }, [state]);

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Extras</h2>
      <Switch
        onChange={(on: boolean) => {
          setIsStockActive(on);
          setState((st) => ({ ...st, stock: on ? 10 : 0 }));
        }}
        value={state.stock > 0}
        label="Limitar el número de ventas"
      />
      {isStockActive && (
        <Input
          value={state.stock}
          onChange={(ev: ChangeEvent<HTMLInputElement>) =>
            handleChange("stock")(ev.currentTarget.value)
          }
          type="number"
          placeholder="Introduce el stock: ej.: 30"
        />
      )}
      <Switch
        onChange={handleChange("showSold")}
        value={state.showSold}
        label="Mostrar el número de ventas en tu página"
      />
      <Switch
        onChange={handleChange("showReviews")}
        value={state.showReviews}
        label="Mostrar reseñas"
      />
    </section>
  );
};

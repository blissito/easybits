import { motion } from "motion/react";
import { Switch } from "./Switch";

export const ExtrasConfig = () => {
  return (
    <motion.section layout className="flex flex-col gap-4">
      <h2 className="text-2xl">Extras</h2>
      <Switch label="Limitar el número de ventas" />
      <Switch label="Mostrar el número de ventas en tu página" />
      <Switch label="Mostrar reseñas" />
    </motion.section>
  );
};

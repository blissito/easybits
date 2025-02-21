import { motion } from "motion/react";
import type { ReactNode } from "react";

export const TextBlurEffect = ({ children }: { children: ReactNode }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, filter: "blur(0px" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px" }}
      exit={{ opacity: 0, y: -40, filter: "blur(0px" }}
      transition={{ type: "spring", bounce: 0, duration: 1 }}
      className="text-ironGray text-lg md:text-2xl font-light mt-6"
    >
      {children}
    </motion.div>
  );
};

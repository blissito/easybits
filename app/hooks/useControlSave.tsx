import { useEffect } from "react";

export const useControlSave = (cb?: () => void) => {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        // Prevent the Save dialog to open
        e.preventDefault();
        // Place your code here
        console.log("CTRL + S");
        cb?.();
      }
    }
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, []);
};

import toast from "react-hot-toast";

export const useBrutalToast = () => {
  return (text: string) =>
    toast.success(text, {
      style: {
        border: "2px solid #000000",
        padding: "16px",
        color: "#000000",
      },
      iconTheme: {
        primary: "#8BB236",
        secondary: "#FFFAEE",
      },
    });
};

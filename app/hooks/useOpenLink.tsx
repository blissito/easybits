import toast from "react-hot-toast";

export const useOpenLink = ({
  localLink,
  publicLink,
}: {
  localLink: string;
  publicLink: string;
}) => {
  return () => {
    const isDev = location.hostname.includes("localhost");
    const uri = isDev ? localLink : publicLink;
    navigator.clipboard.writeText(uri);
    toast.success("Link copiado", {
      style: {
        border: "2px solid #000000",
        padding: "16px",
        color: "#000000",
      },
      iconTheme: {
        primary: "#8BB236",
        secondary: "#FFFAEE",
      },
      position: "top-right",
    });
    const a = document.createElement("a");
    a.target = "_blank";
    a.href = uri;
    a.click();
  };
};

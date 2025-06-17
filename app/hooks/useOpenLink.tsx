import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export const useOpenLink = ({
  localLink,
  publicLink,
}: {
  localLink: string;
  publicLink: string;
}) => {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const isDev = location.hostname.includes("localhost");
    const uri = isDev ? localLink : publicLink;
    setUrl(uri);
  }, []);
  const handleOpenLink = () => {
    navigator.clipboard.writeText(url);
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
    a.href = url;
    a.click();
  };
  return {
    url,
    handleOpenLink,
  };
};

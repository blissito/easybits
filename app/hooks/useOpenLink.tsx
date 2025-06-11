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
    toast("Link copiado ✅", { position: "top-right" });
    const a = document.createElement("a");
    a.target = "_blank";
    a.href = uri;
    a.click();
  };
};

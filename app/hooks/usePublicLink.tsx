import type { Asset, User } from "@prisma/client";
import { useEffect, useState } from "react";

export const usePublicLink = (asset: Asset & { user: User }) => {
  if (!asset) return null;

  const [link, setLink] = useState("");
  useEffect(() => {
    let h = `${location.host}`;
    // const th = asset.template!.host as string; deprecated
    const th = asset.user?.host || ""; // user host intead of the template one
    // should trhow or redirect?
    h = h.replace("www", th); // duh! (not replacing in localhost)
    // // ussing asset slug instead of the template one
    setLink(`${location.protocol}//${h}/p/${asset.slug}`);
  }, []);
  return link;
};

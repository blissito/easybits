import type { Asset } from "@prisma/client";
import { useEffect, useState } from "react";

export const usePublicLink = (asset: Asset) => {
  const [link, setLink] = useState("");

  useEffect(() => {
    setLink(
      `${location.protocol}//${asset.template?.host}.${location.host}/p/${asset.template?.slug}`
    );
  }, []);

  return link;
};

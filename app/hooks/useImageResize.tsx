import { useState } from "react";

export const useImageResize = (options?: {
  callback?: (blob: Blob, success: boolean) => Promise<void>;
}) => {
  const { callback } = options || {};
  const [blob, setBlob] = useState<Blob | null>(null);

  const getDimensions = (
    imageNode: HTMLImageElement,
    maxDimensions: { width: number; height: number }
  ) => {
    let width = imageNode.width;
    let height = imageNode.height;
    if (width >= height && width > maxDimensions.width) {
      height *= maxDimensions.width / width;
      width = maxDimensions.width;
    } else if (height > maxDimensions.height) {
      width *= maxDimensions.height / height;
      height = maxDimensions.height;
    }
    return [width, height];
  };

  const resize = async (
    file: File | Blob,
    options?: {
      maxDimensions?: { width: number; height: number };
      // callback?: (file: Blob, success: boolean) => void;
    }
  ) => {
    if (file.type?.includes("gif")) return; // avoid @todo: convert
    let {
      maxDimensions = {
        width: 300,
        height: 200,
      },
    } = options || {};
    const imageNode = document.createElement("img");
    if (Object.keys(file).includes("link")) {
      // specific for this program
      const blob = await fetch(file.link).then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      imageNode.src = url;
    } else if (file.type) {
      if (!file.type.match(/image.*/) || file.type.match(/image\/gif/))
        return callback?.(file, false);
      // TODO: use https://github.com/antimatter15/whammy to convert gif to webm
      imageNode.src = URL.createObjectURL(file);
    }

    imageNode.onload = () => {
      const [width, height] = getDimensions(imageNode, maxDimensions);
      // actual work:
      const canvas = Object.assign(document.createElement("canvas"), {
        width,
        height,
      });
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imageNode, 0, 0, width, height);
      // only if blob support
      // canvas.toBlob((blob) => callback?.(blob!, true), file.type); // @todo optional
      const du = canvas.toDataURL("image/webp", 0.5); // mid quality
      fetch(du)
        .then((r) => r.blob())
        .then((b) => {
          setBlob(b);
          callback?.(b, true);
        });
    };
  };

  return {
    resize,
    blob,
  };
};

// var file = new File([myBlob], "name");

import { useState } from "react";

type Link = { link: string };

export const useImageResize = (options?: {
  quality?: number;
  callback?: (blob: Blob, success: boolean) => Promise<void>;
}) => {
  const { callback, quality = 0.7 } = options || {};
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
    file: File | Blob | Link,
    options?: {
      maxDimensions?: { width: number; height: number };
      // callback?: (file: Blob, success: boolean) => void;
    }
  ) => {
    let {
      maxDimensions = {
        width: 600,
        height: 315,
      },
    } = options || {};
    const imageNode = document.createElement("img");
    // specific for easybits
    if (Object.keys(file).includes("link")) {
      const blob = await fetch((file as Link).link).then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      imageNode.src = url;
    } else if ((file as Blob).type) {
      if (
        !(file as Blob).type.match(/image.*/) ||
        (file as Blob).type.match(/image\/gif/)
      ) {
        return callback?.(file as Blob, false);
      }
      // TODO: use https://github.com/antimatter15/whammy to convert gif to webm
      imageNode.src = URL.createObjectURL(file as Blob);
      // program continues inside imageNode.onload
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
      // @todo only if blob support
      // canvas.toBlob((blob) => callback?.(blob!, true), file.type); // @todo make it optional
      const du = canvas.toDataURL("image/webp", quality); // low quality
      // DataURL to blob conversion hack using fetch:
      fetch(du)
        .then((r) => r.blob())
        .then((b) => {
          setBlob(b);
          callback?.(b, true); // send the resulting blob
        });
    };
  };

  return {
    resize,
    blob,
  };
};

// var file = new File([myBlob], "name");

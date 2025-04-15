export const useImageResize = (options?: {
  callback?: (blob: Blob, success: boolean) => Promise<void>;
}) => {
  const { callback } = options || {};

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
      let width = imageNode.width;
      let height = imageNode.height;
      let isTooLarge = false;

      if (width >= height && width > maxDimensions.width) {
        // width is the largest and too much.
        height *= maxDimensions.width / width;
        width = maxDimensions.width;
        isTooLarge = true;
      } else if (height > maxDimensions.height) {
        // height is oversized
        width *= maxDimensions.height / height;
        height = maxDimensions.height;
        isTooLarge = true;
      }
      if (!isTooLarge) {
        // no need to resize
        callback?.(file, false);
      }
      // actual work:
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(imageNode, 0, 0, width, height);
      // only if blob support
      // canvas.toBlob((blob) => callback?.(blob!, true), file.type); // @todo optional
      const du = canvas.toDataURL("image/webp", 0.5);
      fetch(du)
        .then((r) => r.blob())
        .then((b) => callback?.(b, true));
    };
  };
  // var file = new File([myBlob], "name");

  return {
    resize,
  };
};

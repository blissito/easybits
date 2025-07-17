import { useRef } from "react";
import {
  permittedGetUserMedia,
  processStream,
  registerRecord,
} from "~/utils/userMedia";

export const CamStreamer = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const requestPermission = async () => {
    if (permittedGetUserMedia()) {
      const mediaSource = new MediaSource();
      videoRef.current!.src = URL.createObjectURL(mediaSource); // preview

      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      videoRef.current!.srcObject = stream;
      videoRef.current!.addEventListener("loadedmetadata", () => {
        videoRef.current!.play();
      });
      // upload chunk to server
      registerRecord(stream);
    }
  };
  return (
    <>
      {" "}
      <button
        onClick={requestPermission}
        className="py-3 px-8 rounded-full bg-fuchsia-500 text-white font-bold text-2xl my-8 enabled:hover:bg-fuchsia-600 enabled:active:bg-fuchsia-700 shadow-sm"
      >
        Comenzar transmisión en vivo
      </button>
      <video ref={videoRef} className="aspect-video border rounded-2xl mb-8" />
    </>
  );
};

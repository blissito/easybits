import type { File } from "@prisma/client";
import { Modal } from "~/components/common/Modal";

export const FileDetailModal = ({
  isOpen,
  onClose,
  file,
}: {
  isOpen: boolean;
  onClose?: () => void;
  file: File;
}) => {
  // console.log("FILE: ", file);
  return (
    <Modal
      containerClassName="z-30"
      isOpen={isOpen}
      title={"Detalle de archivo"}
      onClose={onClose}
    >
      <h3>Full video:</h3>
      {file && file.url && (
        <video controls className="w-full aspect-video" src={file.url}></video>
      )}
      <h3>HLS:</h3>
      {file && file.masterPlaylistURL && (
        <video
          controls
          className="w-full aspect-video"
          src={file.masterPlaylistURL}
        ></video>
      )}
    </Modal>
  );
};

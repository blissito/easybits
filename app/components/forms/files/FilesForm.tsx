import { BrutalButton } from "../../common/BrutalButton";
import { SelectInput } from "../SelectInput";
import { useRef, useState, type ChangeEvent } from "react";
import { FilesDropper } from "./FilesDropper";
import { FileList } from "./FileList";
import { motion } from "motion/react";

const getFileArray = (event: any) => {
  let iterable = [];
  let arr = [];
  if (event.dataTransfer?.files?.length > 0) {
    iterable = event.dataTransfer.files;
  } else if (event.currentTarget?.files?.length > 0) {
    iterable = event.currentTarget.files;
  }
  for (let file of iterable) {
    arr.push(file);
  }
  return arr;
};

// @todo size limits
export const FilesForm = ({
  onClose,
}: {
  onClose?: (arg0: File[], arg1: "public-read" | "private") => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [privacy, setPrivacy] = useState("public-read");
  const [files, setFiles] = useState<File[]>([]);
  const isDisabled = files.length < 1;

  const updateFileList = (fileList: File[]) => {
    setFiles((fs) => {
      const fileNames = fs.map((f) => f.name);
      return fs.concat(fileList.filter((nf) => !fileNames.includes(nf.name)));
    });
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleDrop = (event: any /** @todo */) => {
    event.preventDefault();
    updateFileList(getFileArray(event));
  };

  const handleRemove = (index: number) => {
    const filtered = [...files];
    filtered.splice(index, 1);
    setFiles(filtered);
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (!event.currentTarget.files) return;

    updateFileList(getFileArray(event));
  };

  const openFileSelector = () => {
    fileInputRef.current?.click();
  };

  const getTotalSize = () => {
    const totalInBytes = files.reduce((acc, el) => (acc += el.size), 0);
    const MB = 1000000;
    return `${(totalInBytes / MB).toFixed(1)} mb`;
  };

  return (
    <>
      <motion.article
        layoutId="FilesFormModal"
        className="h-full flex flex-col"
      >
        <SelectInput
          value={privacy}
          onChange={(value) => setPrivacy(value)}
          label="privacidad del archivo"
          options={[
            { label: "Privado", value: "private" },
            { label: "Público", value: "public-read" },
          ]}
          error={
            <p className="text-brand-500">
              La privacidad de los archivos es permanente
            </p>
          }
        />
        {files.length < 1 && (
          <FilesDropper onDrop={handleDrop} onClick={handleUploadClick} />
        )}
        {files.length > 0 && (
          <FileList
            onOpenFileSelector={openFileSelector}
            onRemove={handleRemove}
            files={files}
          />
        )}
        <BrutalButton
          onClick={() => onClose?.(files, privacy)}
          isDisabled={isDisabled}
          containerClassName="mt-auto ml-auto my-12"
        >
          + Subir {files.length > 0 ? files.length : null} archivo
          {files.length > 1 ? (
            <>
              {" "}
              {files.length > 1 ? "s" : null} {`(${getTotalSize()})`}
            </>
          ) : null}
        </BrutalButton>
        <input
          onChange={handleFileInputChange}
          multiple
          type="file"
          hidden
          ref={fileInputRef}
        />
      </motion.article>
    </>
  );
};

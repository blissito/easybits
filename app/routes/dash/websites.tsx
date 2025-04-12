import { useState } from "react";
import Spinner from "~/components/common/Spinner";

export default function Page() {
  return (
    <article className="pt-20 px-8 md:pl-36">
      <h1 className="text-2xl font-bold">Tus sitios web estáticos</h1>
      <FolderUploader />
    </article>
  );
}

const FolderUploader = () => {
  const [isLoading, setIsLoading] = useState(false);
  return (
    <main className="p-12 border-2 border-dashed my-3">
      {/* <input type="file" id="input" webkitdirectory mozdirectory /> */}
      <p>Haz Drag and drop del build folder de tu sitio.</p>
      <p>
        O,{" "}
        <button
          className="underline"
          onClick={async () => {
            setIsLoading(true);
            const handle = await showDirectoryPicker();
            const out = {};
            await handleDirectoryEntry(handle, out);
            for await (const entry of handle.values()) {
              console.log("Entry: ", entry);
            }
            console.log("OUT: ", out);
            setIsLoading(false);
          }}
        >
          {isLoading ? <Spinner /> : "  explora entre tus archivos"}
        </button>
      </p>
    </main>
  );
};

async function handleDirectoryEntry(dirHandle, out) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file") {
      const file = await entry.getFile();
      out[file.name] = file;
    }
    if (entry.kind === "directory") {
      const newHandle = await dirHandle.getDirectoryHandle(entry.name, {
        create: false,
      });
      const newOut = (out[entry.name] = {});
      await handleDirectoryEntry(newHandle, newOut);
    }
  }
}

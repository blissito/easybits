import { FaBoxOpen, FaShare } from "react-icons/fa";
import { EditAssetForm } from "./EditAssetForm";
import { FaCopy } from "react-icons/fa6";
import { cn } from "~/utils/cn";

const PADDING_LAYOUT = `pl-10`;

export default function EditAsset() {
  return (
    <article
      className={cn(
        "relative z-10" // hack because of the animated background
      )}
    >
      <h1 className={cn("text-4xl py-4 border-b border-black", PADDING_LAYOUT)}>
        Template UI
      </h1>
      <main className={cn("flex gap-12 justify-evenly", PADDING_LAYOUT)}>
        <EditAssetForm />
        <aside className="h-screen bg-black p-8 text-white sticky top-0 w-[320px]">
          <nav className="flex items-center mb-8 gap-4">
            <h3 className="text-2xl mr-auto">Vista previa</h3>
            <span className="text-xl">
              <FaShare />
            </span>
            <span className="text-xl">
              <FaCopy />
            </span>
            <span className="text-xl">
              <FaBoxOpen />
            </span>
          </nav>
          <img
            className="rounded-2xl"
            src="/public/hero/example1.png"
            alt="template preview"
          />
        </aside>
      </main>
    </article>
  );
}

import { FaBoxOpen, FaCopy, FaShare } from "react-icons/fa";

export const AssetPreview = () => {
  return (
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
  );
};

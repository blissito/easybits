import ClientOnly from "~/components/common/ClientOnly";

export default function EbookReaderPage() {
  return (
    <div>
      <ClientOnly
        load={() => import("./EbookReader")}
        fallback={<div>Loading...</div>}
      />
    </div>
  );
}

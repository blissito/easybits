import ClientOnly from "~/components/common/ClientOnly";
import Spinner from "~/components/common/Spinner";

export default function EbookReaderPage() {
  return (
    <div>
      <ClientOnly
        load={() => import("./EbookReader")}
        fallback={
          <div className="w-full h-screen flex items-center justify-center">
            <Spinner />
          </div>
        }
      />
    </div>
  );
}

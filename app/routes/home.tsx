import { createUserKeys, getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/home";
import { CopyButton } from "~/components/common/CopyButton";
import { useRef, type ChangeEvent } from "react";
import { useUpload } from "~/hooks/useUpload";
import { db } from "~/.server/db";
import { FaRegCheckCircle, FaSpinner } from "react-icons/fa";
import { useLocation, useSubmit } from "react-router";
import { LuFileWarning } from "react-icons/lu";
import { cn } from "~/utils/cn";

export function meta() {
  return [
    { title: "easyBits API" },
    { name: "description", content: "All your files as easy bits" },
  ];
}

// @todo this will be moved to dash maybe
export const loader = async ({ request }: Route.LoaderArgs) => {
  let user = await getUserOrRedirect(request);
  if (!user.publicKey) {
    user = await createUserKeys(user);
  }
  // load assets
  const assets = await db.asset.findMany({
    where: { userId: user.id },
  });
  return { user, assets };
};

export default function Home({ loaderData }: Route.ComponentProps) {
  const { user, assets } = loaderData;
  const fileInput = useRef<HTMLInputElement>(null);
  const submit = useSubmit();

  // files api
  const { putFile, isFetching } = useUpload(
    "fdaa8bf7-20d0-48be-bd94-245f0b488e8c"
  ); // @todo call only when needed

  const handleAssetSelection = () => {
    fileInput.current?.click();
  };

  const handleInputFileChange = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    await putFile(event.currentTarget.files?.[0] as File);
    submit(null);
  };

  return (
    <article className="py-20 flex-col flex  gap-6 min-h-screen mx-6 max-w-4xl">
      <section>
        <h2>Public key</h2>
        <div className="flex gap-2">
          <pre>{user.publicKey}</pre>
          <CopyButton text={user.publicKey as string} />
        </div>
      </section>
      <section>
        <nav className="w-full bg-indigo-500 flex items-center justify-between px-4 py-2">
          <h2>Todos tus assets</h2>
          <button
            disabled={isFetching}
            onClick={handleAssetSelection}
            className={cn(
              "bg-indigo-800 p-3 rounded-2xl",
              "disabled:pointer-events-none disabled:bg-gray-500"
            )}
          >
            {isFetching ? (
              <p className="animate-spin">
                <FaSpinner />
              </p>
            ) : (
              "Nuevo Asset"
            )}
          </button>
          <input
            onChange={handleInputFileChange}
            type="file"
            hidden
            ref={fileInput}
          />
        </nav>
        <>
          {assets.map((asset) => (
            <div
              className="p-3 bg-gray-900 grid grid-cols-4 text-xs"
              key={asset.id}
            >
              <CopyButton
                className="col-span-2"
                text={`https://www.easybits.cloud/embed/video/${asset.storageKey}`}
              >
                <span>{asset.storageKey}</span>
              </CopyButton>
              <p className="flex gap-1 items-center">
                {asset.status}

                {asset.status === "uploaded" ? (
                  <span className="text-green-300">
                    <FaRegCheckCircle />
                  </span>
                ) : (
                  <span className="text-yellow-300">
                    <LuFileWarning />
                  </span>
                )}
              </p>
              <span>{asset.contentType}</span>
            </div>
          ))}
        </>
      </section>
    </article>
  );
}

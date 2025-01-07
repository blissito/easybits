import { createUserKeys, getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/home";
import { CopyButton } from "~/components/common/CopyButton";
import { useRef, type ChangeEvent } from "react";
import { useUpload } from "~/hooks/useUpload";
import { db } from "~/.server/db";
import { FaSpinner } from "react-icons/fa";
import { useSubmit } from "react-router";

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
          <h2>Tabla de assets</h2>
          <button
            onClick={handleAssetSelection}
            className="bg-indigo-800 p-3 rounded-2xl"
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
            <div className="p-3 bg-gray-900 grid grid-cols-2" key={asset.id}>
              <span>{asset.storageKey}</span>
              <span>{asset.status}</span>
            </div>
          ))}
        </>
      </section>
    </article>
  );
}

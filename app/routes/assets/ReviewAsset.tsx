import { useState, type ReactNode } from "react";
import { cn } from "~/utils/cn";
import { getUserOrRedirect } from "~/.server/getters";
import { Modal } from "~/components/common/Modal";
import { db } from "~/.server/db";
import { useLoaderData } from "react-router";
import { FaStar, FaRegStar, FaArrowLeft } from "react-icons/fa6";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  // check you purchased the asset
  // get the asset
  const asset = await db.asset.findUnique({
    where: {
      slug: params.assetSlug,
    },
  });

  return {
    asset,
  };
};

export default function ReviewAsset({}) {
  const [stars, setStars] = useState(0);
  const loaderData = useLoaderData();
  const { asset } = loaderData;
  return (
    <article className="relative">
      <div className="absolute top-0 left-0 flex justify-center items-center p-4 gap-3">
        <FaArrowLeft /> Volver
      </div>
      <Modal
        title={`Qué tal estuvo ${asset?.title}?`}
        isOpen={true}
        onClose={() => {}}
        // mode="naked"
        block={false}
        noCloseButton
      >
        <div>
          <div className="mt-6 mb-10 flex gap-3">
            {Array.from({ length: 5 }, (_, i) => (
              <button
                key={i}
                onClick={() => setStars(i + 1)}
                className="text-5xl"
              >
                {i < stars ? (
                  <FaStar className="text-black" />
                ) : (
                  <FaRegStar className="text-gray-400" />
                )}
              </button>
            ))}
          </div>
          <Input
            type="textarea"
            className="mb-14 h-[182px]"
            inputClassName="h-full"
          />
          <BrutalButton
            containerClassName="w-full"
            className="min-w-full bg-yellow-500 w-full "
          >
            Compartir comentarios
          </BrutalButton>
        </div>
      </Modal>
    </article>
  );
}

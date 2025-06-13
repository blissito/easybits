import { useState, type FormEvent, type ReactNode } from "react";
import { cn } from "~/utils/cn";
import { getUserOrRedirect } from "~/.server/getters";
import { Modal } from "~/components/common/Modal";
import { db } from "~/.server/db";
import { Link, useFetcher, useLoaderData } from "react-router";
import { FaStar, FaRegStar, FaArrowLeft } from "react-icons/fa6";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Controller, useForm } from "react-hook-form";
import { BrendisConfetti } from "~/components/Confetti";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  // check you purchased the asset
  // check you already left a review
  // get the asset
  const asset = await db.asset.findUnique({
    where: {
      slug: params.assetSlug,
    },
  });

  return {
    asset,
    user,
  };
};

export default function ReviewAsset({}) {
  const [stars, setStars] = useState(0);
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const { asset, user } = loaderData;
  const isLoading = fetcher.state !== "idle";
  const isSuccess = fetcher.data?.id;
  const { handleSubmit, control, register, watch } = useForm({});

  const submit = (values) => {
    fetcher.submit(
      {
        intent: "create_review",
        data: JSON.stringify({
          assetId: asset?.id,
          userId: user?.id,
          ...values,
        }),
      },
      {
        method: "post",
        action: "/api/v1/reviews",
      }
    );
  };

  return (
    <article className="relative">
      <div className="absolute top-0 left-0 flex justify-center items-center p-4 gap-3">
        <FaArrowLeft /> Volver
      </div>
      {isSuccess && (
        <div className="text-xl mt-2 md:mt-4 font-bold flex justify-center items-center h-screen">
          <div className="flex flex-col items-center gap-4 text-center">
            {/* <img              
              alt="Thank You"
              className="w-24 h-24"
            /> */}
            <p className="text-3xl">¡Gracias por tu comentario! 🎊</p>
            <p className="font-normal">
              Agradecemos que compartas tu experiencia, tus comentarios ayudan a
              que más personas conozcan lo increíble que es{" "}
              <Link className="" to={`/tienda/${asset.slug}`}>
                {asset?.title}
              </Link>
            </p>
          </div>
        </div>
      )}
      {isSuccess && <BrendisConfetti />}
      <Modal
        title={
          <>
            Qué tal estuvo{" "}
            <Link to={`/tienda/${asset.slug}`}>{asset?.title}</Link>
          </>
        }
        isOpen={!isSuccess}
        onClose={() => {}}
        // mode="naked"
        block={false}
        noCloseButton
      >
        <fetcher.Form onSubmit={handleSubmit(submit)}>
          <div>
            <Controller
              name="rating"
              control={control}
              render={({ field }) => (
                <div className="mt-6 mb-10 flex gap-3" value={field.value}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        field.onChange(i + 1);
                        setStars(i + 1);
                      }}
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
              )}
            />

            <Input
              type="textarea"
              className="mb-14 h-[182px]"
              inputClassName="h-full"
              {...register("comment", { required: true })}
            />
            <BrutalButton
              containerClassName="w-full"
              className="min-w-full bg-yellow-500 w-full "
              type="submit"
              isLoading={isLoading}
            >
              Compartir comentarios
            </BrutalButton>
          </div>
        </fetcher.Form>
      </Modal>
    </article>
  );
}

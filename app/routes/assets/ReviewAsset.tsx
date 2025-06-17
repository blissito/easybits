import { useState, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { getUserOrRedirect } from "~/.server/getters";
import { Modal } from "~/components/common/Modal";
import { db } from "~/.server/db";
import { Link, useFetcher, useLoaderData } from "react-router";
import { FaStar, FaRegStar, FaArrowLeft } from "react-icons/fa6";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Controller, useForm } from "react-hook-form";
import { BrendisConfetti } from "~/components/Confetti";
import { AnimatePresence } from "motion/react";

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
    <article className="relative bg-brand-500 h-screen">
      <div className="relative">
        {/* big lombrices (icons) */}
        <img
          className="fixed left-[117px] top-[266px]"
          src="/images/lombriz1.svg"
        />
        <img
          className="fixed left-[428px] top-[44px]"
          src="/images/lombriz2.svg"
        />
        <img className="fixed left-0 top-[841px]" src="/images/lombriz4.svg" />
        <img
          className="fixed right-[113px] top-[23px]"
          src="/images/lombriz3.svg"
        />
        <img className="fixed right-0 top-[706px]" src="/images/lombriz5.svg" />
        {/* small lombrices (icons) */}
        <img
          className="fixed left-[250px] top-[494px]"
          src="/images/lombriz6.svg"
        />
        <img
          className="fixed left-[212px] top-[681px]"
          src="/images/lombriz7.svg"
        />
        <img
          className="fixed right-[64px] top-[454px]"
          src="/images/lombriz7.svg"
        />
        <img
          className="fixed left-[417px] bottom-[117px]"
          src="/images/lombriz8.svg"
        />
        <img
          className="fixed right-[537px] top-[91px]"
          src="/images/lombriz9.svg"
        />
        <img
          className="fixed right-[232px] top-[228px]"
          src="/images/lombriz10.svg"
        />
        <img
          className="fixed right-[250px] top-[360px]"
          src="/images/lombriz11.svg"
        />
        <img
          className="fixed left-[731px] bottom-[31px]"
          src="/images/lombriz13.svg"
        />
        <img
          className="fixed right-[136px] bottom-[37px]"
          src="/images/lombriz14.svg"
        />
      </div>
      <Link className="" to={`/tienda/${asset.slug}`}>
        <div className="absolute top-0 left-0 flex justify-center items-center p-4 gap-3 cursor-pointer">
          <FaArrowLeft /> Volver
        </div>
      </Link>
      {isSuccess && (
        <div className="text-xl font-bold flex justify-center items-center h-screen">
          <div className="flex flex-col items-center gap-4 text-center">
            <img
              alt="Thank You"
              className="w-48 h-48"
              src="/images/star-comments.png"
            />
            <p className="text-3xl">¡Gracias por tu comentario!</p>
            <p className="font-normal w-[408px]">
              Agradecemos que compartas tu experiencia, tus comentarios ayudan a
              que más personas conozcan lo increíble que es{" "}
              <Link className="" to={`/tienda/${asset.slug}`}>
                {asset?.title}
              </Link>
              .
            </p>
            <button
              className="mt-4 px-6 py-2 bg-yellow-500 text-black rounded-lg hover:bg-yellow-600 transition-colors"
              onClick={() => window.location.reload()}
            >
              Volver
            </button>
          </div>
        </div>
      )}
      {isSuccess && <BrendisConfetti />}
      {!isSuccess && (
        <div className="flex justify-center items-center h-screen">
          <div className="w-[488px] p-6 md:p-8 rounded-xl border-2 border-black bg-white relative">
            <img
              className="mx-3 w-20 absolute right-[13px] top-[-40px]"
              src="/images/logo-glasses-y.png"
            />
            <h2 className="text-2xl md:text-3xl font-semibold mb-6">
              Qué tal estuvo{" "}
              <Link
                className="text-brand-500 underline underline-offset-4"
                to={`/tienda/${asset.slug}`}
              >
                {asset?.title}
              </Link>
              ?
            </h2>
            <fetcher.Form onSubmit={handleSubmit(submit)}>
              <div>
                <Controller
                  name="rating"
                  control={control}
                  render={({ field }) => (
                    <div className="mt-6 mb-10 flex gap-3">
                      <AnimatePresence>
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
                              <motion.div
                                key={`filled-${i}`}
                                initial={{ scale: 1 }}
                                animate={{ scale: 1.2 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 300,
                                  damping: 10,
                                }}
                              >
                                <FaStar className="text-black" />
                              </motion.div>
                            ) : (
                              <motion.div
                                key={`empty-${i}`}
                                initial={{ scale: 1.2 }}
                                animate={{ scale: 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 300,
                                  damping: 10,
                                }}
                              >
                                <FaRegStar className="text-gray-400" />
                              </motion.div>
                            )}
                          </button>
                        ))}
                      </AnimatePresence>
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
          </div>
        </div>
      )}
    </article>
  );
}

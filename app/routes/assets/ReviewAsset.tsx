import { useState, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import { getUserOrRedirect } from "~/.server/getters";
import { db } from "~/.server/db";
import { Link, redirect, useFetcher, useLoaderData } from "react-router";
import {FaArrowLeft } from "react-icons/fa6";
import { Input } from "~/components/common/Input";
import { BrutalButton } from "~/components/common/BrutalButton";
import { Controller, useForm } from "react-hook-form";
import { BrendisConfetti } from "~/components/Confetti";
import { AnimatePresence } from "motion/react";
import type { Route } from "../tienda/+types/review";

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const user = await getUserOrRedirect(request);
  
  // Obtener el asset
  const assetData = await db.asset.findUnique({
    where: {
      slug: params.assetSlug,
    },
  });

  if (!assetData) {
    throw new Response("Asset no encontrado", { status: 404 });
  }

  // Verificar si el usuario ya dejó una review para este asset
  const existingReview = await db.review.findFirst({
    where: {
      userId: user.id,
      assetId: assetData.id,
    },
  });


  if (existingReview) {
    return redirect(`/compras/${assetData.id}`)
  }

  return {
    asset: assetData,
    user,
  };
};

interface ReviewFormValues {
  stars: number;
  comment: string;
}

export default function ReviewAsset({}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const { asset, user } = loaderData;
  const isLoading = fetcher.state !== "idle";
  const isSuccess = fetcher.data?.id;
  const { handleSubmit, control, register } = useForm<ReviewFormValues>();

  const submit = (values: ReviewFormValues) => {
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

  const isCommentNotSet = comment.length < 12;
  const isRankNotSet = stars < 1;
  const isDisabled = isCommentNotSet || isRankNotSet;

  return (
    <article className="relative overflow-hidden bg-brand-500 min-h-[640px] h-screen px-4 md:px-[5%] xl:px-0 ">
      <div className="relative z-10">
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
          className="fixed left-[320px] top-[491px]"
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
          className="fixed right-[340px] top-[360px]"
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

      {isSuccess && (
        <div className="relative z-20 text-xl font-bold flex justify-center items-center h-screen px-4 md:px-[5%] xl:px-0">
          <div className="flex flex-col items-center gap-4 text-center">
            <motion.img
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              alt="Thank You"
              className="w-48 h-48 relative z-30 opacity-0"
              src="/images/star-comments.png"
            />
            <motion.p
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="text-3xl"
            >
              ¡Gracias por tu comentario!
            </motion.p>
            <motion.p
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="font-normal max-w-2xl mb-8"
            >
              Agradecemos que compartas tu experiencia, tus comentarios ayudan a
              que más personas conozcan lo increíble que es{" "}
              <Link className="font-bold" to={`/tienda/${asset.slug}`}>
                «{asset?.title}»
              </Link>
              .
            </motion.p>
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Link to={`/compras/${asset.id}/`}>
                <BrutalButton
                type="button"
                  className="bg-white"
                  // onClick={() => window.location.reload()}
                >
                  Volver
                </BrutalButton>
              </Link>
            </motion.div>
          </div>
          <BrendisConfetti />
        </div>
      )}
      {!isSuccess && (
        <>
          <Link to={`/compras/${asset.id}/`}>
            <div className="absolute top-4 left-20  flex justify-center items-center p-3 gap-3 cursor-pointer">
              <FaArrowLeft /> Volver
            </div>
          </Link>
          <div className="flex justify-center h-full items-center ">
            <div className="w-[488px] p-6 md:p-8 rounded-xl border-2 border-black bg-white relative">
              <img
                className="mx-3 w-20 absolute right-[13px] top-[-40px]"
                src="/images/logo-glasses-y.png"
              />
              <h2 className="text-2xl md:text-2xl font-semibold mb-6">
                ¿Qué tal estuvo{" "}
                <span className="text-brand-500 ">{asset?.title}</span>?
              </h2>
              <fetcher.Form onSubmit={handleSubmit(submit)}>
                <div>
                  <Controller
                    name="rating"
                    control={control}
                    render={({ field }) => (
                      <div className="mt-6 mb-8 flex gap-3 ">
                        <AnimatePresence>
                          {Array.from({ length: 5 }, (_, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                field.onChange(i + 1);
                                setStars(i + 1);
                              }}
                              className="text-5xl"
                            >
                              {i < stars ? (
                                <motion.div
                                  key={`filled-${i}`}
                                  whileTap={{ scale: 1.1, opacity: 1 }}
                                  whileHover={{ scale: 1.1 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 10,
                                  }}
                                >
                                  <img
                                    className="h-12 w-12 pointer-events-none"
                                    src="/icons/star.svg"
                                  />
                                </motion.div>
                              ) : (
                                <motion.div
                                  key={`empty-${i}`}
                                  initial={{ scale: 0.5, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  whileHover={{ scale: 1.1 }}
                                  transition={{
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 10,
                                    repeat: 0,
                                  }}
                                >
                                  <img
                                    className="h-12 w-12 pointer-events-none"
                                    src="/icons/star-empty.svg"
                                  />
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
                    placeholder="Déjale un comentario al creador"
                    className="mb-14 h-[182px]"
                    inputClassName="h-full"
                    {...register("comment", {
                      required: true,
                      onChange(e) {
                        setComment(e.currentTarget.value);
                      },
                    })}
                  />
                  <BrutalButton
                    containerClassName="w-full"
                    className="min-w-full bg-yellow-500 w-full "
                    type="submit"
                    isLoading={isLoading}
                    isDisabled={isDisabled}
                  >
                    Enviar comentarios
                  </BrutalButton>
                </div>
              </fetcher.Form>
            </div>
          </div>
        </>
      )}
    </article>
  );
}

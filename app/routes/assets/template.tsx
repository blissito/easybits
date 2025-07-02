import { AiFillInstagram } from "react-icons/ai";
import {
  FaFacebookF,
  FaLink,
  FaLinkedin,
  FaTiktok,
  FaYoutube,
  FaXTwitter,
} from "react-icons/fa6";
import { Avatar } from "~/components/common/Avatar";
import { Tag } from "~/components/common/Tag";
import { ProductGallery } from "~/components/galleries/ProductGallery";
import { Link, useFetcher } from "react-router";
import { cn } from "~/utils/cn";
import type { Asset, File, User } from "@prisma/client";
import type { FormEvent, ReactNode } from "react";
import Markdown from "~/components/common/Markdown";
import { Input } from "~/components/common/Input";
import { EmojiConfetti } from "~/components/Confetti";
import { useFetcherSubmit } from "~/hooks/useFetcherSubmit";
import { useOpenLink } from "~/hooks/useOpenLink";
import { motion } from "motion/react";
import { useState } from "react";
import { Modal } from "~/components/common/Modal";

export const ContentTemplate = ({
  asset,
  files = [],
  actionButton,
  reviews,
  assetReviews = [],
}: {
  actionButton?: ReactNode;
  files?: File[];
  asset: Asset & { user: User };
  reviews: any;
  assetReviews?: any[];
}) => {
  return (
    <section
      className={cn("border-b-0 border-black", "md:border-b-[2px]")}
      style={{ fontFamily: asset.user?.storeConfig?.typography }}
    >
      <div className="max-w-7xl mx-auto border-x-none md:border-x-[2px] border-black bg-white">
        <ProductGallery
          className="bg-white"
          items={asset.gallery.map((src) => ({
            src,
          }))}
        />
        <div className="grid grid-cols-8 border-t-[2px] border-black">
          <div
            className={cn(
              "col-span-8 md:col-span-5 border-r-0  border-black ",
              "md:border-r-[2px]"
            )}
          >
            <Bragging
              asset={asset}
              reviews={reviews}
              assetReviews={assetReviews}
            />
            {asset.description ? (
              <div className={cn("h-fit px-4 pb-4", "md:px-6 md:pb-6")}>
                <Markdown>{asset.description}</Markdown>
              </div>
            ) : null}
          </div>
          <Info
            files={files}
            asset={asset}
            actionButton={actionButton}
            reviews={reviews}
            assetReviews={assetReviews}
            freeSubscriptionComponent={
              Number(asset.price || 0) === 0 && <Subscription asset={asset} />
            }
          />
        </div>
      </div>
    </section>
  );
};

const ReviewsModal = ({
  isOpen,
  onClose,
  assetReviews = [],
}: {
  isOpen: boolean;
  onClose: () => void;
  assetReviews?: any[];
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Echa un vistazo a los comentarios"
    >
      <div className="space-y-0 max-h-[60vh] overflow-y-auto mt-2 scrollbar-hide-reviews">
        {(assetReviews || [])
          .slice()
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .map((review, idx, array) => (
            <div
              key={idx}
              className={
                idx === array.length - 1 ? "" : "border-b border-black"
              }
            >
              <ReviewCard review={review} />
            </div>
          ))}
      </div>
    </Modal>
  );
};

const Bragging = ({
  asset = {},
  reviews,
  assetReviews = [],
}: {
  asset: Asset;
  reviews?: any;
  assetReviews?: any[];
}) => {
  const { typography } = asset.user?.storeConfig || {};
  const [open, setOpen] = useState(false);

  const getTypeOfBrag = () => {
    switch (asset.type) {
      case "WEBINAR":
        return "inscritos";
      default:
        return "desc.";
    }
  };

  const calculateAverageRating = (reviews: any) => {
    if (!reviews?.total || !reviews?.byRating) return 0;

    const totalRating = Object.entries(reviews.byRating).reduce(
      (acc, [rating, count]) => {
        return acc + parseInt(rating) * (count as number);
      },
      0
    );

    return (totalRating / reviews.total).toFixed(1);
  };

  const handleOpen = () => {
    // Only open modal if there are reviews available
    const hasReviews =
      (reviews?.total && reviews.total > 0) ||
      (assetReviews && assetReviews.length > 0);
    if (hasReviews) {
      setOpen(true);
    }
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <main
        className="grid grid-cols-12 h-fit md:h-16 border-b-[2px] border-black"
        style={{ fontFamily: typography }}
      >
        {asset.tags.length === 0 ? null : (
          <>
            <section
              style={{
                scrollbarWidth: "none",
              }}
              className={cn(
                "overflow-scroll",
                "flex items-center px-4 gap-2 text-left h-10 border-b-2 border-black md:border-none ",
                "col-span-12 md:col-span-8 md:px-6 md:h-full md:border-transparent"
              )}
            >
              {asset.tags
                .trim()
                .split(",")
                .map((tag, i) => (
                  <Tag
                    className="h-6 md:h-8"
                    variant="outline"
                    label={tag}
                    key={i}
                  />
                ))}
            </section>
          </>
        )}

        <section
          className={cn(
            "h-10  px-3 flex items-center  gap-2 overflow-hidden ",
            "md:h-full border-l-2 border-black col-span-6 md:col-span-2",
            {
              "border-l-0": asset.tags.length === 0,
            }
          )}
        >
          {
            <p>
              {asset.extra?.showSold ? asset.extra?.sold : 0} {getTypeOfBrag()}
            </p>
          }
          <img src="/icons/download.svg" alt="download" />
        </section>
        {asset.extra?.showReviews && (
          <section
            id="reviewsRank-open-button"
            className={cn(
              " overflow-hidden px-3 col-span-6 md:col-span-2 flex border-l-2 border-black items-center gap-2",
              {
                "cursor-pointer hover:bg-gray-100 transition-colors":
                  (reviews?.total && reviews.total > 0) ||
                  (assetReviews && assetReviews.length > 0),
              }
            )}
            onClick={handleOpen}
          >
            <p
              id="reviewsRank-open-button"
              className="underline underline-offset-4"
            >
              {calculateAverageRating(reviews)}
            </p>
            {/* @todo This should be a svg */}
            <img
              id="reviewsRank-open-button"
              className="w-6"
              src="/icons/star.png"
              alt="star"
            />
          </section>
        )}
      </main>
      <ReviewsModal
        isOpen={open}
        onClose={handleClose}
        assetReviews={assetReviews}
      />
    </>
  );
};

const Info = ({
  files = [],
  asset,
  actionButton,
  reviews,
  assetReviews = [],
  freeSubscriptionComponent = null,
}: {
  freeSubscriptionComponent?: ReactNode;
  actionButton?: ReactNode;
  asset: Asset & { user: User };
  files?: File[];
  reviews: any;
  assetReviews?: any[];
}) => {
  const text = asset.template?.ctaText
    ? asset.template.ctaText
    : (asset.price || 0) <= 0
    ? "Suscribirse gratis"
    : "Comprar";

  const getPriceString = () => `$${asset.price} ${asset.currency}`;
  const { typography } = asset?.user?.storeConfig || {};
  return (
    <div
      style={{ fontFamily: typography }}
      className={cn("col-span-8 ", "md:col-span-3 md:border-t-0")}
    >
      <div
        className={cn(
          "h-[62px] border-y-[0px] bg-black border-black  place-content-center hidden",
          "md:grid"
        )}
      >
        <h3 className="text-2xl font-bold text-white">{getPriceString()} </h3>
      </div>
      {freeSubscriptionComponent}
      <div className="hidden md:block">{actionButton}</div>
      {/* Only show note if asset.note exists */}
      {asset.note && (
        <div className="h-fit p-3 border-b-[2px] border-black content-center">
          {asset.note}
        </div>
      )}
      {asset.type === "WEBINAR" ? (
        <WebinarDetails asset={asset} />
      ) : asset.type === "EBOOK" ? (
        <EbookDetails asset={asset} files={files} />
      ) : (
        <Formats
          files={files}
          asset={asset}
          reviews={reviews}
          assetReviews={assetReviews}
        />
      )}
      <ReviewsSection
        reviews={reviews}
        asset={asset}
        assetReviews={assetReviews}
      />
    </div>
  );
};

const Subscription = ({
  asset,
  actionId,
  text = "Suscribirme gratis",
}: {
  text?: string;
  actionId?: string;
  asset: Asset;
}) => {
  const { hexColor, typography } = asset?.user?.storeConfig || {};
  const fetcher = useFetcher();
  const isLoading = fetcher.state !== "idle";

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = Object.fromEntries(new FormData(e.currentTarget));
    // @todo validate form urgent! if see this, please fix it.
    fetcher.submit(
      new URLSearchParams({
        ...form,
        intent: "free_subscription",
        assetId: asset.id,
        actionId: actionId || "",
      }),
      {
        method: "post",
        action: "/api/v1/user",
      }
    );
  };

  if (fetcher.data?.success) {
    return (
      <section
        className="flex flex-col justify-center items-center text-xl p-6 border-black border-b-2"
        style={{ fontFamily: typography }}
      >
        <h2>¡Gracias por suscribirte!</h2>
        <br />
        <p>Ahora revisa tu correo. 📬</p>
        <EmojiConfetti />
      </section>
    );
  }

  // hidden on mobile
  return (
    <fetcher.Form onSubmit={handleSubmit} className="hidden md:block">
      <Input
        placeholder="Escribe tu nombre"
        name="displayName"
        inputClassName="border-0 border-t-2 border-b-2 h-16 rounded-none focus:ring-0 focus:border-black"
      />
      <Input
        required
        placeholder="Escribe tu email"
        name="email"
        className="min-h-full m-0"
        inputClassName="border-0 border-b-2 h-16 rounded-none focus:ring-0 focus:border-black"
      />
      <button
        disabled={isLoading}
        type="submit"
        className={cn(
          "hidden md:grid h-16 w-full text-2xl font-bold border-b-[2px] bg-[#CE95F9] border-black place-content-center disabled:text-gray-500 disabled:bg-gray-400/40"
        )}
        style={{ background: hexColor, fontFamily: typography }}
      >
        {text}
      </button>
    </fetcher.Form>
  );
};

const EbookDetails = ({ asset, files }: { asset: Asset; files: File[] }) => {
  const getSizeInMB = () => {
    const bytes = files.reduce((acc, f) => (acc = acc + f.size), 0);
    return (bytes / 1_000_000).toFixed(2) + " mb";
  };
  const { typography } = asset?.user?.storeConfig || {};
  return (
    <section style={{ fontFamily: typography }}>
      <AttributeList
        textLeft="Número de páginas"
        textRight={asset.metadata?.numberOfPages}
      />
      <AttributeList
        textLeft="Formatos:"
        textRight={files.map((f) => f.name.split(".")[1]).join(", ")}
      />
      <AttributeList textLeft="Peso:" textRight={getSizeInMB()} />
    </section>
  );
};

const WebinarDetails = ({ asset }: { asset: Asset }) => {
  const { typography } = asset?.user?.storeConfig || {};
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });
  };
  return (
    <section style={{ fontFamily: typography }}>
      <AttributeList
        textLeft="No. de sesiones"
        textRight={asset.metadata?.numberOfSessions}
      />

      <AttributeList
        textLeft="Modalidad"
        textRight={
          <div className="flex gap-2 items-center">
            {" "}
            <div className="relative w-3 h-3">
              <div className=" rounded-full absolute inset-0 blur-sm animate-pulse" />
              <div className="bg-red-500 rounded-full absolute inset-[.1px]" />
            </div>
            En vivo
          </div>
        }
      />

      <AttributeList textLeft="Fecha" textRight={formatDate(asset.eventDate)} />
    </section>
  );
};

const ReviewCard = ({ review }: { review: any }) => {
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
    });
  };

  return (
    <div className=" py-4  flex flex-col gap-3">
      <div className="text-sm">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }, (_, index) => (
            <img
              key={index}
              src={
                index < review.rating
                  ? "/icons/star.png"
                  : "/icons/star-empty.svg"
              }
              alt="star"
              className="w-4 h-4"
            />
          ))}
          {review.createdAt && (
            <div className="text-xs text-metal ml-1">
              {formatDate(review.createdAt)}
            </div>
          )}
        </div>
        <p className="text-base mt-1">{review.comment}</p>
      </div>
      <div className="flex items-center justify-start gap-0">
        <img
          src={review.user?.picture}
          className="w-5 h-5 border-r-2 border-b-2 border-black rounded-full"
          alt="avatar"
        />
        <span className="text-xs text-gray-500 ml-1">
          {review.user?.displayName || review.user?.email || "Anónimo"}
        </span>
      </div>
    </div>
  );
};

const ReviewsSection = ({
  reviews,
  assetReviews = [],
  asset,
}: {
  reviews: any;
  assetReviews?: any[];
  asset: any;
}) => {
  const [open, setOpen] = useState(false);

  if (!reviews?.total || reviews.total === 0 || !asset?.extra?.showReviews) {
    return null;
  }

  // Handler to open modal
  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <>
      <div
        id="reviews-open-button"
        className="border-b-[2px] border-black p-3 cursor-pointer"
        onClick={handleOpen}
      >
        <p className="mb-4">Qué opinan la comunidad:</p>
        {Object.keys(reviews?.byRating || {})
          .sort((a, b) => b - a)
          .map((n, index) => {
            const percentage = (reviews.byRating[n] * 100) / reviews.total;

            return (
              <div
                id="reviews-open-button"
                key={n}
                className="grid gap-6  grid-cols-9 mb-3 items-center"
              >
                <div
                  id="reviews-open-button"
                  className="col-span-1 flex gap-1 items-center"
                >
                  {" "}
                  <img
                    id="reviews-open-button"
                    src="/icons/star.png"
                    alt="star"
                    className="w-4 h-4"
                  />
                  {n}
                </div>
                <div id="reviews-open-button" className="col-span-8">
                  <div
                    id="reviews-open-button"
                    className="bg-gray-200 h-[28px] rounded-lg w-full border border-black"
                  >
                    <motion.div
                      id="reviews-open-button"
                      className="bg-black h-full rounded"
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{
                        duration: 0.8,
                        delay: 0.3 + index * 0.05,
                      }}
                    />
                  </div>
                  <div />
                </div>
              </div>
            );
          })}
      </div>
      <ReviewsModal
        isOpen={open}
        onClose={handleClose}
        assetReviews={assetReviews}
      />
    </>
  );
};

const Formats = ({
  files,
  asset,
  reviews = {},
  assetReviews = [],
}: {
  files: File[];
  asset: {};
  reviews: {};
  assetReviews?: any[];
}) => {
  const getSizeInMB = () => {
    const bytes = files.reduce((acc, f) => (acc = acc + f.size), 0);
    return (bytes / 1_000_000).toFixed(2) + " mb";
  };
  const { typography } = asset?.user?.storeConfig || {};

  return (
    <div style={{ fontFamily: typography }}>
      <AttributeList textLeft="Número de archivos:" textRight={files.length} />
      <AttributeList
        textLeft="Formatos:"
        textRight={files.map((f) => f.name.split(".")[1]).join(", ")}
      />
      <AttributeList textLeft="Peso:" textRight={getSizeInMB()} />
    </div>
  );
};

export const FooterTemplate = ({
  form,
  asset,
}: {
  form: (arg0: { isLoading: boolean }) => ReactNode;
  asset: Asset;
}) => {
  const { handleSubmit, isLoading, success, message } = useFetcherSubmit({
    action: "/api/v1/user",
    intent: "free_subscription",
    assetId: asset.id,
  });

  return (
    <>
      <section
        className={cn(
          "flex gap-1 items-center h-fit pb-16 justify-center border-b-[2px] border-black ",
          " md:h-10 md:pb-0 "
        )}
      >
        <span className="text-sm">Powered by</span>
        <img alt="isotipo easybits" className="w-6" src="/logo-purple.svg" />
        <Link to="/" className="mt-1">
          <img alt="isotipo easybits" src="/logo-eb.svg" />{" "}
        </Link>
      </section>
      {success ? message : form({ isLoading, handleSubmit })}
    </>
  );
};

export const HeaderTemplate = ({
  className,
  asset,
}: {
  className?: string;
  asset: Asset;
}) => {
  const title = asset.title || "+20 Praga pack";
  const authorName = asset.user.displayName || "Sin nombre";
  const {
    instagram,
    facebook,
    x,
    youtube,
    website,
    linkedin,
    tiktok,
    hexColor,
    typography,
    logoImage,
    socialNetworks,
  } = asset?.user?.storeConfig || {};
  const authorPic = asset.user?.picture || logoImage || "Sin nombre";
  // const storeLink = {`${user?.host}.easybits.cloud/tienda`}

  const { handleOpenLink } = useOpenLink({
    localLink: `http://${asset.user.host}.localhost:3000/tienda/`,
    publicLink: `https://${asset.user.host}.easybits.cloud/tienda/`,
  });
  return (
    <section
      className={cn("border-b-[2px] border-black bg-[#CE95F9]", className)}
      style={{ background: hexColor, fontFamily: typography }}
    >
      <div className="border-b-[2px] border-black h-16">
        <div className="max-w-7xl mx-auto border-x-0 md:border-x-[2px] h-16 border-black px-4 flex justify-between ">
          <button onClick={handleOpenLink}>
            <div className="flex gap-2 items-center h-full">
              <Avatar src={authorPic} />{" "}
              <h3 className="underline font-bold">{authorName}</h3>
            </div>{" "}
          </button>

          {socialNetworks && (
            <div className="flex items-center gap-3">
              {instagram && (
                <Link to={instagram}>
                  <AiFillInstagram className="text-black text-xl hover:scale-90 cursor-pointer transition-all" />
                </Link>
              )}
              {facebook && (
                <Link to={facebook}>
                  <FaFacebookF className="text-black text-lg hover:scale-90 cursor-pointer transition-all" />
                </Link>
              )}
              {x && (
                <Link to={x}>
                  <FaXTwitter className="text-black text-lg hover:scale-90 cursor-pointer transition-all" />
                </Link>
              )}
              {youtube && (
                <Link to={youtube}>
                  <FaYoutube className="text-black text-xl hover:scale-90 cursor-pointer transition-all" />
                </Link>
              )}
              {tiktok && (
                <Link to={tiktok}>
                  <FaTiktok className="text-black text-lg hover:scale-90 cursor-pointer transition-all" />
                </Link>
              )}
              {linkedin && (
                <Link to={linkedin}>
                  <FaLinkedin className="text-black text-lg hover:scale-90 cursor-pointer transition-all" />
                </Link>
              )}
              {website && (
                <Link to={website}>
                  <FaLink className="text-black text-lg hover:scale-90 cursor-pointer transition-all" />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="max-w-7xl mx-auto border-x-0 md:border-x-[2px] border-black px-4 flex justify-between h-fit py-6 md:py-9 relative ">
        <img
          className="absolute right-96 bottom-0"
          src="/icons/waves.svg"
          alt="waves"
        />
        <img
          className="absolute right-[40%] top-0 w-10 md:w-auto"
          src="/icons/navajo.svg"
          alt="circles"
        />
        <img
          className="absolute right-[30%] md:right-[60%] bottom-0"
          src="/icons/curved.svg"
          alt="rombos"
        />
        <img
          className="w-6 md:w-10 absolute right-[10%] bottom-10"
          src="/home/star.svg"
          alt="star"
        />
        <h2
          className="text-3xl md:text-4xl xl:text-5xl font-bold"
          style={{ fontFamily: typography }}
        >
          {title}
        </h2>
      </div>
    </section>
  );
};

const AttributeList = ({
  textLeft,
  textRight,
}: {
  textLeft: string;
  textRight: ReactNode;
}) => {
  return (
    <section className="border-b-[2px] border-black flex justify-between p-3 gap-3">
      <p className="min-w-max">{textLeft}</p>
      <div className="max-w-[420px]">{textRight}</div>
    </section>
  );
};

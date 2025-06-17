import { AiFillInstagram } from "react-icons/ai";
import {
  FaFacebookF,
  FaInstagram,
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
import type { Asset, File } from "@prisma/client";
import type { FormEvent, ReactNode } from "react";
import Markdown from "~/components/common/Markdown";
import { Input } from "~/components/common/Input";
import { EmojiConfetti } from "~/components/Confetti";
import { useFetcherSubmit } from "~/hooks/useFetcherSubmit";
import PaymentModal from "./PaymentModal";
import { usePublicLink } from "~/hooks/usePublicLink";
import { useOpenLink } from "~/hooks/useOpenLink";

export const ContentTemplate = ({
  asset,
  stripePromise,
  checkoutSession,
  files = [],
  actionButton,
  reviews,
}: {
  actionButton?: ReactNode;
  files?: File[];
  asset: Asset;
}) => {
  const { typography } = asset?.user?.storeConfig || {};
  return (
    <section
      className={cn("border-b-0 border-black", "md:border-b-[2px]")}
      style={{ fontFamily: typography }}
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
            <Bragging asset={asset} />
            <div className={cn("h-fit p-4", "md:p-6")}>
              <Markdown>{asset.description}</Markdown>
            </div>
          </div>
          <Info
            files={files}
            asset={asset}
            typography={typography}
            stripePromise={stripePromise}
            checkoutSession={checkoutSession}
            actionButton={actionButton}
            reviews={reviews}
          />
        </div>
      </div>
    </section>
  );
};

const Bragging = ({ asset = {} }: { asset: Asset }) => {
  const { typography } = asset.user?.storeConfig || {};
  const getTypeOfBrag = () => {
    switch (asset.type) {
      case "WEBINAR":
        return "inscritos";
      default:
        return "descargas";
    }
  };
  return (
    <main
      className="grid grid-cols-10 h-fit md:h-16 border-b-[2px] border-black"
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
              "col-span-10 md:col-span-7 md:px-6 md:h-full md:border-transparent"
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
          "min-w-max",
          "h-10  px-3 flex items-center  gap-2",
          "md:h-full border-l-2 border-black col-span-5 md:col-span-2",
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
          className={cn(
            "min-w-max px-3 col-span-5 md:col-span-1 flex border-l-2 border-black items-center gap-2"
          )}
        >
          <p className="underline">
            {/* @todo map reviews */}
            {asset.extra?.reviews || 4.7}
          </p>
          {/* @todo This should be a svg */}
          <img className="w-6" src="/icons/star.png" alt="star" />
        </section>
      )}
    </main>
  );
};

const Info = ({
  files = [],
  asset,
  stripePromise,
  checkoutSession,
  actionButton,
  typography,
  reviews,
}: {
  actionButton?: ReactNode;
  asset: Asset;
  files?: File[];
  typography: string;
}) => {
  const text = asset.template?.ctaText
    ? asset.template.ctaText
    : asset.price <= 0
    ? "Suscribirse gratis"
    : "Comprar";

  const getPriceString = () => `$${asset.price} ${asset.currency}`;
  return (
    <div
      style={{ fontFamily: typography }}
      className={cn(
        "col-span-8 border-t-[2px] border-black",
        "md:col-span-3 md:border-t-0"
      )}
    >
      <div
        className={cn(
          "h-[62px] border-y-[0px] bg-black border-black  place-content-center hidden",
          "md:grid"
        )}
      >
        <h3 className="text-2xl font-bold text-white">{getPriceString()} </h3>
      </div>
      {asset.price <= 0 && <Subscription asset={asset} text={text} />}

      {asset.price > 0 && (
        <PaymentModal
          stripePromise={stripePromise}
          asset={asset}
          checkoutSession={checkoutSession}
          text={text}
        />
      )}
      {actionButton}

      <div className="h-fit p-3 border-b-[2px] border-black content-center">
        {asset.note}
      </div>
      {asset.type === "WEBINAR" ? (
        <WebinarDetails asset={asset} />
      ) : (
        <Formats files={files} asset={asset} reviews={reviews} />
      )}
    </div>
  );
};

const Subscription = ({
  asset,
  actionId,
  text,
}: {
  actionId?: string;
  asset: Asset;
}) => {
  const { hexColor, typography } = asset?.user?.storeConfig || {};
  const fetcher = useFetcher();
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);

    formData.set("intent", "free_subscription");
    formData.set("assetId", asset.id);
    formData.set("actionId", actionId);

    fetcher.submit(formData, {
      method: "post",
      action: "/api/v1/user",
    });
  };

  const isLoading = fetcher.state !== "idle";

  if (fetcher.data?.success) {
    return (
      <section
        className="flex flex-col justify-center items-center text-xl h-[100px] pt-12"
        style={{ fontFamily: typography }}
      >
        <h2>¡Gracias por suscribirte!</h2>
        <br />
        <p>Ahora revisa tu correo. 📬</p>
        <EmojiConfetti />
      </section>
    );
  }

  return (
    // hidden on mobile
    <fetcher.Form onSubmit={handleSubmit} className="hidden md:block">
      <Input
        placeholder="Escribe tu nombre"
        name="displayName"
        inputClassName="border-0 border-b-2 rounded-none"
      />
      <Input
        required
        placeholder="Escribe tu email"
        name="email"
        className="min-h-full m-0"
        inputClassName="border-0 border-b-2 rounded-none"
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

const WebinarDetails = ({ asset }: { asset: Asset }) => {
  const { typography } = asset?.user?.storeConfig || {};
  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("es-MX", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
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
              <div className="bg-pink-500 rounded-full absolute inset-0 blur-sm animate-pulse" />
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

const Formats = ({
  files,
  asset,
  reviews = {},
}: {
  files: File[];
  asset: {};
  reviews: {};
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
        textRight={files.map((f) => `${f.name.split(".")[1]}, `)}
      />
      <AttributeList textLeft="Peso:" textRight={getSizeInMB()} />

      <div className="border-b-[2px] border-black p-3">
        <p className="mb-4">Evaluaciones:</p>
        {Object.keys(reviews?.byRating || {})
          .sort((a, b) => b - a)
          .map((n) => {
            const percentage = (reviews.byRating[n] * 100) / reviews.total;

            return (
              <div className="grid gap-3 grid-cols-12 mb-3 items-center">
                <div className="col-span-3">{n} Estrellas</div>
                <div className="col-span-9">
                  <div className="bg-gray-200 h-[28px] rounded-lg w-full border border-black">
                    <div
                      className="bg-black h-full rounded-lg"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};

export const FooterTemplate = ({
  form,
}: {
  form: (arg0: { isLoading: boolean }) => ReactNode;
}) => {
  const { handleSubmit, isLoading, success, message } = useFetcherSubmit({
    action: "/api/v1/user",
    intent: "free_subscription",
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

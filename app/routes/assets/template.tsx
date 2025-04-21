import { AiFillInstagram } from "react-icons/ai";
import { FaFacebookF, FaLink, FaTiktok, FaYoutube } from "react-icons/fa";
import { RiTwitterXFill } from "react-icons/ri";
import { Avatar } from "~/components/common/Avatar";
import { Tag } from "~/components/common/Tag";
import { ProductGallery } from "~/components/galleries/ProductGallery";
import { Form, Link, useFetcher } from "react-router";
import { cn } from "~/utils/cn";
import { BrutalButton } from "~/components/common/BrutalButton";
import type { Asset } from "@prisma/client";
import type { FormEvent, ReactNode } from "react";
import Markdown from "~/components/common/Markdown";
import { Input } from "~/components/common/Input";
import { EmojiConfetti } from "~/components/Confetti";
import { useFetcherSubmit } from "~/hooks/useFetcherSubmit";
import PaymentModal from "./PaymentModal";

export const ContentTemplate = ({
  asset,
  stripePromise,
  checkoutSession,
}: {
  asset: Asset;
}) => {
  return (
    <section className={cn("border-b-0 border-black", "md:border-b-[2px]")}>
      <div className="max-w-7xl mx-auto border-x-none md:border-x-[2px] border-black">
        <ProductGallery
          className="bg-black"
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
            asset={asset}
            stripePromise={stripePromise}
            checkoutSession={checkoutSession}
          />
        </div>
      </div>
    </section>
  );
};

const Bragging = ({ asset = {} }: { asset: Asset }) => {
  const getTypeOfBrag = () => {
    switch (asset.type) {
      case "WEBINAR":
        return "inscritos";
      default:
        return "descargas";
    }
  };
  return (
    <main className="grid grid-cols-10 h-fit md:h-16 border-b-[2px] border-black">
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

const Info = ({ asset, stripePromise, checkoutSession }: { asset: Asset }) => {
  const text = asset.template?.ctaText
    ? asset.template.ctaText
    : asset.price <= 0
    ? "Suscribirse gratis"
    : "Comprar";

  const getPriceString = () => `$${asset.price} ${asset.currency}`;
  return (
    <div
      className={cn(
        "col-span-8 border-t-[2px] border-black",
        "md:col-span-3 md:border-t-0"
      )}
    >
      <div
        className={cn(
          "h-16 border-b-[2px] bg-black border-black  place-content-center hidden",
          "md:grid"
        )}
      >
        <h3 className="text-2xl font-bold text-white">{getPriceString()}</h3>
      </div>
      {asset.price <= 0 && <Subscription asset={asset} text={text} />}

      {asset.price && (
        <PaymentModal
          stripePromise={stripePromise}
          asset={asset}
          checkoutSession={checkoutSession}
          text={text}
        />
      )}

      <div className="h-fit p-6 border-b-[2px] border-black content-center">
        <Markdown>{asset.note}</Markdown>
      </div>
      {asset.type === "WEBINAR" ? (
        <WebinarDetails asset={asset} />
      ) : (
        <Formats />
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
      <section className="flex flex-col justify-center items-center text-xl h-[100px] pt-12">
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
      >
        {text}
      </button>
    </fetcher.Form>
  );
};

const WebinarDetails = ({ asset }: { asset: Asset }) => {
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
    <section>
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

const Formats = () => {
  return (
    <>
      <div className="h-10 border-b-[2px] border-black content-center">
        <AttributeList textLeft="Formato" textRight="png, jpg" />
      </div>
      <div className="h-10 border-b-[2px] border-black content-center">
        <AttributeList textLeft="Formato" textRight="png, jpg" />
      </div>
      <div
        className={cn(
          "h-10 border-b-0 border-black content-center",
          "border-b-[2px]"
        )}
      >
        <AttributeList textLeft="Formato" textRight="png, jpg" />
      </div>
    </>
  );
};

export const FooterTemplate = ({ asset }: { asset: Asset }) => {
  const getPriceString = () => `$${asset.price} ${asset.currency}`;

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
        <img alt="isotipo easybits" src="/isotipo-eb.svg" />
        <span>Powered by</span>
        <Link to="/" className="mt-1">
          <img alt="isotipo easybits " src="/logo-eb.svg" />{" "}
        </Link>
      </section>
      {success ? (
        message
      ) : (
        <Form
          onSubmit={handleSubmit}
          className="md:hidden border-t-[2px] border-x-[2px] border-black fixed bottom-0 bg-black w-full h-16 flex justify-between items-center"
        >
          <p className="text-white font-bold whitespace-pre px-4">
            {getPriceString()}
          </p>
          <input type="hidden" name="assetId" value={asset.id} />
          <Input
            required
            placeholder="Escribe tu email"
            name="email"
            className="min-h-full m-0"
            inputClassName="border-0 border-b-2 rounded-none"
          />
          <BrutalButton
            isLoading={isLoading}
            type="submit"
            containerClassName="rounded-lg"
            className="h-10 min-h-10 max-h-10 rounded-lg min-w-28 text-base  font-medium mx-4"
          >
            {asset.template?.ctaText
              ? asset.template.ctaText
              : asset.price <= 0
              ? "Suscribirse gratis"
              : "Comprar"}
          </BrutalButton>
        </Form>
      )}
    </>
  );
};

export const HeaderTemplate = ({ asset }: { asset: Asset }) => {
  const title = asset.title || "+20 Praga pack";
  const authorName = asset.user.displayName || "Sin nombre";
  const authorPic = asset.user.picture || "Sin nombre";
  return (
    <section className="border-b-[2px] border-black bg-[#CE95F9]">
      <div className="border-b-[2px] border-black h-16">
        <div className="max-w-7xl mx-auto border-x-0 md:border-x-[2px] h-16 border-black px-4 flex justify-between ">
          <div className="flex gap-2 items-center h-full">
            <Avatar src={authorPic} />{" "}
            <h3 className="underline">{authorName}</h3>
          </div>
          <div className="flex items-center gap-3">
            <FaFacebookF className="text-black text-lg" />
            <FaYoutube className="text-black text-lg " />
            <RiTwitterXFill className="text-black text-lg" />
            <AiFillInstagram className="text-black text-lg" />{" "}
            <FaTiktok className="text-black text-lg" />
            <FaLink className="text-black text-lg" />
          </div>
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
          src="/hero/star.svg"
          alt="star"
        />
        <h2 className="text-3xl md:text-4xl xl:text-5xl font-bold">{title}</h2>
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
    <section className="h-10 border-b-[2px] border-black content-center">
      <div className="py-2 h-6 flex justify-between items-center px-6">
        <p>{textLeft}</p>
        <div>{textRight}</div>
      </div>
    </section>
  );
};

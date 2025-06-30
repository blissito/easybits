import type { Asset } from "@prisma/client";
import toast from "react-hot-toast";
import { LuRefreshCcw } from "react-icons/lu";
import { useState, type ReactNode } from "react";
import { EnrolledUsers } from "~/components/fullstack/EnrolledUsers";
import { MdContentCopy } from "react-icons/md";
import { IoShareSocialOutline } from "react-icons/io5";
import { Modal } from "~/components/common/Modal";
import { FaXTwitter } from "react-icons/fa6";
import { PiLinkSimpleBold } from "react-icons/pi";
import { FaFacebookF, FaLinkedinIn } from "react-icons/fa";
import { twMerge } from "tailwind-merge";
import { RiWhatsappFill } from "react-icons/ri";
import { cn } from "~/utils/cn";
import { Input } from "~/components/common/Input";
import { useAnimate, motion } from "motion/react";
import { SiGmail } from "react-icons/si";
import { ContentTemplate, HeaderTemplate } from "./template";
import { useOpenLink } from "~/hooks/useOpenLink";
import Spinner from "~/components/common/Spinner";

export const AssetPreview = ({
  asset,
  host,
}: {
  host: string;
  asset: Asset;
}) => {
  const reload = () => {
    location.reload();
  };
  const [isOpen, setIsOpen] = useState(false);

  const handleModal = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const { handleOpenLink } = useOpenLink({
    localLink: `http://${host}.localhost:3000/tienda/${asset.slug}`,
    publicLink: `https://${host}.easybits.cloud/tienda/${asset.slug}`,
  });
  return (
    <aside
      className="col-span-4 md:block hidden h-svh bg-black px-8 pt-6 pb-8 text-white sticky top-0 overflow-auto "
      style={{ scrollbarWidth: "none" }}
    >
      <nav className="flex items-center mb-8 gap-4">
        <h3 className="w-max text-xl mr-auto">Vista previa</h3>
        <button onClick={reload} className="text-xl active:text-gray-500">
          <LuRefreshCcw />
        </button>
        <button onClick={handleModal}>
          <IoShareSocialOutline className="text-2xl" />
        </button>
        <button onClick={handleOpenLink} className="text-xl">
          <img
            alt="external link"
            src="/icons/opentab-white.svg"
            className="w-6 h-6"
          />
        </button>
        <EnrolledUsers assetId={asset.id} />
      </nav>
      <section className="origin-top-left scale-[.5] w-[200%] text-black bg-white">
        <HeaderTemplate asset={asset} />
        <ContentTemplate asset={asset} files={[]} />
      </section>
      <ShareLink
        onClose={handleClose}
        isOpen={isOpen}
        host={host}
        asset={asset}
      />
    </aside>
  );
};

const ShareLink = ({
  isOpen,
  onClose,
  host,
  asset,
}: {
  isOpen: boolean;
  onClose?: () => void;
  host: string;
  asset: Asset;
}) => {
  const link = `https://${host}.easybits.cloud/tienda/${asset?.slug}`;
  return (
    <>
      <Modal
        key="selector"
        containerClassName="z-50 text-black text-center "
        isOpen={isOpen}
        className="min-h-fit"
        title={"¡Comparte tu asset!"}
        onClose={onClose}
      >
        <div className="mt-4 text-iron">
          <p className="mb-8">
            Es hora de que tus seguidores se enteren de que tus productos ya
            están disponibles. Comparte ya en tus redes sociales.
          </p>
          <Input disabled defaultValue={link} className="disabled:opacity-75" />
          <Sharing link={link} asset={asset} />
        </div>
      </Modal>
    </>
  );
};

export const Sharing = ({ link, asset }: { link: string; asset: Asset }) => {
  const [text, setText] = useState("¡Vi este post y me pareció interesante!");
  const [abortController, setAbortController] =
    useState<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSharelinkWithAIDescription = async ({
    platform,
  }: {
    platform: string;
  }) => {
    if (isLoading && abortController) {
      abortController.abort();
    }
    setIsLoading(true);
    const controller = new AbortController();
    setAbortController(controller);
    const chat = [
      {
        role: "user",
        content: `Quiero compartir el siguiente link: ${link} en ${platform}
                  Genera directamente, sin saludos, explicaciones ni introducciones, una, solo una descripción atractiva, concisa y con un lenguaje informal y con emojis para redes sociales que resalte las características del asset "${asset.title} usa un tono de acuerdo al nombre y tipo del asset ${asset.type}".                                                       
                  Por ejemplo, si el tipo de asset es un ebook y el nombre es "guia para convertirte en un experto en React", la descripción podría ser seria y concisa como:
                  "¡Descubre esta guía definitiva para convertirte en un experto en React! 🚀📚 Aprende los secretos de los profesionales y lleva tus habilidades al siguiente nivel. ¡Haz clic aquí para obtenerla ahora! 👉"`,
      },
    ];

    try {
      const response = await fetch("/api/v1/ai/sugestions", {
        method: "POST",
        body: new URLSearchParams({
          intent: "generate_social_description",
          chat: JSON.stringify(chat),
        }),
        signal: controller.signal,
      });
      // @todo make this a hook
      if (response.ok) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;

        let buffer = "";
        setText("");
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value);
          const lines = buffer.split("\n");

          // Mantén la última línea en el buffer por si está incompleta
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.trim() && line.startsWith("{")) {
              try {
                const data = JSON.parse(line);
                if (data.response) {
                  setText((v) => v + data.response);
                  // Hacer scroll después de cada actualización del contenido
                }
              } catch (e) {
                // Ignora errores de parsing de líneas no válidas
                console.warn("Línea JSON no válida:", line);
              }
            }
          }
        }
        setIsLoading(false);
        return text; // Devuelve el texto generado
      }
    } catch (error) {
      console.error("Error al generar la descripción:", error);
    } finally {
      setAbortController(null);
    }
  };

  return (
    <div className="flex justify-center gap-4 items-center mt-8">
      <SocialMedia
        isLoading={isLoading}
        onClick={async () => {
          const description = await handleSharelinkWithAIDescription({
            platform: "Any text chat",
          });
          navigator.clipboard.writeText(description);

          toast.success("Link copiado", {
            style: {
              border: "2px solid #000000",
              padding: "16px",
              color: "#000000",
            },
            iconTheme: {
              primary: "#8BB236",
              secondary: "#FFFAEE",
            },
          });
        }}
        name="Link"
        className="bg-munsell"
      >
        <PiLinkSimpleBold />
      </SocialMedia>
      <SocialMedia
        name="Facebook"
        className="bg-sky"
        isLoading={isLoading}
        // link={`https://www.facebook.com/sharer/sharer.php?u=${link}`}
        onClick={() => {
          const description = handleSharelinkWithAIDescription({
            platform: "Facebook",
          });
          if (description) {
            const facebookURL = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
              link
            )}&quote=${encodeURIComponent(description)}`;
            window.open(facebookURL, "_blank");
          }
        }}
      >
        <FaFacebookF />
      </SocialMedia>
      <SocialMedia
        name="X"
        isLoading={isLoading}
        className="bg-sea"
        // link={`https://twitter.com/intent/tweet?url=${link}&text=${text}`}
        onClick={async () => {
          const description = await handleSharelinkWithAIDescription({
            platform: "X (twitter)",
          });
          if (description) {
            const tweetURL = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
              description
            )}&url=${encodeURIComponent(link)}`;
            window.open(tweetURL, "_blank");
          }
        }}
      >
        <FaXTwitter />
      </SocialMedia>
      <SocialMedia
        name="Linkedin"
        isLoading={isLoading}
        className="bg-[#B5B5B5]"
        // link={`http://www.linkedin.com/shareArticle?mini=true&url=${link}&title=${text}`}
        onClick={async () => {
          const description = await handleSharelinkWithAIDescription({
            platform: "linkedin",
          });
          if (description) {
            const linkedinURL = `https://www.linkedin.com/sharing/share-offsite?mini=true&url=${encodeURIComponent(
              link
            )}&title=${encodeURIComponent(description)}`;
            window.open(linkedinURL, "_blank");
          }
        }}
      >
        <FaLinkedinIn />
      </SocialMedia>
      <SocialMedia
        name="Gmail"
        className="bg-[#EF8165]"
        isLoading={isLoading}
        // link={`https://mail.google.com/mail/?view=cm&fs=1&to=tu_amiga@example.com&su=¡Te comparto mi descueto!&body=Este es mi link de descuento para el curso de Animaciones con React: \n ${link}`}
        onClick={async () => {
          const description = await handleSharelinkWithAIDescription({
            platform: "mail",
          });
          if (description) {
            const gmailURL = `https://mail.google.com/mail/?view=cm&fs=1&to=&su=${encodeURIComponent(
              "¡Te comparto mi link!"
            )}&body=${encodeURIComponent(description + " " + link)}`;
            window.open(gmailURL, "_blank");
          }
        }}
      >
        <SiGmail />
      </SocialMedia>
      <SocialMedia
        name="WhatsApp"
        className="bg-[#8DBA90]"
        isLoading={isLoading}
        // link={`https://api.whatsapp.com/send/?text=¡Te+comparto+mi+link+de+descuento!${link}&type=phone_number&app_absent=0`}
        onClick={async () => {
          const description = await handleSharelinkWithAIDescription({
            platform: "Whatsapp",
          });
          if (description) {
            const whatsappURL = `https://api.whatsapp.com/send?text=${encodeURIComponent(
              description
            )} ${encodeURIComponent(link)}`;
            window.open(whatsappURL, "_blank");
          }
        }}
      >
        <RiWhatsappFill />
      </SocialMedia>
    </div>
  );
};

export const SocialMedia = ({
  className,
  children,
  name,
  link,
  onClick,
  isLoading,
}: {
  className?: string;
  children: ReactNode;
  name?: string;
  onClick?: () => void;
  link?: string;
  isLoading?: boolean;
}) => {
  const [scope, animate] = useAnimate();

  const handleMouseEnter = () => {
    animate(scope.current, { opacity: 1, scale: 1 });
  };

  const handleMouseLeave = () => {
    animate(scope.current, { opacity: 0, scale: 0.75 });
  };

  return (
    <a rel="noreferrer" target="_blank" href={link}>
      <button
        disabled={isLoading}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={onClick}
        className={twMerge(
          "group bg-black rounded-full   transition-all  text-lg text-black  flex items-center justify-center relative  cursor-pointer "
        )}
      >
        <div
          className={cn(
            "w-12 h-12 border-2 -translate-x-[2px] -translate-y-[2px] grid place-content-center text-2xl border-black bg-purple-600 rounded-full",
            className
          )}
        >
          {isLoading ? <Spinner /> : children}
        </div>

        <motion.div
          ref={scope}
          className={twMerge(
            "absolute bg-dark dark:bg-[#1B1D22] -bottom-7 text-xs text-white px-2 py-1 rounded hidden group-hover:block"
          )}
        >
          {name}
        </motion.div>
      </button>
    </a>
  );
};

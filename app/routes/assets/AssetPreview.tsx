import type { Asset } from "@prisma/client";
import toast from "react-hot-toast";
import { LuRefreshCcw } from "react-icons/lu";
import { useRef, useState, type ReactNode } from "react";
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
import { useSubmit } from "react-router";

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

  return (
    <aside
      className="md:block hidden w-[40%] h-svh bg-black px-8 pt-6 pb-8 text-white sticky top-0 overflow-y-scroll"
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
        <button
          onClick={() => {
            const uri = location.hostname.includes("localhost")
              ? `http://localhost:3000/tienda/${asset.slug}`
              : `https://${host}.easybits.cloud/tienda/${asset.slug}`;
            navigator.clipboard.writeText(uri);
            toast("Link copiado ✅", { position: "top-right" });
            const a = document.createElement("a");
            a.target = "_blank";
            a.href = uri;
            a.click();
          }}
          className="text-xl"
        >
          <MdContentCopy />
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
        slug={asset.slug}
      />
    </aside>
  );
};

const ShareLink = ({
  isOpen,
  onClose,
  host,
  slug,
}: {
  isOpen: boolean;
  onClose?: () => void;
  host: string;
  slug: string;
}) => {
  const link = `https://${host}.easybits.cloud/tienda/${slug}`;
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
          <Sharing link={link} />
        </div>
      </Modal>
    </>
  );
};

export const Sharing = ({ link }: { link: string }) => {
  return (
    <div className="flex justify-center gap-4 items-center mt-8">
      <SocialMedia
        onClick={() => {
          navigator.clipboard.writeText(link);

          toast("Link copiado ✅", { position: "top-right" });
        }}
        name="Link"
        className="bg-munsell"
      >
        <PiLinkSimpleBold />
      </SocialMedia>
      <SocialMedia
        name="Facebook"
        className="bg-sky"
        link={`https://www.facebook.com/sharer/sharer.php?u=${link}`}
      >
        <FaFacebookF />
      </SocialMedia>
      <SocialMedia
        name="X"
        className="bg-sea"
        link={`https://twitter.com/intent/tweet?url=${link}&text=¡Vi este post y me pareció interesante!`}
      >
        <FaXTwitter />
      </SocialMedia>
      <SocialMedia
        name="Linkedin"
        className="bg-[#B5B5B5]"
        link={`http://www.linkedin.com/shareArticle?mini=true&url=${link}&title=¡Vi este post y me pareció interesante!`}
      >
        <FaLinkedinIn />
      </SocialMedia>
      <SocialMedia
        name="Gmail"
        className="bg-[#EF8165]"
        link={`https://mail.google.com/mail/?view=cm&fs=1&to=tu_amiga@example.com&su=¡Te comparto mi descueto!&body=Este es mi link de descuento para el curso de Animaciones con React: \n ${link}`}
      >
        <SiGmail />
      </SocialMedia>
      <SocialMedia
        name="WhatsApp"
        className="bg-[#8DBA90]"
        link={`https://api.whatsapp.com/send/?text=¡Te+comparto+mi+link+de+descuento!${link}&type=phone_number&app_absent=0`}
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
}: {
  className?: string;
  children: ReactNode;
  name?: string;
  onClick?: () => void;
  link?: string;
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
          {children}
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

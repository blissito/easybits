import type { NewsLetter, User } from "@prisma/client";
import { useAnimate } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FaUsersCog } from "react-icons/fa";
import { IoClose } from "react-icons/io5";
import { useFetcher } from "react-router";
import { usePortal } from "~/hooks/usePortal";
import { cn } from "~/utils/cn";

export function EnrolledUsers({ assetId }: { assetId: string }) {
  const close = () => setIsOpen(false);
  const isFirstRender = useRef(true);
  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const fetcher = useFetcher();
  const getUsers = async () => {
    fetcher.submit(
      {
        intent: "get_enrolled_users",
        assetId,
      },
      { method: "post", action: "/api/v1/assets" }
    );
  };

  const users = fetcher.data || [];

  useEffect(() => {
    if (!isFirstRender.current) return;

    getUsers();
    configOpening();
    isFirstRender.current = false;

    return () => {
      configOpening(true);
    };
  }, []);

  const configOpening = (isClosing?: boolean) => {
    if (!document) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };

    if (isClosing) {
      document.body.style.overflow = "auto";
      removeEventListener("keydown", handler);
    }
    isOpen && (document.body.style.overflow = "hidden");
    !isOpen && (document.body.style.overflow = "auto");
    // esc
    addEventListener("keydown", handler);
  };

  const portal = usePortal(
    <UserCrudDrawer onClose={close} assetId={assetId} users={users} />
  );
  if (isOpen) {
    return (
      <>
        <CTA />
        {portal};
      </>
    );
  }
  return <CTA onClick={open} />;
}

const CTA = ({ onClick }: { onClick?: () => void }) => (
  <button onClick={onClick} className="active:scale-[0.95] text-xl">
    <FaUsersCog />
  </button>
);

const UserCrudDrawer = ({
  users,
  assetId,
  onClose,
}: {
  onClose?: () => void;
  assetId: string;
  users: User[];
}) => {
  const [scope, animate] = useAnimate();
  const startAnimation = async () => {
    await animate(
      "#card",
      { y: 100, filter: "blur(9px)", opacity: 0 },
      { duration: 0, type: "spring", bounce: 0 }
    );
    animate(
      scope.current,
      { opacity: 1, filter: "blur(0px)" },

      { type: "spring", bounce: 0 }
    );
    await animate(
      "#card",
      { y: 0, filter: "blur(0px)", opacity: 1 },
      { type: "spring", bounce: 0 }
    );
  };
  useEffect(() => {
    startAnimation();
  }, []);
  return (
    <article
      style={{ opacity: 0, filter: "blur(4px)" }}
      ref={scope}
      className="fixed inset-0 bg-brand-500/20 backdrop-blur-sm z-10 grid place-content-center overflow-hidden"
    >
      <Card id="card" cardHeader={<CardHeader onClose={onClose} />}>
        <UserTable assetId={assetId} users={users} />
      </Card>
    </article>
  );
};

const UserTable = ({
  users = [],
  assetId,
}: {
  assetId: string;
  users: User[];
}) => {
  const gridClassName = "grid grid-cols-3";
  const getDeliveringStatus = (newsletters: NewsLetter[]) => {
    const n = newsletters?.find((nl) => nl.assetId === assetId)?.next;
    switch (n) {
      case 0:
        return (
          <span className="p-1 rounded-full bg-green-400/40 uppercase text-[8px] tracking-wider font-medium text-green-900">
            completado
          </span>
        );
      default:
        return n;
    }
  };

  return (
    <section>
      <header className={cn(gridClassName, "font-semibold")}>
        <span>DisplayName</span>
        <span>Email</span>
        <span>Next deliver</span>
      </header>
      {users.map((user, index) => (
        <div
          className={cn(
            gridClassName,
            "text-xs px-1 py-1 rounded",
            index % 2 === 0 && "bg-gray-200 "
          )}
          key={user.id}
        >
          <span>{user.displayName}</span>
          <span>{user.email}</span>
          <span>{getDeliveringStatus(user.newsletters)}</span>
        </div>
      ))}
    </section>
  );
};

const Card = ({
  children,
  cardHeader,
  className,
  id,
}: {
  id?: string;
  className?: string;
  children: ReactNode;
  cardHeader: ReactNode;
}) => {
  return (
    <section
      id={id}
      className={cn(
        "bg-white rounded-md shadow-md p-4 w-[420px] max-w-[420px] overflow-y-auto h-[420px]",
        className
      )}
    >
      {cardHeader}
      <hr className="my-2" />
      {children}
    </section>
  );
};

const CardHeader = ({ onClose }: { onClose?: () => void }) => {
  return (
    <nav className="flex justify-between">
      <h1 className="text-2xl font-bold">Usuarios involucrados</h1>
      <button
        onClick={onClose}
        type="button"
        className="px-2 border py-1 rounded hover:scale-105 active:scale-100"
      >
        <IoClose />
      </button>
    </nav>
  );
};

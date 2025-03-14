import { FaArrowLeftLong } from "react-icons/fa6";
import { cn } from "~/utils/cn";
import { Chat, ChatMobile } from "./viewer/viewerChat";
import { EventInfo, TransmisionBox } from "./viewer/viewerWebinar";
import { UsersList } from "./viewer/viewerUsers";

export default function Preview() {
  return (
    <section
      className={cn(
        "bg-black h-screen flex flex-col items-start justify-center w-full ",
        "md:flex-row"
      )}
    >
      <UsersList />
      <article
        className={cn(
          "min-h-screen w-full grow flex flex-col items-start justify-start h-full px-2  pt-4 box-border ",
          "md:pr-8"
        )}
      >
        <span className="text-white flex gap-2 items-center mb-4 h-5 ">
          <FaArrowLeftLong />
          Volver al Dashboard
        </span>{" "}
        <div className="flex w-full overflow-hidden min-h-[280px]  md:h-[400px] lg:h-[78vh]">
          <TransmisionBox />
          <Chat />
        </div>
        <EventInfo />
        <ChatMobile />
      </article>
    </section>
  );
}

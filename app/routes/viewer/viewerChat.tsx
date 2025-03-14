import { GoFoldUp } from "react-icons/go";
import { IoSend } from "react-icons/io5";
import { cn } from "~/utils/cn";

export const ChatMobile = () => {
  return (
    <section
      className={cn(
        "bg-onix h-full lg:hidden w-full  rounded-2xl  overflow-y-scroll flex-col flex  ",
        "lg:hidden lg:rounded-l-none lg:rounded-r-2xl"
      )}
    >
      <ChatHeader />
      <ChatHistorial />
      <ChatBox />
    </section>
  );
};

export const Chat = () => {
  return (
    <section
      className={cn(
        "bg-onix hidden min-w-[300px] w-[300px] min-h-full rounded-r-2xl  overflow-y-scroll  flex-col",
        "lg:flex"
      )}
    >
      <ChatHeader />
      <ChatHistorial />
      <ChatBox />
    </section>
  );
};

const ChatHistorial = () => {
  return (
    <div
      className={cn(
        "px-2 pt-1  text-tale font-light box-border ",
        "md:px-4 md:pt-4 h-full overflow-y-scroll "
      )}
    >
      <Message text=" Lorem ipsum dolor sit amet con sec tetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet con sec tetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet con sec tetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet con sec tetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet con sec tetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet con sec tetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet con sec tetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit." />
      <Message text=" Lorem ipsum dolor sit amet consectetur adipisicing elit. Oh shi" />
    </div>
  );
};

const Message = ({ text }: { text: string }) => {
  return (
    <p className="leading-tight my-2 text-sm">
      <strong className="text-munsell mr-1">Kenia 😬:</strong>
      {text}
    </p>
  );
};

const ChatBox = () => {
  return (
    <div className="px-2 md:px-4 pb-4 h-fit pt-2  w-full flex bg-onix backdrop-blur ">
      <input
        className={cn(
          "w-full h-12 rounded-lg bg-onix border border-marengo",
          "focus:border-brand-500  focus:ring-brand-500 placeholder:text-marengo"
        )}
        placeholder="Escribe un mensaje..."
      />{" "}
      <IoSend className="text-white max-h-10 absolute right-8 text-xl top-[14px]" />
    </div>
  );
};

const ChatHeader = () => {
  return (
    <div className="border-b border-white/10 h-10 flex justify-center items-center text-white relative">
      <GoFoldUp className="left-2 absolute rotate-90 text-2xl hidden md:block" />
      <span>Chat general</span>
    </div>
  );
};

import { Form, useFetcher } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import { BrendisConfetti } from "~/components/Confetti";
import { useScript } from "~/hooks/useScript";
import { cn } from "~/utils/cn";

export const SuscriptionBox = ({ className }: { className?: string }) => {
  const fetcher = useFetcher();
  useScript("https://challenges.cloudflare.com/turnstile/v0/api.js");
  const isSuccess = fetcher.data?.success;
  return (
    <section
      className={cn(
        "max-w-3xl h-fit md:h-72 border-black border-[2px] overflow-hidden md:rounded-t-full bg-coverSuscription   rounded-r-3xl rounded-t-3xl  md:rounded-r-full  bg-cover mx-auto p-6 md:p-8  justify-center relative",
        className
      )}
    >
      <div className="w-full  text-center relative">
        <h3 className="text-2xl md:text-3xl font-bold">
          Suscríbete a nuestro newsletter
        </h3>
        <p className="text-base md:text-xl mt-2 md:mt-3 max-w-4xl mx-auto">
          Recibe un resumen mensual de las mejores consejos de marketing y
          business para creadores, o de las nuevas funcionalidades nuevas de
          EasyBits.
        </p>
        {!isSuccess && (
          <fetcher.Form
            action="/api/v1/utils"
            method="post"
            className="flex gap-4 max-w-2xl mx-auto mt-10 flex-wrap md:flex-nowrap justify-center"
          >
            <input
              name="email"
              required
              className="bg-white  rounded-xl w-full border-2 border-black "
              placeholder="ejemplo@easybist.cloud"
            />{" "}
            <BrutalButton
              isLoading={fetcher.state !== "idle"}
              name="intent"
              value="send_confirmation"
              type="submit"
              containerClassName=" -mt-[2px] ml-[1px]"
              id="Suscripcion"
            >
              ¡Apuntarme!
            </BrutalButton>
            <Turnstile />
          </fetcher.Form>
        )}
        {isSuccess && (
          // @Todo ponga un monito de tv o radio pequeñito 🤖 en vez del emoji
          <p className="text-xl mt-2 md:mt-3 font-bold text-brand-500">
            ¡Super! Ahora, revisa tu correo para confirmar tu cuenta. 🎊
          </p>
        )}
        {isSuccess && <BrendisConfetti />}
      </div>
    </section>
  );
};

export const Turnstile = () => {
  return (
    <div className="fixed bottom-0 right-0 z-50">
      <div
        className="cf-turnstile"
        data-sitekey="0x4AAAAAABbVIYBqxYY44hTw"
        data-theme="light"
      ></div>
    </div>
  );
};

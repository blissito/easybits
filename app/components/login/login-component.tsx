import logoPurple from "/icons/eyes-logo-purple.svg";
import { AuthNav } from "./auth-nav";
import { STRINGS } from "./login.strings";
import { FcGoogle } from "react-icons/fc";
import { BsStripe } from "react-icons/bs";
import { AiFillMail } from "react-icons/ai";
import { Button } from "../common/Button";
import { useState, type FormEvent } from "react";
import { Input } from "../common/Input";
import { motion, AnimatePresence } from "motion/react";
import { useFetcher } from "react-router";
import Spinner from "../common/Spinner";

const transition = {
  duration: 0.3,
  delay: 0.1,
  ease: [0, 0.71, 0.2, 1.01],
};

export default function LoginComponent({ state }: { state?: string }) {
  const fetcher = useFetcher();
  const [screen, setScreen] = useState<
    "social" | "email" | "create" | "showing_email_instructions"
  >("social");

  const SELECTED_STRINGS =
    screen === "social" ? STRINGS["login"] : STRINGS["signup"];
  const isGoogleLoading =
    fetcher.state !== "idle" && fetcher.formData?.get("auth") === "google";
  const isStripeLoading =
    fetcher.state !== "idle" && fetcher.formData?.get("auth") === "stripe";

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setScreen("showing_email_instructions");
    const form = Object.fromEntries(new FormData(e.currentTarget)) as {
      displayName: string;
      email: string;
    };
    fetcher.submit(
      {
        email: form.email,
        displayName: form.displayName,
        auth: "email_signup",
      },
      {
        method: "post",
      }
    );
  };

  const isLoading = fetcher.state !== "idle";

  const handleLogin = (auth: "google" | "stripe") => () => {
    fetcher.submit(
      {
        auth,
      },
      { method: "post" }
    );
  };

  const swapScreen = () => {
    setScreen((s) => (s === "social" ? "create" : "social"));
  };

  return (
    <section className="w-full border-[1px] border-black h-svh bg-cover bg-center bg-patternDark flex justify-center  items-center overflow-hidden">
      <AuthNav />
      <main className="w-full">
        <div className="flex flex-col min-w-full items-center justify-center">
          {/* hover animation can improve... just like everything in this F** world*/}
          <img src={logoPurple} className="w-[95px]" alt="EasyBits Logo" />
          <AnimatePresence mode="popLayout">
            {screen === "social" && (
              <SocialButtons
                cta={
                  <button
                    className="text-[#9870ED] cursor-pointer underline"
                    onClick={swapScreen}
                  >
                    {SELECTED_STRINGS.action}
                  </button>
                }
                SELECTED_STRINGS={SELECTED_STRINGS}
                handleLogin={handleLogin}
                isGoogleLoading={isGoogleLoading}
                isStripeLoading={isStripeLoading}
                onEmailClick={() => {
                  setScreen("email");
                }}
              />
            )}

            {screen === "email" && (
              <EmailForm
                noName
                onSubmit={handleSubmit}
                SELECTED_STRINGS={{
                  title: "email",
                  formTitle: "Te enviaremos un magic link 🪄",
                  formSubmit: "Solicitar link ",
                  formAction: "Iniciar sesión con una red social.",
                }}
                isLoading={isLoading}
                onAction={() => {
                  setScreen("social");
                }}
              />
            )}
            {screen === "create" && (
              <EmailForm
                onSubmit={handleSubmit}
                SELECTED_STRINGS={SELECTED_STRINGS}
                isLoading={isLoading}
                onAction={() => {
                  setScreen("social");
                }}
              />
            )}
            {(screen === "email" || screen === "create") && isLoading && (
              <Spinner />
            )}
            {fetcher.data?.state === "confirmation_success" && (
              <>
                <p className="text-white text-2xl text-center max-w-4xl mt-6">
                  Te hemos enviado un correo de confirmación, valida tu cuenta
                  para comenzar. ✅
                </p>
                <p className="text-white text-2xl text-center max-w-4xl mt-4">
                  {" "}
                  ¡A veces el mail acaba en SPAM! Esperamos que no sea así pero
                  si no llega en uno o tres minutos, ya sabes donde encontrarlo.
                </p>
              </>
            )}

            {fetcher.data?.state === "success" && (
              <>
                <p className="text-white text-2xl text-center max-w-2xl">
                  Te hemos enviado un correo con tu magic link. 🪄
                </p>
                <p className="text-marengo mt-4 text-xl text-center max-w-2xl">
                  {" "}
                  Solo entra a tu correo y da clic al enlace. ¡A veces el mail
                  acaba en SPAM! Esperamos que no sea así pero si no llega en
                  uno o tres minutos, ya sabes donde encontrarlo.
                </p>
              </>
            )}
          </AnimatePresence>
        </div>
      </main>
    </section>
  );
}

const SocialButtons = ({
  isGoogleLoading,
  SELECTED_STRINGS,
  isStripeLoading,
  handleLogin,
  onEmailClick,
  cta,
}) => {
  return (
    <motion.div
      key="social"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
      className="w-[98vw] px-4 md:px-[5%] xl:px-0   mx-auto flex flex-col items-center"
    >
      <p className="text-center font-bold text-3xl whitespace-pre-line mb-10 w-full text-white">
        {SELECTED_STRINGS.title}
      </p>
      <div className="flex min-w-full flex-col md:items-center justify-center gap-6 mb-8 mx-auto">
        <Button
          id="GmailLogin"
          mode="large"
          isLoading={isGoogleLoading}
          className="bg-[#A6EB9A] md:min-w-[420px] "
          type="button"
          onClick={handleLogin("google")}
        >
          <FcGoogle    id="GmailLogin"/>
          Iniciar con Gmail
        </Button>
        <Button
          id="StripeLogin"
          mode="large"
          isLoading={isStripeLoading}
          className="bg-[#6772E5] md:min-w-[420px]"
          type="button"
          onClick={handleLogin("stripe")}
        >
          <BsStripe  id="StripeLogin" fill="white" />
          Iniciar con Stripe
        </Button>
        <Button
          mode="large"
          className="md:min-w-[420px]"
          type="button"
          onClick={onEmailClick}
        >
          <AiFillMail />
          Iniciar con Email
        </Button>
      </div>
      {/* <p className="text-center text-white">
        {SELECTED_STRINGS.actionQuestion} {cta}
      </p> */}
    </motion.div>
  );
};

const EmailForm = ({
  onSubmit,
  SELECTED_STRINGS,
  isLoading,
  onAction,
  noName = false,
}: {
  noName?: boolean;
  SELECTED_STRINGS: typeof SELECTED_STRINGS;
}) => {
  return (
    <motion.form
      onSubmit={onSubmit}
      key="email"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={transition}
      id="login_form"
      className="w-[98vw] px-4 md:px-[5%] xl:px-0   mx-auto flex flex-col items-center"
    >
      <p className="text-center max-w-md  text-3xl whitespace-pre-line font-bold mb-8 text-white">
        {SELECTED_STRINGS.formTitle}
      </p>
      <div className="flex min-w-full flex-col md:items-center justify-center gap-6 mb-8 mx-auto">
        {!noName && (
          <Input
            className="md:max-w-[420px] text-white"
            label="Nombre"
            name="displayName"
            placeholder="¿Cómo te gusta que te llamen?"
            inputClassName="w-full"
          />
        )}
        <Input
          required
          className="md:max-w-[420px] text-white"
          label="Email"
          type="email"
          name="email"
          placeholder="tucorreo@gmail.com"
          inputClassName="w-full"
        />
        <Button
          className="bg-brand-500 mt-2 md:min-w-[420px]"
          type="submit"
          name="loginType"
          value="email-pass"
          isLoading={isLoading}
        >
          {SELECTED_STRINGS.formSubmit}
        </Button>
      </div>
      <p className="text-center text-white mt-0">
        <button
          type="button"
          className="text-brand-500 underline cursor-pointer "
          onClick={onAction}
        >
          {SELECTED_STRINGS.formAction}
        </button>
      </p>
    </motion.form>
  );
};

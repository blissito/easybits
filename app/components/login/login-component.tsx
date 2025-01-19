import backgroundGrid from "~/assets/images/bg-grid.svg";
import logoPurple from "~/assets/icons/eyes-logo-purple.svg";
import { AuthNav } from "./auth-nav";
import { STRINGS } from "./login.strings";
import { FcGoogle } from "react-icons/fc";
import { BsStripe } from "react-icons/bs";
import { AiFillMail } from "react-icons/ai";
import { Button } from "../common/Button";
import { useState } from "react";
import { Input } from "../common/Input";
import { motion, AnimatePresence } from "motion/react";

interface LoginProps {
  handleGmail: () => void;
  handleStripe: () => void;
  handleEmail: () => void;
}

export default function LoginComponent({
  handleGmail,
  handleStripe,
  handleEmail,
}: LoginProps) {
  const [loginType, setLoginType] = useState<"social" | "email">("social");
  const [isLogin, setIsLogin] = useState<boolean>(false);

  const SELECTED_STRINGS = isLogin ? STRINGS["login"] : STRINGS["signup"];
  const transition = {
    duration: 0.3,
    delay: 0.1,
    ease: [0, 0.71, 0.2, 1.01],
  };
  return (
    <>
      <AuthNav />
      <main
        className={
          "w-full h-screen bg-cover bg-center flex justify-center items-center"
        }
        style={{ backgroundImage: `url(/app/assets/images/bg-grid.svg)` }}
      >
        <div className="flex flex-col items-center justify-center">
          <img src={logoPurple} className="w-[95px]" />
          <AnimatePresence mode="wait">
            {loginType === "social" && (
              <motion.div
                key="social"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
              >
                <p className="text-center text-3xl whitespace-pre-line mb-10">
                  {SELECTED_STRINGS.title}
                </p>
                <div className="flex flex-col gap-8 mb-8">
                  <Button bgColor="bg-[#A6EB9A]" onClick={handleGmail}>
                    <FcGoogle />
                    Iniciar con Gmail
                  </Button>
                  <Button bgColor="bg-[#6772E5]" onClick={handleStripe}>
                    <BsStripe fill="white" />
                    Iniciar con Stripe
                  </Button>
                  <Button
                    onClick={() => {
                      setLoginType("email");
                    }}
                  >
                    <AiFillMail />
                    Iniciar con Email
                  </Button>
                </div>
                <p className="text-center">
                  {SELECTED_STRINGS.actionQuestion}
                  <span
                    className="text-[#9870ED]"
                    onClick={() => setIsLogin((prev) => !prev)}
                  >
                    {SELECTED_STRINGS.action}
                  </span>
                </p>
              </motion.div>
            )}
            {loginType === "email" && (
              <motion.div
                key="email"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={transition}
              >
                <p className="text-center text-3xl whitespace-pre-line mb-10">
                  {SELECTED_STRINGS.formTitle}
                </p>
                <div className="flex flex-col gap-8 mb-8">
                  {/* inputs */}
                  <form>
                    <Input
                      label="Email"
                      type="email"
                      placeholder="tucorreo@gmail.com"
                    />
                    <Input
                      label="Contraseña"
                      type="password"
                      placeholder="Al menos 8 caracteres"
                    />
                    <Button bgColor="bg-[#9870ED]" onClick={handleEmail}>
                      {SELECTED_STRINGS.formSubmit}
                    </Button>
                  </form>
                </div>
                <p>
                  <span
                    className="text-[#9870ED]"
                    onClick={() => {
                      setLoginType("social");
                    }}
                  >
                    {SELECTED_STRINGS.formAction}
                  </span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </>
  );
}

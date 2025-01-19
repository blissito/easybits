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

  return (
    <>
      <AuthNav />
      <main
        className={`w-full h-screen bg-cover bg-center flex justify-center items-center bg-[url('${backgroundGrid}')]`}
      >
        {loginType === "social" && (
          <div className="flex flex-col items-center">
            <img src={logoPurple} className="w-[95px]" />
            <p className="text-center text-3xl whitespace-pre-line mb-10">
              {STRINGS.title}
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
            <p>
              ¿Ya tienes cuenta?{" "}
              <span className="text-[#9870ED]">Inicia sesión</span>
            </p>
          </div>
        )}
        {loginType === "email" && (
          <div className="flex flex-col items-center">
            <img src={logoPurple} className="w-[95px]" />
            <p className="text-center text-3xl whitespace-pre-line mb-10">
              {STRINGS.formTitle}
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
                  Crear cuenta
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
                Crear cuenta con otra red social
              </span>
            </p>
          </div>
        )}
      </main>
    </>
  );
}

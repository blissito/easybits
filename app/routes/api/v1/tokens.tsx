import { db } from "~/.server/db";
import type { Route } from "./+types/tokens";
import { getReadURL } from "react-hook-multipart";
import { decodeToken } from "~/utils/tokens";
import { Link } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import Logo from "/icons/easybits-logo.svg";
import { FlipLetters } from "~/components/animated/FlipLetters";
import { setSessionCookie } from "~/.server/getters";

const decode = (url: URL) => {
  const token = url.searchParams.get("token") as string;
  const tokenData = decodeToken(token);
  if (!tokenData?.success) {
    throw new Response("Corrupt token", { status: 400 });
  }
  return tokenData.decoded;
};

export const loader = async ({ request }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  const intent = url.searchParams.get("intent");
  if (intent === "confirm_account") {
    const tokenData = decode(url)!;
    await db.user.update({
      where: { email: tokenData.email },
      data: { confirmed: true },
    });
    // @todo create session
    return { success: true };
  }

  if (intent === "magic_link") {
    const tokenData = decode(url)!;
    if (tokenData.email) {
      return await setSessionCookie({
        email: tokenData.email,
        request,
      });
    }
  }

  return { success: false };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "generate_token") {
    const fileId = formData.get("fileId") as string;
    const expInSecs = formData.get("expInSecs") as string;
    const file = await db.file.findUnique({ where: { id: fileId } });
    if (!file || !file.storageKey)
      throw new Response("The file does not exist", { status: 404 });

    const url = await getReadURL(file.storageKey, expInSecs);
    return { url };
  }

  return null;
};

export default function Page({ loaderData }: Route.ComponentProps) {
  const { success } = loaderData;
  return (
    <article className="grid h-screen place-content-center bg-black text-white">
      <nav className="flex gap-2">
        <img className="mb-2" alt="logo" src={Logo} />
        <FlipLetters word="EasyBits" />
      </nav>
      <h2 className="font-bold text-xl mb-4">
        {success && "¡Gracias por confirmar tu cuenta!"}
        {!success && "Hay un problema con el token"}
      </h2>

      <Link to="/dash">
        <BrutalButton>
          {success && "Mira tu dashboard"}
          {!success && "Intenta con un token nuevo"}
        </BrutalButton>
      </Link>
    </article>
  );
}

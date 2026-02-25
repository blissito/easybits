import { db } from "~/.server/db";
import type { Route } from "./+types/tokens";
import { data, Form, Link, redirect } from "react-router";
import { BrutalButton } from "~/components/common/BrutalButton";
import Logo from "/icons/easybits-logo.svg";
import { FlipLetters } from "~/components/animated/FlipLetters";
import { getUserOrRedirect, setSessionCookie } from "~/.server/getters";
import { sendWelcomeEmail } from "~/.server/emails/sendWelcome";
import { decode } from "~/.server/tokens";
import { generateShareToken } from "~/.server/core/operations";
import type { AuthContext } from "~/.server/apiAuth";

// @todo send welcome?
export const loader = async ({ request, params }: Route.LoaderArgs) => {
  if (params.token) {
    const { email, next, error } = decode(params.token);
    if (error) {
      return { success: false };
    }
    // upsert
    const user = await db.user.upsert({
      where: { email: email },
      create: { email: email },
      update: {},
    });
    // welcome
    if (!user.confirmed) {
      await db.user.update({
        where: {
          id: user.id,
        },
        data: {
          confirmed: true,
          newsletters: { push: { assetId: "easybits" } }, // @todo is ok to suscribe here?
        },
      });
      await sendWelcomeEmail(user.email); // welcome after confirm
    }
    // turn on session & redirect to next
    return await setSessionCookie({
      email: email,
      request,
      redirectURL: next,
    });
  }
  return { success: false };
};

export const action = async ({ request }: Route.ActionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "generate_token") {
    const user = await getUserOrRedirect(request);
    const fileId = formData.get("fileId") as string;
    const expiresIn = Number(formData.get("expInSecs") || 3600);

    const ctx: AuthContext = { user, scopes: ["READ", "WRITE", "DELETE", "ADMIN"] };
    const result = await generateShareToken(ctx, { fileId, expiresIn, source: "ui" });
    return data({ url: result.url });
  }

  if (intent === "set_session") {
    const tokenData = decode(new URL(request.url).searchParams.get("token")!);
    if (!tokenData) throw redirect("/dash");

    return await setSessionCookie({
      email: tokenData.email,
      request,
    });
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

      {!success && (
        <Link to="/dash">
          <BrutalButton>Intenta con un token nuevo</BrutalButton>
        </Link>
      )}
      {success && (
        <Form method="post">
          <BrutalButton
            name="intent"
            value="set_session"
            type="submit"
            className="text-black"
          >
            Mira tu dashboard
          </BrutalButton>
        </Form>
      )}
    </article>
  );
}

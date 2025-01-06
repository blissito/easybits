import { createUserKeys, getUserOrRedirect } from "~/.server/getters";
import type { Route } from "./+types/home";
import { CopyButton } from "~/components/common/CopyButton";

export function meta() {
  return [
    { title: "easyBits API" },
    { name: "description", content: "All your files as easy bits" },
  ];
}

export const loader = async ({ request }: Route.LoaderArgs) => {
  let user = await getUserOrRedirect(request);
  if (!user.keys) {
    user = await createUserKeys(user);
  }
  return { user };
};

export default function Home({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <article className="grid place-content-center min-h-screen">
      <section>
        <h2>Public key</h2>
        <div className="flex gap-2">
          <pre>{user.keys?.public}</pre>
          <CopyButton text={user.keys?.public as string} />
        </div>
      </section>
      <section>
        <h2>Secret key</h2>
        <div className="flex gap-2">
          <input type="password" value={user.keys?.secret} />
          <CopyButton text={user.keys?.secret as string} />
        </div>
      </section>
    </article>
  );
}

import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  redirect,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";
import useGoogleTM from "./utils/useGoogleTM";
import useHotjar from "./utils/useHotjar";
import { useTagManager } from "./utils/useTagManager";
import { Toaster } from "react-hot-toast";
import { db } from "./.server/db";
import StoreComponent from "./components/store/StoreComponent";
import Page from "./routes/assets/PublicCustomLanding";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
  { rel: "stylesheet", href: stylesheet },
];

export function Layout({ children }: { children: React.ReactNode }) {
  useGoogleTM();
  useHotjar();
  useTagManager();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body suppressHydrationWarning>
        {children}
        <ScrollRestoration />
        <Scripts />
        <Toaster />
      </body>
    </html>
  );
}

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const url = new URL(request.url);

  // custom_domain & no_home => render Store
  if (!url.hostname.includes("easybits") && url.pathname !== "/home") {
    // look for store
    const user = await db.user.findFirst({
      where: {
        domain: url.hostname,
      },
    });
    // no user, redirect or dev.
    if (!user) {
      return url.hostname.includes("localhost") ? null : redirect("/inicio");
      // return redirect("/home");
    }
    const assets = await db.asset.findMany({
      where: {
        userId: user.id,
      },
      include: {
        user: true,
      },
    });
    // if is asset public detail
    if (params.assetSlug) {
      const asset = await db.asset.findUnique({
        where: {
          userId: {
            equals: user.id,
          },
          slug: params.assetSlug,
        },
        include: { user: true },
      });
      return { asset, user, screen: "public_detail", files: [] };
    }
    return { assets, user, screen: "public_store" }; // data to render
  }

  // easybits & home
  if (url.hostname.includes("easybits") && url.pathname === "/") {
    return redirect("/inicio");
  }
  return null; // render normaly inside easybits
};

export default function App({ loaderData }) {
  // @todo This coould be moved into a second app (just for custom domains)
  const {
    screen,
    assets,
    user,
    asset,
    publishableKey,
    files,
    successStripeId,
  } = loaderData || {};
  if (screen === "public_store") {
    return <StoreComponent assets={assets} user={user} />;
  }
  if (screen === "public_detail") {
    // @todo revisit
    return (
      <Page loaderData={{ asset, publishableKey, files, successStripeId }} />
    );
  }
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}

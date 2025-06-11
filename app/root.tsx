import {
  isRouteErrorResponse,
  Link,
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
import { NotFound } from "./components/common/404";
import { DevAdmin } from "./components/experimental/DevAdmin";

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
        <DevAdmin />
      </body>
    </html>
  );
}

export const loader = async ({ request, params }: Route.LoaderArgs) => {
  const url = new URL(request.url);
  /**
   * host: subdomain including easybits
   * domain/hostname: double dot hostname
   * FIRST: LOCALHOST
   * . / => /inicio
   * SECOND: CUSTOM DOMAIN
   * . domain is present THEN / => /tienda
   * THIRD: IF EASYBITS HOST
   * . host is present THEN / => /tienda, /login => /tienda
   */

  // localhost => inicio
  console.info("::HOSTNAME::", url.hostname);
  if (url.hostname === "localhost") {
    if (url.pathname === "/") {
      return redirect("/inicio");
    } else {
      return null;
    }
  }
  // domain
  const domainExists = await db.user.findFirst({
    where: {
      domain: url.hostname,
    },
  });
  if (domainExists && (url.pathname === "/" || url.pathname === "/login")) {
    return redirect("/tienda");
  }

  // host
  const hostExist = await db.user.findFirst({
    where: {
      host: url.host.split(".")[0],
    },
  });
  if (
    (url.pathname === "/" || url.pathname === "/login") &&
    hostExist &&
    (url.hostname.includes("easybits") || url.hostname.includes("localhost"))
  ) {
    return redirect("/tienda");
  }

  // www & /tienda
  if (
    url.hostname.includes("easybits") &&
    url.hostname.includes("www") &&
    url.pathname.includes("tienda") &&
    !url.pathname.includes("dash")
  ) {
    return redirect("/"); // @revisit login?
  }

  return null;
};

export default function App({ loaderData }) {
  // @todo This coould be moved into a second app (just for custom domains)
  const {
    screen, // @todo revisit. Not used
    assets,
    user,
    asset,
    publishableKey,
    files,
    successStripeId,
  } = loaderData || {};
  if (screen === "public_store") {
    // @todo make this componente fetch data from client
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
    <main className="bg-pattern bg-center w-full h-svh bg-cover bg-no-repeat flex items-center">
      <NotFound message={message} details={details} />
      {/* <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )} */}
    </main>
  );
}

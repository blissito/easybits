import { redirect as rrRedirect } from "react-router";

const message = JSON.stringify({
  message: "t(*_*t)",
  by: "blissmo",
});

const catchURLS = async (request: Request, params: Record<string, any>) => {
  const url = new URL(request.url);
  const intent = params["*"];

  console.log("Intent:", intent);
  switch (intent) {
    case "token/refresh":
    case "token/revoke":
    case "token":
    case "authorize":
      throw new Response(message);
    case "oauth":
      const redirect = url.searchParams.get("redirect");
      throw ((_: Request) => rrRedirect(`/login?redirect=${redirect}`))(
        request
      );
    default:
      await new Promise((r) => setTimeout(r, 1000));
      break;
  }
  return Promise.resolve(true);
};

export const loader = async ({ request, params }) => {
  await catchURLS(request, params);
  return new Response(message);
};

export const action = async ({ request, params }) => {
  await catchURLS(request, params);
  return new Response(message);
};

/**
 * 1. Prompt auth screen to plugin user
 * https://easybits.cloud/kit/oauth?redirect=https://app.kit.com/apps/easybits?success=true
 *
 * http://localhost:3000/kit/oauth?redirect=https://www.easybits.cloud/kit/callback?client_id=
 *
 * The redirect its just  success signal to Kit we need to send client_id
 * 
 * THIS IS THe REAL CLINET_ID
 * https://app.kit.com/apps/EasyBits.cloud?success=true
 * 
 * THIS IS THE REAL REDIRECT URL
 * https://app.kit.com/oauth/authorize?
  client_id=YOUR_CLIENT_ID&
  response_type=code&
  redirect_uri=https://www.easybits.cloud/kit/callback&
  state=DEF456
 */

export const handleTurnstilePost = async (request: Request, body: FormData) => {
  // Turnstile injects a token in "cf-turnstile-response".
  const response = body.get("cf-turnstile-response") as string;
  const remoteip = request.headers.get("CF-Connecting-IP") as string;

  // Validate the token by calling the
  // "/siteverify" API endpoint.
  const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  const result = await fetch(url, {
    body: new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET!,
      response,
      remoteip,
    }),
    method: "POST",
  });
  const outcome = (await result.json()) as { success: boolean };
  console.info("::TURNSTILE_SITEVERIFY_RESPONSE::", outcome); // INFO
  return outcome.success;
};

// {
//     "success": true,
//     "challenge_ts": "2022-02-28T15:14:30.096Z",
//     "hostname": "example.com",
//     "error-codes": [],
//     "action": "login",
//     "cdata": "sessionid-123456789",
//     "metadata":{
//       "ephemeral_id": "x:9f78e0ed210960d7693b167e"
//     }
//   }

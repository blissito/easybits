export const handleTurnstilePost = async (request: Request, body: FormData) => {
  try {
    // Turnstile injects a token in "cf-turnstile-response".
    const response = body.get("cf-turnstile-response") as string;
    const remoteip = request.headers.get("CF-Connecting-IP") as string;

    if (!response) {
      console.error("::TURNSTILE_ERROR:: No cf-turnstile-response token found");
      return false;
    }

    if (!process.env.TURNSTILE_SECRET) {
      console.error(
        "::TURNSTILE_ERROR:: TURNSTILE_SECRET environment variable not set"
      );
      return false;
    }

    // Validate the token by calling the
    // "/siteverify" API endpoint.
    const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const result = await fetch(url, {
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET,
        response,
        remoteip: remoteip || "",
      }),
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!result.ok) {
      console.error(
        "::TURNSTILE_ERROR:: Failed to verify token, HTTP status:",
        result.status
      );
      return false;
    }

    const outcome = (await result.json()) as {
      success: boolean;
      "error-codes"?: string[];
      challenge_ts?: string;
      hostname?: string;
    };

    if (!outcome.success && outcome["error-codes"]) {
      console.error(
        "::TURNSTILE_ERROR:: Verification failed with error codes:",
        outcome["error-codes"]
      );
    }

    return outcome.success;
  } catch (error) {
    console.error("::TURNSTILE_ERROR:: Exception during verification:", error);
    return false;
  }
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

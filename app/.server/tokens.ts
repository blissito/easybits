import jwt from "jsonwebtoken";

const SECRET = process.env.SECRET || "easybitscloud_not_secure";

export const decodeToken = (token: string) => {
  try {
    const decoded = jwt.verify(token, SECRET) as {
      email: string;
      [x: string]: string | undefined;
    };
    return {
      success: true,
      decoded,
    };
  } catch (e: unknown) {
    if (e instanceof Error) {
      return {
        success: false,
        err: e,
        errorMessage: e.message,
      };
    } else {
      return {
        success: false,
        err: e,
        errorMessage: new Error(e as string).message,
      };
    }
  }
};

export const decode = (
  token: string
): { error?: string; [x: string]: string } => {
  const tokenData = decodeToken(token);
  if (!tokenData?.success) {
    return { error: "Corrupt token" };
  }
  return tokenData.decoded!;
};

export const generateUserToken = (
  data: {
    email: string;
    [x: string]: unknown;
  },
  expiresIn: "1h" | "7d" = "1h"
) => {
  return jwt.sign(data, SECRET, {
    expiresIn,
  });
};

export const validateUserToken = (token: string) => {
  try {
    const decoded = jwt.verify(token, SECRET) as {
      email: string;
      tags?: string[];
    };
    return {
      isValid: true,
      decoded,
    };
  } catch (e: unknown) {
    console.error(e);
    return {
      isValid: false,
      err: e,
      errorMessage: (e as Error).message,
    };
  }
};

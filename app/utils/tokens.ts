import jwt from "jsonwebtoken";

const SECRET = process.env.SECRET || "easybitscloud_not_secure";

export const decodeToken = (token: string) => {
  try {
    const decoded = jwt.verify(token, SECRET) as {
      email: string;
      tags?: string[];
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

export const generateEmailToken = (
  email: string,
  expiresIn: "1h" | "72h" = "72h"
) =>
  jwt.sign({ email }, SECRET, {
    expiresIn,
  });

export const generateUserToken = (data: {
  email: string;
  tags?: string[];
  [x: string]: unknown;
}) => {
  return jwt.sign(data, SECRET, {
    expiresIn: "1h",
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

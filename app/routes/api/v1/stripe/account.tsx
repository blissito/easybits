// app/routes/api/account.ts

import Stripe from "stripe";
import { createAccount } from "~/.server/stripe";

export const action = async ({ request }) => {
  try {
    const account = createAccount();

    return { account };
  } catch (error) {
    return { error, status: 500 };
  }
};

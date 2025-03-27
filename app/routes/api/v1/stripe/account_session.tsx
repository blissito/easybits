import { createAccountSession } from "~/.server/stripe";

export const action = async ({ request }) => {
  const formData = await request.formData();
  const account = formData.get("connectedAccountId");

  try {
    const clientSecret = await createAccountSession({ account });
    return clientSecret;
  } catch (error) {
    return { error, status: 400 };
  }
};

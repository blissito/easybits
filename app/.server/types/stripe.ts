import { Stripe } from "stripe";

export interface StripeSession extends Stripe.Checkout.Session {
  metadata: {
    assetId: string;
    merchantStripeId: string;
    plan?: string;
    customer_email?: string;
  };
  connected_account?: string;
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null;
}

export interface StripePaymentIntent extends Stripe.PaymentIntent {
  metadata: {
    assetId: string;
    merchantStripeId: string;
  };
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null;
}

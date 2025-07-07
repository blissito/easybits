// app/services/stripe/webhooks/handlers/index.ts
import { Stripe } from 'stripe';
import { paymentIntentSucceeded } from './handlers/paymentIntentSucceeded';

console.info("::WEBHOOK_HANDLERS_RUNNING::")

export const webhookHandlers: Record<string, (event: Stripe.Event, request: Request) => Promise<void>> = {
  'payment_intent.succeeded': paymentIntentSucceeded,
  // ... otros eventos @todo
};
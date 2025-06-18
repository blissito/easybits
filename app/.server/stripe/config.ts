export const STRIPE_WEBHOOK_ENDPOINT = process.env.STRIPE_WEBHOOK_ENDPOINT || 'https://api.easybits.cloud/api/stripe/webhook';

// Eventos que queremos escuchar
export const WEBHOOK_EVENTS = [
  'account.updated',
  'charge.succeeded',
  'charge.failed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'payment_intent.canceled',
  'payment_intent.processing',
];

export const STRIPE_WEBHOOK_ENDPOINT = process.env.STRIPE_WEBHOOK_ENDPOINT || 'https://api.easybits.cloud/api/stripe/webhook';
import { z } from 'zod';

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

// Validar el esquema de configuración
export type StripeEnvironment = 'development' | 'production';

const stripeConfigSchema = z.object({
  secretKey: z.string().min(1, { message: 'Stripe secret key is required' }),
  publishableKey: z.string().min(1, { message: 'Stripe publishable key is required' }),
  webhookSecret: z.string().min(1, { message: 'Stripe webhook secret is required' }),
  apiVersion: z.string().default('2023-08-16'),
});

type StripeConfig = z.infer<typeof stripeConfigSchema>;

// Función para validar la configuración de un entorno
function getValidatedConfig(env: StripeEnvironment): StripeConfig {
  const config = {
    secretKey: env === 'development' ? process.env.STRIPE_DEV_SECRET_KEY : process.env.STRIPE_SECRET_KEY, 
    publishableKey: env === 'development' ? process.env.STRIPE_DEV_PUBLISHABLE_KEY : process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: env === 'development' ? process.env.STRIPE_DEV_WEBHOOK_SECRET : process.env.STRIPE_WEBHOOK_SECRET,
  };

  const result = stripeConfigSchema.safeParse(config);
  
  if (!result.success) {
    const errorMessages = result.error.issues.map(issue => 
      `[${issue.path.join('.')}] ${issue.message}`
    ).join('\n');
    
    throw new Error(`Invalid Stripe ${env} configuration:\n${errorMessages}`);
  }
  
  return result.data;
}

// Configuración validada para cada entorno
export const stripeConfig = {
  development: getValidatedConfig('development'),
  production: getValidatedConfig('production'),
} as const;

// Tipo para la configuración de Stripe
export type StripeEnvironmentConfig = typeof stripeConfig[keyof typeof stripeConfig];

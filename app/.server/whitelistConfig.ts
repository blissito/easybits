// Configuración de whitelist para IPs
export const WHITELIST_CONFIG = {
  // IPs de Stripe (oficiales)
  STRIPE_IPS: [
    "3.18.12.63",
    "3.130.192.231",
    "13.235.14.237",
    "13.235.122.149",
    "18.211.135.69",
    "35.154.171.200",
    "52.15.183.38",
    "54.187.174.169",
    "54.187.205.235",
    "54.187.216.72",
    "54.241.31.99",
    "54.241.31.102",
    "54.241.34.107",
    // IPs adicionales de Stripe
    "13.114.141.11",
    "13.114.141.12",
    "13.114.141.13",
    "13.114.141.14",
    "13.114.141.15",
    "13.114.141.16",
    "13.114.141.17",
    "13.114.141.18",
    "13.114.141.19",
    "13.114.141.20",
  ],

  // IPs de desarrollo
  DEVELOPMENT_IPS: [
    "127.0.0.1", // localhost
    "::1", // localhost IPv6
    "192.168.1.1", // red local
    "10.0.0.1", // red local
    "172.16.0.1", // red local
  ],

  // IPs personalizadas desde variables de entorno
  get CUSTOM_IPS(): string[] {
    return process.env.WHITELIST_IPS
      ? process.env.WHITELIST_IPS.split(",").map((ip) => ip.trim())
      : [];
  },

  // Obtener todas las IPs whitelisteadas
  get ALL_WHITELISTED_IPS(): string[] {
    return [...this.STRIPE_IPS, ...this.DEVELOPMENT_IPS, ...this.CUSTOM_IPS];
  },
};

// Función para verificar si una IP está en whitelist
export function isIPWhitelisted(ip: string): boolean {
  return WHITELIST_CONFIG.ALL_WHITELISTED_IPS.includes(ip);
}

// Función para verificar si una IP es de Stripe
export function isStripeIP(ip: string): boolean {
  return WHITELIST_CONFIG.STRIPE_IPS.includes(ip);
}

// Función para verificar si una IP es de desarrollo
export function isDevelopmentIP(ip: string): boolean {
  return WHITELIST_CONFIG.DEVELOPMENT_IPS.includes(ip);
}

// Función para obtener información detallada de una IP
export function getIPInfo(ip: string): {
  ip: string;
  isWhitelisted: boolean;
  isStripe: boolean;
  isDevelopment: boolean;
  isCustom: boolean;
  category: string;
} {
  const isWhitelisted = isIPWhitelisted(ip);
  const isStripe = isStripeIP(ip);
  const isDevelopment = isDevelopmentIP(ip);
  const isCustom = WHITELIST_CONFIG.CUSTOM_IPS.includes(ip);

  let category = "unknown";
  if (isStripe) category = "stripe";
  else if (isDevelopment) category = "development";
  else if (isCustom) category = "custom";
  else if (isWhitelisted) category = "whitelisted";

  return {
    ip,
    isWhitelisted,
    isStripe,
    isDevelopment,
    isCustom,
    category,
  };
}

// Función para logging detallado
export function logDetailedIPInfo(ip: string): void {
  const info = getIPInfo(ip);
  console.log(`🔍 IP Analysis:`, {
    ip: info.ip,
    category: info.category,
    whitelisted: info.isWhitelisted,
    stripe: info.isStripe,
    development: info.isDevelopment,
    custom: info.isCustom,
  });
}

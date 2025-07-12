const environments = {
  development: "http://localhost:3000",
  production: "https://www.easybits.cloud",
};

// Use BASE_URL from environment if available, otherwise fallback to default logic
const baseUrl =
  process.env.BASE_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://www.easybits.cloud");

export const config = {
  baseUrl,
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV !== "development",
  logLevel: process.env.NODE_ENV === "development" ? "debug" : "info",
};

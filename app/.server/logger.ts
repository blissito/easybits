import { createLogger, format, transports } from "winston";
import { config } from "./config";

const { combine, timestamp, json } = format;

// Configuración del logger
const logger = createLogger({
  level: config.logLevel,
  format: combine(
    timestamp(),
    json()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: "error.log", level: "error" }),
    new transports.File({ filename: "combined.log" })
  ]
});

// Función para registrar intentos de asignación de asset
export const logAssetAssignmentAttempt = (
  sessionId: string,
  assetId: string,
  merchantStripeId: string,
  email: string,
  status: string,
  error?: string
) => {
  logger.info("Asset assignment attempt", {
    sessionId,
    assetId,
    merchantStripeId,
    email,
    status,
    error,
    timestamp: new Date()
  });
};

export default logger;

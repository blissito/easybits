/**
 * «La computadora del agente»: el modelo de pasos vive en el paquete compartido
 * `@ghostystudio/computer` (lo usan Sitios, el replay, GTeams y el chat /c de Ghosty Studio).
 * Este archivo sólo lo reexporta para que los imports de servidor y cliente no cambien.
 * Un cambio al modelo se hace en ~/ghosty-studio/packages/computer y se publica.
 */
export * from "@ghostystudio/computer";

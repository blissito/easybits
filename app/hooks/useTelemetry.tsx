import { useEffect } from "react";

interface UseTelemetryOptions {
  ownerId: string;
  assetId?: string;
  linkType: "assetDetail" | "store";
}

export function useTelemetry({
  ownerId,
  assetId,
  linkType,
}: UseTelemetryOptions) {
  useEffect(() => {
    // Construir la URL base sin subdominio
    const { protocol } = window.location;
    let apiHost = window.location.host;
    // Si es un subdominio tipo pelusina.localhost:3000, usar localhost:3000
    if (apiHost.includes("localhost")) {
      apiHost = "localhost:3000";
    } else {
      // Para producción, podrías ajustar esto según tu dominio principal
      const parts = apiHost.split(".");
      if (parts.length > 2) {
        apiHost = parts.slice(-2).join(".");
      }
    }
    const apiUrl = `${protocol}//${apiHost}/api/v1/telemetry`;

    fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "track-visit",
        ownerId,
        assetId,
        linkType,
      }),
    });
  }, [ownerId, assetId, linkType]);
}

// hooks/useGoogleAnalytics.ts
import { useEffect } from "react";

interface UseGoogleAnalyticsProps {
  trackingId?: string | null;
  pageTitle?: string;
  pagePath?: string;
}

export const useGoogleAnalytics = ({
  trackingId,
  pageTitle = document.title,
  pagePath = window.location.pathname,
}: UseGoogleAnalyticsProps) => {
  useEffect(() => {
    if (!trackingId || !trackingId.startsWith("G-")) {
      return;
    }

    // Cargar Google Analytics script si no existe
    if (!window.gtag) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${trackingId}`;
      document.head.appendChild(script);

      // Inicializar gtag
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () {
        window.dataLayer.push(arguments);
      };
      window.gtag("js", new Date());
      window.gtag("config", trackingId, {
        page_title: pageTitle,
        page_path: pagePath,
      });
    } else {
      // Si ya existe, solo enviar pageview
      window.gtag("config", trackingId, {
        page_title: pageTitle,
        page_path: pagePath,
      });
    }

    // Cleanup function
    return () => {
      // Opcional: remover el script si es necesario
    };
  }, [trackingId, pageTitle, pagePath]);
};

// Tipos para TypeScript
declare global {
  interface Window {
    gtag: (...args: any[]) => void;
    dataLayer: any[];
  }
}

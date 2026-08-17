/**
 * Screenshot de una página — el "ojo" de un agente que edita sitios.
 *
 * Corre en la caja `render-svc` del propio owner (Chromium on-demand), así que el
 * coste real es su budget de sandbox; el crédito es el escalón mínimo del catálogo.
 *
 * El motor vive en `core/fleetRender.captureScreenshot`, compartido con la tool
 * siempre-inyectada de la flota: una sola implementación, dos superficies.
 */
import {
  auditPage,
  auditViewportCount,
  captureScreenshot,
  type AuditResult,
  type AuditViewport,
  type ScreenshotPreset,
} from "../../core/fleetRender";
import type { AuthContext } from "../../apiAuth";
import { db } from "../../db";
import { ServiceProviderError } from "../errors";
import type { ServiceCtx, ServiceDef, ServiceResult } from "../types";
import { CREDIT_SCALE } from "~/lib/credits";

const SERVICE_ID = "render.screenshot";
const AUDIT_SERVICE_ID = "render.audit";

export interface ScreenshotInput {
  url?: string;
  html?: string;
  preset?: ScreenshotPreset;
  viewport?: { width: number; height: number };
  fullPage?: boolean;
  waitMs?: number;
  fileName?: string;
}

export interface ScreenshotOutput extends ServiceResult {
  data: {
    fileId: string;
    url: string;
    width: number;
    height: number;
    contentType: string;
    size: number;
    preset: string;
    broken: number;
    warning?: string;
  };
}

export interface AuditInput {
  url?: string;
  html?: string;
  viewports?: AuditViewport[];
  waitMs?: number;
}

export interface AuditOutput extends ServiceResult {
  data: AuditResult;
}

export const screenshotService: ServiceDef<ScreenshotInput, ScreenshotOutput> = {
  id: SERVICE_ID,
  product: "image",
  displayName: "Screenshot (Chromium on-demand)",
  description:
    "Captura cómo se ve una página —HTML sin publicar o URL pública— y la guarda como " +
    "archivo público, listo para encadenar a una tool de visión.",
  estimateCost: () => 1 * CREDIT_SCALE,
  async execute(input, ctx: ServiceCtx): Promise<ScreenshotOutput> {
    const user = await db.user.findUnique({ where: { id: ctx.userId } });
    if (!user) throw new ServiceProviderError(SERVICE_ID, 404, "usuario no encontrado");
    const auth = { user, scopes: ["READ", "WRITE", "DELETE"] } as unknown as AuthContext;
    try {
      const shot = await captureScreenshot(auth, input);
      return { data: shot };
    } catch (e) {
      throw new ServiceProviderError(SERVICE_ID, 502, (e as Error).message);
    }
  },
};

/**
 * Auditoría de accesibilidad + layout. Cobra POR VIEWPORT porque eso es lo que
 * cuesta: la caja abre un contexto y carga la página una vez por cada uno.
 */
export const auditService: ServiceDef<AuditInput, AuditOutput> = {
  id: AUDIT_SERVICE_ID,
  product: "image",
  displayName: "Audit de página (axe-core + layout)",
  description:
    "Mide contraste real sobre el DOM pintado (axe-core) y desbordes/recortes/solapes " +
    "de layout, a varios viewports. Devuelve el nodo culpable, no una opinión.",
  estimateCost: (input) => auditViewportCount(input) * CREDIT_SCALE,
  async execute(input, ctx: ServiceCtx): Promise<AuditOutput> {
    const user = await db.user.findUnique({ where: { id: ctx.userId } });
    if (!user) throw new ServiceProviderError(AUDIT_SERVICE_ID, 404, "usuario no encontrado");
    const auth = { user, scopes: ["READ", "WRITE", "DELETE"] } as unknown as AuthContext;
    try {
      return { data: await auditPage(auth, input) };
    } catch (e) {
      throw new ServiceProviderError(AUDIT_SERVICE_ID, 502, (e as Error).message);
    }
  },
};

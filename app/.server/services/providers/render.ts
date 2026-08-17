/**
 * Screenshot de una página — el "ojo" de un agente que edita sitios.
 *
 * Corre en la caja `render-svc` del propio owner (Chromium on-demand), así que el
 * coste real es su budget de sandbox; el crédito es el escalón mínimo del catálogo.
 *
 * El motor vive en `core/fleetRender.captureScreenshot`, compartido con la tool
 * siempre-inyectada de la flota: una sola implementación, dos superficies.
 */
import { captureScreenshot, type ScreenshotPreset } from "../../core/fleetRender";
import type { AuthContext } from "../../apiAuth";
import { db } from "../../db";
import { ServiceProviderError } from "../errors";
import type { ServiceCtx, ServiceDef, ServiceResult } from "../types";
import { CREDIT_SCALE } from "~/lib/credits";

const SERVICE_ID = "render.screenshot";

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
    mobileEmulation: boolean;
    waitHonored: boolean;
    broken: number;
    warning?: string;
  };
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

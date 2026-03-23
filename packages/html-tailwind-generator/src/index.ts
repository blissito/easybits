// Types
export type { Section3, IframeMessage } from "./types";
export type { LandingTheme, CustomColors } from "./themes";

// Themes
export {
  LANDING_THEMES,
  buildCustomTheme,
  buildCustomThemeCss,
  buildThemeCss,
  buildSingleThemeCss,
} from "./themes";

// HTML builders
export { buildPreviewHtml, buildDeployHtml } from "./buildHtml";
export { getIframeScript } from "./iframeScript";

// Generation
export {
  generateLanding,
  extractJsonObjects,
  SYSTEM_PROMPT,
  PROMPT_SUFFIX,
  type GenerateOptions,
} from "./generate";

export {
  generateDocument,
  DOCUMENT_SYSTEM_PROMPT,
  DOCUMENT_PROMPT_SUFFIX,
  type GenerateDocumentOptions,
} from "./generateDocument";

// Refinement
export {
  refineLanding,
  REFINE_SYSTEM,
  type RefineOptions,
} from "./refine";

// Deploy
export {
  deployToS3,
  deployToEasyBits,
  type DeployToS3Options,
  type DeployToEasyBitsOptions,
} from "./deploy";

// Images
export {
  searchImage,
  enrichImages,
  findImageSlots,
  generateImage,
  generateSvg,
  type PexelsResult,
  type EnrichImagesOptions,
} from "./images/index";

// Components (re-exported for convenience)
export {
  Canvas,
  type CanvasHandle,
  SectionList,
  FloatingToolbar,
  CodeEditor,
  ViewportToggle,
  type Viewport,
} from "./components/index";

// V4 HTML builders
export { buildDeployHtmlV4 } from "./buildHtmlV4";

// V4 GrapesJS ↔ Section3 conversion (browser-only)
export { grapesToSections } from "./grapesToSections";

// Hooks
export { useThumbnailCapture } from "./hooks/useThumbnailCapture";

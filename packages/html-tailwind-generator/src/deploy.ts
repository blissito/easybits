import { buildDeployHtml } from "./buildHtml";
import type { Section3 } from "./types";
import type { CustomColors } from "./themes";

export interface DeployToS3Options {
  /** The sections to deploy */
  sections: Section3[];
  /** Theme ID */
  theme?: string;
  /** Custom colors (when theme is "custom") */
  customColors?: CustomColors;
  /** S3-compatible upload function. Receives the HTML string, returns the URL */
  upload: (html: string) => Promise<string>;
}

/**
 * Deploy a landing page to any S3-compatible storage.
 * The consumer provides their own upload function.
 */
export async function deployToS3(options: DeployToS3Options): Promise<string> {
  const { sections, theme, customColors, upload } = options;
  const html = buildDeployHtml(sections, theme, customColors);
  return upload(html);
}

export interface DeployToEasyBitsOptions {
  /** EasyBits API key */
  apiKey: string;
  /** Website slug (e.g. "my-landing" → my-landing.easybits.cloud) */
  slug: string;
  /** The sections to deploy */
  sections: Section3[];
  /** Theme ID */
  theme?: string;
  /** Custom colors (when theme is "custom") */
  customColors?: CustomColors;
  /** EasyBits API base URL (default: https://easybits.cloud) */
  baseUrl?: string;
}

/**
 * Deploy a landing page to EasyBits hosting (slug.easybits.cloud).
 * Uses the EasyBits API to create/update a website.
 */
export async function deployToEasyBits(options: DeployToEasyBitsOptions): Promise<string> {
  const {
    apiKey,
    slug,
    sections,
    theme,
    customColors,
    baseUrl = "https://easybits.cloud",
  } = options;

  const html = buildDeployHtml(sections, theme, customColors);

  const res = await fetch(`${baseUrl}/api/v2/websites`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ slug, html }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Deploy failed" }));
    throw new Error(error.error || "Deploy failed");
  }

  const data = await res.json();
  return data.url || `https://${slug}.easybits.cloud`;
}

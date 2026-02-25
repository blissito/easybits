/**
 * @easybits.cloud/sdk — Official HTTP client for the Easybits API v2
 *
 * @example
 * ```ts
 * import { EasybitsClient } from "@easybits.cloud/sdk";
 *
 * const eb = new EasybitsClient({ apiKey: "eb_sk_live_..." });
 * const { items } = await eb.listFiles();
 * ```
 */

// ─── Types ───────────────────────────────────────────────────────

export interface EasybitsConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface EasybitsFile {
  id: string;
  name: string;
  contentType: string;
  size: number;
  status: string;
  access: string;
  createdAt: string;
  updatedAt: string;
  assetId?: string | null;
  downloadUrl?: string;
}

export interface ListFilesParams {
  assetId?: string;
  limit?: number;
  cursor?: string;
}

export interface ListFilesResponse {
  items: EasybitsFile[];
  nextCursor?: string | null;
  total: number;
}

export interface UploadFileParams {
  fileName: string;
  contentType: string;
  size: number;
  assetId?: string;
  access?: "public" | "private";
  region?: "LATAM" | "US" | "EU";
}

export interface UploadFileResponse {
  file: EasybitsFile;
  putUrl: string;
}

export interface OptimizeImageParams {
  fileId: string;
  format?: "webp" | "avif";
  quality?: number;
}

export interface OptimizeImageResponse {
  file: EasybitsFile;
  originalSize: number;
  optimizedSize: number;
  savings: string;
}

export interface ShareFileParams {
  fileId: string;
  targetEmail: string;
  canRead?: boolean;
  canWrite?: boolean;
  canDelete?: boolean;
}

export interface ShareFileResponse {
  id: string;
  fileId: string;
  targetEmail: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: string;
  createdAt: string;
  expiresAt?: string | null;
}

export class EasybitsError extends Error {
  constructor(
    public status: number,
    public body: string,
  ) {
    super(`Easybits API error ${status}: ${body}`);
    this.name = "EasybitsError";
  }
}

// ─── Client ──────────────────────────────────────────────────────

const DEFAULT_BASE_URL = "https://www.easybits.cloud";

export class EasybitsClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: EasybitsConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
  }

  // ── Internal ────────────────────────────────────────────────

  private async request<T>(path: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v2${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...opts?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new EasybitsError(res.status, body);
    }

    return res.json() as Promise<T>;
  }

  // ── Files ───────────────────────────────────────────────────

  async listFiles(params?: ListFilesParams): Promise<ListFilesResponse> {
    const search = new URLSearchParams();
    if (params?.assetId) search.set("assetId", params.assetId);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return this.request<ListFilesResponse>(`/files${qs ? `?${qs}` : ""}`);
  }

  async getFile(fileId: string): Promise<EasybitsFile> {
    return this.request<EasybitsFile>(`/files/${fileId}`);
  }

  async uploadFile(params: UploadFileParams): Promise<UploadFileResponse> {
    return this.request<UploadFileResponse>("/files", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async deleteFile(fileId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/files/${fileId}`, {
      method: "DELETE",
    });
  }

  async optimizeImage(params: OptimizeImageParams): Promise<OptimizeImageResponse> {
    const { fileId, ...body } = params;
    return this.request<OptimizeImageResponse>(`/files/${fileId}/optimize`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async shareFile(params: ShareFileParams): Promise<ShareFileResponse> {
    const { fileId, ...body } = params;
    return this.request<ShareFileResponse>(`/files/${fileId}/share`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ── Keys ────────────────────────────────────────────────────

  async listKeys(): Promise<{ keys: ApiKey[] }> {
    return this.request<{ keys: ApiKey[] }>("/keys");
  }

  // ── Config helpers ──────────────────────────────────────────

  /** Returns the base URL configured for this client */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Returns the MCP endpoint URL */
  getMcpUrl(): string {
    return `${this.baseUrl}/api/mcp`;
  }
}

// ─── Config file helpers (for CLI/MCP) ───────────────────────────

export interface RcConfig {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Read config from ~/.easybitsrc
 * Works in Node.js only (uses fs/os modules)
 */
export async function readRcConfig(): Promise<RcConfig> {
  try {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const { homedir } = await import("os");
    const rcPath = join(homedir(), ".easybitsrc");
    return JSON.parse(readFileSync(rcPath, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Write config to ~/.easybitsrc
 * Works in Node.js only
 */
export async function writeRcConfig(config: RcConfig): Promise<void> {
  const { writeFileSync } = await import("fs");
  const { join } = await import("path");
  const { homedir } = await import("os");
  const rcPath = join(homedir(), ".easybitsrc");
  const existing = await readRcConfig();
  writeFileSync(rcPath, JSON.stringify({ ...existing, ...config }, null, 2));
}

/**
 * Resolve API key from env or rc file
 */
export async function resolveApiKey(): Promise<string | undefined> {
  return process.env.EASYBITS_API_KEY || (await readRcConfig()).apiKey;
}

/**
 * Resolve base URL from env or rc file
 */
export async function resolveBaseUrl(): Promise<string> {
  return (
    process.env.EASYBITS_URL ||
    (await readRcConfig()).baseUrl ||
    DEFAULT_BASE_URL
  );
}

/**
 * Create client from env/rc config (for CLI/MCP usage)
 */
export async function createClientFromEnv(): Promise<EasybitsClient> {
  const apiKey = await resolveApiKey();
  if (!apiKey) {
    throw new Error(
      "No API key found. Set EASYBITS_API_KEY or run: easybits login <key>"
    );
  }
  const baseUrl = await resolveBaseUrl();
  return new EasybitsClient({ apiKey, baseUrl });
}

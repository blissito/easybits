/**
 * @easybits.cloud/sdk — Agentic-first file storage SDK
 *
 * The typed HTTP client for AI agents to manage, share, and transform files
 * via the Easybits API v2. Includes webhooks, bulk operations, and more.
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

export interface UpdateFileParams {
  name?: string;
  access?: "public" | "private";
  metadata?: Record<string, unknown>;
  status?: string;
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

export interface TransformImageParams {
  fileId: string;
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  format?: "webp" | "avif" | "png" | "jpeg";
  quality?: number;
  rotate?: number;
  flip?: boolean;
  grayscale?: boolean;
}

export interface TransformImageResponse {
  file: EasybitsFile;
  originalSize: number;
  transformedSize: number;
  transforms: string[];
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

export interface ShareToken {
  id: string;
  fileId: string;
  source: string;
  expiresAt: string;
  createdAt: string;
  expired?: boolean;
}

export interface GenerateShareTokenResponse {
  url: string;
  token: ShareToken;
}

export interface ListShareTokensParams {
  fileId?: string;
  limit?: number;
  cursor?: string;
}

export interface ListShareTokensResponse {
  items: (ShareToken & { file?: { name: string } })[];
  nextCursor?: string | null;
}

export interface DeletedFile extends EasybitsFile {
  daysUntilPurge: number;
  deletedAt: string;
}

export interface ListDeletedFilesParams {
  limit?: number;
  cursor?: string;
}

export interface ListDeletedFilesResponse {
  items: DeletedFile[];
  nextCursor?: string | null;
}

export interface Website {
  id: string;
  name: string;
  slug: string;
  status: string;
  fileCount?: number;
  totalSize?: number;
  prefix?: string;
  createdAt: string;
  url: string;
}

export interface UpdateWebsiteParams {
  name?: string;
  status?: string;
}

export interface StorageProvider {
  id: string;
  name: string;
  type: string;
  region: string;
  isDefault: boolean;
  createdAt: string;
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

// ─── Webhook Types ─────────────────────────────────────────────

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  status: string;
  failCount: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookParams {
  url: string;
  events: string[];
}

export interface CreateWebhookResponse extends Webhook {
  secret: string;
}

export interface UpdateWebhookParams {
  url?: string;
  events?: string[];
  status?: "ACTIVE" | "PAUSED";
}

// ─── Usage Stats Types ─────────────────────────────────────────

export interface UsageStats {
  plan: string;
  storage: {
    usedBytes: number;
    maxBytes: number;
    usedGB: number;
    maxGB: number;
    percentUsed: number;
  };
  counts: {
    files: number;
    deletedFiles: number;
    websites: number;
    webhooks: number;
  };
}

// ─── Bulk Types ────────────────────────────────────────────────

export interface BulkUploadItem {
  fileName: string;
  contentType: string;
  size: number;
  access?: "public" | "private";
}

export interface BulkDeleteResponse {
  deleted: number;
  ids: string[];
}

export interface Permission {
  id: string;
  email: string;
  displayName?: string | null;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  createdAt: string;
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

  async updateFile(fileId: string, params: UpdateFileParams): Promise<EasybitsFile> {
    return this.request<EasybitsFile>(`/files/${fileId}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
  }

  async deleteFile(fileId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/files/${fileId}`, {
      method: "DELETE",
    });
  }

  async restoreFile(fileId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/files/${fileId}/restore`, {
      method: "POST",
    });
  }

  async listDeletedFiles(params?: ListDeletedFilesParams): Promise<ListDeletedFilesResponse> {
    const search = new URLSearchParams({ status: "DELETED" });
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.cursor) search.set("cursor", params.cursor);
    return this.request<ListDeletedFilesResponse>(`/files?${search}`);
  }

  // ── Images ──────────────────────────────────────────────────

  async optimizeImage(params: OptimizeImageParams): Promise<OptimizeImageResponse> {
    const { fileId, ...body } = params;
    return this.request<OptimizeImageResponse>(`/files/${fileId}/optimize`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async transformImage(params: TransformImageParams): Promise<TransformImageResponse> {
    const { fileId, ...body } = params;
    return this.request<TransformImageResponse>(`/files/${fileId}/transform`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  // ── Sharing ─────────────────────────────────────────────────

  async shareFile(params: ShareFileParams): Promise<ShareFileResponse> {
    const { fileId, ...body } = params;
    return this.request<ShareFileResponse>(`/files/${fileId}/share`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async generateShareToken(fileId: string, expiresIn?: number): Promise<GenerateShareTokenResponse> {
    return this.request<GenerateShareTokenResponse>(`/files/${fileId}/share-token`, {
      method: "POST",
      body: JSON.stringify({ expiresIn }),
    });
  }

  async listShareTokens(params?: ListShareTokensParams): Promise<ListShareTokensResponse> {
    const search = new URLSearchParams();
    if (params?.fileId) search.set("fileId", params.fileId);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return this.request<ListShareTokensResponse>(`/share-tokens${qs ? `?${qs}` : ""}`);
  }

  // ── Search ──────────────────────────────────────────────────

  async searchFiles(query: string): Promise<{ items: EasybitsFile[] }> {
    return this.request<{ items: EasybitsFile[] }>(`/files/search?q=${encodeURIComponent(query)}`);
  }

  // ── Websites ────────────────────────────────────────────────

  async listWebsites(): Promise<{ items: Website[] }> {
    return this.request<{ items: Website[] }>("/websites");
  }

  async createWebsite(name: string): Promise<{ website: Website }> {
    return this.request<{ website: Website }>("/websites", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  async getWebsite(websiteId: string): Promise<Website> {
    return this.request<Website>(`/websites/${websiteId}`);
  }

  async updateWebsite(websiteId: string, params: UpdateWebsiteParams): Promise<{ ok: boolean; website: Website }> {
    return this.request<{ ok: boolean; website: Website }>(`/websites/${websiteId}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
  }

  async deleteWebsite(websiteId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/websites/${websiteId}`, {
      method: "DELETE",
    });
  }

  // ── Providers ───────────────────────────────────────────────

  async listProviders(): Promise<{ providers: StorageProvider[]; defaultProvider?: { type: string; note: string } }> {
    return this.request(`/providers`);
  }

  // ── Keys ────────────────────────────────────────────────────

  async listKeys(): Promise<{ keys: ApiKey[] }> {
    return this.request<{ keys: ApiKey[] }>("/keys");
  }

  // ── Webhooks ───────────────────────────────────────────────

  async listWebhooks(): Promise<{ items: Webhook[] }> {
    return this.request<{ items: Webhook[] }>("/webhooks");
  }

  async createWebhook(params: CreateWebhookParams): Promise<CreateWebhookResponse> {
    return this.request<CreateWebhookResponse>("/webhooks", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getWebhook(webhookId: string): Promise<Webhook> {
    return this.request<Webhook>(`/webhooks/${webhookId}`);
  }

  async updateWebhook(webhookId: string, params: UpdateWebhookParams): Promise<Webhook> {
    return this.request<Webhook>(`/webhooks/${webhookId}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
  }

  async deleteWebhook(webhookId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/webhooks/${webhookId}`, {
      method: "DELETE",
    });
  }

  // ── Usage & Bulk ───────────────────────────────────────────

  async getUsageStats(): Promise<UsageStats> {
    return this.request<UsageStats>("/usage");
  }

  async bulkDeleteFiles(fileIds: string[]): Promise<BulkDeleteResponse> {
    return this.request<BulkDeleteResponse>("/files/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ fileIds }),
    });
  }

  async bulkUploadFiles(items: BulkUploadItem[]): Promise<{ items: UploadFileResponse[] }> {
    return this.request<{ items: UploadFileResponse[] }>("/files/bulk-upload", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  }

  async listPermissions(fileId: string): Promise<{ items: Permission[] }> {
    return this.request<{ items: Permission[] }>(`/files/${fileId}/permissions`);
  }

  async duplicateFile(fileId: string, name?: string): Promise<EasybitsFile> {
    return this.request<EasybitsFile>(`/files/${fileId}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
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

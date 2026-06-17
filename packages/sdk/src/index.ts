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
  /** True when more pages exist — pass `nextCursor` as `cursor` to fetch them. */
  hasMore?: boolean;
  total?: number;
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
  hasMore?: boolean;
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
  hasMore?: boolean;
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
  assetId?: string;
  region?: "LATAM" | "US" | "EU";
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

// ─── Database Types ──────────────────────────────────────────

export interface EasybitsDatabase {
  id: string;
  name: string;
  namespace: string;
  description: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface DatabaseQueryResult {
  cols: string[];
  rows: unknown[][];
  affected_row_count: number;
  last_insert_rowid: string | null;
}

// ─── Presentation Types ───────────────────────────────────────

export interface PresentationSlide {
  id: string;
  order: number;
  type?: "2d" | "3d";
  html?: string;
}

export interface Presentation {
  id: string;
  name: string;
  prompt: string;
  slides: PresentationSlide[];
  theme: string;
  status: string;
  websiteId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePresentationParams {
  name: string;
  prompt: string;
  slides?: PresentationSlide[];
  theme?: string;
}

export interface UpdatePresentationParams {
  name?: string;
  prompt?: string;
  slides?: PresentationSlide[];
  theme?: string;
}

export interface DeployPresentationResponse {
  url: string;
  websiteId: string;
  slug: string;
}

// ─── Document Types ──────────────────────────────────────────

export interface DocumentSection {
  id: string;
  order: number;
  html?: string;
  type?: string;
  name?: string;
}

export interface Document {
  id: string;
  name: string;
  prompt: string;
  sections: DocumentSection[];
  status: string;
  websiteId?: string | null;
  theme?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentParams {
  name: string;
  prompt?: string;
  sections?: DocumentSection[];
  theme?: string;
  customColors?: Record<string, string>;
}

export interface UpdateDocumentParams {
  name?: string;
  prompt?: string;
  sections?: DocumentSection[];
  theme?: string;
  customColors?: Record<string, string>;
}

export interface DeployDocumentResponse {
  url: string;
  websiteId: string;
  slug: string;
  customUrl?: string;
}

export interface AddPageParams {
  html?: string;
  afterPageIndex?: number;
  label?: string;
}

export interface GenerateDocumentParams {
  prompt: string;
  pageCount?: number;
  direction?: {
    name?: string;
    headingFont?: string;
    bodyFont?: string;
    colors?: { primary: string; accent: string; surface: string; surfaceAlt: string; text: string };
    mood?: string;
    layoutHint?: string;
  };
  extraInstructions?: string;
  logoUrl?: string;
  skipCover?: boolean;
  sourceContent?: string;
  /** Single reference image as base64 data URL or image URL — AI will replicate this design */
  referenceImage?: string;
  /** Per-page reference images (e.g. rendered from PDF pages) — each index maps to a page */
  referencePages?: string[];
}

export interface GenerateDocumentResult {
  sections: DocumentSection[];
  total: number;
}

export interface RefineDocumentParams {
  sectionId: string;
  instruction: string;
  direction?: GenerateDocumentParams["direction"];
}

export interface RegeneratePageParams {
  sectionId: string;
  direction?: GenerateDocumentParams["direction"];
}

export interface DocumentDirection {
  name: string;
  headingFont: string;
  bodyFont: string;
  colors: Record<string, string>;
  mood: string;
  layoutHint: string;
  coverHtml?: string;
}

export interface EnhancePromptResult {
  enhanced: string;
}

// ─── Sandbox templates + persistent agents ───────────────────────

export type AgentTier =
  | "chat-embed"
  | "coding-harness"
  | "autonomous"
  | "custom"
  | "base";

export type AgentTemplate =
  | "ubuntu"
  | "python"
  | "node"
  | "node-agent"
  | "bun"
  | "claude-code"
  | "goose"
  | "ghostyclaw"
  | "openclaw"
  | "chat-openai"
  | "chat-anthropic";

export interface TemplateAgentSpec {
  port?: number;
  protocol?: "http" | "sse" | "ws" | "cli-stdin";
  health_path?: string;
  health_command?: string;
}

export interface TemplateEnvSpec {
  name: string;
  label?: string;
  secret?: boolean;
  required?: boolean;
  default?: string;
}

export interface TemplateConnectionMode {
  id: string;
  label: string;
}

export interface TemplateInfo {
  name: string;
  display?: string;
  description?: string;
  tier?: AgentTier;
  image: string;
  memoryMb: number;
  vcpus: number;
  agent?: TemplateAgentSpec;
  requiredEnv?: TemplateEnvSpec[];
  connectionModes?: TemplateConnectionMode[];
}

export interface AgentInfo {
  agentId: string;
  embedToken: string;
  sandboxId: string;
  agentUrl: string;
  healthUrl?: string;
  template: AgentTemplate;
  expiresAt?: string | null;
}

export interface AgentRecord {
  agentId: string;
  ownerId: string;
  sandboxId: string;
  agentUrl: string;
  template: string;
  embedToken: string;
  name: string | null;
  status: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface CreateAgentParams {
  template: AgentTemplate;
  env: Record<string, string>;
  name?: string;
  timeoutSeconds?: number;
  port?: number;
  healthPath?: string;
}

export interface SpawnGhostyParams {
  name?: string;
  systemPrompt?: string;
  timeoutSeconds?: number;
}

export interface MessageAgentParams {
  content: string;
  sessionId?: string;
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

// ─── eb.compute (LLM managed, cobrado por token) ─────────────────

export interface ComputeMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | unknown[];
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface ComputeChatParams {
  /** "gemini-flash" (default) | "gemini-pro" | "gpt-4o-mini" | "claude-sonnet" */
  model?: string;
  messages: ComputeMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: unknown[];
  tool_choice?: unknown;
}

export interface ComputeChatResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string | null; tool_calls?: unknown[] };
    finish_reason: string;
  }>;
  /** `cost` = créditos cobrados por esta llamada (estilo OpenRouter). */
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
  };
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

  async revokeShareToken(tokenId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/share-tokens/${tokenId}`, {
      method: "DELETE",
    });
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

  async listWebsiteFiles(websiteId: string, params?: { limit?: number; cursor?: string }): Promise<ListFilesResponse> {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return this.request<ListFilesResponse>(`/websites/${websiteId}/files${qs ? `?${qs}` : ""}`);
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

  async revokePermission(permissionId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/permissions/${permissionId}`, {
      method: "DELETE",
    });
  }

  async duplicateFile(fileId: string, name?: string): Promise<EasybitsFile> {
    return this.request<EasybitsFile>(`/files/${fileId}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  // ── Presentations ──────────────────────────────────────────

  async listPresentations(): Promise<{ items: Presentation[] }> {
    return this.request<{ items: Presentation[] }>("/presentations");
  }

  async getPresentation(presentationId: string): Promise<Presentation> {
    return this.request<Presentation>(`/presentations/${presentationId}`);
  }

  async createPresentation(params: CreatePresentationParams): Promise<Presentation> {
    return this.request<Presentation>("/presentations", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async updatePresentation(presentationId: string, params: UpdatePresentationParams): Promise<Presentation> {
    return this.request<Presentation>(`/presentations/${presentationId}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
  }

  async deletePresentation(presentationId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/presentations/${presentationId}`, {
      method: "DELETE",
    });
  }

  async deployPresentation(presentationId: string): Promise<DeployPresentationResponse> {
    return this.request<DeployPresentationResponse>(`/presentations/${presentationId}/deploy`, {
      method: "POST",
    });
  }

  async unpublishPresentation(presentationId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/presentations/${presentationId}/unpublish`, {
      method: "POST",
    });
  }

  // ── Documents ──────────────────────────────────────────────

  async listDocuments(): Promise<{ items: Document[] }> {
    return this.request<{ items: Document[] }>("/documents");
  }

  async getDocument(documentId: string): Promise<Document> {
    return this.request<Document>(`/documents/${documentId}`);
  }

  async createDocument(params: CreateDocumentParams): Promise<Document> {
    return this.request<Document>("/documents", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async updateDocument(documentId: string, params: UpdateDocumentParams): Promise<Document> {
    return this.request<Document>(`/documents/${documentId}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
  }

  async deleteDocument(documentId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/documents/${documentId}`, {
      method: "DELETE",
    });
  }

  async deployDocument(documentId: string): Promise<DeployDocumentResponse> {
    return this.request<DeployDocumentResponse>(`/documents/${documentId}/deploy`, {
      method: "POST",
    });
  }

  async unpublishDocument(documentId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/documents/${documentId}/unpublish`, {
      method: "POST",
    });
  }

  // ── Document Pages ──────────────────────────────────────────

  async addPage(documentId: string, params?: AddPageParams): Promise<DocumentSection> {
    return this.request<DocumentSection>(`/documents/${documentId}/pages`, {
      method: "POST",
      body: JSON.stringify(params || {}),
    });
  }

  async deletePage(documentId: string, pageId: string): Promise<{ success: boolean; remainingPages: number }> {
    return this.request<{ success: boolean; remainingPages: number }>(`/documents/${documentId}/pages/${pageId}`, {
      method: "DELETE",
    });
  }

  async reorderPages(documentId: string, pageIds: string[]): Promise<Array<{ id: string; order: number; name?: string }>> {
    return this.request<Array<{ id: string; order: number; name?: string }>>(`/documents/${documentId}/pages/reorder`, {
      method: "PUT",
      body: JSON.stringify({ pageIds }),
    });
  }

  async getPageHtml(documentId: string, pageId: string): Promise<DocumentSection> {
    return this.request<DocumentSection>(`/documents/${documentId}/pages/${pageId}`);
  }

  async setPageHtml(documentId: string, pageId: string, html: string): Promise<{ success: boolean; pageId: string }> {
    return this.request<{ success: boolean; pageId: string }>(`/documents/${documentId}/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify({ html }),
    });
  }

  async getSectionHtml(documentId: string, pageId: string, selector: string): Promise<{ html: string; tagName: string }> {
    return this.request<{ html: string; tagName: string }>(
      `/documents/${documentId}/pages/${pageId}/element?selector=${encodeURIComponent(selector)}`
    );
  }

  async setSectionHtml(documentId: string, pageId: string, selector: string, html: string): Promise<{ success: boolean; pageId: string; cssSelector: string }> {
    return this.request<{ success: boolean; pageId: string; cssSelector: string }>(
      `/documents/${documentId}/pages/${pageId}/element?selector=${encodeURIComponent(selector)}`,
      { method: "PATCH", body: JSON.stringify({ html }) }
    );
  }

  // ── Document AI ─────────────────────────────────────────────

  async generateDocument(documentId: string, params: GenerateDocumentParams): Promise<GenerateDocumentResult> {
    return this.consumeSSE<GenerateDocumentResult>("/document-generate", {
      method: "POST",
      body: JSON.stringify({ landingId: documentId, ...params }),
    }, (events) => {
      const sections: DocumentSection[] = [];
      for (const e of events) {
        if (e.type === "section" && e.data) sections.push(e.data as DocumentSection);
        if (e.type === "section-update" && e.data) {
          const update = e.data as { id: string; html: string };
          const s = sections.find((s) => s.id === update.id);
          if (s) s.html = update.html;
        }
      }
      return { sections, total: sections.length };
    });
  }

  async refineDocument(documentId: string, params: RefineDocumentParams): Promise<{ html: string }> {
    return this.consumeSSE<{ html: string }>("/document-refine", {
      method: "POST",
      body: JSON.stringify({ landingId: documentId, ...params }),
    }, (events) => {
      const last = events.filter((e) => e.type === "result" || e.type === "done").pop();
      return { html: (last?.data as any)?.html || "" };
    });
  }

  async regenerateDocumentPage(documentId: string, params: RegeneratePageParams): Promise<{ html: string }> {
    return this.refineDocument(documentId, { ...params, instruction: "__VARIANT__" });
  }

  async getDocumentDirections(prompt: string, opts?: { pageCount?: number }): Promise<DocumentDirection[]> {
    return this.consumeSSE<DocumentDirection[]>("/document-directions", {
      method: "POST",
      body: JSON.stringify({ prompt, pageCount: opts?.pageCount }),
    }, (events) => {
      return events
        .filter((e) => e.type === "direction")
        .map((e) => e.data as DocumentDirection);
    });
  }

  async enhanceDocumentPrompt(name: string, prompt?: string): Promise<EnhancePromptResult> {
    const action = prompt ? "enhance" : "auto-describe";
    const result = await this.request<{ enhanced?: string; description?: string }>("/document-enhance", {
      method: "POST",
      body: JSON.stringify({ name, prompt, _action: action }),
    });
    return { enhanced: result.enhanced || result.description || "" };
  }

  // ── SSE helper ──────────────────────────────────────────────

  private async consumeSSE<T>(
    path: string,
    opts: RequestInit,
    collect: (events: Array<{ type: string; data: unknown }>) => T
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}/api/v2${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...opts.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new EasybitsError(res.status, body);
    }

    const text = await res.text();
    const events: Array<{ type: string; data: unknown }> = [];
    let currentType = "";

    for (const line of text.split("\n")) {
      if (line.startsWith("event: ")) {
        currentType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const raw = line.slice(6);
        try {
          events.push({ type: currentType || "message", data: JSON.parse(raw) });
        } catch {
          events.push({ type: currentType || "message", data: raw });
        }
        currentType = "";
      }
    }

    return collect(events);
  }

  // ── Databases ─────────────────────────────────────────────

  async listDatabases(): Promise<{ items: EasybitsDatabase[] }> {
    return this.request<{ items: EasybitsDatabase[] }>("/databases");
  }

  async createDatabase(params: { name: string; description?: string }): Promise<EasybitsDatabase> {
    return this.request<EasybitsDatabase>("/databases", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getDatabase(dbId: string): Promise<EasybitsDatabase> {
    return this.request<EasybitsDatabase>(`/databases/${dbId}`);
  }

  async deleteDatabase(dbId: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/databases/${dbId}`, {
      method: "DELETE",
    });
  }

  async queryDatabase(dbId: string, sql: string, args?: unknown[]): Promise<DatabaseQueryResult> {
    return this.request<DatabaseQueryResult>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({ sql, args }),
    });
  }

  async execDatabase(dbId: string, statements: Array<{ sql: string; args?: unknown[] }>): Promise<{ results: DatabaseQueryResult[] }> {
    return this.request<{ results: DatabaseQueryResult[] }>(`/databases/${dbId}/query`, {
      method: "POST",
      body: JSON.stringify({ statements }),
    });
  }

  /**
   * Sugar helper: `eb.db('my-db')` returns a DatabaseHandle that auto-resolves
   * the database by name (creates it if it doesn't exist).
   */
  db(name: string): DatabaseHandle {
    return new DatabaseHandle(this, name);
  }

  // ── Config helpers ──────────────────────────────────────────

  /** Returns the base URL configured for this client */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** Get the EasyBits API reference documentation */
  async getDocs(section?: string): Promise<string> {
    const qs = section ? `?section=${encodeURIComponent(section)}` : "";
    const res = await fetch(`${this.baseUrl}/api/v2/docs${qs}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`getDocs failed: ${res.status}`);
    return res.text();
  }

  /** Returns the MCP endpoint URL */
  getMcpUrl(): string {
    return `${this.baseUrl}/api/mcp`;
  }

  // ── Templates ───────────────────────────────────────────────

  /** List sandbox templates available in the catalog. Pass tier to filter. */
  async listTemplates(params?: { tier?: AgentTier }): Promise<TemplateInfo[]> {
    const qs = params?.tier ? `?tier=${encodeURIComponent(params.tier)}` : "";
    const out = await this.request<{ templates: TemplateInfo[] }>(
      `/templates${qs}`,
    );
    return out.templates;
  }

  // ── Agents ──────────────────────────────────────────────────

  /** List agents owned by this client. */
  async listAgents(): Promise<AgentRecord[]> {
    const out = await this.request<{ agents: AgentRecord[] }>("/agents");
    return out.agents;
  }

  /** Get a single agent record (owner-only). */
  async getAgent(agentId: string): Promise<AgentRecord> {
    return this.request<AgentRecord>(`/agents/${agentId}`);
  }

  /** Generic agent spawn: pick template + provide env. */
  async createAgent(params: CreateAgentParams): Promise<AgentInfo> {
    return this.request<AgentInfo>("/agents", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  /** Zero-config Ghosty: managed credentials, Haiku 4.5, generic prompt. */
  async spawnGhosty(params?: SpawnGhostyParams): Promise<AgentInfo> {
    return this.request<AgentInfo>("/agents/ghosty", {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
  }

  /** Destroy an agent + its underlying sandbox. */
  async destroyAgent(agentId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(`/agents/${agentId}`, {
      method: "DELETE",
    });
  }

  /**
   * Send a message and collect the SSE stream into a single assembled string.
   * For real-time streaming use streamAgent instead.
   */
  async messageAgent(
    agentId: string,
    params: MessageAgentParams,
  ): Promise<{ content: string; tokens: number }> {
    let assembled = "";
    let tokens = 0;
    for await (const tok of this.streamAgent(agentId, params)) {
      assembled += tok;
      tokens++;
    }
    return { content: assembled, tokens };
  }

  /**
   * Stream tokens from an agent message as an AsyncIterable<string>.
   * Each yielded string is one token's text. Server-side only (Node fetch
   * supports ReadableStream readers; in browsers prefer EventSource directly
   * against /api/v2/agents/:id/message with the embedToken).
   */
  async *streamAgent(
    agentId: string,
    params: MessageAgentParams,
  ): AsyncGenerator<string, void, void> {
    const res = await fetch(`${this.baseUrl}/api/v2/agents/${agentId}/message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new EasybitsError(res.status, body);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try {
          const evt = JSON.parse(dataLine.slice(6));
          if (evt.type === "token" && typeof evt.value === "string") {
            yield evt.value as string;
          } else if (evt.type === "error") {
            throw new Error(`agent stream error: ${evt.message}`);
          }
        } catch {
          // ignore non-JSON event lines
        }
      }
    }
  }

  // ── Sandboxes (raw microVMs) ────────────────────────────────
  //
  // Low-level Firecracker microVMs: run code, manage files, expose ports.
  // Distinct from agents (managed). Mirrors E2B's Sandbox DX.
  //
  //   const sbx = await eb.sandboxes.create({ template: "code-interpreter" });
  //   await sbx.runCell("x = 41");
  //   const { url } = await sbx.exposePort(3000);
  //   await sbx.destroy();
  /**
   * eb.compute — LLM managed (Gemini/GPT/Claude) cobrado por token contra tus
   * créditos. No traes key de proveedor: usas tu API key de EasyBits.
   *
   *   const json = await eb.compute.prompt("Clasifica este ticket...");
   *   const r = await eb.compute.chat({ model: "gemini-flash", messages: [...] });
   */
  get compute() {
    const req = <T>(path: string, opts?: RequestInit) => this.request<T>(path, opts);
    return {
      /** Chat completion OpenAI-compatible (soporta tools y visión). */
      chat: (params: ComputeChatParams): Promise<ComputeChatResponse> =>
        req<ComputeChatResponse>("/compute/v1/chat/completions", {
          method: "POST",
          body: JSON.stringify(params),
        }),
      /** Atajo: prompt → texto de respuesta. */
      prompt: async (
        prompt: string,
        opts?: { model?: string; system?: string; temperature?: number },
      ): Promise<string> => {
        const messages: ComputeMessage[] = [];
        if (opts?.system) messages.push({ role: "system", content: opts.system });
        messages.push({ role: "user", content: prompt });
        const r = await req<ComputeChatResponse>("/compute/v1/chat/completions", {
          method: "POST",
          body: JSON.stringify({
            model: opts?.model ?? "gemini-flash",
            messages,
            temperature: opts?.temperature,
          }),
        });
        return r.choices?.[0]?.message?.content ?? "";
      },
    };
  }

  get sandboxes() {
    const req = <T>(path: string, opts?: RequestInit) =>
      this.request<T>(path, opts);
    return {
      /** Spawn a microVM. Waits until it's running unless waitForReady=false. */
      create: async (params: CreateSandboxParams): Promise<Sandbox> => {
        const rec = await req<SandboxRecord>("/sandboxes", {
          method: "POST",
          body: JSON.stringify(params),
        });
        const sbx = new Sandbox(rec, req);
        if (params.waitForReady !== false) await sbx.waitUntilReady();
        return sbx;
      },
      /** List the caller's sandboxes. */
      list: async (): Promise<Sandbox[]> => {
        const { sandboxes } = await req<{ sandboxes: SandboxRecord[] }>(
          "/sandboxes",
        );
        return sandboxes.map((r) => new Sandbox(r, req));
      },
      /** Reconnect to an existing sandbox by id. */
      get: async (sandboxId: string): Promise<Sandbox> => {
        const rec = await req<SandboxRecord>(`/sandboxes/${sandboxId}`);
        return new Sandbox(rec, req);
      },
    };
  }
}

// ─── Sandbox handle ──────────────────────────────────────────────

type SandboxReq = <T>(path: string, opts?: RequestInit) => Promise<T>;

/**
 * A live Firecracker microVM. Returned by `eb.sandboxes.create()`.
 * Instance methods map 1:1 to the sandbox REST API.
 */
export class Sandbox {
  readonly sandboxId: string;
  readonly template: SandboxTemplate;
  status: SandboxStatus;
  createdAt: string;
  expiresAt: string;
  metadata?: Record<string, string>;
  private req: SandboxReq;
  /** Filesystem operations inside the sandbox. */
  readonly files: SandboxFiles;

  constructor(record: SandboxRecord, req: SandboxReq) {
    this.sandboxId = record.sandboxId;
    this.template = record.template;
    this.status = record.status;
    this.createdAt = record.createdAt;
    this.expiresAt = record.expiresAt;
    this.metadata = record.metadata;
    this.req = req;
    this.files = new SandboxFiles(record.sandboxId, req);
  }

  private base() {
    return `/sandboxes/${this.sandboxId}`;
  }
  private post<T>(path: string, body?: unknown): Promise<T> {
    return this.req<T>(`${this.base()}${path}`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  }

  // ── Lifecycle ──
  /** Refresh this handle's status from the server. */
  async refresh(): Promise<this> {
    const rec = await this.req<SandboxRecord>(this.base());
    this.status = rec.status;
    this.expiresAt = rec.expiresAt;
    this.metadata = rec.metadata;
    return this;
  }
  /** Poll until status is "running" (or throw on error/stopped/timeout). */
  async waitUntilReady(timeoutMs = 60_000, intervalMs = 1500): Promise<this> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      await this.refresh();
      if (this.status === "running") return this;
      if (this.status === "error" || this.status === "stopped" || this.status === "lost")
        throw new EasybitsError(409, `sandbox is ${this.status}`);
      await sleep(intervalMs);
    }
    throw new EasybitsError(504, `sandbox not running after ${timeoutMs}ms`);
  }
  /** Extend the TTL before auto-destroy. No-op on persistent boxes. */
  extend(extendSeconds?: number): Promise<SandboxRecord> {
    return this.post("/extend", { extendSeconds });
  }
  /** Snapshot to disk and free CPU/IP. TTL keeps counting. */
  suspend(): Promise<SandboxRecord> {
    return this.post("/suspend");
  }
  /** Restore a suspended sandbox. */
  resume(): Promise<SandboxRecord> {
    return this.post("/resume");
  }
  /** Destroy the microVM. */
  destroy(): Promise<{ ok: true }> {
    return this.req(this.base(), { method: "DELETE" });
  }

  // ── Execution ──
  /** Run a blocking shell command. */
  exec(
    command: string,
    opts?: { cwd?: string; timeoutSeconds?: number; env?: Record<string, string> },
  ): Promise<ExecResult> {
    return this.post("/exec", { command, ...opts });
  }
  /** Run a code snippet in a FRESH process (no state between calls). */
  runCode(
    code: string,
    opts?: { lang?: "python" | "node" | "bash"; timeoutSeconds?: number },
  ): Promise<ExecResult> {
    return this.post("/run-code", { code, ...opts });
  }
  /**
   * Run a cell in the PERSISTENT Jupyter kernel (state survives across calls,
   * matplotlib charts returned as image/png). Requires template "code-interpreter".
   * Retries briefly while the kernel finishes booting on the first call.
   */
  async runCell(
    code: string,
    opts?: { timeoutSeconds?: number },
  ): Promise<RunCellResult> {
    let lastErr: unknown;
    for (let i = 0; i < 8; i++) {
      try {
        return await this.post<RunCellResult>("/run-cell", { code, ...opts });
      } catch (e) {
        if (e instanceof EasybitsError && /kernel sidecar unavailable/i.test(e.message)) {
          lastErr = e;
          await sleep(3000);
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }
  /** Restart the Jupyter kernel (clears all state). */
  kernelRestart(): Promise<{ ok: true }> {
    return this.post("/kernel-restart");
  }

  // ── Background processes ──
  /** Start a long-running command. Returns an execId to poll. */
  execBackground(
    command: string,
    opts?: { cwd?: string; env?: Record<string, string> },
  ): Promise<BgStartResult> {
    return this.post("/bg", { command, ...opts });
  }
  /** Poll a background process: status + captured stdout/stderr. */
  bgStatus(execId: string): Promise<BgStatusResult> {
    return this.req(`${this.base()}/bg/${encodeURIComponent(execId)}`);
  }
  /** Kill a background process. */
  bgKill(execId: string): Promise<{ ok: true }> {
    return this.req(`${this.base()}/bg/${encodeURIComponent(execId)}`, {
      method: "DELETE",
    });
  }

  // ── Networking ──
  /** Expose a port as a public HTTPS URL (sb-<id>-<port>.sandboxes.easybits.cloud). */
  exposePort(port: number): Promise<ExposedPort> {
    return this.post("/expose", { port });
  }
}

/** Filesystem sub-API for a Sandbox (sbx.files.*). */
export class SandboxFiles {
  constructor(private sandboxId: string, private req: SandboxReq) {}
  private base() {
    return `/sandboxes/${this.sandboxId}/files`;
  }
  write(
    path: string,
    content: string,
    opts?: { encoding?: "utf8" | "base64" },
  ): Promise<{ ok: true; bytes: number }> {
    return this.req(`${this.base()}/write`, {
      method: "POST",
      body: JSON.stringify({ path, content, ...opts }),
    });
  }
  read(
    path: string,
    opts?: { encoding?: "utf8" | "base64" },
  ): Promise<{ content: string; size: number; encoding: string }> {
    const qs = new URLSearchParams({ path });
    if (opts?.encoding) qs.set("encoding", opts.encoding);
    return this.req(`${this.base()}/read?${qs.toString()}`);
  }
  list(path: string): Promise<{ entries: SandboxFileEntry[] }> {
    const qs = new URLSearchParams({ path });
    return this.req(`${this.base()}/list?${qs.toString()}`);
  }
  delete(path: string, opts?: { recursive?: boolean }): Promise<{ ok: true }> {
    return this.req(`${this.base()}/delete`, {
      method: "POST",
      body: JSON.stringify({ path, ...opts }),
    });
  }
  move(from: string, to: string): Promise<{ ok: true }> {
    return this.req(`${this.base()}/move`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    });
  }
  mkdir(path: string): Promise<{ ok: true }> {
    return this.req(`${this.base()}/mkdir`, {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Sandbox types ───────────────────────────────────────────────

export type SandboxTemplate =
  | "ubuntu"
  | "python"
  | "node"
  | "node-agent"
  | "bun"
  | "claude-code"
  | "goose"
  | "ghostyclaw"
  | "openclaw"
  | "chat-openai"
  | "chat-anthropic"
  | "code-interpreter";

export type SandboxStatus =
  | "starting"
  | "running"
  | "stopped"
  | "error"
  | "lost"
  | "suspended";

export interface CreateSandboxParams {
  template: SandboxTemplate;
  timeoutSeconds?: number;
  name?: string;
  metadata?: Record<string, string>;
  /** Wait until status is "running" before returning (default true). */
  waitForReady?: boolean;
}

export interface SandboxRecord {
  sandboxId: string;
  template: SandboxTemplate;
  status: SandboxStatus;
  createdAt: string;
  expiresAt: string;
  ownerId: string;
  metadata?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated?: boolean;
}

export interface SandboxFileEntry {
  name: string;
  path: string;
  size: number;
  isDir: boolean;
  modifiedAt: string;
}

export interface CellResult {
  /** MIME type, e.g. "text/plain", "image/png", "text/html". */
  type: string;
  /** Payload (base64 for image/png). */
  data: string;
}

export interface RunCellResult {
  stdout: string;
  stderr: string;
  results: CellResult[];
  error?: { ename: string; evalue: string; traceback: string[] } | null;
}

export interface ExposedPort {
  url: string;
  host: string;
  port: number;
}

export interface BgStartResult {
  execId: string;
  status: string;
}

export interface BgStatusResult {
  status: "running" | "exited";
  exitCode?: number;
  stdout: string;
  stderr: string;
  startedAt: string;
}

// ─── DatabaseHandle ──────────────────────────────────────────────

export class DatabaseHandle {
  private _id: string | null = null;

  constructor(private client: EasybitsClient, private name: string) {}

  private async resolveId(): Promise<string> {
    if (this._id) return this._id;
    const { items } = await this.client.listDatabases();
    const found = items.find((d) => d.name === this.name);
    if (found) {
      this._id = found.id;
      return found.id;
    }
    const created = await this.client.createDatabase({ name: this.name });
    this._id = created.id;
    return created.id;
  }

  async query(sql: string, args?: unknown[]): Promise<DatabaseQueryResult> {
    const id = await this.resolveId();
    return this.client.queryDatabase(id, sql, args);
  }

  async exec(statements: Array<{ sql: string; args?: unknown[] }>): Promise<{ results: DatabaseQueryResult[] }> {
    const id = await this.resolveId();
    return this.client.execDatabase(id, statements);
  }

  async delete(): Promise<{ success: boolean }> {
    const id = await this.resolveId();
    this._id = null;
    return this.client.deleteDatabase(id);
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

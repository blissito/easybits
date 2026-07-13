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

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  status: string;
  /** Per-workspace storage cap in bytes; null = only the account plan ceiling applies. */
  quotaBytes: number | null;
  usedBytes: number;
  fileCount: number;
  createdAt: string;
}

export interface CreateWorkspaceParams {
  name: string;
  slug?: string;
  quotaBytes?: number;
}

export interface UpdateWorkspaceParams {
  name?: string;
  status?: string;
  quotaBytes?: number | null;
}

export interface WorkspaceUsage {
  workspaceId: string;
  usedBytes: number;
  quotaBytes: number | null;
  fileCount: number;
}

export interface ListWorkspacesResponse {
  items: Workspace[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface WorkspaceKey {
  id: string;
  /** The raw API key — returned exactly once. Store it now. */
  key: string;
  prefix: string;
  scopes: string[];
  workspaceId: string;
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

// ── FleetAgents ──────────────────────────────────────────────
// A FleetAgent is an elastic agent in the EasyBits fleet: it routes conversations
// to ephemeral workers. External apps (Formmy, GTeams) create one per tenant and
// configure it entirely through this SDK. See docs/formmy-easybits-sdk-integration.md.
//
// TWO credentials, don't mix:
//   • create / list / delete  → the client credential (user OAuth JWT, scope WRITE)
//   • everything else          → the per-agent `token` returned by create()
export interface CreateFleetAgentParams {
  name?: string;
  /** Shortcut → persona.env.SYSTEM_PROMPT (identity/instructions). */
  systemPrompt?: string;
  /** Shortcut → persona.env[modelEnv], resolved by the agent's engine. */
  model?: string;
  /** High-level engine id (FLEET_ENGINES): "claude" | "deepseek" | "codex" | "easybits" | "glm".
   *  Derives workerTemplate + env + defaultModel. Engines other than Claude may require a
   *  provider secret (set it via setSecret) — e.g. "deepseek" needs DEEPSEEK_API_KEY. */
  engine?: string;
  workerTemplate?: string;
  maxWorkersPerVm?: number;
  vmMemMb?: number;
  maxVms?: number;
  idleSuspendMin?: number;
}

export interface FleetAgentRecord {
  id: string;
  /** Per-agent bearer for all config/message calls. Persist it alongside id. */
  token: string;
  name?: string | null;
  assistantName?: string | null;
  workerTemplate?: string;
  hasOwnNumber?: boolean;
  ownerId?: string;
  createdAt?: string;
  [k: string]: unknown;
}

/** Response of GET .../capabilities — catalog + current state (see doc for full shape). */
export interface FleetCapabilities {
  builtins: Array<{ name: string; label: string; channel: string | null; bucketScoped: boolean }>;
  capabilities: Array<Record<string, unknown>>;
  secretsPresent: string[];
  groups: Record<string, Record<string, unknown>>;
  ownerFiles: Array<{ id: string; name: string; contentType: string }>;
  ownerDbs: Array<{ name: string; namespace: string }>;
  agent: {
    systemPrompt: string;
    workerTemplate: string;
    model: string;
    modelLabel: string;
    effort: string;
    hasOwnNumber: boolean;
    buckets: string[];
  };
  models: Array<{ key: string; label: string }>;
  buckets: Array<Record<string, unknown>>;
  bucketTools: Record<string, string[]>;
  efforts: string[];
  skills: Array<{ id: string; name: string; description: string; enabled: boolean; fileCount: number }>;
  customMcps: Array<Record<string, unknown>>;
}

export type FleetEffort = "low" | "medium" | "high" | "xhigh" | "max";
export type FleetCapLevel = "off" | "read" | "write";
/** Uniform mutation response from POST .../capabilities. */
export interface FleetOk {
  ok?: boolean;
  error?: string;
  [k: string]: unknown;
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

// ─── Forms ───────────────────────────────────────────────────────

export type FormFieldType =
  | "text"
  | "email"
  | "tel"
  | "textarea"
  | "select"
  | "date"
  | "number"
  | "checkbox"
  | "radio"
  | "file"
  | "matrix";

export interface FormFieldInput {
  name: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  /** Options for select/radio, or the COLUMN headers for a matrix. */
  options?: string[];
  /** For `matrix`: the row labels (each row gets one choice among `options`). */
  rows?: string[];
  /** Show this field only when another field currently equals `equals`. */
  showIf?: { field: string; equals: string };
  /** For `file`: accepted types hint, e.g. ".pdf,image/*". */
  accept?: string;
  /** Section name — consecutive fields sharing a section render as one step. */
  section?: string;
}

export interface CreateFormParams {
  name: string;
  fields: FormFieldInput[];
  /** Hosted template: "formal" (default) | "brutalista" | "institucional" | "editorial". */
  theme?: "formal" | "brutalista" | "institucional" | "editorial";
  slug?: string;
  successMessage?: string;
  deliveryUrl?: string;
}

export interface CreateFormResponse {
  id: string;
  slug: string | null;
  theme: string | null;
  name: string;
  /** Public hosted URL, e.g. https://www.easybits.cloud/f/:slug */
  url: string | null;
}

export interface FormSummary {
  id: string;
  name: string;
  slug: string | null;
  theme: string | null;
  websiteId: string | null;
  landingId: string | null;
  url: string | null;
  submissionCount: number;
  createdAt: string;
}

export interface FormSubmissionRecord {
  id: string;
  formId?: string;
  data: Record<string, string>;
  createdAt: string;
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

  // ── Workspaces ──────────────────────────────────────────────
  // Namespaced, quota-bounded containers of files. Create one per tenant, then
  // mint a workspace-scoped key so that tenant can only touch its own files.

  async listWorkspaces(params?: { limit?: number; cursor?: string }): Promise<ListWorkspacesResponse> {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return this.request<ListWorkspacesResponse>(`/workspaces${qs ? `?${qs}` : ""}`);
  }

  async createWorkspace(params: CreateWorkspaceParams): Promise<{ workspace: Workspace }> {
    return this.request<{ workspace: Workspace }>("/workspaces", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  async getWorkspace(workspaceId: string): Promise<Workspace> {
    return this.request<Workspace>(`/workspaces/${workspaceId}`);
  }

  async updateWorkspace(workspaceId: string, params: UpdateWorkspaceParams): Promise<{ ok: boolean; workspace: Workspace }> {
    return this.request<{ ok: boolean; workspace: Workspace }>(`/workspaces/${workspaceId}`, {
      method: "PATCH",
      body: JSON.stringify(params),
    });
  }

  async deleteWorkspace(workspaceId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/workspaces/${workspaceId}`, {
      method: "DELETE",
    });
  }

  async getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
    return this.request<WorkspaceUsage>(`/workspaces/${workspaceId}/usage`);
  }

  /** Mint a workspace-scoped API key. The raw `key` is returned exactly once. */
  async createWorkspaceKey(
    workspaceId: string,
    params?: { name?: string; scopes?: ("READ" | "WRITE" | "DELETE")[] }
  ): Promise<WorkspaceKey> {
    return this.request<WorkspaceKey>(`/workspaces/${workspaceId}/keys`, {
      method: "POST",
      body: JSON.stringify(params ?? {}),
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

  // ── Forms ──────────────────────────────────────────────────

  /** Create a standalone hosted form, served at /f/:slug. */
  async createForm(params: CreateFormParams): Promise<CreateFormResponse> {
    return this.request<CreateFormResponse>("/forms", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  /** List your forms with submission counts. */
  async listForms(): Promise<{ items: FormSummary[] }> {
    return this.request<{ items: FormSummary[] }>("/forms");
  }

  /** List submissions for a form (most recent first). */
  async getFormSubmissions(
    formId: string,
    opts?: { limit?: number }
  ): Promise<{ formName?: string; items: FormSubmissionRecord[]; total: number }> {
    const qs = opts?.limit ? `?limit=${opts.limit}` : "";
    return this.request(`/forms/${formId}/submissions${qs}`);
  }

  /** Get a form's config (fields, theme, hosted URL). */
  async getForm(formId: string): Promise<CreateFormResponse & { fields: FormFieldInput[]; successMessage: string }> {
    return this.request(`/forms/${formId}`);
  }

  /** Update a form's name, theme, fields or success message. */
  async updateForm(
    formId: string,
    patch: Partial<Pick<CreateFormParams, "name" | "theme" | "fields" | "successMessage" | "deliveryUrl">>
  ): Promise<CreateFormResponse> {
    return this.request<CreateFormResponse>(`/forms/${formId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
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
      /**
       * Provision a PERMANENT (always-on) machine, billed flat MXN/month on top
       * of your plan. Requires a paid plan. Returns a Sandbox you operate by id.
       */
      createPermanent: async (params: CreatePermanentParams): Promise<Sandbox> => {
        const rec = await req<SandboxRecord>("/machines", {
          method: "POST",
          body: JSON.stringify(params),
        });
        const sbx = new Sandbox(rec, req);
        if (params.waitForReady !== false) await sbx.waitUntilReady();
        return sbx;
      },
      /** List the caller's permanent machines. */
      listPermanent: async (): Promise<Sandbox[]> => {
        const { machines } = await req<{ machines: SandboxRecord[] }>("/machines");
        return machines.map((r) => new Sandbox(r, req));
      },
      /** Boot N copy-on-write children from an existing snapshot. */
      forkFromSnapshot: async (
        snapshotId: string,
        opts?: ForkOptions,
      ): Promise<Sandbox[]> => {
        const children = await req<SandboxRecord[]>(`/snapshots/${snapshotId}`, {
          method: "POST",
          body: JSON.stringify(opts ?? {}),
        });
        return children.map((r) => new Sandbox(r, req));
      },
      /** Saved copy-on-write snapshots (clone sources). */
      snapshots: {
        /** List the caller's snapshots. */
        list: async (): Promise<SnapshotRecord[]> => {
          const { items } = await req<{ items: SnapshotRecord[] }>("/snapshots");
          return items;
        },
        /** Delete a snapshot (frees its stored image). */
        delete: (snapshotId: string): Promise<{ ok: boolean }> =>
          req(`/snapshots/${snapshotId}`, { method: "DELETE" }),
      },
    };
  }

  /**
   * Elastic fleet agents. Create/list/delete authenticate with the client
   * credential (user OAuth JWT, scope WRITE); every config/message call takes the
   * per-agent `token` returned by create(). See docs/formmy-easybits-sdk-integration.md.
   */
  get fleet() {
    const req = <T>(path: string, opts?: RequestInit) => this.request<T>(path, opts);
    // Config/message calls auth with the per-agent fleetAgent.token, NOT the client key.
    const asAgent = (token: string, opts?: RequestInit): RequestInit => ({
      ...opts,
      headers: { ...opts?.headers, Authorization: `Bearer ${token}` },
    });
    const cap = (id: string) => `/fleet-agents/${id}/capabilities`;
    const post = (id: string, token: string, body: Record<string, unknown>) =>
      req<FleetOk>(cap(id), asAgent(token, { method: "POST", body: JSON.stringify(body) }));
    return {
      // ── Lifecycle (auth = client credential) ──
      create: (params: CreateFleetAgentParams): Promise<{ fleetAgent: FleetAgentRecord }> =>
        req("/fleet-agents", { method: "POST", body: JSON.stringify(params) }),
      list: (): Promise<{ pools: FleetAgentRecord[] }> => req("/fleet-agents"),
      delete: (id: string): Promise<{ ok: boolean }> =>
        req(`/fleet-agents/${id}/delete`, { method: "POST", body: "{}" }),

      // ── Config: read (auth = fleetAgent.token) ──
      getCapabilities: (id: string, token: string, params?: { q?: string }): Promise<FleetCapabilities> =>
        req(`${cap(id)}${params?.q ? `?q=${encodeURIComponent(params.q)}` : ""}`, asAgent(token)),

      // ── Config: agent-level mutations ──
      setName: (id: string, token: string, name: string) => post(id, token, { action: "set-name", name }),
      setAgentPrompt: (id: string, token: string, systemPrompt: string) =>
        post(id, token, { action: "set-agent-prompt", systemPrompt }),
      setModel: (id: string, token: string, model: string) => post(id, token, { action: "set-model", model }),
      setEffort: (id: string, token: string, effort: FleetEffort) => post(id, token, { action: "set-effort", effort }),
      toggleOwnNumber: (id: string, token: string, on: boolean) => post(id, token, { action: "toggle-own-number", on }),
      setSecret: (id: string, token: string, secret: { name: string; value: string }) =>
        post(id, token, { action: "set-secret", ...secret }),
      addMcp: (id: string, token: string, mcp: { name: string; label?: string; pkg?: string; url?: string; requiredSecret?: string; envVar?: string }) =>
        post(id, token, { action: "add-mcp", ...mcp }),
      removeMcp: (id: string, token: string, name: string) => post(id, token, { action: "remove-mcp", name }),
      toggleSkill: (id: string, token: string, s: { skillId: string; on: boolean }) =>
        post(id, token, { action: "toggle-skill", ...s }),
      deleteSkill: (id: string, token: string, skillId: string) => post(id, token, { action: "delete-skill", skillId }),

      // ── Config: per-channel mutations (groupId; "*" = agent default) ──
      setGroupPrompt: (id: string, token: string, groupId: string, systemPrompt: string) =>
        post(id, token, { action: "set-prompt", groupId, systemPrompt }),
      setCapLevel: (id: string, token: string, groupId: string, p: { cap: string; level: FleetCapLevel }) =>
        post(id, token, { action: "set-cap-level", groupId, ...p }),
      toggleBuiltin: (id: string, token: string, groupId: string, p: { builtin: string; on: boolean }) =>
        post(id, token, { action: "toggle-builtin", groupId, ...p }),
      setToolGroup: (id: string, token: string, groupId: string, p: { buckets: string[]; inherit?: boolean }) =>
        post(id, token, { action: "set-toolgroup", groupId, ...p }),
      toggleAsset: (id: string, token: string, groupId: string, p: { fileId: string; on: boolean }) =>
        post(id, token, { action: "toggle-asset", groupId, ...p }),

      // ── WABA (auth = fleetAgent.token) ──
      waba: {
        config: (id: string, token: string, body: Record<string, unknown>) =>
          req<FleetOk>(`/fleet-agents/${id}/waba/config`, asAgent(token, { method: "POST", body: JSON.stringify(body) })),
        connectStart: (id: string, token: string, body: Record<string, unknown>) =>
          req<FleetOk>(`/fleet-agents/${id}/waba/connect/start`, asAgent(token, { method: "POST", body: JSON.stringify(body) })),
        connect: (id: string, token: string, body: Record<string, unknown>) =>
          req<FleetOk>(`/fleet-agents/${id}/waba/connect`, asAgent(token, { method: "POST", body: JSON.stringify(body) })),
      },

      // ── Messaging (auth = fleetAgent.token) ──
      message: (id: string, token: string, body: { groupId: string; text: string; [k: string]: unknown }): Promise<{ reply: string }> =>
        req(`/fleet-agents/${id}/message`, asAgent(token, { method: "POST", body: JSON.stringify(body) })),
    };
  }

  /**
   * Convenience view over always-on machines (permanent sandboxes). Same
   * resources as `eb.sandboxes.*` — machines are addressed by sandboxId.
   */
  get machines() {
    const req = <T>(path: string, opts?: RequestInit) => this.request<T>(path, opts);
    return {
      /** The hosting catalog: tiers + disk add-on pricing. */
      tiers: () => req<MachineTiers>("/machines/tiers"),
      /** List the caller's permanent machines. */
      list: async (): Promise<Sandbox[]> => {
        const { machines } = await req<{ machines: SandboxRecord[] }>("/machines");
        return machines.map((r) => new Sandbox(r, req));
      },
      /** Provision a permanent machine (alias of eb.sandboxes.createPermanent). */
      create: async (params: CreatePermanentParams): Promise<Sandbox> => {
        const rec = await req<SandboxRecord>("/machines", {
          method: "POST",
          body: JSON.stringify(params),
        });
        const sbx = new Sandbox(rec, req);
        if (params.waitForReady !== false) await sbx.waitUntilReady();
        return sbx;
      },
    };
  }

  // ── Calls (videollamadas online con grabación HD) ────────────────
  //
  //   const call = await eb.calls.create();
  //   // comparte call.roomUrl con los participantes
  //   await eb.calls.record(call.sandboxId, { room: call.room });
  //   const { url } = await eb.calls.stop(call.sandboxId);
  //   // url = MP4 permanente en Files (+ transcript .txt)
  //   await eb.calls.destroy(call.sandboxId);
  get calls() {
    const req = <T>(path: string, opts?: RequestInit) => this.request<T>(path, opts);
    return {
      /** Crea una videollamada y devuelve el link para compartir (~15s de boot). */
      create(params?: { room?: string }): Promise<{ sandboxId: string; room: string; roomUrl: string }> {
        return req("/calls", { method: "POST", body: JSON.stringify(params ?? {}) });
      },
      /** Inicia la grabación HD server-side (chromium+ffmpeg). */
      record(sandboxId: string, params: { room: string }): Promise<{ recording: boolean; startedAt: string }> {
        return req(`/calls/${sandboxId}/record`, { method: "POST", body: JSON.stringify(params) });
      },
      /** Detiene la grabación, sube MP4 + transcript a Files y retorna el link permanente. */
      stop(sandboxId: string): Promise<{ url: string; fileId: string }> {
        return req(`/calls/${sandboxId}/stop`, { method: "POST" });
      },
      /** Estado del servidor: grabación activa y participantes en la sala. */
      status(sandboxId: string): Promise<{ recording: boolean; room?: string; startedAt?: string; participants: string[] }> {
        return req(`/calls/${sandboxId}/status`);
      },
      /** Grabaciones y transcripts permanentes en Files (sobreviven al destroy). */
      files(): Promise<Array<{ id: string; name: string; url: string; source: string; createdAt: string }>> {
        return req(`/calls/files`);
      },
      /**
       * Texto del transcript de una llamada, inline (no un link), + status honesto:
       * `transcribing` (Whisper procesando, reintenta), `ready` (texto en `.text`),
       * `failed` (sin audio o Whisper falló), `unavailable` (grabación sin transcript),
       * `no_recording` (nadie grabó). Pasa `sandboxId` para el estado EN VIVO durante
       * la llamada; omítelo para el transcript más reciente de tus Files.
       */
      transcript(sandboxId?: string): Promise<{
        source: "box" | "files";
        status: "transcribing" | "ready" | "failed" | "unknown" | "unavailable" | "no_recording" | "not_found";
        text?: string | null;
        chars?: number;
        error?: string;
        fileId?: string;
        name?: string;
        createdAt?: string;
      }> {
        return req(sandboxId ? `/calls/${sandboxId}/transcript` : `/calls/transcript`);
      },
      /** Para grabación activa, rescata archivos huérfanos de la VM y destruye el servidor. */
      destroy(sandboxId: string): Promise<{ ok: true }> {
        return req(`/calls/${sandboxId}/destroy`, { method: "POST" });
      },
    };
  }

  // ── Video projects ──────────────────────────────────────────
  // Stateful, doc-style video: ordered animated scenes (HTML + GSAP) that
  // compile to an MP4 via the on-demand HyperFrames box, with optional kokoro
  // narration and background music.

  listVideoProjects(params?: {
    limit?: number;
    offset?: number;
    status?: string;
  }): Promise<{ total: number; items: VideoProjectSummary[] }> {
    const s = new URLSearchParams();
    if (params?.limit) s.set("limit", String(params.limit));
    if (params?.offset) s.set("offset", String(params.offset));
    if (params?.status) s.set("status", params.status);
    const qs = s.toString();
    return this.request(`/video-projects${qs ? `?${qs}` : ""}`);
  }

  getVideoProject(id: string): Promise<VideoProject> {
    return this.request(`/video-projects/${id}`);
  }

  async createVideoProject(params: CreateVideoProjectParams): Promise<VideoProjectSummary> {
    const { project } = await this.request<{ project: VideoProjectSummary }>(`/video-projects`, {
      method: "POST",
      body: JSON.stringify(params ?? {}),
    });
    return project;
  }

  async updateVideoProject(
    id: string,
    patch: Partial<Pick<VideoProject, "name" | "theme" | "fps" | "width" | "height">> & {
      customColors?: Record<string, string>;
    },
  ): Promise<VideoProjectSummary> {
    const { project } = await this.request<{ project: VideoProjectSummary }>(
      `/video-projects/${id}`,
      { method: "PATCH", body: JSON.stringify(patch) },
    );
    return project;
  }

  deleteVideoProject(id: string): Promise<{ success: boolean }> {
    return this.request(`/video-projects/${id}`, { method: "DELETE" });
  }

  addVideoScene(
    id: string,
    scene: VideoSceneInput & { afterIndex?: number },
  ): Promise<{ scene: VideoScene; sceneCount: number }> {
    return this.request(`/video-projects/${id}/scenes`, {
      method: "POST",
      body: JSON.stringify(scene),
    });
  }

  setVideoScene(
    id: string,
    sceneId: string,
    patch: Partial<VideoSceneInput>,
  ): Promise<{ scene: VideoScene; changed: boolean }> {
    return this.request(`/video-projects/${id}/scenes/${sceneId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
  }

  deleteVideoScene(id: string, sceneId: string): Promise<{ success: boolean; sceneCount: number }> {
    return this.request(`/video-projects/${id}/scenes/${sceneId}`, { method: "DELETE" });
  }

  reorderVideoScenes(id: string, sceneIds: string[]): Promise<{ scenes: unknown[] }> {
    return this.request(`/video-projects/${id}/scenes`, {
      method: "PUT",
      body: JSON.stringify({ sceneIds }),
    });
  }

  setVideoMusic(id: string, url: string | null, name?: string): Promise<VideoProjectSummary> {
    return this.request(`/video-projects/${id}/audio`, {
      method: "POST",
      body: JSON.stringify({ url, name }),
    });
  }

  attachVideoAsset(
    id: string,
    asset: { url: string; name?: string; type?: string },
  ): Promise<{ assets: Array<{ name: string; url: string }>; added: { name: string; url: string } }> {
    return this.request(`/video-projects/${id}/audio`, {
      method: "PUT",
      body: JSON.stringify(asset),
    });
  }

  renderVideoProject(
    id: string,
  ): Promise<VideoProjectSummary & { file: { fileId: string; url: string; renderMs?: number } }> {
    return this.request(`/video-projects/${id}/render`, { method: "POST" });
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
  /** Always-on machine fields (set when this sandbox is permanent). */
  persistent?: boolean;
  tier?: string;
  cpuMode?: "shared" | "reserved";
  monthlyMxn?: number;
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
    this.persistent = record.persistent;
    this.tier = record.tier;
    this.cpuMode = record.cpuMode;
    this.monthlyMxn = record.monthlyMxn;
    this.req = req;
    this.files = new SandboxFiles(record.sandboxId, req);
  }

  private applyMachine(rec: SandboxRecord): this {
    this.status = rec.status;
    this.persistent = rec.persistent;
    this.tier = rec.tier;
    this.cpuMode = rec.cpuMode;
    this.monthlyMxn = rec.monthlyMxn;
    return this;
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
  /** Snapshot to disk and free CPU/IP. The TTL is paused while suspended. */
  suspend(): Promise<SandboxRecord> {
    return this.post("/suspend");
  }
  /** Restore a suspended sandbox; the remaining lifetime is restored and the
   *  auto-destroy timer re-armed (no extend needed). */
  resume(): Promise<SandboxRecord> {
    return this.post("/resume");
  }
  /** Destroy the microVM. */
  destroy(): Promise<{ ok: true }> {
    return this.req(this.base(), { method: "DELETE" });
  }

  // ── Snapshot + fork (copy-on-write clone) ──
  /**
   * Capture a named, persisted image of this running box WITHOUT stopping it.
   * The image can later be forked into N copy-on-write children.
   */
  snapshot(name?: string): Promise<SnapshotRecord> {
    return this.post("/snapshot", { name });
  }
  /**
   * Snapshot this box, then boot N copy-on-write children from that image
   * (Morph-style "branch"). Each child is an independent ephemeral sandbox with
   * its own IP. Returns the child handles (still starting — await waitUntilReady).
   */
  async fork(opts?: ForkOptions): Promise<Sandbox[]> {
    const children = await this.post<SandboxRecord[]>("/fork", opts ?? {});
    return children.map((r) => new Sandbox(r, this.req));
  }

  // ── Always-on (permanent machine) ──
  /**
   * Promote this (ephemeral) sandbox to a PERMANENT machine: keeps the same
   * sandboxId, disarms the host reaper, and starts flat MXN/month billing for
   * the chosen tier. The "spin it up, then keep it" flow.
   */
  async makePermanent(
    tier: string,
    opts?: { cpuMode?: "shared" | "reserved"; diskAddonsGB?: number; name?: string },
  ): Promise<this> {
    const rec = await this.req<SandboxRecord>("/machines", {
      method: "POST",
      body: JSON.stringify({ fromSandboxId: this.sandboxId, tier, ...opts }),
    });
    return this.applyMachine(rec);
  }
  /** Release a permanent machine: stops billing (prorated) and destroys the VM. */
  release(): Promise<{ ok: true }> {
    return this.req(`/machines/${this.sandboxId}`, { method: "DELETE" });
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

  // ── Service / hotfix ──
  /**
   * Read recent journald logs from inside the VM. Filter to one systemd unit
   * (e.g. "ghosty-gc-runtime") or omit `unit` for the whole journal. `lines`
   * tails the last N (default 200), `since` takes a journalctl time spec
   * ("10 min ago"), `grep` filters lines. No streaming/follow.
   */
  logs(
    opts?: { unit?: string; lines?: number; since?: string; grep?: string },
  ): Promise<{ unit: string | null; command: string; output: string; exitCode: number }> {
    return this.post("/logs", opts ?? {});
  }
  /**
   * Control the service daemon via systemd. action "status" reports a unit's
   * state, "restart" restarts it (unit required), "rebuild" runs buildCommand
   * in cwd then restarts the unit if given.
   */
  runtime(
    action: "restart" | "rebuild" | "status",
    opts?: { unit?: string; buildCommand?: string; cwd?: string },
  ): Promise<{ action: string; unit: string | null; output: string; exitCode: number; buildOutput?: string }> {
    return this.post("/runtime", { action, ...opts });
  }
  /**
   * Atomic hotfix: apply surgical edits, then optionally rebuild + restart in
   * one call. If the build fails the restart is skipped (running daemon stays up).
   */
  applyPatch(opts: {
    edits: Array<{ path: string; oldString: string; newString: string; replaceAll?: boolean }>;
    rebuild?: { buildCommand: string; cwd?: string };
    restart?: { unit: string };
  }): Promise<{
    applied: Array<{ path: string; replacements: number }>;
    buildOutput?: string;
    buildExitCode?: number;
    restarted?: boolean;
    status?: string;
  }> {
    return this.post("/apply-patch", opts);
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

  /**
   * Attach a custom domain to a port, served over HTTPS with an auto-issued
   * TLS cert. Returns the exact DNS record to create (`dns`): subdomain → CNAME,
   * apex/root → A. Create that record in your DNS, then call verifyDomain().
   */
  addDomain(domain: string, port: number): Promise<AddDomainResult> {
    return this.post("/domain-add", { domain, port });
  }

  /** Detach a custom domain from this sandbox. */
  removeDomain(domain: string): Promise<{ ok: boolean }> {
    return this.post("/domain-remove", { domain });
  }

  /** List the custom domains attached to this sandbox. */
  listDomains(): Promise<SandboxDomain[]> {
    return this.post("/domain-list", {});
  }

  /** Check that a custom domain resolves and serves over TLS ("ya quedó"). */
  verifyDomain(domain: string): Promise<DomainVerification> {
    return this.post("/domain-verify", { domain });
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
  /**
   * Surgical in-place edit: replace oldString → newString. Sidesteps shell
   * escaping (unlike exec + sed). Replaces all occurrences by default; pass
   * replaceAll:false for first-match-only (errors if ambiguous). Throws if
   * oldString is absent.
   */
  edit(
    path: string,
    oldString: string,
    newString: string,
    opts?: { replaceAll?: boolean },
  ): Promise<{ ok: true; path: string; replacements: number; bytes: number }> {
    return this.req(`${this.base()}/edit`, {
      method: "POST",
      body: JSON.stringify({ path, oldString, newString, ...opts }),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Video project types ─────────────────────────────────────────

export interface VideoSceneInput {
  /** Scene markup — absolutely positioned, assets referenced as assets/<name>. */
  html: string;
  /** Optional GSAP snippet against a pre-declared paused timeline `tl`. */
  timeline?: string;
  /** Seconds on screen (defaults to fit narration, else 3). */
  durationSec?: number;
  label?: string;
  /** Voiceover text — synthesized with kokoro (default voice em_santa). */
  narration?: string;
  /** kokoro voice id: em_santa | em_alex | ef_dora. */
  narrationVoice?: string;
}

export interface VideoScene extends VideoSceneInput {
  id: string;
  order: number;
  narrationUrl?: string;
  narrationName?: string;
}

export interface VideoProjectSummary {
  id: string;
  name: string;
  status: "draft" | "rendering" | "ready" | "failed";
  width: number;
  height: number;
  fps: number;
  theme: string;
  sceneCount: number;
  durationSec: number;
  hasAudio: boolean;
  lastRenderUrl?: string | null;
  lastRenderFileId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoProject extends VideoProjectSummary {
  customColors?: Record<string, string> | null;
  audioAssetName?: string | null;
  assets: Array<{ name: string; url: string; type?: string }>;
  scenes: VideoScene[];
  lastRenderMs?: number | null;
  failReason?: string | null;
}

export interface CreateVideoProjectParams {
  name?: string;
  format?: { preset?: string };
  width?: number;
  height?: number;
  fps?: number;
  theme?: string;
  customColors?: Record<string, string>;
  scenes?: VideoSceneInput[];
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
  | "code-interpreter"
  | "livekit-svc";

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
  // Present when the sandbox is a permanent ("always-on") machine.
  persistent?: boolean;
  tier?: string;
  cpuMode?: "shared" | "reserved";
  monthlyMxn?: number;
}

/** A named, persisted copy-on-write image captured from a running sandbox. */
export interface SnapshotRecord {
  snapshotId: string;
  name?: string;
  sourceId: string;
  ownerId: string;
  template: string;
  vcpus: number;
  memMb: number;
  hasMem: boolean;
  sizeBytes: number;
  createdAt: string;
}

export interface ForkOptions {
  /** Number of children to boot (1–16). Default 1. */
  count?: number;
  name?: string;
  metadata?: Record<string, string>;
  timeoutSeconds?: number;
}

// ─── Hosting (always-on machines) ────────────────────────────────

export interface MachineTier {
  key: string;
  vcpus: number;
  memoryMb: number;
  diskMb: number;
  priceShared: number;
  priceReserved: number | null;
  minPlan: "Byte" | "Mega" | "Tera";
}

export interface MachineTiers {
  tiers: MachineTier[];
  diskAddon: { gb: number; price: number };
}

export interface CreatePermanentParams {
  /** Catalog tier key (see eb.machines.tiers()). */
  tier: string;
  cpuMode?: "shared" | "reserved";
  /** Extra NVMe in multiples of 100GB (+$99/mo each). */
  diskAddonsGB?: number;
  template?: SandboxTemplate;
  name?: string;
  /** Wait until running before returning (default true). */
  waitForReady?: boolean;
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

export interface DomainDnsRecord {
  type: "A" | "CNAME"; // apex → A, subdomain → CNAME
  name: string;
  value: string;
  note: string;
}

export interface AddDomainResult {
  domain: string;
  port: number;
  url: string;
  cname: string;
  dns: DomainDnsRecord; // the exact DNS record the customer must create
}

export interface SandboxDomain {
  domain: string;
  port: number;
}

export interface DomainVerification {
  domain: string;
  ready: boolean;
  dns: { resolved: boolean; cname?: string[] };
  https: { ok: boolean; status?: number; error?: string };
  hint: string;
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

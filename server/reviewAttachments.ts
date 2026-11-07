import { withGithubViewerAttachmentClient, type GithubViewerAttachmentClient } from "./github.ts";

export const REVIEW_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const REVIEW_ATTACHMENT_TYPES = ["image/png", "image/jpeg", "image/gif", "video/mp4", "video/quicktime", "video/webm"] as const;
const EXTENSIONS: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
const QUERY = `query ReviewAttachmentRepository($owner: String!, $name: String!, $number: Int!) {
  viewer { id login }
  repository(owner: $owner, name: $name) { nameWithOwner databaseId visibility viewerPermission pullRequest(number: $number) { id } }
}`;

export class ReviewAttachmentError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); this.name = "ReviewAttachmentError"; }
}
export interface ReviewAttachmentCapability {
  available: boolean;
  reason: string | null;
  repo: string;
  number: number;
  accountId: string;
  accountLogin: string;
  repositoryId: number;
  visibility: "PUBLIC" | "PRIVATE" | "INTERNAL";
  maxBytes: number;
  allowedTypes: readonly string[];
}
export interface ReviewAttachmentInput { repo: string; number: number; accountId: string; repositoryId: number; visibility: ReviewAttachmentCapability["visibility"]; name: string; contentType: string; bytes: Uint8Array; signal?: AbortSignal }
type Prepare = <T>(repo: string, source: "app detail" | "user action", work: (client: GithubViewerAttachmentClient) => Promise<T>) => Promise<T>;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReviewAttachmentError("GitHub returned incomplete attachment permission data", 502, "invalid-github-response");
  return value as Record<string, unknown>;
}
async function capability(repo: string, number: number, client: GithubViewerAttachmentClient): Promise<ReviewAttachmentCapability> {
  const [owner, name] = repo.split("/");
  const data = record(await client.graphql(QUERY, { owner, name, number }, "Review attachment capability"));
  if (data.repository === null) throw new ReviewAttachmentError("Repository not found or inaccessible", 404, "not-found");
  const repository = record(data.repository), viewer = record(data.viewer);
  if (!repository.pullRequest || typeof record(repository.pullRequest).id !== "string") throw new ReviewAttachmentError("Pull request not found or inaccessible", 404, "not-found");
  if (typeof viewer.id !== "string" || !viewer.id || typeof viewer.login !== "string" || !viewer.login || typeof repository.nameWithOwner !== "string" || repository.nameWithOwner.toLowerCase() !== repo.toLowerCase() || typeof repository.databaseId !== "number" || !Number.isSafeInteger(repository.databaseId) || repository.databaseId <= 0 || !["PUBLIC", "PRIVATE", "INTERNAL"].includes(String(repository.visibility))) {
    throw new ReviewAttachmentError("GitHub returned incomplete attachment identity data", 502, "invalid-github-response");
  }
  const available = ["WRITE", "MAINTAIN", "ADMIN"].includes(String(repository.viewerPermission));
  return { available, reason: available ? null : "GitHub attachments require write access to this repository. You can continue reviewing here or attach files on GitHub with an eligible account.", repo, number, accountId: viewer.id, accountLogin: viewer.login, repositoryId: repository.databaseId, visibility: repository.visibility as ReviewAttachmentCapability["visibility"], maxBytes: REVIEW_ATTACHMENT_MAX_BYTES, allowedTypes: REVIEW_ATTACHMENT_TYPES };
}
export function fetchReviewAttachmentCapability(repo: string, number: number, prepare: Prepare = withGithubViewerAttachmentClient): Promise<ReviewAttachmentCapability> {
  return prepare(repo, "app detail", client => capability(repo, number, client));
}
function starts(bytes: Uint8Array, signature: number[], at = 0): boolean { return signature.every((value, index) => bytes[at + index] === value); }
export function validateReviewAttachment(name: string, contentType: string, bytes: Uint8Array): { name: string; contentType: string } {
  if (bytes.byteLength === 0 || bytes.byteLength > REVIEW_ATTACHMENT_MAX_BYTES) throw new ReviewAttachmentError("Choose a nonempty image or video no larger than 10 MiB.", 413, "attachment-size");
  const basename = name.split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_").trim() ?? "";
  const extension = basename.split(".").at(-1)?.toLowerCase() ?? "";
  const mime = EXTENSIONS[extension];
  if (!mime || mime !== contentType.toLowerCase()) throw new ReviewAttachmentError("Choose PNG, JPEG, GIF, MP4, MOV or WebM with a matching file type.", 415, "attachment-type");
  let matches = false;
  if (mime === "image/png") matches = starts(bytes, [137,80,78,71,13,10,26,10]);
  if (mime === "image/jpeg") matches = starts(bytes, [255,216,255]);
  if (mime === "image/gif") matches = starts(bytes, [71,73,70,56,55,97]) || starts(bytes, [71,73,70,56,57,97]);
  if (mime === "video/mp4" || mime === "video/quicktime") {
    const brand = new TextDecoder().decode(bytes.slice(8, 12));
    matches = bytes.length >= 12 && starts(bytes, [102,116,121,112], 4) && (mime === "video/quicktime" ? brand === "qt  " : brand !== "qt  ");
  }
  if (mime === "video/webm") matches = starts(bytes, [26,69,223,163]) && new TextDecoder().decode(bytes.slice(0, 256)).includes("webm");
  if (!matches) throw new ReviewAttachmentError("The file bytes do not match the selected image or video type.", 415, "attachment-signature");
  return { name: basename.length > 120 ? `${basename.slice(0, 100)}.${extension}` : basename, contentType: mime };
}
export function validateReviewAttachmentUrl(value: unknown): string {
  if (typeof value !== "string") throw new ReviewAttachmentError("GitHub returned no attachment URL", 502, "invalid-upload-response");
  let url: URL;
  try { url = new URL(value); } catch { throw new ReviewAttachmentError("GitHub returned an invalid attachment URL", 502, "invalid-upload-response"); }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port || url.search || url.hash || !/^\/user-attachments\/assets\/[a-zA-Z0-9-]+$/.test(url.pathname)) throw new ReviewAttachmentError("GitHub returned an unexpected attachment URL", 502, "invalid-upload-response");
  return url.href;
}
export function uploadReviewAttachment(input: ReviewAttachmentInput, prepare: Prepare = withGithubViewerAttachmentClient): Promise<{ url: string; name: string; contentType: string }> {
  const file = validateReviewAttachment(input.name, input.contentType, input.bytes);
  return prepare(input.repo, "user action", async client => {
    const current = await capability(input.repo, input.number, client);
    if (current.accountId !== input.accountId || current.repositoryId !== input.repositoryId || current.visibility !== input.visibility) throw new ReviewAttachmentError("The GitHub account, repository or visibility changed. Refresh attachment access and choose the file again.", 409, "stale-attachment-context");
    if (!current.available) throw new ReviewAttachmentError(current.reason!, 403, "attachment-write-access");
    const response = await client.upload(current.repositoryId, file.name, file.contentType, input.bytes, input.signal);
    const body: unknown = await response.json().catch(() => null);
    const value = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).url : null;
    return { url: validateReviewAttachmentUrl(value), ...file };
  });
}
export async function readReviewAttachmentForm(req: Request): Promise<{ file: File; accountId: string; repositoryId: number; visibility: ReviewAttachmentCapability["visibility"] }> {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new ReviewAttachmentError("Choose a file using the attachment picker.", 415, "attachment-request-type");
  const limit = REVIEW_ATTACHMENT_MAX_BYTES + 64 * 1024;
  const length = Number(req.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) throw new ReviewAttachmentError("Attachment request is too large", 413, "attachment-size");
  const reader = req.body?.getReader();
  if (!reader) throw new ReviewAttachmentError("Attachment file is missing", 400, "attachment-file");
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > limit) { await reader.cancel(); throw new ReviewAttachmentError("Attachment request is too large", 413, "attachment-size"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  const form = await new Response(body, { headers: { "content-type": req.headers.get("content-type")! } }).formData().catch(() => {
    throw new ReviewAttachmentError("Attachment form could not be read", 400, "attachment-form");
  });
  const files = form.getAll("file"), accountId = form.get("accountId"), repositoryId = Number(form.get("repositoryId")), visibility = form.get("visibility");
  if (files.length !== 1 || !(files[0] instanceof File) || typeof accountId !== "string" || !accountId || accountId.length > 512 || !Number.isSafeInteger(repositoryId) || repositoryId <= 0 || (visibility !== "PUBLIC" && visibility !== "PRIVATE" && visibility !== "INTERNAL")) throw new ReviewAttachmentError("Attachment identity or file is missing", 400, "attachment-context");
  return { file: files[0], accountId, repositoryId, visibility };
}

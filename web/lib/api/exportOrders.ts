/**
 * Chunked CSV export download. Uses raw fetch (not the JSON api helper)
 * so we can read X-Export-* headers and stitch multiple chunks into one file.
 */
import { ApiError } from "./client";
import type { OrderSort } from "./orders";
import type { OrderStatus } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/** Absolute ceiling across stitched chunks (10 × 10k per-request max). */
export const EXPORT_ABSOLUTE_MAX_ROWS = 100_000;
export const EXPORT_CHUNK_LIMIT = 10_000;

export interface ExportOrdersParams {
  dueDateFrom: string;
  dueDateTo: string;
  status?: OrderStatus;
  search?: string;
  sort?: OrderSort;
  offset?: number;
  limit?: number;
}

export interface ExportChunk {
  csv: string;
  total: number;
  offset: number;
  count: number;
  hasMore: boolean;
}

function buildExportQuery(params: ExportOrdersParams): string {
  const query = new URLSearchParams();
  query.set("dueDateFrom", params.dueDateFrom);
  query.set("dueDateTo", params.dueDateTo);
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.sort) query.set("sort", params.sort);
  query.set("offset", String(params.offset ?? 0));
  query.set("limit", String(params.limit ?? EXPORT_CHUNK_LIMIT));
  return `?${query.toString()}`;
}

async function fetchExportChunk(params: ExportOrdersParams): Promise<ExportChunk> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/orders/export${buildExportQuery(params)}`, {
      method: "GET",
      credentials: "include",
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Could not reach the server. Check your connection and try again.");
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error =
      payload && typeof payload === "object" && "error" in payload
        ? (payload as { error?: { code?: string; message?: string; details?: ApiError["details"] } }).error
        : undefined;
    throw new ApiError(
      typeof error?.code === "string" && error.code ? error.code : "INTERNAL_ERROR",
      typeof error?.message === "string" && error.message.trim()
        ? error.message
        : "Unable to export orders. Please try again.",
      error?.details,
    );
  }

  const csv = await response.text();
  const total = Number(response.headers.get("X-Export-Total") ?? "0");
  const offset = Number(response.headers.get("X-Export-Offset") ?? "0");
  const count = Number(response.headers.get("X-Export-Count") ?? "0");
  const hasMore = response.headers.get("X-Export-Has-More") === "true";

  return { csv, total, offset, count, hasMore };
}

function stripCsvHeader(csv: string): string {
  const newline = csv.indexOf("\n");
  if (newline === -1) return "";
  return csv.slice(newline + 1);
}

function triggerDownload(contents: string, filename: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export interface DownloadOrdersCsvOptions extends Omit<ExportOrdersParams, "offset" | "limit"> {
  onProgress?: (exported: number, total: number) => void;
}

/**
 * Fetches all CSV chunks sequentially (to avoid rate limits), stitches them,
 * and triggers a single browser download. Fails fast if total > 100k.
 */
export async function downloadOrdersCsv(options: DownloadOrdersCsvOptions): Promise<void> {
  const { onProgress, ...filters } = options;
  const first = await fetchExportChunk({ ...filters, offset: 0, limit: EXPORT_CHUNK_LIMIT });

  if (first.total > EXPORT_ABSOLUTE_MAX_ROWS) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `This export matches ${first.total.toLocaleString()} orders, which exceeds the ${EXPORT_ABSOLUTE_MAX_ROWS.toLocaleString()}-row limit. Narrow the due-date range and try again.`,
    );
  }

  onProgress?.(first.count, first.total);

  let combined = first.csv;
  let offset = first.offset + first.count;
  let exported = first.count;
  let hasMore = first.hasMore;

  while (hasMore) {
    const chunk = await fetchExportChunk({ ...filters, offset, limit: EXPORT_CHUNK_LIMIT });
    const dataRows = stripCsvHeader(chunk.csv);
    if (dataRows.trim().length > 0) {
      // Ensure a single newline between chunks even if the previous chunk
      // already ended with one.
      if (!combined.endsWith("\n")) combined += "\n";
      combined += dataRows.startsWith("\n") ? dataRows.slice(1) : dataRows;
    }
    exported += chunk.count;
    offset = chunk.offset + chunk.count;
    hasMore = chunk.hasMore;
    onProgress?.(exported, chunk.total);
  }

  const filename = `orders-${filters.dueDateFrom}-to-${filters.dueDateTo}.csv`;
  triggerDownload(combined, filename);
}

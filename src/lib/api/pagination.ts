import { ApiError, type ApiResponse } from "@/lib/api/client";
import type { PaginatedResult, PaginationMeta, PaginationParams } from "@/types/pagination";

import { buildApiUrl } from "@/lib/api/base";
import { getAccessToken } from "@/lib/auth/token";
import { refreshAccessToken } from "@/lib/api/authSession";

export type PaginatedQueryParams = PaginationParams &
  Record<string, string | number | boolean | undefined>;

function toQueryParams(params?: PaginatedQueryParams) {
  const q: Record<string, string> = {};
  if (!params) return q;
  if (params.page != null) q.page = String(params.page);
  if (params.limit != null) q.limit = String(params.limit);
  if (params.sortBy) q.sortBy = params.sortBy;
  if (params.sortOrder) q.sortOrder = params.sortOrder;
  if (params.search) q.search = params.search;
  for (const [key, value] of Object.entries(params)) {
    if (
      value !== undefined &&
      value !== "" &&
      !["page", "limit", "sortBy", "sortOrder", "search"].includes(key)
    ) {
      q[key] = String(value);
    }
  }
  return q;
}

export async function apiClientPaginated<T>(
  path: string,
  params?: PaginatedQueryParams
): Promise<PaginatedResult<T>> {
  const url = buildApiUrl(path);
  const query = toQueryParams(params);
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

  let token = getAccessToken();
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new ApiError(
      "Cannot reach server. Start the backend (port 4000) or run `npm run dev` from the project root.",
      0,
      "NETWORK_ERROR"
    );
  }

  if (response.status === 401) {
    token = await refreshAccessToken();
    if (token) {
      try {
        response = await fetch(url.toString(), {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        throw new ApiError(
          "Cannot reach server. Start the backend (port 4000) or run `npm run dev` from the project root.",
          0,
          "NETWORK_ERROR"
        );
      }
    }
  }

  let body: ApiResponse<T[] | { items: T[] }>;
  try {
    body = (await response.json()) as ApiResponse<T[] | { items: T[] }>;
  } catch {
    throw new ApiError("Invalid response from server", response.status);
  }

  if (!response.ok || !body.success) {
    throw new ApiError(body.message ?? "Request failed", response.status, body.code);
  }

  const pagination = body.meta?.pagination as PaginationMeta | undefined;
  if (!pagination) {
    throw new ApiError("Missing pagination metadata", response.status);
  }

  const data = body.data;
  const items = Array.isArray(data)
    ? data
    : data && typeof data === "object" && "items" in data
      ? (data as { items: T[] }).items
      : [];

  return { items, pagination };
}

/** Paginated response where data is an object with items + optional extra fields */
export async function apiClientPaginatedData<TItem, TData extends { items: TItem[] }>(
  path: string,
  params?: PaginatedQueryParams
): Promise<{ data: TData; pagination: PaginationMeta }> {
  const url = buildApiUrl(path);
  const query = toQueryParams(params);
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v));

  let token = getAccessToken();
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new ApiError(
      "Cannot reach server. Start the backend (port 4000) or run `npm run dev` from the project root.",
      0,
      "NETWORK_ERROR"
    );
  }

  if (response.status === 401) {
    token = await refreshAccessToken();
    if (token) {
      try {
        response = await fetch(url.toString(), {
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      } catch {
        throw new ApiError(
          "Cannot reach server. Start the backend (port 4000) or run `npm run dev` from the project root.",
          0,
          "NETWORK_ERROR"
        );
      }
    }
  }

  let body: ApiResponse<TData>;
  try {
    body = (await response.json()) as ApiResponse<TData>;
  } catch {
    throw new ApiError("Invalid response from server", response.status);
  }

  if (!response.ok || !body.success || !body.data) {
    throw new ApiError(body.message ?? "Request failed", response.status, body.code);
  }

  const pagination = body.meta?.pagination as PaginationMeta | undefined;
  if (!pagination) {
    throw new ApiError("Missing pagination metadata", response.status);
  }

  return { data: body.data, pagination };
}

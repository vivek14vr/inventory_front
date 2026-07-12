import { refreshAccessToken } from "@/lib/api/authSession";
import { apiUrl, buildApiUrl } from "@/lib/api/base";
import { getAccessTokenIfValid, getRefreshToken } from "@/lib/auth/token";
import type { AuthUser, LoginResponse, PublicUser } from "@/types/auth";
import type { Brand, Client, Product, ProductWarehouseThreshold, Warehouse } from "@/types/master";
import type {
  AdminDashboard,
  LowStockProductRow,
  LowStockResponse,
  StockItemDetailResponse,
  StockItemLedgerRow,
  StockResponse,
} from "@/types/inventory";
import type {
  ClientImportPreview,
  ClientImportResult,
  ClientImportRowDecision,
  ProductImportPreview,
  ProductImportResult,
  ProductImportRowDecision,
  SalesImportConfirmVoucher,
  SalesImportPreview,
  SalesImportResult,
  TallyImport,
} from "@/types/imports";
import type { ReportFilters, ReportResult, ReportType } from "@/types/reports";
import type { AuditFilters, AuditLogEntry, AuditSummary } from "@/types/audit";
import type {
  InventoryBalance,
  PendingTransfer,
  StockMovement,
  TransferRecord,
  TransferActivityReport,
} from "@/types/stock";
import type { PaginationParams } from "@/types/pagination";
import { apiClientPaginated, apiClientPaginatedData } from "@/lib/api/pagination";

export { getApiBase } from "@/lib/api/base";

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  meta?: Record<string, unknown>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type RequestOptions = RequestInit & {
  params?: Record<string, string>;
  token?: string | null;
  skipAuth?: boolean;
  _retry?: boolean;
};

async function parseJsonResponse<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError("Invalid response from server", response.status);
  }
}

async function resolveAuthToken(explicit?: string | null): Promise<string | undefined> {
  if (explicit) return explicit;
  return getAccessTokenIfValid() ?? (await refreshAccessToken()) ?? undefined;
}

async function fetchWithAuth(
  url: string,
  init: RequestInit,
  options?: { token?: string | null; _retry?: boolean }
): Promise<Response> {
  const token = await resolveAuthToken(options?.token);
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch {
    throw new ApiError(
      "Cannot reach server. Check that the API is running on port 4000.",
      0,
      "NETWORK_ERROR"
    );
  }

  if (response.status === 401 && !options?._retry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return fetchWithAuth(url, init, { token: refreshed, _retry: true });
    }
  }

  return response;
}

export async function apiClient<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, headers, token, skipAuth, _retry, ...init } = options;

  const url = buildApiUrl(path);
  if (params) {
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value)
    );
  }

  const authToken = skipAuth
    ? undefined
    : (token ?? getAccessTokenIfValid() ?? undefined);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(
      "Cannot reach server. Check that the API is running on port 4000.",
      0,
      "NETWORK_ERROR"
    );
  }

  const body = await parseJsonResponse<T>(response);

  if (
    response.status === 401 &&
    !skipAuth &&
    !_retry &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/refresh")
  ) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiClient<T>(path, {
        ...options,
        token: newToken,
        _retry: true,
      });
    }
  }

  if (!response.ok || !body.success) {
    throw new ApiError(
      body.message ?? "Request failed",
      response.status,
      body.code
    );
  }

  return body.data as T;
}

export const api = {
  health: () =>
    apiClient<{ status: string; database: string }>("/health", { skipAuth: true }),

  auth: {
    login: async (email: string, password: string) => {
      let response: Response;
      try {
        response = await fetch(apiUrl("/auth/login"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        throw new ApiError(
          "Cannot reach server. Start the API (npm run dev) and use your computer's IP on mobile, not localhost.",
          0,
          "NETWORK_ERROR"
        );
      }
      const body = await parseJsonResponse<LoginResponse>(response);
      if (!response.ok || !body.success || !body.data) {
        throw new ApiError(body.message ?? "Login failed", response.status, body.code);
      }
      const data = body.data;
      return {
        ...data,
        accessToken: data.accessToken ?? data.token,
        token: data.token ?? data.accessToken,
      };
    },
    refresh: () =>
      apiClient<LoginResponse>("/auth/refresh", {
        method: "POST",
        body: "{}",
        skipAuth: true,
      }),
    me: (token?: string) => apiClient<AuthUser>("/auth/me", { token }),
    logout: () => {
      const refreshToken = getRefreshToken();
      return apiClient<{ message: string }>("/auth/logout", {
        method: "POST",
        body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
      });
    },
    logoutAll: () =>
      apiClient<{ message: string; sessionsRevoked: number }>("/auth/logout-all", {
        method: "POST",
      }),
  },

  warehouses: {
    list: (includeInactive?: boolean) =>
      apiClient<Warehouse[]>("/warehouses", {
        params: includeInactive ? { includeInactive: "true" } : undefined,
      }),
    get: (id: string) => apiClient<Warehouse>(`/warehouses/${id}`),
    create: (data: { name: string; code: string; isActive?: boolean }) =>
      apiClient<Warehouse>("/warehouses", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{ name: string; code: string; isActive: boolean }>
    ) =>
      apiClient<Warehouse>(`/warehouses/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  brands: {
    list: (includeInactive?: boolean) =>
      apiClient<Brand[]>("/brands", {
        params: includeInactive ? { includeInactive: "true" } : undefined,
      }),
    get: (id: string) => apiClient<Brand>(`/brands/${id}`),
    create: (data: { name: string; isActive?: boolean }) =>
      apiClient<Brand>("/brands", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<{ name: string; isActive: boolean }>) =>
      apiClient<Brand>(`/brands/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  clients: {
    list: (includeInactive?: boolean) =>
      apiClient<Client[]>("/clients", {
        params: includeInactive ? { includeInactive: "true" } : undefined,
      }),
    get: (id: string) => apiClient<Client>(`/clients/${id}`),
    create: (data: { name: string; secondaryName?: string; isActive?: boolean }) =>
      apiClient<Client>("/clients", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{ name: string; secondaryName?: string | null; isActive: boolean }>
    ) =>
      apiClient<Client>(`/clients/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  products: {
    list: (opts?: PaginationParams & {
      includeInactive?: boolean;
      brandId?: string;
      includeWarehouseThresholds?: boolean;
      includeStockTotals?: boolean;
    }) =>
      apiClientPaginated<Product>("/products", {
        page: opts?.page ?? 1,
        limit: opts?.limit ?? 20,
        includeInactive: opts?.includeInactive ? "true" : "false",
        ...(opts?.includeWarehouseThresholds ? { includeWarehouseThresholds: "true" } : {}),
        ...(opts?.includeStockTotals ? { includeStockTotals: "true" } : {}),
        ...(opts?.brandId ? { brandId: opts.brandId } : {}),
        ...(opts?.search ? { search: opts.search } : {}),
        ...(opts?.sortBy ? { sortBy: opts.sortBy } : {}),
        ...(opts?.sortOrder ? { sortOrder: opts.sortOrder } : {}),
      }),
    listAll: async (opts?: { includeInactive?: boolean; brandId?: string }) => {
      const items: Product[] = [];
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const result = await apiClientPaginated<Product>("/products", {
          page,
          limit: 100,
          ...(opts?.includeInactive ? { includeInactive: "true" } : {}),
          ...(opts?.brandId ? { brandId: opts.brandId } : {}),
        });
        items.push(...result.items);
        totalPages = result.pagination.totalPages;
        page += 1;
      }

      return items;
    },
    get: (id: string) => apiClient<Product>(`/products/${id}`),
    create: (data: {
      name: string;
      secondaryName?: string;
      brandId: string;
      stockUnit?: string;
      unitsPerStockUnit?: number;
      baseUnit?: string;
      lowStockThreshold?: number;
      totalLowStockThreshold?: number;
      isActive?: boolean;
    }) =>
      apiClient<Product>("/products", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        secondaryName: string | null;
        brandId: string;
        stockUnit: string;
        unitsPerStockUnit: number;
        baseUnit?: string;
        lowStockThreshold: number | null;
        totalLowStockThreshold: number | null;
        isActive: boolean;
      }>
    ) =>
      apiClient<Product>(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiClient<Product>(`/products/${id}`, {
        method: "DELETE",
      }),
    warehouseThresholds: (productId: string) =>
      apiClient<ProductWarehouseThreshold[]>(
        `/products/${productId}/warehouse-thresholds`
      ),
    updateWarehouseThresholds: (
      productId: string,
      thresholds: Array<{ warehouseId: string; lowStockThreshold: number | null }>
    ) =>
      apiClient<ProductWarehouseThreshold[]>(
        `/products/${productId}/warehouse-thresholds`,
        {
          method: "PUT",
          body: JSON.stringify({ thresholds }),
        }
      ),
  },

  stock: {
    balances: (
      params?: PaginationParams & {
        warehouseId?: string;
        brandId?: string;
        productId?: string;
        search?: string;
        sortBy?: string;
      }
    ) => apiClientPaginated<InventoryBalance>("/stock/balances", params),
    productAvailability: (params: { warehouseId: string; brandId: string }) =>
      apiClient<
        Array<{
          productId: string;
          quantity: number;
          stockUnit: string;
          unitsPerStockUnit: number;
          baseUnit: string;
        }>
      >(`/stock/availability?warehouseId=${encodeURIComponent(params.warehouseId)}&brandId=${encodeURIComponent(params.brandId)}`),
    movements: () => apiClient<StockMovement[]>("/stock/movements"),
    stockIn: (data: {
      warehouseId?: string;
      brandId: string;
      productId: string;
      quantity: number;
      transferId?: string;
      clientName?: string;
      invoiceNumber?: string;
      notes?: string;
    }) =>
      apiClient<{ movement: StockMovement; balance: number; transferId?: string }>(
        "/stock/in",
        { method: "POST", body: JSON.stringify(data) }
      ),
    stockOut: (data: {
      warehouseId?: string;
      brandId: string;
      productId: string;
      quantity: number;
      dispatchType: "TRANSFER" | "DIRECT_SELLING";
      destinationWarehouseId?: string;
      clientName?: string;
      invoiceNumber?: string;
      notes?: string;
    }) =>
      apiClient<{ movement: StockMovement; balance: number; transferId?: string }>(
        "/stock/out",
        { method: "POST", body: JSON.stringify(data) }
      ),
    stockOutBatch: (data: {
      warehouseId?: string;
      clientName: string;
      invoiceNumber?: string;
      notes?: string;
      items: Array<{ brandId: string; productId: string; quantity: number }>;
    }) =>
      apiClient<{
        movements: StockMovement[];
        balances: Record<string, number>;
        invoiceNumber?: string;
        clientName: string;
      }>("/stock/out/batch", { method: "POST", body: JSON.stringify(data) }),
    listClientReturnInvoices: (
      params?: import("@/types/pagination").PaginationParams & {
        search?: string;
        warehouseId?: string;
      }
    ) =>
      apiClientPaginated<import("@/types/stock").ClientReturnInvoiceSummary>(
        "/stock/client-returns/invoices",
        params
      ),
    getClientReturnInvoice: (params: {
      invoiceNumber: string;
      clientName?: string;
      warehouseId?: string;
    }) =>
      apiClient<import("@/types/stock").ClientReturnInvoice>(
        "/stock/client-returns/invoice",
        { params }
      ),
    submitClientReturn: (data: {
      mode: import("@/types/stock").ClientReturnMode;
      invoiceNumber?: string;
      clientName?: string;
      warehouseId?: string;
      saleMovementId?: string;
      quantity?: number;
      notes?: string;
    }) =>
      apiClient<import("@/types/stock").ClientReturnUpdateQuantityResult>(
        "/stock/client-returns",
        {
          method: "POST",
          body: JSON.stringify(data),
        }
      ),
  },

  inventory: {
    dashboard: () => apiClient<AdminDashboard>("/inventory/dashboard"),
    stock: (params?: PaginationParams & {
      warehouseId?: string;
      brandId?: string;
      productId?: string;
      includeZero?: boolean;
      search?: string;
      sortBy?: string;
      sortOrder?: "asc" | "desc";
    }) =>
      apiClientPaginatedData<StockResponse["items"][number], StockResponse>(
        "/inventory/stock",
        params
      ),
    movements: (
      params?: PaginationParams & {
        warehouseId?: string;
        brandId?: string;
        productId?: string;
        type?: string;
        dateFrom?: string;
        dateTo?: string;
        search?: string;
        sortBy?: string;
        sortOrder?: "asc" | "desc";
      }
    ) => apiClientPaginated<StockMovement>("/inventory/movements", params),
    lowStock: (
      params?: PaginationParams & {
        warehouseId?: string;
        brandId?: string;
        search?: string;
        sortBy?: string;
        sortOrder?: "asc" | "desc";
      }
    ) =>
      apiClientPaginatedData<LowStockProductRow, LowStockResponse>(
        "/inventory/low-stock",
        params
      ),
    itemDetail: (
      warehouseId: string,
      productId: string,
      params?: PaginationParams & { type?: "STOCK_IN" | "STOCK_OUT" }
    ) =>
      apiClientPaginatedData<StockItemLedgerRow, StockItemDetailResponse>(
        "/inventory/items/detail",
        { warehouseId, productId, ...params }
      ),
    adjustStock: (data: {
      warehouseId: string;
      productId: string;
      brandId: string;
      quantity: number;
      reason?: string;
    }) =>
      apiClient<{
        warehouseId: string;
        productId: string;
        brandId: string;
        previousQuantity: number;
        quantity: number;
        changed: boolean;
      }>("/inventory/stock", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    updateLowStockThreshold: (data: {
      warehouseId: string;
      productId: string;
      lowStockThreshold: number | null;
    }) =>
      apiClient<{
        warehouseId: string;
        productId: string;
        warehouseLowStockThreshold: number | null;
        productLowStockThreshold: number | null;
        lowStockThreshold: number | null;
      }>("/inventory/stock/threshold", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    listInvoices: (params?: PaginationParams & { search?: string }) =>
      apiClientPaginated<StockMovement>("/inventory/invoices", params),
    listInvoiceGroups: (
      params?: PaginationParams & {
        search?: string;
        warehouseId?: string;
        clientId?: string;
        sortBy?: string;
        sortOrder?: "asc" | "desc";
      }
    ) =>
      apiClientPaginated<import("@/types/stock").InvoiceGroup>(
        "/inventory/invoices/grouped",
        params
      ),
    searchInvoices: (params: PaginationParams & { search: string }) =>
      apiClientPaginated<StockMovement>("/inventory/invoices/search", params),
    updateMovementInvoice: (
      movementId: string,
      data: {
        invoiceNumber?: string;
        clientName?: string;
        quantity?: number;
        lineUpdates?: Array<{ movementId: string; quantity: number }>;
      }
    ) =>
      apiClient<StockMovement>(`/inventory/movements/${movementId}/invoice`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    deleteInvoice: (movementId: string) =>
      apiClient<{ deleted: boolean; id: string }>(
        `/inventory/movements/${movementId}/invoice`,
        { method: "DELETE" }
      ),
  },

  transfers: {
    pending: (warehouseId?: string) =>
      apiClient<PendingTransfer[]>("/transfers/pending", {
        params: warehouseId ? { warehouseId } : undefined,
      }),
    history: (
      params?: PaginationParams & {
        status?: string;
        sourceWarehouseId?: string;
        destinationWarehouseId?: string;
        dateFrom?: string;
        dateTo?: string;
        sortBy?:
          | "status"
          | "createdAt"
          | "quantity"
          | "productName"
          | "brandName"
          | "route";
        sortOrder?: "asc" | "desc";
      }
    ) => apiClientPaginated<TransferRecord>("/transfers/history", params),
    updateStatus: (
      id: string,
      data: { status: "RECEIVED" | "CANCELLED"; notes?: string }
    ) =>
      apiClient<TransferRecord>(`/transfers/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    returnGoods: (id: string, data?: { notes?: string }) =>
      apiClient<TransferRecord>(`/transfers/${id}/return`, {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
    returnInTransit: (id: string, data?: { notes?: string }) =>
      apiClient<TransferRecord>(`/transfers/${id}/return-in-transit`, {
        method: "POST",
        body: JSON.stringify(data ?? {}),
      }),
    activity: (params?: { dateFrom?: string; dateTo?: string; limit?: number }) =>
      apiClient<TransferActivityReport>("/transfers/activity", {
        params: params
          ? {
              ...(params.dateFrom ? { dateFrom: params.dateFrom } : {}),
              ...(params.dateTo ? { dateTo: params.dateTo } : {}),
              ...(params.limit != null ? { limit: String(params.limit) } : {}),
            }
          : undefined,
      }),
  },

  reports: {
    fetch: (type: ReportType, filters?: ReportFilters) => {
      const paths: Record<ReportType, string> = {
        stock: "/reports/stock",
        "stock-in": "/reports/stock-in",
        "stock-out": "/reports/stock-out",
        transfers: "/reports/transfers",
        "sales-client": "/reports/sales/by-client",
        "sales-invoice": "/reports/sales/by-invoice",
        "sales-brand": "/reports/sales/by-brand",
      };
      const params: Record<string, string> = {};
      if (filters?.warehouseId) params.warehouseId = filters.warehouseId;
      if (filters?.brandId) params.brandId = filters.brandId;
      if (filters?.productId) params.productId = filters.productId;
      if (filters?.clientName) params.clientName = filters.clientName;
      if (filters?.invoiceNumber) params.invoiceNumber = filters.invoiceNumber;
      if (filters?.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters?.dateTo) params.dateTo = filters.dateTo;
      if (filters?.groupBy) params.groupBy = filters.groupBy;
      return apiClient<ReportResult>(paths[type], { params });
    },
    downloadCsv: async (type: ReportType, filters?: ReportFilters) => {
      const paths: Record<ReportType, string> = {
        stock: "/reports/stock",
        "stock-in": "/reports/stock-in",
        "stock-out": "/reports/stock-out",
        transfers: "/reports/transfers",
        "sales-client": "/reports/sales/by-client",
        "sales-invoice": "/reports/sales/by-invoice",
        "sales-brand": "/reports/sales/by-brand",
      };
      const url = buildApiUrl(paths[type]);
      url.searchParams.set("format", "csv");
      if (filters?.warehouseId) url.searchParams.set("warehouseId", filters.warehouseId);
      if (filters?.brandId) url.searchParams.set("brandId", filters.brandId);
      if (filters?.productId) url.searchParams.set("productId", filters.productId);
      if (filters?.clientName) url.searchParams.set("clientName", filters.clientName);
      if (filters?.invoiceNumber) url.searchParams.set("invoiceNumber", filters.invoiceNumber);
      if (filters?.dateFrom) url.searchParams.set("dateFrom", filters.dateFrom);
      if (filters?.dateTo) url.searchParams.set("dateTo", filters.dateTo);
      if (filters?.groupBy) url.searchParams.set("groupBy", filters.groupBy);

      const response = await fetchWithAuth(url.toString(), {});
      if (!response.ok) {
        throw new ApiError("Export failed", response.status);
      }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="(.+)"/);
      const filename = match?.[1] ?? `report-${type}.csv`;

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
    },
  },

  imports: {
    list: () => apiClient<TallyImport[]>("/imports"),
    get: (id: string) => apiClient<TallyImport>(`/imports/${id}`),
    uploadTally: async (file: File, warehouseId: string): Promise<TallyImport> => {
      const form = new FormData();
      form.append("file", file);
      form.append("warehouseId", warehouseId);

      const response = await fetchWithAuth(apiUrl("/imports/tally"), {
        method: "POST",
        body: form,
      });

      let body: ApiResponse<TallyImport>;
      try {
        body = (await response.json()) as ApiResponse<TallyImport>;
      } catch {
        throw new ApiError("Invalid response from server", response.status);
      }
      if (!response.ok || !body.success) {
        throw new ApiError(
          body.message ?? "Upload failed",
          response.status,
          body.code
        );
      }
      return body.data as TallyImport;
    },
    previewProducts: async (file: File): Promise<ProductImportPreview> => {
      const form = new FormData();
      form.append("file", file);
      const response = await fetchWithAuth(apiUrl("/imports/products/preview"), {
        method: "POST",
        body: form,
      });
      let body: ApiResponse<ProductImportPreview>;
      try {
        body = (await response.json()) as ApiResponse<ProductImportPreview>;
      } catch {
        throw new ApiError("Invalid response from server", response.status);
      }
      if (!response.ok || !body.success) {
        throw new ApiError(body.message ?? "Preview failed", response.status, body.code);
      }
      return body.data as ProductImportPreview;
    },
    confirmProducts: (data: {
      fileName?: string;
      rows: ProductImportRowDecision[];
    }) =>
      apiClient<ProductImportResult>("/imports/products/confirm", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    previewSales: async (file: File): Promise<SalesImportPreview> => {
      const form = new FormData();
      form.append("file", file);
      const response = await fetchWithAuth(apiUrl("/imports/sales/preview"), {
        method: "POST",
        body: form,
      });
      let body: ApiResponse<SalesImportPreview>;
      try {
        body = (await response.json()) as ApiResponse<SalesImportPreview>;
      } catch {
        throw new ApiError("Invalid response from server", response.status);
      }
      if (!response.ok || !body.success) {
        throw new ApiError(body.message ?? "Preview failed", response.status, body.code);
      }
      return body.data as SalesImportPreview;
    },
    confirmSales: (data: {
      fileName?: string;
      warehouseId: string;
      vouchers: SalesImportConfirmVoucher[];
    }) =>
      apiClient<SalesImportResult>("/imports/sales/confirm", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    previewClients: async (file: File): Promise<ClientImportPreview> => {
      const form = new FormData();
      form.append("file", file);
      const response = await fetchWithAuth(apiUrl("/imports/clients/preview"), {
        method: "POST",
        body: form,
      });
      let body: ApiResponse<ClientImportPreview>;
      try {
        body = (await response.json()) as ApiResponse<ClientImportPreview>;
      } catch {
        throw new ApiError("Invalid response from server", response.status);
      }
      if (!response.ok || !body.success) {
        throw new ApiError(body.message ?? "Preview failed", response.status, body.code);
      }
      return body.data as ClientImportPreview;
    },
    confirmClients: (data: {
      fileName?: string;
      rows: ClientImportRowDecision[];
    }) =>
      apiClient<ClientImportResult>("/imports/clients/confirm", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  audit: {
    list: (filters?: AuditFilters & PaginationParams) =>
      apiClientPaginated<AuditLogEntry>("/audit", filters),
    summary: () => apiClient<AuditSummary>("/audit/summary"),
    users: () => apiClient<PublicUser[]>("/audit/users"),
  },

  checklists: {
    today: (date?: string) =>
      apiClient<import("@/types/checklist").TodayChecklist[]>(
        `/checklists/today${date ? `?date=${date}` : ""}`
      ),
    list: () => apiClient<import("@/types/checklist").Checklist[]>("/checklists"),
    adminAll: () =>
      apiClient<import("@/types/checklist").Checklist[]>("/checklists/admin/all"),
    progress: (id: string, date: string) =>
      apiClient<import("@/types/checklist").ChecklistProgress>(
        `/checklists/${id}/progress?date=${date}`
      ),
    create: (data: {
      title: string;
      description?: string;
      assignedUserIds: string[];
      tasks: Array<{ title: string; sortOrder?: number; dueTime?: string }>;
    }) =>
      apiClient<import("@/types/checklist").Checklist>("/checklists", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        title: string;
        description: string;
        assignedUserIds: string[];
        tasks: Array<{ title: string; sortOrder?: number; dueTime?: string }>;
        isActive: boolean;
      }>
    ) =>
      apiClient<import("@/types/checklist").Checklist>(`/checklists/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    complete: (checklistId: string, taskId: string, date?: string) =>
      apiClient<{ completed: boolean; completedAt?: string }>(
        `/checklists/${checklistId}/tasks/${taskId}/complete`,
        { method: "POST", body: JSON.stringify(date ? { date } : {}) }
      ),
    uncomplete: (checklistId: string, taskId: string, date?: string) =>
      apiClient<{ completed: boolean }>(
        `/checklists/${checklistId}/tasks/${taskId}/uncomplete`,
        { method: "POST", body: JSON.stringify(date ? { date } : {}) }
      ),
  },

  notifications: {
    poll: () =>
      apiClient<import("@/types/notification").NotificationPollResult>(
        "/notifications/poll"
      ),
    list: (params?: { resolved?: boolean; page?: number; limit?: number }) =>
      apiClientPaginated<import("@/types/notification").AppNotification>(
        "/notifications",
        params
      ),
    unreadCount: () =>
      apiClient<{ count: number }>("/notifications/unread-count"),
    sync: (date?: string) =>
      apiClient<import("@/types/notification").NotificationSyncResult>(
        "/notifications/sync",
        { method: "POST", body: JSON.stringify(date ? { date } : {}) }
      ),
    markRead: (id: string) =>
      apiClient<import("@/types/notification").AppNotification>(
        `/notifications/${id}/read`,
        { method: "PATCH" }
      ),
    markAllRead: () =>
      apiClient<{ updated: number }>("/notifications/read-all", {
        method: "POST",
      }),
  },

  permissions: {
    catalog: () =>
      apiClient<{ modules: import("@/lib/auth/permissions").PermissionModuleDefinition[] }>(
        "/permissions/catalog"
      ),
  },

  users: {
    list: () => apiClient<PublicUser[]>("/users"),
    get: (id: string) => apiClient<PublicUser>(`/users/${id}`),
    create: (data: {
      name: string;
      email: string;
      password: string;
      role: "ADMIN" | "WAREHOUSE_USER";
      warehouseId?: string;
      permissions?: import("@/lib/auth/permissions").PermissionGrant[];
      isActive?: boolean;
    }) =>
      apiClient<PublicUser>("/users", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        name: string;
        email: string;
        password: string;
        role: "ADMIN" | "WAREHOUSE_USER";
        warehouseId: string | null;
        permissions?: import("@/lib/auth/permissions").PermissionGrant[];
        isActive: boolean;
      }>
    ) =>
      apiClient<PublicUser>(`/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  search: {
    productSuggestions: (params: {
      search: string;
      limit?: number;
      brandId?: string;
      warehouseId?: string;
      includeInactive?: boolean;
    }) =>
      apiClient<{
        items: Array<{
          productId: string;
          productName: string;
          secondaryProductName?: string;
          brandId: string;
          brandName: string;
          quantity: number;
          quantityScope: "total" | "warehouse";
        }>;
      }>("/search/products", {
        params: {
          search: params.search,
          ...(params.limit != null ? { limit: String(params.limit) } : {}),
          ...(params.brandId ? { brandId: params.brandId } : {}),
          ...(params.warehouseId ? { warehouseId: params.warehouseId } : {}),
          ...(params.includeInactive ? { includeInactive: "true" } : {}),
        },
      }),
    invoiceSuggestions: (params: { search: string; limit?: number }) =>
      apiClient<{
        items: Array<{
          id: string;
          kind: "invoice" | "client" | "product";
          title: string;
          subtitle?: string;
          searchTerm: string;
        }>;
      }>("/search/invoices", {
        params: {
          search: params.search,
          ...(params.limit != null ? { limit: String(params.limit) } : {}),
        },
      }),
  },
};

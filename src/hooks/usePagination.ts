"use client";

import { useCallback, useMemo, useState } from "react";
import { DEFAULT_PAGE_SIZE } from "@/types/pagination";

export function usePagination(initialLimit = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(initialLimit);

  const resetPage = useCallback(() => setPage(1), []);

  const params = useMemo(
    () => ({
      page: String(page),
      limit: String(limit),
    }),
    [page, limit]
  );

  const handleLimitChange = useCallback((next: number) => {
    setLimit(next);
    setPage(1);
  }, []);

  return {
    page,
    setPage,
    limit,
    setLimit: handleLimitChange,
    resetPage,
    params,
  };
}

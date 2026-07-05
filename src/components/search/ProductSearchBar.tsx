"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  SearchInputWithSuggestions,
  type SearchSuggestion,
} from "@/components/search/SearchInputWithSuggestions";

type ProductSearchBarProps = {
  inventoryPath: string;
  fetchSuggestions: (term: string) => Promise<SearchSuggestion[]>;
  placeholder?: string;
  className?: string;
};

export function ProductSearchBar({
  inventoryPath,
  fetchSuggestions,
  placeholder = "Search products by name or brand…",
  className = "",
}: ProductSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const navigateToInventory = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      const params = new URLSearchParams({ search: trimmed });
      router.push(`${inventoryPath}?${params.toString()}`);
    },
    [inventoryPath, router]
  );

  return (
    <form
      role="search"
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        navigateToInventory(query);
      }}
    >
      <SearchInputWithSuggestions
        value={query}
        onChange={setQuery}
        onSelect={(suggestion) => navigateToInventory(suggestion.searchTerm)}
        fetchSuggestions={fetchSuggestions}
        placeholder={placeholder}
        ariaLabel="Search products"
        inputClassName="form-input w-full pl-12 pr-12 shadow-sm"
        showViewAll
        onViewAll={navigateToInventory}
      />
    </form>
  );
}

export type { SearchSuggestion as ProductSearchSuggestion };

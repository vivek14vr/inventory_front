"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

export type SearchSuggestion = {
  id: string;
  searchTerm: string;
  title: string;
  subtitle?: string;
  badge?: string;
  meta?: string;
};

type SearchInputWithSuggestionsProps = {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: SearchSuggestion) => void;
  fetchSuggestions: (term: string) => Promise<SearchSuggestion[]>;
  placeholder?: string;
  ariaLabel?: string;
  inputClassName?: string;
  wrapperClassName?: string;
  debounceMs?: number;
  showViewAll?: boolean;
  onViewAll?: (term: string) => void;
  viewAllLabel?: (term: string) => string;
  emptyMessage?: (term: string) => string;
  disabled?: boolean;
};

export function SearchInputWithSuggestions({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder = "Search…",
  ariaLabel = "Search",
  inputClassName = "form-input w-full",
  wrapperClassName = "",
  debounceMs = 300,
  showViewAll = false,
  onViewAll,
  viewAllLabel = (term) => `View all results for “${term}”`,
  emptyMessage = (term) => `No matches for “${term}”`,
  disabled = false,
}: SearchInputWithSuggestionsProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  // form-input uses px-4; force enough left padding for the leading icon.
  const resolvedInputClassName = `${inputClassName} !pl-12`;

  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debouncedQuery = useDebouncedValue(value.trim(), debounceMs);

  useEffect(() => {
    if (!debouncedQuery || disabled) {
      setSuggestions([]);
      setFetchError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFetchError("");

    void fetchSuggestions(debouncedQuery)
      .then((items) => {
        if (cancelled) return;
        setSuggestions(items);
        setOpen(true);
        setActiveIndex(items.length > 0 ? 0 : -1);
      })
      .catch(() => {
        if (cancelled) return;
        setSuggestions([]);
        setFetchError("Could not load suggestions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, disabled, fetchSuggestions]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function chooseSuggestion(suggestion: SearchSuggestion) {
    onSelect(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      if (event.key === "Escape") {
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1
      );
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeIndex]);
    }
  }

  const showDropdown = open && debouncedQuery.length > 0 && !disabled;

  return (
    <div ref={rootRef} className={`relative ${wrapperClassName}`}>
      <label htmlFor={`${listboxId}-input`} className="sr-only">
        {ariaLabel}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-stone-400">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
        </span>
        <input
          id={`${listboxId}-input`}
          type="search"
          value={value}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (debouncedQuery) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={showDropdown ? listboxId : undefined}
          aria-activedescendant={
            showDropdown && activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          className={resolvedInputClassName}
        />
        {loading && (
          <span className="absolute inset-y-0 right-4 flex items-center" aria-hidden>
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-orange-600" />
          </span>
        )}
      </div>

      {showDropdown && (
        <div
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-lg"
          role="listbox"
          id={listboxId}
        >
          {fetchError ? (
            <p className="px-4 py-3 text-sm text-red-600">{fetchError}</p>
          ) : suggestions.length === 0 && !loading ? (
            <p className="px-4 py-3 text-sm text-stone-500">{emptyMessage(debouncedQuery)}</p>
          ) : (
            <>
              <ul className="max-h-80 overflow-y-auto py-1">
                {suggestions.map((item, index) => {
                  const isActive = index === activeIndex;

                  return (
                    <li key={item.id} role="presentation">
                      <button
                        type="button"
                        id={`${listboxId}-option-${index}`}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => chooseSuggestion(item)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                          isActive ? "bg-orange-50" : "hover:bg-stone-50"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-stone-900">{item.title}</p>
                          {item.subtitle && (
                            <p className="truncate text-sm text-stone-500">{item.subtitle}</p>
                          )}
                          {(item.badge || item.meta) && (
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {item.badge && (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                                  {item.badge}
                                </span>
                              )}
                              {item.meta && (
                                <span className="text-xs text-stone-500">{item.meta}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {showViewAll && onViewAll && (
                <div className="border-t border-stone-100 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      onViewAll(debouncedQuery);
                      setOpen(false);
                      setActiveIndex(-1);
                    }}
                    className="text-sm font-semibold text-orange-700 hover:text-orange-800"
                  >
                    {viewAllLabel(debouncedQuery)}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

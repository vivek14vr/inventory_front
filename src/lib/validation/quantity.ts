export const QUANTITY_NON_NEGATIVE_MESSAGE = "Quantity cannot be negative";
export const QUANTITY_POSITIVE_MESSAGE = "Quantity must be at least 1";

export function validateNonNegativeInteger(
  quantity: number,
  label = "Quantity"
): string | null {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 0) {
    return label === "Quantity"
      ? QUANTITY_NON_NEGATIVE_MESSAGE
      : `${label} cannot be negative`;
  }
  return null;
}

export function validatePositiveInteger(
  quantity: number,
  label = "Quantity"
): string | null {
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 1) {
    return label === "Quantity"
      ? QUANTITY_POSITIVE_MESSAGE
      : `${label} must be at least 1`;
  }
  return null;
}

export function parseNonNegativeInt(
  raw: string,
  label = "Quantity"
): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { value: null, error: `${label} is required` };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: `Enter a valid ${label.toLowerCase()}` };
  }
  const negativeError = validateNonNegativeInteger(parsed, label);
  if (negativeError) {
    return { value: null, error: negativeError };
  }
  return { value: parsed, error: null };
}

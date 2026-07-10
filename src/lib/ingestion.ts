/**
 * Shared constants for the screenshot-ingestion flow.
 */

/**
 * Extracted fields with confidence below this are visually flagged in the
 * confirmation preview; an extraction whose formatConfidence is below it
 * additionally requires the user to pick the format explicitly (no
 * pre-selection) before the rest of the preview unlocks.
 */
export const CONFIDENCE_CONFIRM_THRESHOLD = 0.8;

export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // Claude API image limit

export const SUPPORTED_SCREENSHOT_MEDIA_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

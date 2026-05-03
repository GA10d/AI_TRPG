export const DEFAULT_COMIC_GENERATION_INTERVAL = 3;
export const MIN_COMIC_GENERATION_INTERVAL = 1;
export const MAX_COMIC_GENERATION_INTERVAL = 12;

export function normalizeComicGenerationInterval(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_COMIC_GENERATION_INTERVAL;
  }

  const roundedValue = Math.round(value);
  return Math.min(
    MAX_COMIC_GENERATION_INTERVAL,
    Math.max(MIN_COMIC_GENERATION_INTERVAL, roundedValue)
  );
}

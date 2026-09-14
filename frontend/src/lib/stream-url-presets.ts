/**
 * Fixed source URLs the streaming server understands directly. Everything else
 * is typed by hand, so the URL itself remains the single stored value - the
 * server derives an input's type from its scheme and has no separate type
 * field, so storing a "type" alongside would just be a second source of truth.
 */
export const URL_PRESETS = [
  { value: "publish://", label: "publish://" },
  { value: "fake://fake", label: "fake://fake" },
] as const;

/** Sentinel for the "Custom" dropdown entry; never stored as a URL. */
export const CUSTOM_URL = "__custom__";

/** Which dropdown entry a stored URL corresponds to. */
export function presetOf(url: string): string {
  return URL_PRESETS.some((preset) => preset.value === url) ? url : CUSTOM_URL;
}

/**
 * The URL after picking `selected` in the dropdown.
 *
 * Choosing a preset sets it outright. Choosing Custom clears a preset so the
 * field starts empty rather than leaving `publish://` sitting in a free-text
 * box, but leaves an already-custom URL untouched - otherwise merely reopening
 * the dropdown would wipe what the user typed.
 */
export function urlForPreset(selected: string, currentUrl: string): string {
  if (selected !== CUSTOM_URL) return selected;
  return presetOf(currentUrl) === CUSTOM_URL ? currentUrl : "";
}

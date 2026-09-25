/**
 * `@clappr/core` ships its own types; the plugin packages do not. They are
 * handed straight to Clappr, so opaque types are enough - declaring their
 * internals by hand would only drift from the libraries.
 */
declare module "@clappr/hlsjs-playback" {
  const HlsjsPlayback: unknown;
  export default HlsjsPlayback;
}

declare module "dash-shaka-playback" {
  const DashShakaPlayback: unknown;
  export default DashShakaPlayback;
}

declare module "@clappr/plugins" {
  export const MediaControl: unknown;
  export const Poster: unknown;
  export const ClickToPause: unknown;
  export const SpinnerThreeBounce: unknown;
  export const ErrorScreen: unknown;
  export const SeekTime: unknown;
  export const DVRControls: unknown;
  export const ClosedCaptions: unknown;
  export const Stats: unknown;
  export const WaterMark: unknown;
  export const Plugins: unknown[];
}

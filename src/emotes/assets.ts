import type { Emote, EmoteAssetOptions, EmoteImage } from '../types/emotes';

export const isValidEmoteAssetUrl = (url: string): boolean => {
  if (typeof url !== 'string' || !url) return false;
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);base64,[a-z0-9+/=\s]+$/i.test(url)) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeFormat = (format?: string): string | undefined => {
  const normalized = format?.trim().toLowerCase().replace(/^\./u, '');
  return normalized || undefined;
};

const formatFromUrl = (url: string): string | undefined => {
  try {
    const pathname = new URL(url).pathname;
    return normalizeFormat(pathname.match(/\.([a-z0-9]+)$/iu)?.[1]);
  } catch {
    return undefined;
  }
};

const scaleFromUrl = (url: string): number | undefined => {
  try {
    const pathname = new URL(url).pathname;
    const twitchScale = pathname.match(/\/(?:default|animated|static)\/(?:dark|light)\/(\d+(?:\.\d+)?)\/?$/iu)?.[1];
    const filenameScale = pathname.match(/\/(\d+(?:\.\d+)?)x\.[^/]+$/iu)?.[1];
    const parsed = Number(twitchScale ?? filenameScale);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const withDerivedMetadata = (image: EmoteImage): EmoteImage => {
  const format = normalizeFormat(image.format) ?? formatFromUrl(image.url);
  const scale = image.scale ?? scaleFromUrl(image.url);
  return {
    ...image,
    ...(format ? { format } : {}),
    ...(scale !== undefined ? { scale } : {}),
  };
};

const baseAssets = (emote: Emote): EmoteImage[] => {
  const byUrl = new Map<string, EmoteImage>();
  for (const image of emote.images ?? []) {
    if (!isValidEmoteAssetUrl(image.url) || byUrl.has(image.url)) continue;
    byUrl.set(image.url, withDerivedMetadata(image));
  }

  const primaryMetadata = byUrl.get(emote.url);
  const primary = isValidEmoteAssetUrl(emote.url)
    ? withDerivedMetadata({ animated: emote.animated, ...primaryMetadata, url: emote.url })
    : undefined;

  const result: EmoteImage[] = [];
  if (primary) result.push(primary);
  for (const image of byUrl.values()) {
    if (image.url !== emote.url) result.push(image);
  }
  for (const url of emote.altUrls ?? []) {
    if (!isValidEmoteAssetUrl(url) || result.some((image) => image.url === url)) continue;
    result.push(withDerivedMetadata({ url, animated: emote.animated }));
  }
  return result;
};

const booleanPreferenceRank = (actual: boolean | undefined, requested: boolean | undefined): number => {
  if (requested === undefined) return 0;
  if (actual === requested) return 0;
  if (actual === undefined) return 1;
  return 2;
};

const themePreferenceRank = (image: EmoteImage, requested: EmoteAssetOptions['theme']): number => {
  if (!requested) return 0;
  if (image.theme === requested) return 0;
  if (image.theme === undefined) return 1;
  return 2;
};

const formatPreferenceRank = (image: EmoteImage, preferred?: readonly string[]): number => {
  if (!preferred?.length) return 0;
  const normalized = preferred.map(normalizeFormat).filter((format): format is string => Boolean(format));
  const format = normalizeFormat(image.format) ?? formatFromUrl(image.url);
  if (!format) return normalized.length + 1;
  const index = normalized.indexOf(format);
  return index >= 0 ? index : normalized.length + 1;
};

const scalePreferenceRank = (image: EmoteImage, requested?: number): number => {
  if (requested === undefined || !Number.isFinite(requested)) return 0;
  if (image.scale === undefined || !Number.isFinite(image.scale)) return Number.POSITIVE_INFINITY;
  return Math.abs(image.scale - requested);
};

const dimensionPreferenceRank = (
  image: EmoteImage,
  targetWidth?: number,
  targetHeight?: number,
): readonly [number, number] => {
  const wantsWidth = targetWidth !== undefined && Number.isFinite(targetWidth) && targetWidth > 0;
  const wantsHeight = targetHeight !== undefined && Number.isFinite(targetHeight) && targetHeight > 0;
  if (!wantsWidth && !wantsHeight) return [0, 0];
  if (image.width === undefined && image.height === undefined) return [2, Number.POSITIVE_INFINITY];

  const width = image.width ?? 0;
  const height = image.height ?? 0;
  const widthTarget = wantsWidth ? targetWidth! : width;
  const heightTarget = wantsHeight ? targetHeight! : height;
  const meets = (!wantsWidth || width >= widthTarget) && (!wantsHeight || height >= heightTarget);
  const distance = Math.abs(width - widthTarget) + Math.abs(height - heightTarget);
  return [meets ? 0 : 1, distance];
};

const hasPreferences = (options: EmoteAssetOptions): boolean =>
  options.animated !== undefined ||
  options.theme !== undefined ||
  options.scale !== undefined ||
  options.targetWidth !== undefined ||
  options.targetHeight !== undefined ||
  Boolean(options.preferredFormats?.length);

export function emoteAssetCandidates(
  emote: Emote,
  options: EmoteAssetOptions = {},
): EmoteImage[] {
  const assets = baseAssets(emote);
  if (!hasPreferences(options)) return assets;

  return assets
    .map((image, index) => ({ image, index }))
    .sort((a, b) => {
      const animatedDelta = booleanPreferenceRank(a.image.animated, options.animated) -
        booleanPreferenceRank(b.image.animated, options.animated);
      if (animatedDelta !== 0) return animatedDelta;

      const themeDelta = themePreferenceRank(a.image, options.theme) -
        themePreferenceRank(b.image, options.theme);
      if (themeDelta !== 0) return themeDelta;

      const formatDelta = formatPreferenceRank(a.image, options.preferredFormats) -
        formatPreferenceRank(b.image, options.preferredFormats);
      if (formatDelta !== 0) return formatDelta;

      const aScaleRank = scalePreferenceRank(a.image, options.scale);
      const bScaleRank = scalePreferenceRank(b.image, options.scale);
      if (aScaleRank !== bScaleRank) return aScaleRank < bScaleRank ? -1 : 1;

      const aDimensions = dimensionPreferenceRank(a.image, options.targetWidth, options.targetHeight);
      const bDimensions = dimensionPreferenceRank(b.image, options.targetWidth, options.targetHeight);
      if (aDimensions[0] !== bDimensions[0]) return aDimensions[0] - bDimensions[0];
      if (aDimensions[1] !== bDimensions[1]) return aDimensions[1] - bDimensions[1];

      return a.index - b.index;
    })
    .map(({ image }) => image);
}

export function resolveEmoteAsset(
  emote: Emote,
  options: EmoteAssetOptions = {},
): EmoteImage | undefined {
  return emoteAssetCandidates(emote, options)[0];
}

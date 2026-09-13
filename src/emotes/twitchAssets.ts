import type { Emote, EmoteImage, EmoteTheme } from '../types/emotes';

export const TWITCH_EMOTE_CDN_TEMPLATE =
  'https://static-cdn.jtvnw.net/emoticons/v2/{{id}}/{{format}}/{{theme_mode}}/{{scale}}';

export type TwitchEmoteFormat = 'static' | 'animated';
export type TwitchEmoteScale = '1.0' | '2.0' | '3.0';

export interface TwitchEmoteAssetDescriptor {
  id: string;
  formats?: readonly string[];
  scales?: readonly string[];
  themes?: readonly string[];
  template?: string;
}

export interface TwitchEmoteAssetOptions {
  animated?: boolean;
  theme?: EmoteTheme;
  scale?: TwitchEmoteScale | number;
}

const DEFAULT_FORMATS: TwitchEmoteFormat[] = ['static'];
const DEFAULT_SCALES: TwitchEmoteScale[] = ['1.0', '2.0', '3.0'];
const DEFAULT_THEMES: EmoteTheme[] = ['dark', 'light'];

const normalizedFormats = (formats?: readonly string[]): TwitchEmoteFormat[] => {
  const result = (formats ?? []).filter((format): format is TwitchEmoteFormat =>
    format === 'static' || format === 'animated');
  return result.length > 0 ? [...new Set(result)] : DEFAULT_FORMATS;
};

const normalizedThemes = (themes?: readonly string[]): EmoteTheme[] => {
  const result = (themes ?? []).filter((theme): theme is EmoteTheme =>
    theme === 'dark' || theme === 'light');
  return result.length > 0 ? [...new Set(result)] : DEFAULT_THEMES;
};

const normalizedScales = (scales?: readonly string[]): TwitchEmoteScale[] => {
  const result = (scales ?? []).filter((scale): scale is TwitchEmoteScale =>
    scale === '1.0' || scale === '2.0' || scale === '3.0');
  return result.length > 0 ? [...new Set(result)] : DEFAULT_SCALES;
};

const chooseFormat = (formats: TwitchEmoteFormat[], animated?: boolean): TwitchEmoteFormat => {
  if (animated === false && formats.includes('static')) return 'static';
  if (animated === true && formats.includes('animated')) return 'animated';
  if (animated === undefined && formats.includes('animated')) return 'animated';
  return formats.includes('static') ? 'static' : formats[0];
};

const chooseTheme = (themes: EmoteTheme[], requested?: EmoteTheme): EmoteTheme => {
  if (requested && themes.includes(requested)) return requested;
  if (themes.includes('dark')) return 'dark';
  return themes[0];
};

const chooseScale = (
  scales: TwitchEmoteScale[],
  requested?: TwitchEmoteScale | number,
): TwitchEmoteScale => {
  if (typeof requested === 'string' && scales.includes(requested)) return requested;
  if (typeof requested === 'number' && Number.isFinite(requested)) {
    return [...scales].sort((a, b) =>
      Math.abs(Number(a) - requested) - Math.abs(Number(b) - requested))[0];
  }
  return [...scales].sort((a, b) => Number(b) - Number(a))[0];
};

export function resolveTwitchEmoteAsset(
  descriptor: TwitchEmoteAssetDescriptor,
  options: TwitchEmoteAssetOptions = {},
): string {
  const formats = normalizedFormats(descriptor.formats);
  const themes = normalizedThemes(descriptor.themes);
  const scales = normalizedScales(descriptor.scales);
  const format = chooseFormat(formats, options.animated);
  const theme = chooseTheme(themes, options.theme);
  const scale = chooseScale(scales, options.scale);

  return (descriptor.template ?? TWITCH_EMOTE_CDN_TEMPLATE)
    .replaceAll('{{id}}', encodeURIComponent(descriptor.id))
    .replaceAll('{{format}}', format)
    .replaceAll('{{theme_mode}}', theme)
    .replaceAll('{{scale}}', scale);
}

export function twitchEmoteImages(descriptor: TwitchEmoteAssetDescriptor): EmoteImage[] {
  const formats = normalizedFormats(descriptor.formats);
  const themes = normalizedThemes(descriptor.themes);
  const scales = normalizedScales(descriptor.scales);
  const images: EmoteImage[] = [];

  for (const format of formats) {
    for (const theme of themes) {
      for (const scale of scales) {
        images.push({
          url: resolveTwitchEmoteAsset(descriptor, {
            animated: format === 'animated',
            theme,
            scale,
          }),
          scale: Number(scale),
          animated: format === 'animated',
          theme,
        });
      }
    }
  }
  return images;
}

export function createTwitchNativeEmote(
  descriptor: TwitchEmoteAssetDescriptor,
  code: string,
  raw?: unknown,
): Emote {
  const images = twitchEmoteImages(descriptor);
  const url = resolveTwitchEmoteAsset(descriptor);
  const altUrls = [...new Set(images.map((image) => image.url).filter((candidate) => candidate !== url))];
  return {
    id: descriptor.id,
    code,
    provider: 'twitch',
    zeroWidth: false,
    animated: normalizedFormats(descriptor.formats).includes('animated'),
    url,
    altUrls,
    images,
    raw,
  };
}

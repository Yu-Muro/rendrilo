export const outputFormats = [
  { mimeType: "image/jpeg", label: "JPEG", extension: "jpg", supportsTransparency: false },
  { mimeType: "image/png", label: "PNG", extension: "png", supportsTransparency: true },
  { mimeType: "image/webp", label: "WebP", extension: "webp", supportsTransparency: true },
  { mimeType: "image/avif", label: "AVIF", extension: "avif", supportsTransparency: true },
] as const;

export type OutputMimeType = (typeof outputFormats)[number]["mimeType"];

export interface PixelSize {
  readonly height: number;
  readonly width: number;
}

export interface ConversionSettings {
  readonly allowUpscale: boolean;
  readonly backgroundColor: string;
  readonly height?: number;
  readonly outputType: OutputMimeType;
  readonly preserveAspectRatio: boolean;
  readonly quality: number;
  readonly width?: number;
}

export const defaultConversionSettings: ConversionSettings = {
  allowUpscale: false,
  backgroundColor: "#ffffff",
  outputType: "image/webp",
  preserveAspectRatio: true,
  quality: 85,
};

export function findOutputFormat(mimeType: string) {
  return outputFormats.find((format) => format.mimeType === mimeType);
}

export function normalizeQuality(quality: number): number {
  if (!Number.isFinite(quality)) {
    return defaultConversionSettings.quality / 100;
  }

  return Math.min(100, Math.max(1, quality)) / 100;
}

export function normalizeBackgroundColor(color: string): string {
  return /^#[\da-f]{6}$/i.test(color) ? color : defaultConversionSettings.backgroundColor;
}

export function calculateOutputSize(
  source: PixelSize,
  settings: Pick<ConversionSettings, "allowUpscale" | "height" | "preserveAspectRatio" | "width">,
): PixelSize {
  assertPixelSize(source);

  const requestedWidth = normalizeDimension(settings.width);
  const requestedHeight = normalizeDimension(settings.height);

  if (!requestedWidth && !requestedHeight) {
    return source;
  }

  if (!settings.preserveAspectRatio) {
    return {
      width: limitUpscale(requestedWidth ?? source.width, source.width, settings.allowUpscale),
      height: limitUpscale(requestedHeight ?? source.height, source.height, settings.allowUpscale),
    };
  }

  const widthScale = requestedWidth ? requestedWidth / source.width : Number.POSITIVE_INFINITY;
  const heightScale = requestedHeight ? requestedHeight / source.height : Number.POSITIVE_INFINITY;
  let scale = Math.min(widthScale, heightScale);

  if (!settings.allowUpscale) {
    scale = Math.min(scale, 1);
  }

  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

function normalizeDimension(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.max(1, Math.round(value));
}

function limitUpscale(value: number, sourceValue: number, allowUpscale: boolean): number {
  return allowUpscale ? value : Math.min(value, sourceValue);
}

function assertPixelSize(size: PixelSize): void {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new RangeError("Source dimensions must be positive finite numbers.");
  }
}

export const inputFormats = [
  { mimeType: "image/jpeg", label: "JPEG", extensions: [".jpg", ".jpeg"] },
  { mimeType: "image/png", label: "PNG", extensions: [".png"] },
  { mimeType: "image/webp", label: "WebP", extensions: [".webp"] },
  { mimeType: "image/avif", label: "AVIF", extensions: [".avif"] },
] as const;

export type InputMimeType = (typeof inputFormats)[number]["mimeType"];

export const acceptedImageTypes = inputFormats.map(({ mimeType }) => mimeType).join(",");

export function findInputFormat(mimeType: string) {
  return inputFormats.find((format) => format.mimeType === mimeType.toLowerCase());
}

import { findOutputFormat, type OutputMimeType } from "./conversion.ts";

export function createOutputFileName(originalName: string, outputType: OutputMimeType): string {
  const format = findOutputFormat(outputType);

  if (!format) {
    throw new RangeError(`Unsupported output format: ${outputType}`);
  }

  const trimmedName = originalName.trim();
  const extensionIndex = trimmedName.lastIndexOf(".");
  const baseName = extensionIndex > 0 ? trimmedName.slice(0, extensionIndex) : trimmedName;

  return `${baseName || "converted"}.${format.extension}`;
}

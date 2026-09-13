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

export function createUniqueOutputFileNames(
  originalNames: readonly string[],
  outputType: OutputMimeType,
): string[] {
  const usedNames = new Set<string>();

  return originalNames.map((originalName) => {
    const initialName = createOutputFileName(originalName, outputType);
    const extensionIndex = initialName.lastIndexOf(".");
    const baseName = initialName.slice(0, extensionIndex);
    const extension = initialName.slice(extensionIndex);
    let candidate = initialName;
    let suffix = 2;

    while (usedNames.has(candidate.toLowerCase())) {
      candidate = `${baseName}-${suffix}${extension}`;
      suffix += 1;
    }

    usedNames.add(candidate.toLowerCase());
    return candidate;
  });
}

import { findInputFormat } from "./formats.ts";

const mebibyte = 1024 * 1024;

export const defaultInputLimits = {
  maxFileCount: 100,
  maxFileSizeBytes: 100 * mebibyte,
  maxTotalSizeBytes: 500 * mebibyte,
} as const;

export interface ImageFileMetadata {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

export type RejectionCode =
  | "empty-file"
  | "file-count-exceeded"
  | "file-too-large"
  | "total-size-exceeded"
  | "unsupported-format";

export interface RejectedFile<TFile extends ImageFileMetadata> {
  readonly code: RejectionCode;
  readonly file: TFile;
}

export interface ValidationResult<TFile extends ImageFileMetadata> {
  readonly accepted: TFile[];
  readonly rejected: RejectedFile<TFile>[];
}

interface InputLimits {
  readonly maxFileCount: number;
  readonly maxFileSizeBytes: number;
  readonly maxTotalSizeBytes: number;
}

export function validateIncomingFiles<TFile extends ImageFileMetadata>(
  existingFiles: readonly ImageFileMetadata[],
  incomingFiles: readonly TFile[],
  limits: InputLimits = defaultInputLimits,
): ValidationResult<TFile> {
  const accepted: TFile[] = [];
  const rejected: RejectedFile<TFile>[] = [];
  let totalSize = existingFiles.reduce((total, file) => total + file.size, 0);

  for (const file of incomingFiles) {
    let code: RejectionCode | undefined;

    if (file.size === 0) {
      code = "empty-file";
    } else if (!findInputFormat(file.type)) {
      code = "unsupported-format";
    } else if (file.size > limits.maxFileSizeBytes) {
      code = "file-too-large";
    } else if (existingFiles.length + accepted.length >= limits.maxFileCount) {
      code = "file-count-exceeded";
    } else if (totalSize + file.size > limits.maxTotalSizeBytes) {
      code = "total-size-exceeded";
    }

    if (code) {
      rejected.push({ code, file });
      continue;
    }

    accepted.push(file);
    totalSize += file.size;
  }

  return { accepted, rejected };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

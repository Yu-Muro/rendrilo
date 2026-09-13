import { Zip, ZipPassThrough } from "fflate";

export interface ZipArchiveEntry {
  readonly blob: Blob;
  readonly name: string;
}

export interface ZipProgress {
  readonly completed: number;
  readonly total: number;
}

export async function createZipArchive(
  entries: readonly ZipArchiveEntry[],
  onProgress?: (progress: ZipProgress) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  if (entries.length === 0) {
    throw new RangeError("At least one file is required to create a ZIP archive.");
  }

  signal?.throwIfAborted();

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    const archive = new Zip((error, chunk, final) => {
      if (error) {
        reject(error);
        return;
      }

      chunks.push(chunk);

      if (final) {
        resolve(new Blob(chunks, { type: "application/zip" }));
      }
    });

    const handleAbort = () => {
      archive.terminate();
      reject(signal?.reason ?? new DOMException("ZIP creation was canceled.", "AbortError"));
    };

    signal?.addEventListener("abort", handleAbort, { once: true });

    void addEntries(archive, entries, onProgress, signal)
      .then(() => archive.end())
      .catch((error: unknown) => {
        archive.terminate();
        reject(error);
      })
      .finally(() => signal?.removeEventListener("abort", handleAbort));
  });
}

async function addEntries(
  archive: Zip,
  entries: readonly ZipArchiveEntry[],
  onProgress?: (progress: ZipProgress) => void,
  signal?: AbortSignal,
): Promise<void> {
  for (const [index, entry] of entries.entries()) {
    signal?.throwIfAborted();
    const zipEntry = new ZipPassThrough(sanitizeZipEntryName(entry.name));
    archive.add(zipEntry);
    await pipeBlob(entry.blob, zipEntry, signal);
    onProgress?.({ completed: index + 1, total: entries.length });
  }
}

async function pipeBlob(blob: Blob, zipEntry: ZipPassThrough, signal?: AbortSignal): Promise<void> {
  const reader = blob.stream().getReader();

  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();

      if (done) {
        zipEntry.push(new Uint8Array(), true);
        return;
      }

      zipEntry.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export function sanitizeZipEntryName(name: string): string {
  const sanitized = name.replaceAll(/[\\/\0]/g, "_").trim();
  return sanitized || "converted-image";
}

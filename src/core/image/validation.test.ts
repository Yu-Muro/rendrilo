import { describe, expect, it } from "vite-plus/test";
import { formatBytes, validateIncomingFiles } from "./validation.ts";

const jpeg = { name: "photo.jpg", size: 2_000, type: "image/jpeg" };

describe("validateIncomingFiles", () => {
  it("accepts supported images", () => {
    const result = validateIncomingFiles([], [jpeg]);

    expect(result.accepted).toEqual([jpeg]);
    expect(result.rejected).toEqual([]);
  });

  it("rejects empty and unsupported files", () => {
    const empty = { name: "empty.png", size: 0, type: "image/png" };
    const text = { name: "notes.txt", size: 20, type: "text/plain" };

    const result = validateIncomingFiles([], [empty, text]);

    expect(result.accepted).toEqual([]);
    expect(result.rejected.map(({ code }) => code)).toEqual(["empty-file", "unsupported-format"]);
  });

  it("applies count and total size limits in input order", () => {
    const second = { name: "second.jpg", size: 4, type: "image/jpeg" };
    const third = { name: "third.jpg", size: 5, type: "image/jpeg" };
    const result = validateIncomingFiles([jpeg], [second, third], {
      maxFileCount: 2,
      maxFileSizeBytes: 10,
      maxTotalSizeBytes: 3_000,
    });

    expect(result.accepted).toEqual([second]);
    expect(result.rejected).toEqual([{ code: "file-count-exceeded", file: third }]);
  });

  it("rejects files above the individual size limit", () => {
    const result = validateIncomingFiles([], [jpeg], {
      maxFileCount: 2,
      maxFileSizeBytes: 1_000,
      maxTotalSizeBytes: 10_000,
    });

    expect(result.rejected[0]?.code).toBe("file-too-large");
  });

  it("rejects files above the combined size limit", () => {
    const existing = { name: "existing.png", size: 7, type: "image/png" };
    const incoming = { name: "incoming.webp", size: 4, type: "image/webp" };
    const result = validateIncomingFiles([existing], [incoming], {
      maxFileCount: 3,
      maxFileSizeBytes: 10,
      maxTotalSizeBytes: 10,
    });

    expect(result.rejected[0]?.code).toBe("total-size-exceeded");
  });
});

describe("formatBytes", () => {
  it("formats byte values for display", () => {
    expect(formatBytes(900)).toBe("900 B");
    expect(formatBytes(1_536)).toBe("1.5 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
  });
});

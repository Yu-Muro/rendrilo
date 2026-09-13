import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vite-plus/test";
import { createZipArchive, sanitizeZipEntryName } from "./create-zip.ts";

describe("createZipArchive", () => {
  it("creates an archive containing every file", async () => {
    const progress: number[] = [];
    const archive = await createZipArchive(
      [
        { blob: new Blob(["first"]), name: "first.txt" },
        { blob: new Blob(["second"]), name: "second.txt" },
      ],
      ({ completed }) => progress.push(completed),
    );
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));

    expect(archive.type).toBe("application/zip");
    expect(strFromU8(files["first.txt"]!)).toBe("first");
    expect(strFromU8(files["second.txt"]!)).toBe("second");
    expect(progress).toEqual([1, 2]);
  });

  it("requires at least one file", async () => {
    await expect(createZipArchive([])).rejects.toThrow(RangeError);
  });

  it("respects an already canceled signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      createZipArchive(
        [{ blob: new Blob(["data"]), name: "file.txt" }],
        undefined,
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("sanitizeZipEntryName", () => {
  it("prevents paths and empty archive names", () => {
    expect(sanitizeZipEntryName("../folder\\image.webp")).toBe(".._folder_image.webp");
    expect(sanitizeZipEntryName("  ")).toBe("converted-image");
  });
});

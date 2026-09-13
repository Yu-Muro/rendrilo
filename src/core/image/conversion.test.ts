import { describe, expect, it } from "vite-plus/test";
import { calculateOutputSize, normalizeBackgroundColor, normalizeQuality } from "./conversion.ts";
import { createOutputFileName } from "./file-naming.ts";

const resizeDefaults = {
  allowUpscale: false,
  preserveAspectRatio: true,
};

describe("calculateOutputSize", () => {
  it("keeps source dimensions when no target is provided", () => {
    expect(calculateOutputSize({ height: 800, width: 1200 }, resizeDefaults)).toEqual({
      height: 800,
      width: 1200,
    });
  });

  it("calculates height from a target width", () => {
    expect(
      calculateOutputSize({ height: 800, width: 1200 }, { ...resizeDefaults, width: 600 }),
    ).toEqual({ height: 400, width: 600 });
  });

  it("fits an image within a width and height boundary", () => {
    expect(
      calculateOutputSize(
        { height: 800, width: 1200 },
        { ...resizeDefaults, height: 300, width: 300 },
      ),
    ).toEqual({ height: 200, width: 300 });
  });

  it("does not upscale by default", () => {
    expect(
      calculateOutputSize({ height: 800, width: 1200 }, { ...resizeDefaults, width: 2400 }),
    ).toEqual({ height: 800, width: 1200 });
  });

  it("supports independent dimensions when aspect ratio is disabled", () => {
    expect(
      calculateOutputSize(
        { height: 800, width: 1200 },
        { allowUpscale: true, height: 400, preserveAspectRatio: false, width: 400 },
      ),
    ).toEqual({ height: 400, width: 400 });
  });

  it("rejects invalid source dimensions", () => {
    expect(() => calculateOutputSize({ height: 0, width: 1200 }, resizeDefaults)).toThrow(
      RangeError,
    );
  });
});

describe("conversion settings normalization", () => {
  it("clamps encoder quality", () => {
    expect(normalizeQuality(0)).toBe(0.01);
    expect(normalizeQuality(85)).toBe(0.85);
    expect(normalizeQuality(200)).toBe(1);
  });

  it("falls back from an invalid background color", () => {
    expect(normalizeBackgroundColor("#123abc")).toBe("#123abc");
    expect(normalizeBackgroundColor("not-a-color")).toBe("#ffffff");
  });
});

describe("createOutputFileName", () => {
  it("replaces the original extension", () => {
    expect(createOutputFileName("holiday.photo.png", "image/webp")).toBe("holiday.photo.webp");
  });

  it("uses a safe fallback for an empty name", () => {
    expect(createOutputFileName(" ", "image/jpeg")).toBe("converted.jpg");
  });
});

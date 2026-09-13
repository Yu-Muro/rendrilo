/// <reference lib="webworker" />

import {
  calculateOutputSize,
  findOutputFormat,
  normalizeBackgroundColor,
  normalizeQuality,
} from "../core/image/conversion.ts";
import type {
  ConversionErrorCode,
  ConversionFailedEvent,
  ConversionProgress,
  ConversionWorkerCommand,
  ConversionWorkerEvent,
  ConvertImageCommand,
} from "../core/image/worker-protocol.ts";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
const canceledJobs = new Set<string>();

workerScope.addEventListener("message", (event: MessageEvent<ConversionWorkerCommand>) => {
  const command = event.data;

  if (command.type === "cancel") {
    canceledJobs.add(command.jobId);
    return;
  }

  void convert(command);
});

async function convert(command: ConvertImageCommand): Promise<void> {
  let bitmap: ImageBitmap | undefined;

  try {
    assertAvailable("OffscreenCanvas" in workerScope, "OffscreenCanvas is not available.");
    reportProgress(command.jobId, "decoding");
    bitmap = await decode(command.file);
    assertNotCanceled(command.jobId);

    const size = calculateOutputSize(
      { height: bitmap.height, width: bitmap.width },
      command.settings,
    );
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d", { alpha: true });

    assertAvailable(Boolean(context), "A 2D rendering context is not available.");
    reportProgress(command.jobId, "rendering");

    const format = findOutputFormat(command.settings.outputType);
    assertAvailable(Boolean(format), "The requested output format is not supported.");

    if (!format?.supportsTransparency) {
      context!.fillStyle = normalizeBackgroundColor(command.settings.backgroundColor);
      context!.fillRect(0, 0, size.width, size.height);
    }

    context!.drawImage(bitmap, 0, 0, size.width, size.height);
    assertNotCanceled(command.jobId);
    reportProgress(command.jobId, "encoding");

    const blob = await encode(canvas, command.settings.outputType, command.settings.quality);
    assertNotCanceled(command.jobId);

    post({ blob, jobId: command.jobId, size, type: "completed" });
  } catch (error) {
    post(toFailure(command.jobId, error));
  } finally {
    bitmap?.close();
    canceledJobs.delete(command.jobId);
  }
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new WorkerConversionError("decode-failed", "The image could not be decoded.");
  }
}

async function encode(canvas: OffscreenCanvas, outputType: string, quality: number): Promise<Blob> {
  let blob: Blob;

  try {
    blob = await canvas.convertToBlob({ quality: normalizeQuality(quality), type: outputType });
  } catch {
    throw new WorkerConversionError("encode-failed", "The image could not be encoded.");
  }

  if (blob.type !== outputType) {
    throw new WorkerConversionError(
      "output-format-unsupported",
      "This browser cannot encode the selected output format.",
    );
  }

  return blob;
}

function reportProgress(jobId: string, progress: ConversionProgress): void {
  post({ jobId, progress, type: "progress" });
}

function post(message: ConversionWorkerEvent): void {
  workerScope.postMessage(message);
}

function assertNotCanceled(jobId: string): void {
  if (canceledJobs.has(jobId)) {
    throw new WorkerConversionError("canceled", "The conversion was canceled.");
  }
}

function assertAvailable(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new WorkerConversionError("environment-unsupported", message);
  }
}

function toFailure(jobId: string, error: unknown): ConversionFailedEvent {
  if (error instanceof WorkerConversionError) {
    return { code: error.code, jobId, message: error.message, type: "failed" };
  }

  return {
    code: "encode-failed",
    jobId,
    message: "The image conversion failed unexpectedly.",
    type: "failed",
  };
}

class WorkerConversionError extends Error {
  readonly code: ConversionErrorCode;

  constructor(code: ConversionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

import type { ConversionSettings, PixelSize } from "./conversion.ts";
import type {
  ConversionErrorCode,
  ConversionProgress,
  ConversionWorkerCommand,
  ConversionWorkerEvent,
} from "./worker-protocol.ts";

export interface ConversionResult {
  readonly blob: Blob;
  readonly size: PixelSize;
}

export interface ConversionTask {
  readonly cancel: () => void;
  readonly jobId: string;
  readonly result: Promise<ConversionResult>;
}

export class ConversionTaskError extends Error {
  readonly code: ConversionErrorCode;

  constructor(code: ConversionErrorCode, message: string) {
    super(message);
    this.name = "ConversionTaskError";
    this.code = code;
  }
}

interface PendingJob {
  readonly onProgress?: (progress: ConversionProgress) => void;
  readonly reject: (error: ConversionTaskError) => void;
  readonly resolve: (result: ConversionResult) => void;
}

export class ConversionClient {
  readonly #jobs = new Map<string, PendingJob>();
  readonly #worker: Worker;

  constructor() {
    this.#worker = new Worker(new URL("../../workers/conversion.worker.ts", import.meta.url), {
      type: "module",
    });
    this.#worker.addEventListener("message", this.#handleMessage);
    this.#worker.addEventListener("error", this.#handleWorkerError);
  }

  convert(
    file: Blob,
    settings: ConversionSettings,
    onProgress?: (progress: ConversionProgress) => void,
  ): ConversionTask {
    const jobId = crypto.randomUUID();
    const result = new Promise<ConversionResult>((resolve, reject) => {
      this.#jobs.set(jobId, { onProgress, reject, resolve });
    });
    const command: ConversionWorkerCommand = { file, jobId, settings, type: "convert" };

    this.#worker.postMessage(command);

    return {
      cancel: () => {
        if (this.#jobs.has(jobId)) {
          const cancelCommand: ConversionWorkerCommand = { jobId, type: "cancel" };
          this.#worker.postMessage(cancelCommand);
        }
      },
      jobId,
      result,
    };
  }

  dispose(): void {
    this.#worker.removeEventListener("message", this.#handleMessage);
    this.#worker.removeEventListener("error", this.#handleWorkerError);
    this.#worker.terminate();

    for (const job of this.#jobs.values()) {
      job.reject(new ConversionTaskError("canceled", "The conversion worker was disposed."));
    }

    this.#jobs.clear();
  }

  readonly #handleMessage = (event: MessageEvent<ConversionWorkerEvent>) => {
    const message = event.data;
    const job = this.#jobs.get(message.jobId);

    if (!job) {
      return;
    }

    if (message.type === "progress") {
      job.onProgress?.(message.progress);
      return;
    }

    this.#jobs.delete(message.jobId);

    if (message.type === "completed") {
      job.resolve({ blob: message.blob, size: message.size });
      return;
    }

    job.reject(new ConversionTaskError(message.code, message.message));
  };

  readonly #handleWorkerError = () => {
    for (const job of this.#jobs.values()) {
      job.reject(
        new ConversionTaskError("environment-unsupported", "The conversion worker stopped."),
      );
    }

    this.#jobs.clear();
  };
}

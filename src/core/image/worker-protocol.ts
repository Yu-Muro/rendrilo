import type { ConversionSettings, PixelSize } from "./conversion.ts";

export type ConversionErrorCode =
  | "canceled"
  | "decode-failed"
  | "encode-failed"
  | "environment-unsupported"
  | "output-format-unsupported";

export type ConversionProgress = "decoding" | "encoding" | "rendering";

export interface ConvertImageCommand {
  readonly file: Blob;
  readonly jobId: string;
  readonly settings: ConversionSettings;
  readonly type: "convert";
}

export interface CancelConversionCommand {
  readonly jobId: string;
  readonly type: "cancel";
}

export type ConversionWorkerCommand = CancelConversionCommand | ConvertImageCommand;

export interface ConversionCompletedEvent {
  readonly blob: Blob;
  readonly jobId: string;
  readonly size: PixelSize;
  readonly type: "completed";
}

export interface ConversionFailedEvent {
  readonly code: ConversionErrorCode;
  readonly jobId: string;
  readonly message: string;
  readonly type: "failed";
}

export interface ConversionProgressEvent {
  readonly jobId: string;
  readonly progress: ConversionProgress;
  readonly type: "progress";
}

export type ConversionWorkerEvent =
  | ConversionCompletedEvent
  | ConversionFailedEvent
  | ConversionProgressEvent;

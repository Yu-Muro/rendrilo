import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import {
  ConversionClient,
  ConversionTaskError,
  type ConversionTask,
} from "./core/image/conversion-client.ts";
import {
  defaultConversionSettings,
  findOutputFormat,
  outputFormats,
  type ConversionSettings,
  type OutputMimeType,
  type PixelSize,
} from "./core/image/conversion.ts";
import { createUniqueOutputFileNames } from "./core/image/file-naming.ts";
import { acceptedImageTypes, findInputFormat, inputFormats } from "./core/image/formats.ts";
import {
  defaultInputLimits,
  formatBytes,
  validateIncomingFiles,
  type RejectionCode,
} from "./core/image/validation.ts";
import type { ConversionProgress } from "./core/image/worker-protocol.ts";

interface CompletedConversion {
  readonly blob: Blob;
  readonly downloadName: string;
  readonly size: PixelSize;
  readonly url: string;
}

type FileConversionState =
  | { readonly status: "idle" }
  | { readonly status: "canceled" }
  | { readonly message: string; readonly status: "error" }
  | { readonly progress: ConversionProgress; readonly status: "running" }
  | { readonly result: CompletedConversion; readonly status: "completed" };

interface QueueEntry {
  readonly file: File;
  readonly id: string;
  readonly state: FileConversionState;
}

interface ActiveRun {
  canceled: boolean;
  readonly id: string;
  task?: ConversionTask;
}

const rejectionMessages: Record<RejectionCode, string> = {
  "empty-file": "is empty",
  "file-count-exceeded": "exceeds the 100-image selection limit",
  "file-too-large": "is larger than 100 MB",
  "total-size-exceeded": "exceeds the 500 MB total limit",
  "unsupported-format": "uses an unsupported format",
};

const progressLabels: Record<ConversionProgress, string> = {
  decoding: "Reading image…",
  encoding: "Encoding…",
  rendering: "Rendering…",
};

function createQueueEntry(file: File): QueueEntry {
  return { file, id: crypto.randomUUID(), state: { status: "idle" } };
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<ConversionClient | null>(null);
  const activeRunRef = useRef<ActiveRun | null>(null);
  const resultUrlsRef = useRef(new Set<string>());
  const mountedRef = useRef(false);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [settings, setSettings] = useState<ConversionSettings>(defaultConversionSettings);
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const client = new ConversionClient();
    const resultUrls = resultUrlsRef.current;
    clientRef.current = client;

    return () => {
      mountedRef.current = false;
      activeRunRef.current?.task?.cancel();
      client.dispose();
      clientRef.current = null;

      for (const url of resultUrls) {
        URL.revokeObjectURL(url);
      }

      resultUrls.clear();
    };
  }, []);

  const releaseUrl = (url: string) => {
    URL.revokeObjectURL(url);
    resultUrlsRef.current.delete(url);
  };

  const releaseAllResults = () => {
    for (const url of resultUrlsRef.current) {
      URL.revokeObjectURL(url);
    }

    resultUrlsRef.current.clear();
  };

  const resetResults = () => {
    releaseAllResults();
    setQueue((current) => current.map((entry) => ({ ...entry, state: { status: "idle" } })));
  };

  const updateEntryState = (id: string, state: FileConversionState) => {
    setQueue((current) => current.map((entry) => (entry.id === id ? { ...entry, state } : entry)));
  };

  const addFiles = (fileList: FileList | null) => {
    if (!fileList?.length || isRunning) {
      return;
    }

    const result = validateIncomingFiles(
      queue.map(({ file }) => file),
      Array.from(fileList),
    );

    setQueue((current) => [...current, ...result.accepted.map((file) => createQueueEntry(file))]);
    setErrors(
      result.rejected.map(
        ({ code, file }) => `${file.name || "Unnamed file"} ${rejectionMessages[code]}.`,
      ),
    );
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const updateSettings = (patch: Partial<ConversionSettings>) => {
    if (isRunning) {
      return;
    }

    resetResults();
    setSettings((current) => ({ ...current, ...patch }));
  };

  const removeFile = (id: string) => {
    if (isRunning) {
      return;
    }

    setQueue((current) => {
      const entry = current.find((item) => item.id === id);

      if (entry?.state.status === "completed") {
        releaseUrl(entry.state.result.url);
      }

      return current.filter((item) => item.id !== id);
    });
  };

  const clearAll = () => {
    if (isRunning) {
      return;
    }

    releaseAllResults();
    setQueue([]);
    setErrors([]);
  };

  const startConversion = async () => {
    const client = clientRef.current;

    if (!client || queue.length === 0 || isRunning) {
      return;
    }

    releaseAllResults();
    setQueue((current) => current.map((entry) => ({ ...entry, state: { status: "idle" } })));
    setIsRunning(true);

    const run: ActiveRun = { canceled: false, id: crypto.randomUUID() };
    const outputNames = createUniqueOutputFileNames(
      queue.map(({ file }) => file.name),
      settings.outputType,
    );
    activeRunRef.current = run;

    for (const [index, entry] of queue.entries()) {
      if (run.canceled || activeRunRef.current?.id !== run.id) {
        break;
      }

      updateEntryState(entry.id, { progress: "decoding", status: "running" });
      const task = client.convert(entry.file, settings, (progress) => {
        if (mountedRef.current && activeRunRef.current?.id === run.id && !run.canceled) {
          updateEntryState(entry.id, { progress, status: "running" });
        }
      });
      run.task = task;

      try {
        const result = await task.result;

        if (run.canceled || activeRunRef.current?.id !== run.id) {
          updateEntryState(entry.id, { status: "canceled" });
          break;
        }

        const url = URL.createObjectURL(result.blob);
        resultUrlsRef.current.add(url);
        updateEntryState(entry.id, {
          result: {
            blob: result.blob,
            downloadName: outputNames[index] ?? "converted",
            size: result.size,
            url,
          },
          status: "completed",
        });
      } catch (error) {
        if (!mountedRef.current || activeRunRef.current?.id !== run.id) {
          return;
        }

        if (run.canceled || (error instanceof ConversionTaskError && error.code === "canceled")) {
          updateEntryState(entry.id, { status: "canceled" });
          break;
        }

        const message =
          error instanceof ConversionTaskError
            ? error.message
            : "The image could not be converted unexpectedly.";
        updateEntryState(entry.id, { message, status: "error" });
      } finally {
        run.task = undefined;
      }
    }

    if (!mountedRef.current || activeRunRef.current?.id !== run.id) {
      return;
    }

    if (run.canceled) {
      setQueue((current) =>
        current.map((entry) =>
          entry.state.status === "idle" || entry.state.status === "running"
            ? { ...entry, state: { status: "canceled" } }
            : entry,
        ),
      );
    }

    activeRunRef.current = null;
    setIsRunning(false);
  };

  const cancelConversion = () => {
    const run = activeRunRef.current;

    if (run) {
      run.canceled = true;
      run.task?.cancel();
    }
  };

  const outputFormat = findOutputFormat(settings.outputType);
  const showQuality = settings.outputType !== "image/png";
  const totalSize = queue.reduce((total, { file }) => total + file.size, 0);
  const completedCount = queue.filter(({ state }) => state.status === "completed").length;

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="rendrilo home">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span>rendrilo</span>
        </a>
        <div className="privacy-label">
          <span className="privacy-dot" aria-hidden="true" />
          Local processing only
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="page-title">
          <p className="eyebrow">Universal image converter</p>
          <h1 id="page-title">
            Convert images.
            <br />
            Keep them <em>private.</em>
          </h1>
          <p className="hero-copy">
            Fast, high-quality image conversion that happens entirely in your browser. Your files
            never leave this device.
          </p>
        </section>

        <section
          className={`drop-zone${isDragging ? " is-dragging" : ""}`}
          onDragEnter={() => !isRunning && setIsDragging(true)}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          aria-labelledby="upload-title"
        >
          <div className="upload-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
            </svg>
          </div>
          <div>
            <h2 id="upload-title">Drop your images here</h2>
            <p>or choose them from your device</p>
          </div>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept={acceptedImageTypes}
            multiple
            onChange={handleInput}
            disabled={isRunning}
          />
          <button
            className="primary-button"
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isRunning}
          >
            Choose images
          </button>
          <p className="limits">
            Up to {defaultInputLimits.maxFileCount} files · 100 MB each · JPEG, PNG, WebP, AVIF
          </p>
        </section>

        <div className="format-row" aria-label="Supported input formats">
          <span>Works with</span>
          {inputFormats.map((format) => (
            <span className="format-chip" key={format.mimeType}>
              {format.label}
            </span>
          ))}
        </div>

        <div className="announcements" aria-live="polite">
          {errors.map((error) => (
            <p className="error-message" key={error}>
              {error}
            </p>
          ))}
        </div>

        {queue.length > 0 && (
          <section className="workspace" aria-labelledby="workspace-title">
            <div className="queue-heading">
              <div>
                <p className="eyebrow">Batch workspace</p>
                <h2 id="workspace-title">Convert your images</h2>
              </div>
              <div className="queue-summary">
                {queue.length} {queue.length === 1 ? "file" : "files"} · {formatBytes(totalSize)}
              </div>
            </div>

            <div className="settings-grid">
              <label className="field">
                <span>Output format</span>
                <select
                  value={settings.outputType}
                  onChange={(event) =>
                    updateSettings({ outputType: event.target.value as OutputMimeType })
                  }
                  disabled={isRunning}
                >
                  {outputFormats.map((format) => (
                    <option key={format.mimeType} value={format.mimeType}>
                      {format.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={`field quality-field${showQuality ? "" : " is-disabled"}`}>
                <span>
                  Quality <output>{settings.quality}</output>
                </span>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={settings.quality}
                  onChange={(event) => updateSettings({ quality: event.target.valueAsNumber })}
                  disabled={!showQuality || isRunning}
                />
              </label>

              <label className="field">
                <span>Width</span>
                <div className="number-input">
                  <input
                    type="number"
                    min="1"
                    placeholder="Original"
                    value={settings.width ?? ""}
                    onChange={(event) =>
                      updateSettings({
                        width: event.target.value ? event.target.valueAsNumber : undefined,
                      })
                    }
                    disabled={isRunning}
                  />
                  <span>px</span>
                </div>
              </label>

              <label className="field">
                <span>Height</span>
                <div className="number-input">
                  <input
                    type="number"
                    min="1"
                    placeholder="Original"
                    value={settings.height ?? ""}
                    onChange={(event) =>
                      updateSettings({
                        height: event.target.value ? event.target.valueAsNumber : undefined,
                      })
                    }
                    disabled={isRunning}
                  />
                  <span>px</span>
                </div>
              </label>
            </div>

            <div className="option-row">
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={settings.preserveAspectRatio}
                  onChange={(event) =>
                    updateSettings({ preserveAspectRatio: event.target.checked })
                  }
                  disabled={isRunning}
                />
                Keep aspect ratio
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={settings.allowUpscale}
                  onChange={(event) => updateSettings({ allowUpscale: event.target.checked })}
                  disabled={isRunning}
                />
                Allow upscaling
              </label>
              {outputFormat && !outputFormat.supportsTransparency && (
                <label className="color-field">
                  Background
                  <input
                    type="color"
                    value={settings.backgroundColor}
                    onChange={(event) => updateSettings({ backgroundColor: event.target.value })}
                    disabled={isRunning}
                  />
                </label>
              )}
            </div>

            <ul className="file-list" aria-label="Conversion queue">
              {queue.map((entry) => (
                <li className="file-item" key={entry.id}>
                  <div className="file-symbol" aria-hidden="true">
                    {findInputFormat(entry.file.type)?.label.slice(0, 1) ?? "?"}
                  </div>
                  <div className="file-details">
                    <strong>{entry.file.name}</strong>
                    <span>
                      {findInputFormat(entry.file.type)?.label ?? "Unknown"} ·{" "}
                      {formatBytes(entry.file.size)}
                    </span>
                    <FileStatus state={entry.state} />
                  </div>
                  <div className="file-actions">
                    {entry.state.status === "completed" && (
                      <a
                        className="file-download"
                        href={entry.state.result.url}
                        download={entry.state.result.downloadName}
                      >
                        Download
                      </a>
                    )}
                    <button
                      className="remove-button"
                      type="button"
                      onClick={() => removeFile(entry.id)}
                      aria-label={`Remove ${entry.file.name}`}
                      disabled={isRunning}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="conversion-actions" aria-live="polite">
              {isRunning ? (
                <>
                  <p className="conversion-status">
                    <span className="spinner" aria-hidden="true" />
                    Converting {completedCount} of {queue.length}
                  </p>
                  <button className="secondary-button" type="button" onClick={cancelConversion}>
                    Cancel batch
                  </button>
                </>
              ) : (
                <>
                  <button className="primary-button" type="button" onClick={startConversion}>
                    Convert {queue.length} {queue.length === 1 ? "image" : "images"} to{" "}
                    {outputFormat?.label ?? "image"}
                  </button>
                  <button className="secondary-button" type="button" onClick={clearAll}>
                    Clear all
                  </button>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      <footer>
        <p>
          <span aria-hidden="true">◇</span> No uploads. No accounts. No tracking.
        </p>
      </footer>
    </div>
  );
}

function FileStatus({ state }: { readonly state: FileConversionState }) {
  if (state.status === "idle") {
    return <span className="file-status">Waiting</span>;
  }

  if (state.status === "running") {
    return <span className="file-status is-running">{progressLabels[state.progress]}</span>;
  }

  if (state.status === "canceled") {
    return <span className="file-status">Canceled</span>;
  }

  if (state.status === "error") {
    return (
      <span className="file-status is-error" role="alert">
        {state.message}
      </span>
    );
  }

  return (
    <span className="file-status is-complete">
      {state.result.downloadName} · {state.result.size.width} × {state.result.size.height} ·{" "}
      {formatBytes(state.result.blob.size)}
    </span>
  );
}

export default App;

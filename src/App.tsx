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
import { createOutputFileName } from "./core/image/file-naming.ts";
import { acceptedImageTypes, findInputFormat, inputFormats } from "./core/image/formats.ts";
import {
  defaultInputLimits,
  formatBytes,
  validateIncomingFiles,
  type RejectionCode,
} from "./core/image/validation.ts";
import type { ConversionProgress } from "./core/image/worker-protocol.ts";

interface SelectedFile {
  readonly file: File;
  readonly id: string;
}

interface CompletedConversion {
  readonly downloadName: string;
  readonly size: PixelSize;
  readonly url: string;
  readonly bytes: number;
}

type ConversionState =
  | { readonly status: "idle" }
  | { readonly progress: ConversionProgress; readonly status: "running" }
  | { readonly message: string; readonly status: "error" }
  | { readonly result: CompletedConversion; readonly status: "completed" };

const rejectionMessages: Record<RejectionCode, string> = {
  "empty-file": "is empty",
  "file-count-exceeded": "exceeds the current one-image selection limit",
  "file-too-large": "is larger than 100 MB",
  "total-size-exceeded": "exceeds the 500 MB total limit",
  "unsupported-format": "uses an unsupported format",
};

const progressLabels: Record<ConversionProgress, string> = {
  decoding: "Reading image…",
  encoding: "Encoding result…",
  rendering: "Rendering pixels…",
};

function createSelectedFile(file: File): SelectedFile {
  return { file, id: crypto.randomUUID() };
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<ConversionClient | null>(null);
  const taskRef = useRef<ConversionTask | null>(null);
  const resultUrlRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [settings, setSettings] = useState<ConversionSettings>(defaultConversionSettings);
  const [conversion, setConversion] = useState<ConversionState>({ status: "idle" });
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    const client = new ConversionClient();
    clientRef.current = client;

    return () => {
      mountedRef.current = false;
      client.dispose();
      clientRef.current = null;

      if (resultUrlRef.current) {
        URL.revokeObjectURL(resultUrlRef.current);
      }
    };
  }, []);

  const releaseResult = () => {
    if (resultUrlRef.current) {
      URL.revokeObjectURL(resultUrlRef.current);
      resultUrlRef.current = null;
    }

    setConversion({ status: "idle" });
  };

  const cancelCurrentTask = () => {
    taskRef.current?.cancel();
    taskRef.current = null;
  };

  const addFiles = (fileList: FileList | null) => {
    if (!fileList?.length) {
      return;
    }

    const result = validateIncomingFiles([], Array.from(fileList), {
      ...defaultInputLimits,
      maxFileCount: 1,
    });
    const acceptedFile = result.accepted[0];

    if (acceptedFile) {
      cancelCurrentTask();
      releaseResult();
      setSelectedFile(createSelectedFile(acceptedFile));
    }

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
    releaseResult();
    setSettings((current) => ({ ...current, ...patch }));
  };

  const removeFile = () => {
    cancelCurrentTask();
    releaseResult();
    setErrors([]);
    setSelectedFile(null);
  };

  const startConversion = async () => {
    const client = clientRef.current;

    if (!client || !selectedFile || conversion.status === "running") {
      return;
    }

    releaseResult();
    setConversion({ progress: "decoding", status: "running" });
    const task = client.convert(selectedFile.file, settings, (progress) => {
      if (mountedRef.current) {
        setConversion({ progress, status: "running" });
      }
    });
    taskRef.current = task;

    try {
      const result = await task.result;

      if (!mountedRef.current || taskRef.current?.jobId !== task.jobId) {
        return;
      }

      const url = URL.createObjectURL(result.blob);
      resultUrlRef.current = url;
      setConversion({
        result: {
          bytes: result.blob.size,
          downloadName: createOutputFileName(selectedFile.file.name, settings.outputType),
          size: result.size,
          url,
        },
        status: "completed",
      });
    } catch (error) {
      if (!mountedRef.current || taskRef.current?.jobId !== task.jobId) {
        return;
      }

      const message =
        error instanceof ConversionTaskError
          ? error.message
          : "The image could not be converted unexpectedly.";
      setConversion({ message, status: "error" });
    } finally {
      if (taskRef.current?.jobId === task.jobId) {
        taskRef.current = null;
      }
    }
  };

  const cancelConversion = () => {
    taskRef.current?.cancel();
  };

  const outputFormat = findOutputFormat(settings.outputType);
  const showQuality = settings.outputType !== "image/png";

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
          onDragEnter={() => setIsDragging(true)}
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
            <h2 id="upload-title">Drop an image here</h2>
            <p>or choose one from your device</p>
          </div>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept={acceptedImageTypes}
            onChange={handleInput}
          />
          <button
            className="primary-button"
            type="button"
            onClick={() => inputRef.current?.click()}
          >
            Choose image
          </button>
          <p className="limits">Up to 100 MB · JPEG, PNG, WebP, AVIF</p>
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

        {selectedFile && (
          <section className="workspace" aria-labelledby="workspace-title">
            <div className="queue-heading">
              <div>
                <p className="eyebrow">Ready</p>
                <h2 id="workspace-title">Convert your image</h2>
              </div>
              <div className="queue-summary">Processed locally</div>
            </div>

            <div className="selected-file">
              <div className="file-symbol" aria-hidden="true">
                {findInputFormat(selectedFile.file.type)?.label.slice(0, 1) ?? "?"}
              </div>
              <div className="file-details">
                <strong>{selectedFile.file.name}</strong>
                <span>
                  {findInputFormat(selectedFile.file.type)?.label ?? "Unknown"} ·{" "}
                  {formatBytes(selectedFile.file.size)}
                </span>
              </div>
              <button
                className="remove-button"
                type="button"
                onClick={removeFile}
                aria-label={`Remove ${selectedFile.file.name}`}
              >
                Remove
              </button>
            </div>

            <div className="settings-grid">
              <label className="field">
                <span>Output format</span>
                <select
                  value={settings.outputType}
                  onChange={(event) =>
                    updateSettings({ outputType: event.target.value as OutputMimeType })
                  }
                  disabled={conversion.status === "running"}
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
                  disabled={!showQuality || conversion.status === "running"}
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
                    disabled={conversion.status === "running"}
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
                    disabled={conversion.status === "running"}
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
                  disabled={conversion.status === "running"}
                />
                Keep aspect ratio
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={settings.allowUpscale}
                  onChange={(event) => updateSettings({ allowUpscale: event.target.checked })}
                  disabled={conversion.status === "running"}
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
                    disabled={conversion.status === "running"}
                  />
                </label>
              )}
            </div>

            <div className="conversion-actions" aria-live="polite">
              {conversion.status === "running" ? (
                <>
                  <p className="conversion-status">
                    <span className="spinner" aria-hidden="true" />
                    {progressLabels[conversion.progress]}
                  </p>
                  <button className="secondary-button" type="button" onClick={cancelConversion}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="primary-button" type="button" onClick={startConversion}>
                  Convert to {outputFormat?.label ?? "image"}
                </button>
              )}
            </div>

            {conversion.status === "error" && (
              <p className="error-message conversion-error" role="alert">
                {conversion.message}
              </p>
            )}

            {conversion.status === "completed" && (
              <div className="result-panel">
                <div>
                  <p className="eyebrow">Complete</p>
                  <strong>{conversion.result.downloadName}</strong>
                  <span>
                    {conversion.result.size.width} × {conversion.result.size.height} ·{" "}
                    {formatBytes(conversion.result.bytes)}
                  </span>
                </div>
                <a
                  className="download-button"
                  href={conversion.result.url}
                  download={conversion.result.downloadName}
                >
                  Download
                </a>
              </div>
            )}
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

export default App;

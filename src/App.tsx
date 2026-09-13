import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { acceptedImageTypes, findInputFormat, inputFormats } from "./core/image/formats.ts";
import {
  defaultInputLimits,
  formatBytes,
  validateIncomingFiles,
  type RejectionCode,
} from "./core/image/validation.ts";

interface QueuedFile {
  readonly file: File;
  readonly id: string;
}

const rejectionMessages: Record<RejectionCode, string> = {
  "empty-file": "is empty",
  "file-count-exceeded": "exceeds the 100 file limit",
  "file-too-large": "is larger than 100 MB",
  "total-size-exceeded": "exceeds the 500 MB total limit",
  "unsupported-format": "uses an unsupported format",
};

function createQueuedFile(file: File): QueuedFile {
  return { file, id: crypto.randomUUID() };
}

function App() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queuedFiles, setQueuedFiles] = useState<QueuedFile[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList?.length) {
      return;
    }

    const files = Array.from(fileList);
    const result = validateIncomingFiles(
      queuedFiles.map(({ file }) => file),
      files,
    );

    setQueuedFiles((current) => [
      ...current,
      ...result.accepted.map((file) => createQueuedFile(file)),
    ]);
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

  const removeFile = (id: string) => {
    setQueuedFiles((files) => files.filter((entry) => entry.id !== id));
  };

  const totalSize = queuedFiles.reduce((total, { file }) => total + file.size, 0);

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
          />
          <button
            className="primary-button"
            type="button"
            onClick={() => inputRef.current?.click()}
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

        {queuedFiles.length > 0 && (
          <section className="queue" aria-labelledby="queue-title">
            <div className="queue-heading">
              <div>
                <p className="eyebrow">Ready</p>
                <h2 id="queue-title">Selected images</h2>
              </div>
              <div className="queue-summary">
                {queuedFiles.length} {queuedFiles.length === 1 ? "file" : "files"} ·{" "}
                {formatBytes(totalSize)}
              </div>
            </div>
            <ul className="file-list">
              {queuedFiles.map(({ file, id }) => (
                <li key={id}>
                  <div className="file-symbol" aria-hidden="true">
                    {findInputFormat(file.type)?.label.slice(0, 1) ?? "?"}
                  </div>
                  <div className="file-details">
                    <strong>{file.name}</strong>
                    <span>
                      {findInputFormat(file.type)?.label ?? "Unknown"} · {formatBytes(file.size)}
                    </span>
                  </div>
                  <button
                    className="remove-button"
                    type="button"
                    onClick={() => removeFile(id)}
                    aria-label={`Remove ${file.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="queue-footer">
              <p>Conversion settings are the next implementation step.</p>
              <button className="secondary-button" type="button" onClick={() => setQueuedFiles([])}>
                Clear all
              </button>
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

export default App;

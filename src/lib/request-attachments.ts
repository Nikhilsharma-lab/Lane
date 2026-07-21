export const REQUEST_ATTACHMENTS_BUCKET = "request-attachments";
export const MAX_ATTACHMENT_FILES = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_TOTAL_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_NAME_LENGTH = 255;

const MIME_BY_EXTENSION = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
} as const;

export const ATTACHMENT_ACCEPT =
  ".pdf,.docx,.txt,.md,.png,.jpg,.jpeg,.webp";

export type AttachmentMetadata = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type AttachmentValidation =
  | { valid: true; metadata: AttachmentMetadata }
  | { valid: false; message: string };

function extensionFor(fileName: string): keyof typeof MIME_BY_EXTENSION | null {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return extension && extension in MIME_BY_EXTENSION
    ? (extension as keyof typeof MIME_BY_EXTENSION)
    : null;
}

export function validateAttachmentMetadata(
  input: AttachmentMetadata
): AttachmentValidation {
  const fileName = input.fileName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  if (!fileName || fileName.length > MAX_ATTACHMENT_NAME_LENGTH) {
    return {
      valid: false,
      message: "Use a filename between 1 and 255 characters.",
    };
  }

  if (
    !Number.isInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > MAX_ATTACHMENT_BYTES
  ) {
    return {
      valid: false,
      message: "Each file must be no larger than 10 MB.",
    };
  }

  const extension = extensionFor(fileName);
  if (!extension) {
    return {
      valid: false,
      message:
        "Choose a PDF, DOCX, text, Markdown, PNG, JPEG, or WebP file.",
    };
  }

  const allowedTypes = MIME_BY_EXTENSION[extension] as readonly string[];
  const suppliedType = input.mimeType.trim().toLowerCase();
  const mimeType = suppliedType || allowedTypes[0];
  if (!allowedTypes.includes(mimeType)) {
    return {
      valid: false,
      message: "The filename and file type do not match.",
    };
  }

  return {
    valid: true,
    metadata: { fileName, mimeType, sizeBytes: input.sizeBytes },
  };
}

export function validateAttachmentSelection(
  files: AttachmentMetadata[]
): { valid: true } | { valid: false; message: string } {
  if (files.length > MAX_ATTACHMENT_FILES) {
    return {
      valid: false,
      message: "Add up to 5 files to one Request.",
    };
  }

  const totalBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  if (totalBytes > MAX_ATTACHMENTS_TOTAL_BYTES) {
    return {
      valid: false,
      message: "Keep all files together under 25 MB.",
    };
  }

  return { valid: true };
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

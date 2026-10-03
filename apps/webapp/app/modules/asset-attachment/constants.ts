/**
 * Asset attachments — shared between server and browser.
 * Part of the attachments feature; not in upstream Shelf.
 */

/** Private storage bucket the files live in. Created on first upload. */
export const ATTACHMENTS_BUCKET = "attachments";

/** Form field the asset form uses to pass files staged before saving. */
export const STAGED_ATTACHMENTS_FIELD = "stagedAttachmentIds";

/** Where the asset form uploads files before the asset is saved. */
export const STAGE_ATTACHMENTS_URL = "/api/asset-attachments/stage";

/** Upload size limit when ATTACHMENT_MAX_SIZE_MB isn't set. */
export const DEFAULT_ATTACHMENT_MAX_SIZE_MB = 100;

/**
 * Accepted files, in react-dropzone's format. The server re-checks every file
 * by its contents, so this only shapes the file picker.
 */
export const ATTACHMENT_ACCEPT: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "message/rfc822": [".eml"],
};

export const ATTACHMENT_TYPES_DESCRIPTION =
  "PDF, JPG, PNG, HEIC or saved email (EML)";

/** Short label for the type column. */
export function attachmentTypeLabel(contentType: string): string {
  switch (contentType) {
    case "application/pdf":
      return "PDF";
    case "image/jpeg":
      return "JPG";
    case "image/png":
      return "PNG";
    case "image/heic":
    case "image/heif":
      return "HEIC";
    case "message/rfc822":
      return "Email";
    default:
      return "File";
  }
}

/**
 * Shrinks a big photo in the browser before it's uploaded (fork), so a main
 * image of any size can be used: the longest side comes down to 2560 px and it
 * is re-encoded (WebP, else JPEG). The original is not kept. Small images, and
 * anything the browser can't read, go up as they are.
 */

/** The longest side a main image is shrunk to. */
export const MAX_IMAGE_EDGE = 2560;
/** Under this, and within the size above, a picture is left as it is. */
const LEAVE_UNDER_BYTES = 2 * 1024 * 1024;

/** The size to draw at: the longest side at most `max`, keeping the shape. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Whether a picture needs shrinking at all. */
export function needsShrinking(
  file: { size: number },
  width: number,
  height: number
) {
  return (
    file.size > LEAVE_UNDER_BYTES || Math.max(width, height) > MAX_IMAGE_EDGE
  );
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality)
  );
}

/** The file's name with a new extension. */
export function renamed(name: string, ext: string) {
  const base = name.replace(/\.[^./\\]*$/, "") || "image";
  return `${base}.${ext}`;
}

/**
 * The picture, shrunk if it's big. Never throws: on any trouble it hands back
 * the file it was given.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || typeof document === "undefined")
    return file;
  try {
    const bitmap = await createImageBitmap(file);
    if (!needsShrinking(file, bitmap.width, bitmap.height)) {
      bitmap.close();
      return file;
    }
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    // WebP keeps a PNG's transparency; browsers that can't make WebP give
    // PNG back instead, so fall back to JPEG for those
    let blob = await toBlob(canvas, "image/webp", 0.85);
    let ext = "webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await toBlob(canvas, "image/jpeg", 0.85);
      ext = "jpg";
    }
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], renamed(file.name, ext), {
      type: blob.type,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

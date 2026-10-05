/**
 * Shrinks a photo in the browser before it's uploaded: upright, JPEG, within
 * `edge` pixels. A phone photo is several MB; this makes it a few hundred KB,
 * which is all Claude needs and far quicker over wifi. If the browser can't
 * decode the file (HEIC in some browsers), the original is sent as it is and
 * the server tries.
 * Part of the AI feature; not in upstream Shelf.
 */
export async function shrinkImage(
  file: File,
  edge = 1600,
  quality = 0.85
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    // imageOrientation applies the camera's rotation, so the result is upright
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file; // never make it bigger
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

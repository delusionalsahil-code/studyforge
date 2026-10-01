export const MAX_PDF_BYTES = 20 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });
}

/** Shrinks big phone photos to max 1800px JPEG (keeps text legible, keeps storage small). */
export async function prepareImage(file: File): Promise<{ filename: string; mime: string; dataUrl: string; size: number }> {
  if (!file.type.startsWith("image/")) throw new Error("This file is not an image.");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("Image is larger than 25 MB.");
  const original = await readAsDataUrl(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("The image could not be decoded — it may be corrupted or an unsupported format."));
    i.src = original;
  });
  if (!img.width || !img.height) throw new Error("The image appears to be empty.");
  const max = 1800;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return { filename: file.name, mime: file.type, dataUrl: original, size: file.size };
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return { filename: file.name, mime: file.type, dataUrl: original, size: file.size };
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return { filename: file.name.replace(/\.\w+$/, "") + ".jpg", mime: "image/jpeg", dataUrl, size: Math.round((dataUrl.length * 3) / 4) };
}

export async function preparePdf(file: File): Promise<{ filename: string; mime: string; dataUrl: string; size: number }> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("This file is not a PDF.");
  if (file.size > MAX_PDF_BYTES) throw new Error("PDF is larger than 20 MB. Split it or upload pages as images.");
  return { filename: file.name, mime: "application/pdf", dataUrl: await readAsDataUrl(file), size: file.size };
}

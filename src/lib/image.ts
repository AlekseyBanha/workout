export type CompressedImage = {
  blob: Blob;
  contentType: "image/webp" | "image/jpeg";
  ext: "webp" | "jpg";
};

const targetBytes = 200 * 1024;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function render(bitmap: ImageBitmap, maxSide: number, type: string, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  return canvasBlob(canvas, type, quality);
}

export async function compressExerciseImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  try {
    let maxSide = 1024;
    let quality = 0.8;
    let blob = await render(bitmap, maxSide, "image/webp", quality);
    let contentType: CompressedImage["contentType"] = "image/webp";
    let ext: CompressedImage["ext"] = "webp";

    if (!blob) {
      contentType = "image/jpeg";
      ext = "jpg";
      blob = await render(bitmap, maxSide, "image/jpeg", quality);
    }
    if (!blob) throw new Error("compress");

    while (blob.size > targetBytes && (quality > 0.45 || maxSide > 480)) {
      if (quality > 0.45) quality = Math.round((quality - 0.08) * 100) / 100;
      else maxSide = Math.round(maxSide * 0.8);
      const next = await render(bitmap, maxSide, contentType, quality);
      if (!next) break;
      blob = next;
    }

    return { blob, contentType, ext };
  } finally {
    bitmap.close();
  }
}

import sharp from "sharp";

export async function cropImage(
  buffer: Buffer,
  crop: { top?: number; bottom?: number; left?: number; right?: number }
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) return buffer;

  const top = crop.top ?? 0;
  const bottom = crop.bottom ?? 0;
  const left = crop.left ?? 0;
  const right = crop.right ?? 0;

  const extractWidth = width - left - right;
  const extractHeight = height - top - bottom;

  if (extractWidth <= 0 || extractHeight <= 0) return buffer;

  return sharp(buffer)
    .extract({ left, top, width: extractWidth, height: extractHeight })
    .png()
    .toBuffer();
}

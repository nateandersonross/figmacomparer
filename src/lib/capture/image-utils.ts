import sharp from "sharp";

export type CropInsets = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

export async function cropImage(buffer: Buffer, insets: CropInsets): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) return buffer;

  const top = insets.top ?? 0;
  const bottom = insets.bottom ?? 0;
  const left = insets.left ?? 0;
  const right = insets.right ?? 0;
  const width = w - left - right;
  const height = h - top - bottom;

  if (width <= 0 || height <= 0) {
    throw new Error("Crop insets exceed image dimensions");
  }

  return sharp(buffer).extract({ left, top, width, height }).png().toBuffer();
}

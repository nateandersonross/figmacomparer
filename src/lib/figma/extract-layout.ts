import type { FigmaNode } from "@/lib/figma/client";
import type { ElementRect } from "@/lib/capture/layout-sample";

export type FigmaSection = {
  index: number;
  name: string;
  rect: ElementRect;
  height: number;
  width: number;
  gapAfter: number | null;
};

export type FigmaImage = {
  index: number;
  name: string;
  rect: ElementRect;
  width: number;
  height: number;
};

export type FigmaText = {
  name: string;
  text: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
  rect: ElementRect;
};

const SECTION_TYPES = new Set(["FRAME", "GROUP", "COMPONENT", "INSTANCE", "SECTION"]);
const MIN_SECTION_HEIGHT = 48;
const MIN_IMAGE_SIZE = 40;

type FrameBox = { x: number; y: number; width: number; height: number };

function toFrameRect(box: { x: number; y: number; width: number; height: number }, frame: FrameBox): ElementRect {
  return {
    top: Math.round(box.y - frame.y),
    left: Math.round(box.x - frame.x),
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

export function getFrameBox(root: FigmaNode): FrameBox {
  const box = root.absoluteBoundingBox ?? { x: 0, y: 0, width: 1, height: 1 };
  return {
    x: box.x,
    y: box.y,
    width: Math.round(box.width),
    height: Math.round(box.height),
  };
}

export function extractSections(root: FigmaNode): FigmaSection[] {
  const frame = getFrameBox(root);
  const children = (root.children ?? [])
    .filter((c) => c.absoluteBoundingBox && SECTION_TYPES.has(c.type))
    .filter((c) => (c.absoluteBoundingBox?.height ?? 0) >= MIN_SECTION_HEIGHT)
    .sort((a, b) => (a.absoluteBoundingBox!.y ?? 0) - (b.absoluteBoundingBox!.y ?? 0));

  return children.map((node, index) => {
    const box = node.absoluteBoundingBox!;
    const rect = toFrameRect(box, frame);
    const next = children[index + 1];
    const gapAfter = next
      ? Math.round(next.absoluteBoundingBox!.y - (box.y + box.height))
      : null;

    return {
      index,
      name: node.name,
      rect,
      height: rect.height,
      width: rect.width,
      gapAfter,
    };
  });
}

export function extractImages(root: FigmaNode): FigmaImage[] {
  const frame = getFrameBox(root);
  const images: FigmaImage[] = [];

  function walk(node: FigmaNode) {
    const box = node.absoluteBoundingBox;
    const hasImageFill = node.fills?.some((f) => f.type === "IMAGE");
    const isImageLike =
      hasImageFill || /image|photo|hero|banner|thumb/i.test(node.name);

    if (box && isImageLike && box.width >= MIN_IMAGE_SIZE && box.height >= MIN_IMAGE_SIZE) {
      const rect = toFrameRect(box, frame);
      images.push({
        index: images.length,
        name: node.name,
        rect,
        width: rect.width,
        height: rect.height,
      });
    }

    for (const child of node.children ?? []) {
      walk(child);
    }
  }

  walk(root);
  return images.slice(0, 30);
}

export function extractTextStyles(root: FigmaNode): FigmaText[] {
  const frame = getFrameBox(root);
  const texts: FigmaText[] = [];

  function walk(node: FigmaNode) {
    if (node.characters && node.style?.fontSize && node.absoluteBoundingBox) {
      texts.push({
        name: node.name,
        text: node.characters.trim().slice(0, 80),
        fontSize: node.style.fontSize,
        fontWeight: node.style.fontWeight ?? 400,
        fontFamily: node.style.fontFamily ?? "unknown",
        lineHeight: node.style.lineHeightPx ?? node.style.fontSize * 1.2,
        rect: toFrameRect(node.absoluteBoundingBox, frame),
      });
    }
    for (const child of node.children ?? []) walk(child);
  }

  walk(root);
  return texts;
}

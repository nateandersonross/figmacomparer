const FIGMA_API = "https://api.figma.com/v1";

export type FigmaNode = {
  id: string;
  name: string;
  type: string;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  layoutMode?: string;
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  cornerRadius?: number;
  fills?: Array<{ type: string; color?: { r: number; g: number; b: number; a: number } }>;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: number;
    lineHeightPx?: number;
    letterSpacing?: number;
  };
  characters?: string;
  children?: FigmaNode[];
};

export type FigmaFileResponse = {
  name: string;
  document: FigmaNode;
};

export type DesignToken = {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  bounds?: { width: number; height: number };
  typography?: {
    fontFamily: string;
    fontSize: number;
    fontWeight: number;
    lineHeight: number;
    letterSpacing?: number;
  };
  spacing?: {
    padding?: { top: number; right: number; bottom: number; left: number };
    gap?: number;
    cornerRadius?: number;
  };
  color?: string;
  text?: string;
};

function figmaColorToHex(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = color.a ?? 1;
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export class FigmaClient {
  constructor(private token: string) {}

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${FIGMA_API}${path}`, {
      headers: { "X-Figma-Token": this.token },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Figma API ${res.status}: ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async getFile(fileKey: string, nodeIds?: string[]): Promise<FigmaFileResponse> {
    const ids = nodeIds?.length ? `?ids=${nodeIds.join(",")}` : "";
    return this.request<FigmaFileResponse>(`/files/${fileKey}${ids}`);
  }

  async getFrame(fileKey: string, frameId: string): Promise<FigmaNode | null> {
    const file = await this.getFile(fileKey, [frameId]);
    return findNodeById(file.document, frameId);
  }

  async exportFramePng(fileKey: string, frameId: string, width: number): Promise<Buffer> {
    const scale = await this.resolveScale(fileKey, frameId, width);
    const data = await this.request<{ images: Record<string, string | null>; err: string | null }>(
      `/images/${fileKey}?ids=${frameId}&format=png&scale=${scale}`
    );
    if (data.err) throw new Error(data.err);
    const url = data.images[frameId];
    if (!url) throw new Error(`No image URL for frame ${frameId}`);
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error(`Failed to download Figma image: ${imgRes.status}`);
    return Buffer.from(await imgRes.arrayBuffer());
  }

  extractTokens(node: FigmaNode): DesignToken[] {
    const tokens: DesignToken[] = [];
    walk(node, tokens);
    return tokens;
  }

  private async resolveScale(fileKey: string, frameId: string, targetWidth: number): Promise<number> {
    const frame = await this.getFrame(fileKey, frameId);
    const frameWidth = frame?.absoluteBoundingBox?.width ?? targetWidth;
    const scale = targetWidth / frameWidth;
    return Math.min(4, Math.max(0.25, Math.round(scale * 100) / 100));
  }
}

function findNodeById(node: FigmaNode, id: string): FigmaNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNodeById(child, id);
    if (found) return found;
  }
  return null;
}

function walk(node: FigmaNode, out: DesignToken[]): void {
  const token: DesignToken = {
    nodeId: node.id,
    nodeName: node.name,
    nodeType: node.type,
  };

  if (node.absoluteBoundingBox) {
    token.bounds = {
      width: Math.round(node.absoluteBoundingBox.width),
      height: Math.round(node.absoluteBoundingBox.height),
    };
  }

  if (node.style?.fontSize) {
    token.typography = {
      fontFamily: node.style.fontFamily ?? "unknown",
      fontSize: node.style.fontSize,
      fontWeight: node.style.fontWeight ?? 400,
      lineHeight: node.style.lineHeightPx ?? node.style.fontSize * 1.2,
      letterSpacing: node.style.letterSpacing,
    };
  }

  const hasPadding =
    node.paddingTop != null ||
    node.paddingRight != null ||
    node.paddingBottom != null ||
    node.paddingLeft != null;

  if (hasPadding || node.itemSpacing != null || node.cornerRadius != null) {
    token.spacing = {
      padding: hasPadding
        ? {
            top: node.paddingTop ?? 0,
            right: node.paddingRight ?? 0,
            bottom: node.paddingBottom ?? 0,
            left: node.paddingLeft ?? 0,
          }
        : undefined,
      gap: node.itemSpacing,
      cornerRadius: node.cornerRadius,
    };
  }

  const solidFill = node.fills?.find((f) => f.type === "SOLID" && f.color);
  if (solidFill?.color) {
    token.color = figmaColorToHex(solidFill.color);
  }

  if (node.characters) {
    token.text = node.characters.slice(0, 80);
  }

  if (token.typography || token.spacing || token.bounds) {
    out.push(token);
  }

  for (const child of node.children ?? []) {
    walk(child, out);
  }
}

export function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/(?:file|design)\/([a-zA-Z0-9]+)/);
    if (!match) return null;
    const fileKey = match[1];
    const nodeParam = u.searchParams.get("node-id");
    const nodeId = nodeParam?.replace(/-/g, ":");
    return { fileKey, nodeId };
  } catch {
    return null;
  }
}

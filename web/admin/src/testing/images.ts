// A fake canvas for the picture tests: no real decoding or drawing. It records what was drawn where, and makes a
// "PNG" whose bytes say so, so a test can tell an upload's PNG from a drawing's. Example data only.
import type { Box, Canvas, Drawable, ImageTools } from "../pictures/normalise";

export type Drawn = { readonly what: string; readonly box: Box; readonly canvas?: Canvas };

export class FakeImages {
  readonly drawn: Drawn[] = [];
  readonly decodedSvgs: string[] = [];
  readonly urls = new Map<string, Blob>();
  readonly released: string[] = [];
  /** Pixel size the next decoded file reports. */
  size = { width: 512, height: 256 };
  /** Pixel size a decoded SVG reports (a drawing is its kind's size). */
  svgSize = { width: 256, height: 256 };
  /** When true, toBlob fails (null), as in a browser that taints the canvas. */
  failToBlob = false;
  /** When true, decoding throws (a corrupt file). */
  failDecode = false;
  /** The size of the PNG toPng makes. */
  pngBytes = 1000;
  private count = 0;

  readonly tools: ImageTools = {
    decodeFile: async (file: Blob): Promise<Drawable> => {
      if (this.failDecode) throw new Error("decode");
      const what = `file:${file.size}`;
      return { ...this.size, source: what as unknown as CanvasImageSource, close: () => undefined };
    },
    decodeSvg: async (svg: string): Promise<Drawable> => {
      if (this.failDecode) throw new Error("decode");
      this.decodedSvgs.push(svg);
      return { ...this.svgSize, source: "svg" as unknown as CanvasImageSource, close: () => undefined };
    },
    toPng: async (picture: Drawable, box: Box, canvas?: Canvas): Promise<Blob | null> => {
      this.drawn.push(canvas === undefined ? { what: String(picture.source), box } : { what: String(picture.source), box, canvas });
      if (this.failToBlob) return null;
      const label = `png:${String(picture.source)}:${this.drawn.length}`;
      const bytes = new Uint8Array(this.pngBytes);
      bytes.set(new TextEncoder().encode(label).subarray(0, this.pngBytes));
      return new Blob([bytes], { type: "image/png" });
    },
    preview: (png: Blob): string => {
      this.count += 1;
      const url = `blob:fake/${this.count}`;
      this.urls.set(url, png);
      return url;
    },
    release: (url: string): void => {
      this.released.push(url);
    },
  };
}

/** A File whose first bytes are `head` (PNG or JPEG magic, or anything else), padded to `size` bytes. */
export function fileWith(head: readonly number[], name: string, size = 64): File {
  const bytes = new Uint8Array(Math.max(size, head.length));
  bytes.set(head);
  return new File([bytes], name);
}

export const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
export const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];

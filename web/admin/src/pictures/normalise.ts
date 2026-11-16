// Turning a picture into what the library stores (Phases 42a and 42b): a 256x256 PNG with a transparent background,
// the picture contain-fitted (letterboxed) and centred. The browser does the decoding and drawing, so no image code
// runs in a Lambda; admin-api then checks the PNG strictly and writes it again from its pixels (api/shared/png_canon.py).
//
// Upload: the operator picks a PNG or JPEG of at most 5 MB (owner, 2026-11-16). The first bytes decide the type, not the
// file name or the browser's guess, so an SVG, GIF, WebP or HEIC is refused before it is decoded. Redrawing on a canvas
// drops everything but the pixels: EXIF and GPS, colour profiles, text chunks.
//
// Drawing: Claude's SVG (already sanitised twice on the server) is loaded as an <img> from a blob: URL and drawn on the
// same canvas. It is never put into the page itself, and an SVG shown through <img> cannot run scripts or load anything.
//
// The browser parts sit behind ImageTools, so the tests use a fake canvas. The numbers are contracts/limits.json's
// `picture` block, which admin-api reads too.
import { LIMITS } from "@scd/shared";

/** The side of every library picture, in pixels. */
export const PICTURE_SIZE = LIMITS.picture.side;
/** The largest original file the operator may upload (owner, 2026-11-16: "up to 5 MB"). */
export const UPLOAD_MAX_BYTES = LIMITS.picture.uploadMaxBytes;
/** Pictures wider or taller than this are refused before drawing (a guard against huge decodes). */
export const MAX_SIDE = LIMITS.picture.uploadMaxSide;
/** The largest PNG admin-api accepts (R34; the base64 body limit is bodyMaxBytes.adminPicture). */
export const PNG_MAX_BYTES = LIMITS.picture.maxBytes;
/** The largest SVG the drawing job returns (the sanitiser's limit). */
export const SVG_MAX_BYTES = 65_536;

export type PictureProblem =
  /** Not a PNG or JPEG by its first bytes (SVG, GIF, WebP, HEIC, anything else). */
  | "not_png_or_jpeg"
  /** The original file is over 5 MB. */
  | "file_too_big"
  /** Wider or taller than 4096 pixels. */
  | "too_many_pixels"
  /** The browser could not decode it. */
  | "unreadable"
  /** The 256x256 PNG is over 512 KiB. */
  | "too_detailed"
  /** The browser would not turn the canvas into a PNG (canvas.toBlob failed): use Chrome. */
  | "no_canvas";

export class PictureError extends Error {
  readonly problem: PictureProblem;
  constructor(problem: PictureProblem) {
    super(problem);
    this.problem = problem;
  }
}

/** What the operator reads for each problem. `drawing` picks the wording for a Claude drawing. */
export function pictureProblemMessage(problem: PictureProblem, drawing = false): string {
  switch (problem) {
    case "not_png_or_jpeg":
      return "Only PNG or JPEG pictures. SVG, GIF, WebP and HEIC files can't be added.";
    case "file_too_big":
      return "That file is over 5 MB. Choose a smaller picture.";
    case "too_many_pixels":
      return `That picture is more than ${MAX_SIDE} pixels wide or tall. Choose a smaller picture.`;
    case "unreadable":
      return drawing ? "Claude's drawing couldn't be shown. Press Try again." : "That picture couldn't be read. Try another file.";
    case "too_detailed":
      return "Picture too detailed: it can't be stored. Try a simpler picture.";
    case "no_canvas":
      return drawing ? "Use Chrome for drawing: this browser couldn't turn the drawing into a picture." : "Use Chrome to add pictures: this browser couldn't make the picture.";
  }
}

/** The file type from its first bytes: PNG `89 50 4E 47 0D 0A 1A 0A`, JPEG `FF D8 FF`; anything else is null. */
export function sniff(bytes: Uint8Array): "png" | "jpeg" | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= png.length && png.every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

/** The pixel size a PNG (IHDR) or JPEG (SOFn) header declares, read before decoding so a small file that would decode
 * to a huge picture is refused without decoding it. Null when the header can't be found (the decoder then decides). */
export function declaredSize(bytes: Uint8Array): { width: number; height: number } | null {
  const u16 = (i: number) => ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
  const u32 = (i: number) => u16(i) * 65536 + u16(i + 2);
  const kind = sniff(bytes);
  if (kind === "png") {
    const ihdr = String.fromCharCode(...bytes.subarray(12, 16));
    return ihdr === "IHDR" && bytes.length >= 24 ? { width: u32(16), height: u32(20) } : null;
  }
  if (kind !== "jpeg") return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1] ?? 0;
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isFrame) return i + 8 < bytes.length ? { width: u16(i + 7), height: u16(i + 5) } : null;
    if (marker === 0xd9 || marker === 0xda) return null; // end of image, or the scan began without a frame header
    i += 2 + u16(i + 2);
  }
  return null;
}

export type Box = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

/** Where a `width` x `height` picture goes on the square canvas: as large as fits, aspect kept, centred. */
export function fitBox(width: number, height: number, size = PICTURE_SIZE): Box {
  const scale = Math.min(size / width, size / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  return { x: Math.floor((size - w) / 2), y: Math.floor((size - h) / 2), width: w, height: h };
}

/** A decoded picture ready to draw. `close` frees it (an ImageBitmap, or a blob: URL). */
export type Drawable = { readonly width: number; readonly height: number; readonly source: CanvasImageSource; close(): void };

/** The browser parts: decoding, drawing on a canvas, and blob: URLs for previews. Tests pass a fake. */
export type ImageTools = {
  /** Decodes a PNG or JPEG file, turned upright by its EXIF orientation. */
  decodeFile(file: Blob): Promise<Drawable>;
  /** Loads an SVG through an <img> (never into the page). */
  decodeSvg(svg: string): Promise<Drawable>;
  /** Draws onto a transparent PICTURE_SIZE square canvas in `box` and returns the PNG, or null when toBlob fails. */
  toPng(picture: Drawable, box: Box): Promise<Blob | null>;
  /** A blob: URL to show a PNG in an <img> (CSP img-src allows blob:). */
  preview(png: Blob): string;
  release(url: string): void;
};

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image(PICTURE_SIZE, PICTURE_SIZE);
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new PictureError("unreadable")), { once: true });
  });
  image.src = url;
  await loaded;
  return image;
}

export const browserTools: ImageTools = {
  async decodeFile(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  },
  async decodeSvg(svg) {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const image = await loadImage(url);
      return { width: image.naturalWidth || PICTURE_SIZE, height: image.naturalHeight || PICTURE_SIZE, source: image, close: () => URL.revokeObjectURL(url) };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  },
  async toPng(picture, box) {
    const canvas = document.createElement("canvas");
    canvas.width = PICTURE_SIZE;
    canvas.height = PICTURE_SIZE;
    const context = canvas.getContext("2d");
    if (context === null) return null;
    context.clearRect(0, 0, PICTURE_SIZE, PICTURE_SIZE);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(picture.source, box.x, box.y, box.width, box.height);
    try {
      return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    } catch {
      return null; // a tainted canvas (some browsers taint after drawing an SVG) throws SecurityError
    }
  },
  preview: (png) => URL.createObjectURL(png),
  release: (url) => URL.revokeObjectURL(url),
};

async function draw(picture: Drawable, tools: ImageTools): Promise<Blob> {
  try {
    if (picture.width > MAX_SIDE || picture.height > MAX_SIDE) throw new PictureError("too_many_pixels");
    if (picture.width < 1 || picture.height < 1) throw new PictureError("unreadable");
    const png = await tools.toPng(picture, fitBox(picture.width, picture.height));
    if (png === null) throw new PictureError("no_canvas");
    if (png.size > PNG_MAX_BYTES) throw new PictureError("too_detailed");
    return png;
  } finally {
    picture.close();
  }
}

/** An uploaded file as a library PNG, or a PictureError saying why not. */
export async function normaliseUpload(file: Blob, tools: ImageTools = browserTools): Promise<Blob> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (sniff(head) === null) throw new PictureError("not_png_or_jpeg");
  if (file.size > UPLOAD_MAX_BYTES) throw new PictureError("file_too_big");
  const declared = declaredSize(new Uint8Array(await file.arrayBuffer()));
  if (declared !== null && (declared.width > MAX_SIDE || declared.height > MAX_SIDE)) throw new PictureError("too_many_pixels");
  let picture: Drawable;
  try {
    picture = await tools.decodeFile(file);
  } catch {
    throw new PictureError("unreadable");
  }
  return draw(picture, tools);
}

/** Claude's (sanitised) SVG as a library PNG, or a PictureError saying why not. */
export async function renderSvg(svg: string, tools: ImageTools = browserTools): Promise<Blob> {
  if (new TextEncoder().encode(svg).length > SVG_MAX_BYTES || !/^\s*<svg[\s>]/u.test(svg)) throw new PictureError("unreadable");
  let picture: Drawable;
  try {
    picture = await tools.decodeSvg(svg);
  } catch {
    throw new PictureError("unreadable");
  }
  return draw(picture, tools);
}

/** A blob's bytes as base64 (no data: prefix), for R34's `pngBase64`. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

/** R35's `pngBase64` back to a PNG blob, for a draft's preview. */
export function base64ToBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

/** The longest picture name admin-api accepts (1-40 characters, plain text). */
export const NAME_MAX = LIMITS.picture.nameMaxLength;

/** Plain text as admin-api's text_ok checks it: no surrounding spaces, no control characters, no < or >. */
export function nameOk(name: string): boolean {
  return name.length >= 1 && name.length <= NAME_MAX && name === name.trim() && ![...name].some(unsafe);
}

/** A control character, < or >: what text_ok refuses inside a name. */
function unsafe(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code < 32 || code === 127 || ch === "<" || ch === ">";
}

function cleanName(text: string): string {
  const cleaned = [...text]
    .map((ch) => (unsafe(ch) ? " " : ch))
    .join("")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, NAME_MAX)
    .trim();
  return cleaned === "" ? "Picture" : cleaned;
}

/** A starting name from the file name: "red_kite-2.jpg" -> "red kite 2". */
export function nameFromFile(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return cleanName((dot > 0 ? fileName.slice(0, dot) : fileName).replace(/[_-]+/gu, " "));
}

/** A starting name from the drawing's description: its first 40 characters, first letter capitalised. */
export function nameFromDescription(description: string): string {
  const name = cleanName(description);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

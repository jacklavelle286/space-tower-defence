// The upload normaliser and the SVG renderer, with a fake canvas: the first bytes decide the type (an SVG or GIF named
// .png is refused), the 5 MB and 4096 px limits, the letterbox, the 512 KiB PNG limit, and "Use Chrome" when toBlob
// fails. Plus the base64 round trip and the starting names.
import { LIMITS } from "@scd/shared";
import { describe, expect, it } from "vitest";
import { fileWith, FakeImages, JPEG_MAGIC, PNG_MAGIC } from "../testing/images";
import {
  base64ToBlob,
  declaredSize,
  blobToBase64,
  fitBox,
  nameFromDescription,
  nameFromFile,
  nameOk,
  normaliseUpload,
  PictureError,
  pictureProblemMessage,
  renderSvg,
  sniff,
  type PictureProblem,
} from "./normalise";

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));

async function problemOf(promise: Promise<unknown>): Promise<PictureProblem | "ok"> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof PictureError) return error.problem;
    throw error;
  }
}

describe("sniff", () => {
  it("knows PNG and JPEG by their first bytes and nothing else", () => {
    expect(sniff(new Uint8Array(PNG_MAGIC))).toBe("png");
    expect(sniff(new Uint8Array(JPEG_MAGIC))).toBe("jpeg");
    for (const other of ["<svg xmlns", "<?xml vers", "GIF89a", "RIFF0000WEBP", "%PDF-1.7", "<html>", "\u0000\u0000\u0000\u0018ftypheic"]) {
      expect(sniff(new Uint8Array(ascii(other)))).toBeNull();
    }
    expect(sniff(new Uint8Array([]))).toBeNull();
    expect(sniff(new Uint8Array([0x89, 0x50]))).toBeNull();
  });
});

describe("declaredSize", () => {
  const png = (w: number, h: number) => {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(bytes.buffer).setUint32(16, w);
    new DataView(bytes.buffer).setUint32(20, h);
    return bytes;
  };
  // SOI, an APP0 segment of 16 bytes, then SOF0 with height 300 and width 5000.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, ...new Array<number>(14).fill(0), 0xff, 0xc0, 0, 17, 8, 0x01, 0x2c, 0x13, 0x88, 3, 0, 0, 0]);

  it("reads a PNG's IHDR and a JPEG's frame header", () => {
    expect(declaredSize(png(640, 480))).toEqual({ width: 640, height: 480 });
    expect(declaredSize(jpeg)).toEqual({ width: 5000, height: 300 });
    expect(declaredSize(new Uint8Array(PNG_MAGIC))).toBeNull();
    expect(declaredSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeNull();
  });

  it("refuses a file that declares more than 4096 px, before decoding it", async () => {
    const images = new FakeImages();
    expect(await problemOf(normaliseUpload(new File([png(20_000, 20_000)], "bomb.png"), images.tools))).toBe("too_many_pixels");
    expect(await problemOf(normaliseUpload(new File([jpeg], "wide.jpg"), images.tools))).toBe("too_many_pixels");
    expect(images.drawn).toEqual([]);
    expect(await problemOf(normaliseUpload(new File([png(4096, 4096)], "ok.png"), images.tools))).toBe("ok");
  });
});

describe("fitBox", () => {
  it("letterboxes into the 256 square, centred, aspect kept", () => {
    expect(fitBox(512, 256)).toEqual({ x: 0, y: 64, width: 256, height: 128 });
    expect(fitBox(100, 400)).toEqual({ x: 96, y: 0, width: 64, height: 256 });
    expect(fitBox(256, 256)).toEqual({ x: 0, y: 0, width: 256, height: 256 });
    expect(fitBox(10, 10)).toEqual({ x: 0, y: 0, width: 256, height: 256 }); // small pictures are scaled up
    expect(fitBox(4096, 1).height).toBe(1);
  });
});

describe("normaliseUpload", () => {
  it("makes a 256x256 PNG from a PNG or a JPEG", async () => {
    for (const head of [PNG_MAGIC, JPEG_MAGIC]) {
      const images = new FakeImages();
      const png = await normaliseUpload(fileWith(head, "cat.jpg"), images.tools);
      expect(png.type).toBe("image/png");
      expect(images.drawn).toHaveLength(1);
      expect(images.drawn[0]?.box).toEqual({ x: 0, y: 64, width: 256, height: 128 });
    }
  });

  it("refuses SVG, GIF and anything else by its bytes, whatever the name, before decoding", async () => {
    const images = new FakeImages();
    expect(await problemOf(normaliseUpload(fileWith(ascii('<svg xmlns="http://www.w3.org/2000/svg">'), "kite.png"), images.tools))).toBe("not_png_or_jpeg");
    expect(await problemOf(normaliseUpload(fileWith(ascii("GIF89a"), "kite.png"), images.tools))).toBe("not_png_or_jpeg");
    expect(await problemOf(normaliseUpload(new File([], "empty.png"), images.tools))).toBe("not_png_or_jpeg");
    expect(images.drawn).toEqual([]);
    expect(pictureProblemMessage("not_png_or_jpeg")).toMatch(/^Only PNG or JPEG pictures/u);
  });

  it("refuses an original over 5 MB, and one over 4096 px", async () => {
    const images = new FakeImages();
    expect(LIMITS.picture.uploadMaxBytes).toBe(5 * 1024 * 1024);
    expect(await problemOf(normaliseUpload(fileWith(PNG_MAGIC, "big.png", LIMITS.picture.uploadMaxBytes + 1), images.tools))).toBe("file_too_big");
    expect(await problemOf(normaliseUpload(fileWith(PNG_MAGIC, "ok.png", LIMITS.picture.uploadMaxBytes), images.tools))).toBe("ok");
    images.size = { width: 4097, height: 100 };
    expect(await problemOf(normaliseUpload(fileWith(PNG_MAGIC, "wide.png"), images.tools))).toBe("too_many_pixels");
  });

  it("says unreadable for a file the browser cannot decode", async () => {
    const images = new FakeImages();
    images.failDecode = true;
    expect(await problemOf(normaliseUpload(fileWith(JPEG_MAGIC, "broken.jpg"), images.tools))).toBe("unreadable");
  });

  it("refuses a PNG over 512 KiB as too detailed", async () => {
    const images = new FakeImages();
    images.pngBytes = LIMITS.picture.maxBytes + 1;
    expect(await problemOf(normaliseUpload(fileWith(PNG_MAGIC, "busy.png"), images.tools))).toBe("too_detailed");
  });

  it("says to use Chrome when toBlob fails", async () => {
    const images = new FakeImages();
    images.failToBlob = true;
    expect(await problemOf(normaliseUpload(fileWith(PNG_MAGIC, "cat.png"), images.tools))).toBe("no_canvas");
    expect(pictureProblemMessage("no_canvas")).toMatch(/Use Chrome/u);
    expect(pictureProblemMessage("no_canvas", true)).toMatch(/^Use Chrome for drawing/u);
  });
});

describe("renderSvg", () => {
  it("draws the SVG through the image tools (never the page) at 256x256", async () => {
    const images = new FakeImages();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><circle cx="1" cy="1" r="1"/></svg>';
    const png = await renderSvg(svg, images.tools);
    expect(png.type).toBe("image/png");
    expect(images.decodedSvgs).toEqual([svg]);
    expect(images.drawn[0]?.box).toEqual({ x: 0, y: 0, width: 256, height: 256 });
  });

  it("refuses something that is not an SVG, or over 64 KB, and says Use Chrome when toBlob fails", async () => {
    const images = new FakeImages();
    expect(await problemOf(renderSvg("<html></html>", images.tools))).toBe("unreadable");
    expect(await problemOf(renderSvg(`<svg>${" ".repeat(65_536)}</svg>`, images.tools))).toBe("unreadable");
    expect(images.decodedSvgs).toEqual([]);
    images.failToBlob = true;
    expect(await problemOf(renderSvg("<svg></svg>", images.tools))).toBe("no_canvas");
  });
});

describe("base64 and names", () => {
  it("round-trips bytes through base64", async () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 7) % 256);
    const base64 = await blobToBase64(new Blob([bytes]));
    expect(base64).toBe(Buffer.from(bytes).toString("base64"));
    expect(new Uint8Array(await base64ToBlob(base64).arrayBuffer())).toEqual(bytes);
  });

  it("starts the name from the file name or the description, as plain text of at most 40 characters", () => {
    expect(nameFromFile("red_kite-2.jpg")).toBe("red kite 2");
    expect(nameFromFile("<b>.png")).toBe("b");
    expect(nameFromFile(".png")).toBe(".png"); // a dot file keeps its whole name
    expect(nameFromFile(`${"a".repeat(60)}.png`)).toHaveLength(40);
    expect(nameFromDescription("a smiling orange fox")).toBe("A smiling orange fox");
    expect(nameFromDescription("   ")).toBe("Picture");
    for (const name of [nameFromFile("x\u0001y.png"), nameFromDescription(`${"word ".repeat(20)}`)]) expect(nameOk(name)).toBe(true);
    expect(nameOk(" cat")).toBe(false);
    expect(nameOk("a<b")).toBe(false);
    expect(nameOk("")).toBe(false);
  });
});

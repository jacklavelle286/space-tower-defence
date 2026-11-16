"""The picture canonicaliser: a strict PNG reader and a fresh PNG writer, standard library only (Gate P, Phase 42a).

Every picture an operator adds reaches admin-api as a PNG the browser drew on a canvas the size of the picture's kind
(256 x 256 for most kinds, 1920 x 1056 for a background; contracts/limits.json `picture.kinds`) (R34). Nothing from
that file is trusted or kept: the bytes are walked chunk by chunk, the pixels are inflated with a hard output limit and
unfiltered, and a new file is written from the pixels alone. So EXIF/GPS, ICC profiles, text chunks, animation frames
and anything appended after the image (a PNG+ZIP or PNG+HTML polyglot) never reach the store, and the same pixels
always give the same bytes and so the same picture ID.

What is accepted (anything else raises PngRefused):

  - the 8-byte PNG signature (else rule `not_png`)
  - chunks with a valid length, an ASCII-letter type and a correct CRC; IHDR first and exactly once; PLTE allowed and
    ignored; IDAT chunks consecutive; IEND last, empty, and nothing after it
  - no unknown critical chunk, and no APNG chunk (acTL, fcTL, fdAT); other ancillary chunks are skipped unread
  - IHDR: exactly the kind's width x height (256 x 256 unless the caller says otherwise), bit depth 8, colour type 6
    (RGBA) or 2 (RGB), compression 0, filter 0, interlace 0 (else rule `png_shape`)
  - the joined IDAT inflates to exactly height * (1 + width * bytes-per-pixel) bytes, the zlib stream ends there and
    no input is left over. The inflate is told to stop one byte past that size, so a zip bomb costs at most that much
    memory (the guard the design calls the bounded inflate; 8.1 MB for a 1920 x 1056 RGBA background)
  - every row's filter byte is 0-4 (None, Sub, Up, Average, Paeth)
  - at least one pixel is not fully transparent (else rule `blank`)

Everything that is not a PNG at all (bad signature, truncation, a bad CRC, a broken zlib stream...) is rule `not_png`:
the operator's answer is the same ("Only PNG or JPEG pictures"). `PngRefused.detail` says which check failed, for tests
only; it never carries input bytes and is never logged.

The output is: signature, IHDR (width, height, depth 8, colour type 6, 0, 0, 0), one IDAT (filter 0 on every row,
zlib level 9) and IEND. A 256 x 256 picture gives the same bytes, and so the same ID, as before kinds had sizes.

The unfilter is plain Python written to do as little per byte as it can (whole-row integer addition for Up, a running
sum per channel for Sub, per-channel loops with local variables for Average and Paeth). It gives exactly the bytes of
the textbook loop (`_unfilter_reference`, kept for the equivalence test) about 1.6 to 2.3 times faster. Measured on the
laptop for a whole call (Gate P2 background measurement, 2026-11-16): 256 x 256 about 0.04 s; a 1920 x 1056 drawn
backdrop 0.85 s and the worst of 43 photos 1.80 s before the faster unfilter, 1.36 s after. Lambda at 1769 MB (one
vCPU) is about 1.5 to 2 times slower than the laptop [ASSUMPTION; UNVERIFIED until the first background upload's
REPORT line].
"""

from __future__ import annotations

import binascii
import hashlib
import re
import struct
import zlib
from dataclasses import dataclass
from itertools import accumulate

SIGNATURE = b"\x89PNG\r\n\x1a\n"
SIDE = 256  # the default size: every kind but background is 256 x 256 (owner decision 2026-11-16: letterboxed)
MAX_INPUT_BYTES = 524_288  # the default decoded-upload limit (R34; a kind's `maxBytes` in contracts/limits.json)
COLOUR_RGB = 2
COLOUR_RGBA = 6
BYTES_PER_PIXEL = {COLOUR_RGB: 3, COLOUR_RGBA: 4}
ALLOWED_CRITICAL = frozenset({b"IHDR", b"PLTE", b"IDAT", b"IEND"})
REFUSED_ANCILLARY = frozenset({b"acTL", b"fcTL", b"fdAT"})  # APNG: a moving picture is never accepted
PICTURE_PREFIX = "lib-"
PICTURE_ID = re.compile(r"lib-[0-9a-f]{32}")
_CHUNK_TYPE = re.compile(rb"[A-Za-z]{4}")
_MAX_CHUNK = 2**31 - 1


class PngRefused(ValueError):
    """The upload is not a picture admin-api accepts. `rule` is the VALIDATION_FAILED rule (`not_png`, `png_shape`,
    `blank`); `detail` names the failed check (tests only)."""

    def __init__(self, rule: str, detail: str) -> None:
        super().__init__(rule)
        self.rule = rule
        self.detail = detail


@dataclass(frozen=True)
class CanonicalPng:
    png: bytes  # the freshly written file
    sha256: str  # hex SHA-256 of `png`
    picture_id: str  # "lib-" + the first 32 hex characters of `sha256`


def picture_id_for(png: bytes) -> str:
    return PICTURE_PREFIX + hashlib.sha256(png).hexdigest()[:32]


def canonicalise(
    data: bytes, *, width: int = SIDE, height: int = SIDE, max_input_bytes: int = MAX_INPUT_BYTES
) -> CanonicalPng:
    """Check `data` as described in the module docstring and return the canonical file, or raise PngRefused. `width`,
    `height` and `max_input_bytes` are the picture kind's (admin-api passes them from contracts/limits.json)."""
    if len(data) > max_input_bytes:
        raise PngRefused("not_png", "too_large")  # admin-api answers 413 before this; a second guard
    if not data.startswith(SIGNATURE):
        raise PngRefused("not_png", "signature")
    colour, idat = _walk(data, width, height)
    rgba = _pixels(colour, idat, width, height)
    if not any(rgba[3::4]):
        raise PngRefused("blank", "fully_transparent")
    png = encode_rgba(rgba, width, height)
    digest = hashlib.sha256(png).hexdigest()
    return CanonicalPng(png=png, sha256=digest, picture_id=PICTURE_PREFIX + digest[:32])


def _walk(data: bytes, width: int, height: int) -> tuple[int, bytes]:
    """The chunk walk: (colour type, the joined IDAT data)."""
    offset = len(SIGNATURE)
    colour: int | None = None
    idat: list[bytes] = []
    idat_done = False  # an IDAT run has ended: another IDAT now is refused
    seen_iend = False
    first = True
    while offset < len(data):
        if len(data) - offset < 12:
            raise PngRefused("not_png", "truncated")
        (length,) = struct.unpack(">I", data[offset : offset + 4])
        kind = data[offset + 4 : offset + 8]
        if length > _MAX_CHUNK or not _CHUNK_TYPE.fullmatch(kind):
            raise PngRefused("not_png", "chunk_header")
        end = offset + 8 + length
        if end + 4 > len(data):
            raise PngRefused("not_png", "truncated")
        body = data[offset + 8 : end]
        (crc,) = struct.unpack(">I", data[end : end + 4])
        if binascii.crc32(kind + body) & 0xFFFFFFFF != crc:
            raise PngRefused("not_png", "crc")
        offset = end + 4

        if first:
            if kind != b"IHDR":
                raise PngRefused("not_png", "ihdr_not_first")
            colour = _ihdr(body, width, height)
            first = False
            continue
        critical = kind[0:1].isupper()
        if kind == b"IHDR":
            raise PngRefused("not_png", "second_ihdr")
        if critical and kind not in ALLOWED_CRITICAL:
            raise PngRefused("not_png", "unknown_critical")
        if kind in REFUSED_ANCILLARY:
            raise PngRefused("not_png", "animated")
        if kind == b"IDAT":
            if idat_done:
                raise PngRefused("not_png", "idat_not_consecutive")
            idat.append(body)
            continue
        if idat:
            idat_done = True
        if kind == b"PLTE" and idat:
            raise PngRefused("not_png", "plte_after_idat")
        if kind == b"IEND":
            if length != 0:
                raise PngRefused("not_png", "iend_length")
            seen_iend = True
            break
    if colour is None:
        raise PngRefused("not_png", "no_ihdr")
    if not seen_iend:
        raise PngRefused("not_png", "no_iend")
    if offset != len(data):
        raise PngRefused("not_png", "data_after_iend")  # polyglots: PNG+ZIP, PNG+HTML
    if not idat:
        raise PngRefused("not_png", "no_idat")
    return colour, b"".join(idat)


def _ihdr(body: bytes, width: int, height: int) -> int:
    if len(body) != 13:
        raise PngRefused("not_png", "ihdr_length")
    got_width, got_height, depth, colour, compression, filtering, interlace = struct.unpack(">IIBBBBB", body)
    if (got_width, got_height) != (width, height):
        raise PngRefused("png_shape", "size")
    if depth != 8 or colour not in BYTES_PER_PIXEL:
        raise PngRefused("png_shape", "colour")
    if compression != 0 or filtering != 0 or interlace != 0:
        raise PngRefused("png_shape", "method")
    return colour


def _pixels(colour: int, idat: bytes, width: int, height: int) -> bytes:
    """Inflate (bounded) and unfilter; always RGBA, width * height * 4 bytes."""
    bpp = BYTES_PER_PIXEL[colour]
    stride = width * bpp
    expected = height * (1 + stride)
    inflater = zlib.decompressobj()
    try:
        raw = inflater.decompress(idat, expected + 1)  # never more than one byte past the real size
    except zlib.error:
        raise PngRefused("not_png", "zlib") from None
    if len(raw) != expected:
        raise PngRefused("not_png", "inflate_size")  # short, or longer than the image (a bomb)
    if not inflater.eof or inflater.unused_data or inflater.unconsumed_tail:
        raise PngRefused("not_png", "inflate_trailing")
    rows = _unfilter(raw, stride, bpp, height)
    if colour == COLOUR_RGBA:
        return rows
    out = bytearray(width * height * 4)
    out[0::4] = rows[0::3]
    out[1::4] = rows[1::3]
    out[2::4] = rows[2::3]
    out[3::4] = b"\xff" * (width * height)
    return bytes(out)


_BYTE = (255).__and__
_MASKS: dict[int, tuple[int, int]] = {}


def _add_rows(line: bytes, prior: bytes) -> bytes:
    """Byte-wise (line + prior) mod 256 for the Up filter, as one big-integer sum: the low 7 bits of every byte are
    added with the top bit masked off (so no carry crosses into the next byte), and the top bits are put back with
    XOR. Exactly what adding byte by byte gives."""
    size = len(line)
    masks = _MASKS.get(size)
    if masks is None:
        masks = _MASKS[size] = (int.from_bytes(b"\x80" * size, "big"), int.from_bytes(b"\x7f" * size, "big"))
    high, low = masks
    a = int.from_bytes(line, "big")
    b = int.from_bytes(prior, "big")
    return (((a & low) + (b & low)) ^ ((a ^ b) & high)).to_bytes(size, "big")


def _unfilter(raw: bytes, stride: int, bpp: int, height: int) -> bytes:
    """The five PNG filters undone, row by row. Each channel of a row is a separate sequence (a pixel's red byte only
    ever depends on red bytes), so Sub, Average and Paeth run along `line[ch::bpp]` with the running values in local
    variables instead of indexing back by `bpp`."""
    out = bytearray(height * stride)
    prior = bytes(stride)
    position = 0
    for row_index in range(height):
        kind = raw[position]
        line = raw[position + 1 : position + 1 + stride]
        position += 1 + stride
        if kind == 0:
            result = line
        elif kind == 2:  # Up
            result = _add_rows(line, prior)
        elif kind == 1:  # Sub: a running sum per channel
            buffer = bytearray(stride)
            for ch in range(bpp):
                buffer[ch::bpp] = bytes(map(_BYTE, accumulate(line[ch::bpp])))
            result = bytes(buffer)
        elif kind == 3:  # Average
            buffer = bytearray(stride)
            for ch in range(bpp):
                above = prior[ch::bpp]
                values = bytearray(len(above))
                left = 0
                for j, (x, up) in enumerate(zip(line[ch::bpp], above, strict=True)):
                    left = (x + ((left + up) >> 1)) & 0xFF
                    values[j] = left
                buffer[ch::bpp] = values
            result = bytes(buffer)
        elif kind == 4:  # Paeth
            buffer = bytearray(stride)
            for ch in range(bpp):
                above = prior[ch::bpp]
                values = bytearray(len(above))
                left = 0
                corner = 0
                for j, (x, up) in enumerate(zip(line[ch::bpp], above, strict=True)):
                    p = left + up - corner
                    pa = p - left if p > left else left - p
                    pb = p - up if p > up else up - p
                    pc = p - corner if p > corner else corner - p
                    if pa <= pb and pa <= pc:
                        left = (x + left) & 0xFF
                    elif pb <= pc:
                        left = (x + up) & 0xFF
                    else:
                        left = (x + corner) & 0xFF
                    values[j] = left
                    corner = up
                buffer[ch::bpp] = values
            result = bytes(buffer)
        else:
            raise PngRefused("not_png", "filter_type")
        out[row_index * stride : (row_index + 1) * stride] = result
        prior = result
    return bytes(out)


def _unfilter_reference(raw: bytes, stride: int, bpp: int, height: int) -> bytes:
    """The textbook loop (the code before Gate P2's faster unfilter). Tests only: `_unfilter` must give these bytes."""
    out = bytearray(height * stride)
    prior = bytearray(stride)
    position = 0
    for row_index in range(height):
        kind = raw[position]
        line = bytearray(raw[position + 1 : position + 1 + stride])
        position += 1 + stride
        if kind == 0:
            pass
        elif kind == 1:  # Sub
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 0xFF
        elif kind == 2:  # Up
            line = bytearray((a + b) & 0xFF for a, b in zip(line, prior, strict=True))
        elif kind == 3:  # Average
            for i in range(stride):
                left = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((left + prior[i]) >> 1)) & 0xFF
        elif kind == 4:  # Paeth
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prior[i]
                c = prior[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                if pa <= pb and pa <= pc:
                    predictor = a
                elif pb <= pc:
                    predictor = b
                else:
                    predictor = c
                line[i] = (line[i] + predictor) & 0xFF
        else:
            raise PngRefused("not_png", "filter_type")
        out[row_index * stride : (row_index + 1) * stride] = line
        prior = line
    return bytes(out)


def _chunk(kind: bytes, body: bytes) -> bytes:
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", binascii.crc32(kind + body) & 0xFFFFFFFF)


def encode_rgba(rgba: bytes, width: int = SIDE, height: int | None = None) -> bytes:
    """A fresh PNG of `rgba` (width x height x 4 bytes; height defaults to width): IHDR, one IDAT with filter 0 on
    every row, IEND."""
    height = width if height is None else height
    stride = width * 4
    if len(rgba) != height * stride:
        raise ValueError("pixel data is the wrong size")
    raw = b"".join(b"\x00" + rgba[row * stride : (row + 1) * stride] for row in range(height))
    ihdr = struct.pack(">IIBBBBB", width, height, 8, COLOUR_RGBA, 0, 0, 0)
    return SIGNATURE + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(raw, 9)) + _chunk(b"IEND", b"")

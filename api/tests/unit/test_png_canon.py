"""shared/png_canon.py: the strict PNG walk, the bounded inflate, the unfilter and the fresh encode (Gate P, 42a).

Every upload is rewritten from its pixels, so nothing but the picture survives: no metadata chunk, no animation, no
bytes after IEND. Anything that is not a 256 x 256 8-bit RGB or RGBA PNG is refused with a rule the admin page shows.
"""

from __future__ import annotations

import binascii
import struct
import time
import zlib

import pytest

from shared import png_canon
from shared.png_canon import (
    MAX_INPUT_BYTES,
    PICTURE_ID,
    SIGNATURE,
    CanonicalPng,
    PngRefused,
    canonicalise,
    encode_rgba,
    picture_id_for,
)

SIDE = 256


def chunk(kind: bytes, body: bytes, crc: int | None = None) -> bytes:
    value = binascii.crc32(kind + body) & 0xFFFFFFFF if crc is None else crc
    return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", value)


def ihdr(width: int = SIDE, height: int = SIDE, depth: int = 8, colour: int = 6, interlace: int = 0) -> bytes:
    return chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, depth, colour, 0, 0, interlace))


def picture_rgba() -> bytes:
    """A deterministic picture: a gradient with a transparent margin (what a letterboxed canvas looks like)."""
    out = bytearray()
    for y in range(SIDE):
        for x in range(SIDE):
            inside = 32 <= y < 224
            out += bytes((x, y, (x * y) & 0xFF, 255 if inside else 0))
    return bytes(out)


def filtered(pixels: bytes, bpp: int, filters: list[int]) -> bytes:
    """`pixels` filtered row by row with the PNG filter types in `filters` (cycled)."""
    stride = SIDE * bpp
    out = bytearray()
    prior = bytes(stride)
    for row_index in range(SIDE):
        row = pixels[row_index * stride : (row_index + 1) * stride]
        kind = filters[row_index % len(filters)]
        line = bytearray(stride)
        for i in range(stride):
            a = row[i - bpp] if i >= bpp else 0
            b = prior[i]
            c = prior[i - bpp] if i >= bpp else 0
            if kind == 0:
                predictor = 0
            elif kind == 1:
                predictor = a
            elif kind == 2:
                predictor = b
            elif kind == 3:
                predictor = (a + b) >> 1
            else:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                predictor = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
            line[i] = (row[i] - predictor) & 0xFF
        out += bytes([kind]) + line
        prior = row
    return bytes(out)


def png(
    pixels: bytes | None = None,
    *,
    colour: int = 6,
    filters: list[int] | None = None,
    before: list[bytes] | None = None,
    after_idat: list[bytes] | None = None,
    raw: bytes | None = None,
    header: bytes | None = None,
    tail: bytes = b"",
) -> bytes:
    bpp = 4 if colour == 6 else 3
    if pixels is None:
        rgba = picture_rgba()
        pixels = rgba if colour == 6 else b"".join(rgba[i : i + 3] for i in range(0, len(rgba), 4))
    data = raw if raw is not None else zlib.compress(filtered(pixels, bpp, filters or [0]), 6)
    parts = [SIGNATURE, header if header is not None else ihdr(colour=colour), *(before or [])]
    parts.append(chunk(b"IDAT", data))
    parts += after_idat or []
    parts.append(chunk(b"IEND", b""))
    return b"".join(parts) + tail


def rule(data: bytes) -> str:
    with pytest.raises(PngRefused) as refused:
        canonicalise(data)
    return refused.value.rule


def detail(data: bytes) -> str:
    with pytest.raises(PngRefused) as refused:
        canonicalise(data)
    return refused.value.detail


# --- What passes --------------------------------------------------------------------------------------------------


def test_a_canvas_rgba_png_is_rewritten_with_the_same_pixels() -> None:
    result = canonicalise(png())
    assert isinstance(result, CanonicalPng)
    assert result.png.startswith(SIGNATURE)
    assert PICTURE_ID.fullmatch(result.picture_id)
    assert result.picture_id == picture_id_for(result.png) == "lib-" + result.sha256[:32]
    assert len(result.picture_id) == 36  # fits a keyId (40)
    assert decode(result.png) == picture_rgba()


def test_an_rgb_png_becomes_rgba_with_full_alpha() -> None:
    rgba = picture_rgba()
    rgb = b"".join(rgba[i : i + 3] for i in range(0, len(rgba), 4))
    result = canonicalise(png(rgb, colour=2))
    pixels = decode(result.png)
    assert pixels[3::4] == b"\xff" * (SIDE * SIDE)
    assert pixels[0::4] == rgba[0::4]


def test_the_same_pixels_through_any_filter_give_the_same_bytes_and_id() -> None:
    ids = {canonicalise(png(filters=[kind])).png for kind in range(5)}
    ids.add(canonicalise(png(filters=[0, 1, 2, 3, 4])).png)
    ids.add(canonicalise(png(raw=zlib.compress(filtered(picture_rgba(), 4, [4, 3]), 1))).png)
    assert len(ids) == 1
    assert canonicalise(next(iter(ids))).png == next(iter(ids))  # canonical output is a fixed point


def test_metadata_chunks_are_dropped_and_the_output_holds_only_ihdr_idat_iend() -> None:
    metadata = [
        chunk(b"tEXt", b"Comment\x00secret"),
        chunk(b"iTXt", b"XML:com.adobe.xmp\x00\x00\x00\x00\x00<x/>"),
        chunk(b"zTXt", b"Title\x00\x00" + zlib.compress(b"hello")),
        chunk(b"eXIf", b"MM\x00*GPS 51.5 -0.1"),
        chunk(b"iCCP", b"icc\x00\x00" + zlib.compress(b"profile")),
        chunk(b"tIME", bytes(7)),
    ]
    result = canonicalise(png(before=metadata))
    assert chunk_types(result.png) == [b"IHDR", b"IDAT", b"IEND"]
    assert b"secret" not in result.png and b"GPS" not in result.png
    assert decode(result.png) == picture_rgba()
    assert result.png == canonicalise(png()).png


def test_split_idat_chunks_are_joined() -> None:
    data = zlib.compress(filtered(picture_rgba(), 4, [1]))
    third = len(data) // 3
    parts = [SIGNATURE, ihdr(), chunk(b"IDAT", data[:third]), chunk(b"IDAT", data[third : 2 * third])]
    parts += [chunk(b"IDAT", data[2 * third :]), chunk(b"IEND", b"")]
    assert decode(canonicalise(b"".join(parts)).png) == picture_rgba()


def test_a_worst_case_filter_mix_is_fast_enough() -> None:
    noisy = bytes((i * 7919 + (i >> 8) * 31) & 0xFF for i in range(SIDE * SIDE * 4))
    data = png(noisy, filters=[4, 3, 4, 3, 1, 2])
    started = time.monotonic()
    canonicalise(data)
    assert time.monotonic() - started < 3.0


# --- What is refused ----------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "data",
    [
        pytest.param(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00", id="jpeg"),
        pytest.param(b"GIF89a\x01\x00\x01\x00", id="gif"),
        pytest.param(b"RIFF\x00\x00\x00\x00WEBPVP8 ", id="webp"),
        pytest.param(b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', id="svg"),
        pytest.param(b"<!doctype html><html><body>hi</body></html>", id="html"),
        pytest.param(b"%PDF-1.7\n", id="pdf"),
        pytest.param(b"", id="empty"),
        pytest.param(b"\x89", id="one-byte"),
    ],
)
def test_anything_that_is_not_a_png_is_not_png(data: bytes) -> None:
    assert rule(data) == "not_png"


def test_a_bad_crc_is_refused() -> None:
    good = png()
    broken = bytearray(good)
    broken[len(SIGNATURE) + 8 + 13] ^= 0xFF  # IHDR's CRC
    assert detail(bytes(broken)) == "crc"
    assert detail(png(before=[chunk(b"tEXt", b"a\x00b", crc=0)])) == "crc"


def test_a_truncated_file_is_refused() -> None:
    good = png()
    for cut in (len(SIGNATURE) + 5, len(good) // 2, len(good) - 1):
        assert rule(good[:cut]) == "not_png"


def test_ihdr_must_come_first_and_only_once() -> None:
    assert detail(SIGNATURE + chunk(b"tEXt", b"a\x00b") + png()[len(SIGNATURE) :]) == "ihdr_not_first"
    assert detail(png(before=[ihdr()])) == "second_ihdr"


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        pytest.param(ihdr(width=255), "png_shape", id="255x256"),
        pytest.param(ihdr(width=512, height=512), "png_shape", id="512x512"),
        pytest.param(ihdr(depth=16), "png_shape", id="depth-16"),
        pytest.param(ihdr(colour=3), "png_shape", id="palette"),
        pytest.param(ihdr(colour=4), "png_shape", id="grey-alpha"),
        pytest.param(ihdr(colour=0), "png_shape", id="grey"),
        pytest.param(ihdr(interlace=1), "png_shape", id="interlaced"),
    ],
)
def test_the_wrong_shape_is_png_shape(header: bytes, expected: str) -> None:
    assert rule(png(header=header)) == expected


def test_an_unknown_critical_chunk_and_apng_are_refused() -> None:
    assert detail(png(before=[chunk(b"ABCD", b"x")])) == "unknown_critical"
    assert detail(png(before=[chunk(b"acTL", struct.pack(">II", 2, 0))])) == "animated"
    assert detail(png(after_idat=[chunk(b"fcTL", bytes(26))])) == "animated"


def test_unknown_ancillary_chunks_are_skipped() -> None:
    assert (
        canonicalise(png(before=[chunk(b"abCd", b"ignored"), chunk(b"pHYs", bytes(9))])).png == canonicalise(png()).png
    )


@pytest.mark.parametrize(
    "tail",
    [
        pytest.param(b"PK\x03\x04" + bytes(26) + b"payload.js", id="png+zip"),
        pytest.param(b"<html><script>alert(1)</script></html>", id="png+html"),
        pytest.param(b"\x00", id="one-byte"),
    ],
)
def test_bytes_after_iend_are_refused(tail: bytes) -> None:
    assert detail(png(tail=tail)) in {"data_after_iend", "truncated", "chunk_header"}
    assert rule(png(tail=tail)) == "not_png"


def test_idat_chunks_must_be_consecutive() -> None:
    data = zlib.compress(filtered(picture_rgba(), 4, [0]))
    half = len(data) // 2
    parts = [SIGNATURE, ihdr(), chunk(b"IDAT", data[:half]), chunk(b"tEXt", b"a\x00b"), chunk(b"IDAT", data[half:])]
    parts.append(chunk(b"IEND", b""))
    assert detail(b"".join(parts)) == "idat_not_consecutive"


@pytest.mark.parametrize("extra", [1, 1024, 1024 * 1024, 64 * 1024 * 1024])
def test_an_idat_that_inflates_past_the_image_is_refused(extra: int) -> None:
    """A zip bomb: the stream would give far more than 256 x 256 pixels. The inflate stops one byte past the real size,
    so even a stream for 64 MiB costs at most that one byte more memory."""
    bomb = zlib.compress(filtered(picture_rgba(), 4, [0]) + bytes(extra), 9)
    assert detail(png(raw=bomb)) in {"inflate_size", "inflate_trailing"}


def test_a_bomb_that_fills_the_upload_limit_is_refused_quickly() -> None:
    """256 MiB of zeros compresses to about 256 KB, inside the 512 KiB upload limit: refused without inflating it."""
    compressor = zlib.compressobj(9)
    zeros = bytes(1024 * 1024)
    bomb = b"".join(compressor.compress(zeros) for _ in range(256)) + compressor.flush()
    assert len(bomb) < MAX_INPUT_BYTES - 200
    started = time.monotonic()
    assert detail(png(raw=bomb)) in {"inflate_size", "inflate_trailing"}
    assert time.monotonic() - started < 3.0


def test_a_short_idat_and_trailing_zlib_data_are_refused() -> None:
    short = zlib.compress(filtered(picture_rgba(), 4, [0])[:-10])
    assert detail(png(raw=short)) == "inflate_size"
    trailing = zlib.compress(filtered(picture_rgba(), 4, [0])) + b"\x00\x01"
    assert detail(png(raw=trailing)) == "inflate_trailing"
    assert detail(png(raw=b"not zlib at all")) == "zlib"


def test_filter_byte_five_is_refused() -> None:
    raw = bytearray(filtered(picture_rgba(), 4, [0]))
    raw[0] = 5
    assert detail(png(raw=zlib.compress(bytes(raw)))) == "filter_type"


def test_a_fully_transparent_picture_is_blank() -> None:
    assert rule(png(bytes(SIDE * SIDE * 4))) == "blank"


def test_an_input_over_the_limit_is_refused() -> None:
    assert rule(png() + bytes(MAX_INPUT_BYTES)) == "not_png"


# --- Helpers that read the output back (an independent minimal decoder for filter 0 output) -----------------------


def chunk_types(data: bytes) -> list[bytes]:
    types = []
    offset = len(SIGNATURE)
    while offset < len(data):
        (length,) = struct.unpack(">I", data[offset : offset + 4])
        types.append(data[offset + 4 : offset + 8])
        offset += 12 + length
    return types


def decode(data: bytes) -> bytes:
    """The canonical file's pixels: one IDAT, filter 0 on every row (what encode_rgba writes)."""
    offset = len(SIGNATURE)
    idat = b""
    while offset < len(data):
        (length,) = struct.unpack(">I", data[offset : offset + 4])
        if data[offset + 4 : offset + 8] == b"IDAT":
            idat += data[offset + 8 : offset + 8 + length]
        offset += 12 + length
    raw = zlib.decompress(idat)
    stride = SIDE * 4
    rows = [raw[r * (stride + 1) : (r + 1) * (stride + 1)] for r in range(SIDE)]
    assert all(row[0] == 0 for row in rows)
    return b"".join(row[1:] for row in rows)


def test_encode_rgba_refuses_the_wrong_size() -> None:
    with pytest.raises(ValueError, match="wrong size"):
        encode_rgba(b"\x00" * 10)


# --- Gate P2: sizes per kind and the faster unfilter ------------------------------------------------------------------

BG_W, BG_H = 1920, 1056  # the background kind (contracts/limits.json)


def sized_png(width: int, height: int, filters: tuple[int, ...] = (0,)) -> bytes:
    """A width x height RGBA PNG: a cheap pattern (opaque), the rows filtered with `filters` (cycled)."""
    stride = width * 4
    row0 = bytes((x * 3) & 0xFF for x in range(stride))
    rows = []
    prior = bytes(stride)
    for y in range(height):
        row = row0[y % 7 :] + row0[: y % 7]
        row = bytes(b | 1 for b in row) if y % 2 else row
        kind = filters[y % len(filters)]
        line = bytes((r - p) & 0xFF for r, p in zip(row, prior, strict=True)) if kind == 2 else row
        rows.append(bytes([kind if kind == 2 else 0]) + line)
        prior = row
    header = chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    return SIGNATURE + header + chunk(b"IDAT", zlib.compress(b"".join(rows), 6)) + chunk(b"IEND", b"")


def test_a_256_picture_gives_the_same_bytes_and_id_as_before_kinds_had_sizes() -> None:
    """The output of the code committed before Gate P2 for this picture (any filter): ids of saved pictures hold."""
    for filters in ([0], [1], [2], [3], [4], [0, 1, 2, 3, 4]):
        result = canonicalise(png(filters=filters))
        assert result.sha256 == "acaf754c379dbe8d345c89a178bf131a089d0ddf6365a0f2a2d14d1f33c8a307", filters


@pytest.mark.parametrize("bpp", [3, 4])
def test_the_fast_unfilter_gives_the_textbook_loops_bytes_for_every_filter(bpp: int) -> None:
    noisy = bytes((i * 7919 + (i >> 8) * 31 + (i * i >> 5)) & 0xFF for i in range(SIDE * SIDE * bpp))
    for filters in ([0], [1], [2], [3], [4], [4, 3, 2, 1, 0], [1, 4, 4, 2, 3]):
        raw = filtered(noisy, bpp, filters)
        fast = png_canon._unfilter(raw, SIDE * bpp, bpp, SIDE)
        assert fast == png_canon._unfilter_reference(raw, SIDE * bpp, bpp, SIDE) == noisy, filters


def test_a_background_sized_png_is_accepted_at_its_kinds_size() -> None:
    data = sized_png(BG_W, BG_H, (0, 2))
    result = canonicalise(data, width=BG_W, height=BG_H, max_input_bytes=4_194_304)
    assert struct.unpack(">II", result.png[16:24]) == (BG_W, BG_H)
    assert PICTURE_ID.fullmatch(result.picture_id)


def test_a_background_sized_png_is_refused_at_the_256_size_and_a_256_png_at_the_background_size() -> None:
    assert rule(sized_png(BG_W, BG_H)) == "png_shape"  # the default (every 256 kind, an avatar too)
    with pytest.raises(PngRefused) as refused:
        canonicalise(png(), width=BG_W, height=BG_H, max_input_bytes=4_194_304)
    assert (refused.value.rule, refused.value.detail) == ("png_shape", "size")


def test_the_input_limit_is_the_callers() -> None:
    data = sized_png(BG_W, BG_H)
    with pytest.raises(PngRefused) as refused:
        canonicalise(data, width=BG_W, height=BG_H, max_input_bytes=len(data) - 1)
    assert refused.value.detail == "too_large"


def test_a_worst_case_background_is_fast_enough() -> None:
    """All-Paeth over noise at 1920 x 1056: 1.36 s for the worst photo measured on the laptop; generous here."""
    noisy = bytes((i * 7919 + (i >> 8) * 31) & 0xFF for i in range(BG_W * 4))
    stride = BG_W * 4
    raw = b"".join(b"\x04" + noisy[y % 11 :] + noisy[: y % 11] for y in range(BG_H))
    header = chunk(b"IHDR", struct.pack(">IIBBBBB", BG_W, BG_H, 8, 6, 0, 0, 0))
    data = SIGNATURE + header + chunk(b"IDAT", zlib.compress(raw, 1)) + chunk(b"IEND", b"")
    assert len(raw) == BG_H * (stride + 1)
    started = time.monotonic()
    canonicalise(data, width=BG_W, height=BG_H, max_input_bytes=len(data))
    assert time.monotonic() - started < 10.0


def test_encode_rgba_writes_a_non_square_picture() -> None:
    out = encode_rgba(b"\x01\x02\x03\xff" * (4 * 2), 4, 2)
    assert struct.unpack(">II", out[16:24]) == (4, 2)

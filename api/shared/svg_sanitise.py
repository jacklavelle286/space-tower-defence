"""The SVG sanitiser for drawings Claude makes (Gate P, Phase 42b). Standard library only, and fail closed.

picture-gen runs it on every SVG Claude returns before anything is stored, and admin-api runs it again when it reads a
job's result (R39), so a `result.json` planted in S3 is still checked. The SVG never reaches a child: the admin page
draws it into a canvas through an `<img>` (where scripts cannot run) and uploads the PNG through R34. This is the
second wall, not the only one.

The rule is an allow-list. Anything not named here refuses the whole drawing (SvgRefused): the operator sees
"Claude's drawing couldn't be used safely. Press Try again." Only comments, processing instructions inside the
parsed tree, `title`, `desc`, `metadata`, and the attributes `class`, `data-*` and `aria-*` are dropped silently.

Pre-parse (on the bytes): UTF-8 without a BOM, at most `max_bytes` (MAX_BYTES unless the kind says more); no `<!`
except a comment (so no DOCTYPE, ENTITY or CDATA, and so no XXE and no entity expansion); no `<?` except one leading
`<?xml version="1.0" encoding="UTF-8"?>`.

Parse: xml.etree.ElementTree with expat. A parse error is a refusal. The root must be `svg` in the SVG namespace.

Elements: svg (root only), g, defs, path, circle, ellipse, rect, line, polyline, polygon, clipPath and use, in the SVG
namespace. Everything else is refused: script, style, foreignObject, image, a, text/tspan/textPath, animate*/set,
filter/fe*, gradients, pattern, mask, marker, symbol, switch, a nested svg, and any other namespace.

Attributes: the presentation set below with strict value rules, geometry per element, `id`, `transform`,
`clip-path="url(#id)"` naming a clipPath, and `href` / `xlink:href` on `use` only, exactly `#id` naming an element that
is not its ancestor and holds no `use`. A clipPath holds plain shapes only: no `use` inside it and no `clip-path` on it
or inside it. So every reference ends after at most one `use` and one clipPath, and there are no chains, no cycles
(through `use` or `clip-path`) and no fan-out that grows with depth. The root's `width`, `height` and `xmlns` are
forced to the picture kind's canvas and the SVG namespace. For a 256 x 256 canvas (every kind but background) the
`viewBox` is forced to `0 0 256 256`, whatever it said, exactly as before kinds had sizes. For any other canvas (a
1920 x 1056 background, Gate P2) the `viewBox` must be present and be the canvas at scale 1 or 2 (`0 0 1920 1056`, or
`0 0 3840 2112` like the house backdrop art/svg/map/luna-backdrop.svg), else the drawing is refused (`viewbox`): a
wrong aspect would be stretched or cut. Every other attribute (any `on*`, `style`,
`xml:base`, ...) is refused. Text content other than whitespace is refused.

Limits: MAX_ELEMENTS elements, MAX_DEPTH deep, MAX_USES `use` elements.

Output: written by our own serialiser, attributes in sorted order, `xlink:href` written as `href`; sanitising the output
again gives the same bytes. Colours outside the art/STYLE.md palette give a warning, not a refusal.
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ET
from collections.abc import Iterable
from dataclasses import dataclass, field

SVG_NS = "http://www.w3.org/2000/svg"
XLINK_NS = "http://www.w3.org/1999/xlink"
MAX_BYTES = 65_536
MAX_ELEMENTS = 3_000
MAX_DEPTH = 24
MAX_USES = 32
MAX_COORD = 10_000.0
SIDE = "256"
DEFAULT_CANVAS = (256, 256)
VIEWBOX_SCALES = (1, 2)  # a non-square canvas's viewBox may be the canvas itself or twice it (the "3840 backdrops")
XML_DECLARATION = b'<?xml version="1.0" encoding="UTF-8"?>'
PALETTE_WARNING = "colours_outside_palette"
WARNINGS = frozenset({PALETTE_WARNING})  # every warning sanitise() can give (admin-api passes on only these)

ELEMENTS = frozenset(
    {"g", "defs", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon", "clipPath", "use"}
)
DROPPED_ELEMENTS = frozenset({"title", "desc", "metadata"})
PRESENTATION = frozenset(
    {
        "fill",
        "stroke",
        "opacity",
        "fill-opacity",
        "stroke-opacity",
        "stroke-width",
        "stroke-miterlimit",
        "stroke-dasharray",
        "stroke-linecap",
        "stroke-linejoin",
        "fill-rule",
        "clip-rule",
        "transform",
        "clip-path",
        "id",
    }
)
GEOMETRY: dict[str, frozenset[str]] = {
    "svg": frozenset(),
    "g": frozenset(),
    "defs": frozenset(),
    "clipPath": frozenset(),
    "path": frozenset({"d"}),
    "circle": frozenset({"cx", "cy", "r"}),
    "ellipse": frozenset({"cx", "cy", "rx", "ry"}),
    "rect": frozenset({"x", "y", "width", "height", "rx", "ry"}),
    "line": frozenset({"x1", "y1", "x2", "y2"}),
    "polyline": frozenset({"points"}),
    "polygon": frozenset({"points"}),
    "use": frozenset({"x", "y", "width", "height", "href"}),
}
ROOT_FORCED = {"viewBox": f"0 0 {SIDE} {SIDE}", "width": SIDE, "height": SIDE}  # the 256 x 256 canvas's root
ROOT_KEYS = frozenset(ROOT_FORCED)
ENUMS = {
    "stroke-linecap": frozenset({"butt", "round", "square"}),
    "stroke-linejoin": frozenset({"miter", "round", "bevel"}),
    "fill-rule": frozenset({"nonzero", "evenodd"}),
    "clip-rule": frozenset({"nonzero", "evenodd"}),
}
RANGES = {
    "opacity": (0.0, 1.0),
    "fill-opacity": (0.0, 1.0),
    "stroke-opacity": (0.0, 1.0),
    "stroke-width": (0.0, 64.0),
    "stroke-miterlimit": (1.0, 10.0),
}
NUMBER = r"[+-]?(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?"
_NUMBER = re.compile(NUMBER)
_ID = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,40}")
_COLOUR = re.compile(r"none|#[0-9A-Fa-f]{3}|#[0-9A-Fa-f]{6}")
_PATH = re.compile(r"[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\- \n]{1,8000}")
_LIST_SPLIT = re.compile(r"[ ,\n]+")
_CLIP_URL = re.compile(r"url\(#([A-Za-z][A-Za-z0-9_-]{0,40})\)")
_HREF = re.compile(r"#([A-Za-z][A-Za-z0-9_-]{0,40})")
_TRANSFORM_ITEM = re.compile(r"\s*(translate|scale|rotate|matrix|skewX|skewY)\s*\(([^()]*)\)\s*,?")
_TRANSFORM_ARGS = {"translate": (1, 2), "scale": (1, 2), "rotate": (1, 3), "matrix": (6,), "skewX": (1,), "skewY": (1,)}
_HEX = re.compile(r"#[0-9A-Fa-f]{6}")


class SvgRefused(ValueError):
    """The drawing is not used. `reason` names the failed check (logs and tests; never the SVG itself)."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@dataclass(frozen=True)
class SanitisedSvg:
    svg: str
    warnings: tuple[str, ...] = ()


@dataclass
class _Node:
    name: str
    attrs: dict[str, str]
    children: list[_Node] = field(default_factory=list)


def palette_from_style(style_text: str) -> frozenset[str]:
    """Every `#rrggbb` written in art/STYLE.md, upper-case: the palette the warning compares with."""
    return frozenset(match.upper() for match in _HEX.findall(style_text))


def sanitise(
    data: bytes | str,
    palette: Iterable[str] | None = None,
    *,
    canvas: tuple[int, int] = DEFAULT_CANVAS,
    max_bytes: int = MAX_BYTES,
) -> SanitisedSvg:
    """The sanitised SVG and its warnings, or SvgRefused. `canvas` (width, height) and `max_bytes` are the picture
    kind's (contracts/limits.json `picture.kinds`: width, height, svgMaxBytes)."""
    raw = data.encode("utf-8") if isinstance(data, str) else bytes(data)
    body = _pre_parse(raw, max_bytes)
    root = _parse(body)
    builder = _Builder(canvas)
    tree = builder.build_root(root)
    builder.check_references(tree)
    out = _serialise(tree, builder.root_attrs)
    known = frozenset(c.upper() for c in palette) if palette is not None else None
    warnings: list[str] = []
    if known is not None:
        off = sorted({c for c in builder.colours if _expand(c) not in known})
        if off:
            warnings.append(PALETTE_WARNING)
    return SanitisedSvg(svg=out, warnings=tuple(warnings))


def _expand(colour: str) -> str:
    colour = colour.upper()
    if len(colour) == 4:
        return "#" + "".join(ch * 2 for ch in colour[1:])
    return colour


def _pre_parse(raw: bytes, max_bytes: int = MAX_BYTES) -> bytes:
    if len(raw) > max_bytes:
        raise SvgRefused("too_large")
    if raw.startswith(b"\xef\xbb\xbf") or raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        raise SvgRefused("bom")
    try:
        raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError:
        raise SvgRefused("not_utf8") from None
    body = raw.lstrip(b" \t\r\n")
    if body.startswith(XML_DECLARATION):
        body = body[len(XML_DECLARATION) :]
    if b"<?" in body:
        raise SvgRefused("processing_instruction")
    position = body.find(b"<!")
    while position != -1:
        if body[position : position + 4] != b"<!--":
            raise SvgRefused("declaration")  # DOCTYPE, ENTITY, CDATA
        position = body.find(b"<!", position + 2)
    return body


def _parse(body: bytes) -> ET.Element:
    # S314: expat's XML attacks need a DTD (entity expansion, external entities); `_pre_parse` has already refused any
    # `<!` that is not a comment, so the parser never sees one. Comments and PIs are not kept by the TreeBuilder.
    parser = ET.XMLParser()  # noqa: S314
    try:
        parser.feed(body)
        return parser.close()
    except ET.ParseError:
        raise SvgRefused("parse") from None


def _blank(text: str | None) -> bool:
    return text is None or text.strip(" \t\r\n") == ""


def _local(tag: str) -> str | None:
    """The local name of an element in the SVG namespace; None for any other namespace (or none)."""
    prefix = "{" + SVG_NS + "}"
    return tag[len(prefix) :] if isinstance(tag, str) and tag.startswith(prefix) else None


def _number(value: str, low: float = -MAX_COORD, high: float = MAX_COORD) -> float:
    if not _NUMBER.fullmatch(value):
        raise SvgRefused("number")
    number = float(value)
    if not math.isfinite(number) or not low <= number <= high:
        raise SvgRefused("number_range")
    return number


def _numbers(value: str, maximum: int) -> list[float]:
    parts = [p for p in _LIST_SPLIT.split(value.strip(" \n")) if p]
    if not parts or len(parts) > maximum:
        raise SvgRefused("number_list")
    return [_number(p) for p in parts]


def _transform(value: str) -> None:
    position = 0
    stripped = value.strip()
    if not stripped:
        raise SvgRefused("transform")
    while position < len(stripped):
        match = _TRANSFORM_ITEM.match(stripped, position)
        if match is None or match.end() == position:
            raise SvgRefused("transform")
        name, args = match.group(1), match.group(2)
        numbers = [p for p in _LIST_SPLIT.split(args.strip(" \n")) if p]
        if len(numbers) not in _TRANSFORM_ARGS[name]:
            raise SvgRefused("transform_args")
        for number in numbers:
            _number(number)
        position = match.end()


def _root_attrs(canvas: tuple[int, int], viewbox: str | None) -> dict[str, str]:
    """The root's forced viewBox, width and height for `canvas`. 256 x 256: always `0 0 256 256` (whatever the file
    said, as before Gate P2). Any other canvas: the file's viewBox must be the canvas at one of VIEWBOX_SCALES."""
    width, height = canvas
    if canvas == DEFAULT_CANVAS:
        return dict(ROOT_FORCED)
    if viewbox is None:
        raise SvgRefused("viewbox")
    parts = [p for p in _LIST_SPLIT.split(viewbox.strip(" \n")) if p]
    if len(parts) != 4 or not all(_NUMBER.fullmatch(p) for p in parts):
        raise SvgRefused("viewbox")
    numbers = [float(p) for p in parts]
    for scale in VIEWBOX_SCALES:
        if numbers == [0.0, 0.0, float(width * scale), float(height * scale)]:
            return {"viewBox": f"0 0 {width * scale} {height * scale}", "width": str(width), "height": str(height)}
    raise SvgRefused("viewbox")  # another aspect or origin: it would be stretched, cut or shifted


class _Builder:
    def __init__(self, canvas: tuple[int, int] = DEFAULT_CANVAS) -> None:
        self.canvas = canvas
        self.viewbox: str | None = None  # the root's own viewBox, checked against the canvas in build_root
        self.root_attrs: dict[str, str] = dict(ROOT_FORCED)
        self.count = 0
        self.uses = 0
        self.ids: dict[str, _Node] = {}
        self.colours: set[str] = set()
        self.clip_paths: set[str] = set()
        # (use node, target id) and (node, clip id), checked once every id is known
        self.use_refs: list[tuple[_Node, str]] = []
        self.clip_refs: list[str] = []

    def build_root(self, root: ET.Element) -> _Node:
        if _local(root.tag) != "svg":
            raise SvgRefused("root")
        if not _blank(root.tail):
            raise SvgRefused("text")
        node = self._element(root, "svg", depth=1)
        self.root_attrs = _root_attrs(self.canvas, self.viewbox)
        node.attrs.update(self.root_attrs)
        return node

    def _element(self, element: ET.Element, name: str, depth: int) -> _Node:
        self.count += 1
        if self.count > MAX_ELEMENTS:
            raise SvgRefused("too_many_elements")
        if depth > MAX_DEPTH:
            raise SvgRefused("too_deep")
        if not _blank(element.text):
            raise SvgRefused("text")
        node = _Node(name=name, attrs=self._attributes(element, name))
        if name == "use":
            self.uses += 1
            if self.uses > MAX_USES:
                raise SvgRefused("too_many_uses")
        if name == "clipPath" and "id" in node.attrs:
            self.clip_paths.add(node.attrs["id"])
        for child in element:
            if not _blank(child.tail):
                raise SvgRefused("text")
            local = _local(child.tag)
            if local in DROPPED_ELEMENTS:
                continue  # title, desc, metadata: dropped with everything inside them
            if local is None or local not in ELEMENTS:
                raise SvgRefused("element")  # script, style, foreignObject, image, text, animate, a nested svg, ...
            node.children.append(self._element(child, local, depth + 1))
        return node

    def _attributes(self, element: ET.Element, name: str) -> dict[str, str]:
        out: dict[str, str] = {}
        for key, value in element.attrib.items():
            if key == "{" + XLINK_NS + "}href":
                key = "href"
            elif key.startswith("{"):
                raise SvgRefused("attribute_namespace")  # xml:base, xml:space, any other namespace
            if key == "class" or key.startswith(("data-", "aria-")):
                continue
            if name == "svg" and key in ROOT_KEYS:
                if key == "viewBox":
                    self.viewbox = value  # checked against the canvas (a 256 canvas ignores it)
                continue  # forced in build_root
            if key not in PRESENTATION and key not in GEOMETRY[name]:
                raise SvgRefused("attribute")  # on*, style, and everything else
            if key in out:
                raise SvgRefused("duplicate_attribute")  # href and xlink:href together
            out[key] = self._value(key, value, name)
        if name == "use" and "href" not in out:
            raise SvgRefused("use_without_href")
        return out

    def _value(self, key: str, value: str, name: str) -> str:
        if key == "id":
            if not _ID.fullmatch(value):
                raise SvgRefused("id")
            if value in self.ids:
                raise SvgRefused("duplicate_id")
            self.ids[value] = _Node(name="", attrs={})  # placeholder; replaced in check_references
        elif key in ("fill", "stroke"):
            if not _COLOUR.fullmatch(value):
                raise SvgRefused("colour")
            if value != "none":
                self.colours.add(value)
        elif key in RANGES:
            low, high = RANGES[key]
            _number(value, low, high)
        elif key in ENUMS:
            if value not in ENUMS[key]:
                raise SvgRefused("enum")
        elif key == "stroke-dasharray":
            if value != "none":
                for number in _numbers(value, 8):
                    if number < 0:
                        raise SvgRefused("number_range")
        elif key == "d":
            if not _PATH.fullmatch(value):
                raise SvgRefused("path")
        elif key == "points":
            if len(_numbers(value, 2000)) % 2:
                raise SvgRefused("points")
        elif key == "transform":
            _transform(value)
        elif key == "clip-path":
            match = _CLIP_URL.fullmatch(value)
            if match is None:
                raise SvgRefused("clip_path")
            self.clip_refs.append(match.group(1))
        elif key == "href":
            match = _HREF.fullmatch(value)
            if match is None or name != "use":
                raise SvgRefused("href")
        else:  # cx cy r rx ry x y x1 y1 x2 y2 width height
            _number(value)
        return value

    def check_references(self, root: _Node) -> None:
        by_id: dict[str, _Node] = {}
        ancestors: dict[int, tuple[_Node, ...]] = {}

        def visit(node: _Node, path: tuple[_Node, ...]) -> None:
            if "id" in node.attrs:
                by_id[node.attrs["id"]] = node
            ancestors[id(node)] = path
            for child in node.children:
                visit(child, (*path, node))

        visit(root, ())
        for clip in self.clip_refs:
            if clip not in self.clip_paths:
                raise SvgRefused("clip_path_target")
        # A clipPath is a leaf of the reference graph: a use or a clip-path in it could point back (a cycle) or fan
        # out (clipPath -> two uses -> a group clipped by the next clipPath, doubling at each level).
        for node in _walk(root):
            if node.name != "clipPath":
                continue
            for inner in _walk(node):
                if inner.name == "use":
                    raise SvgRefused("clip_path_use")
                if "clip-path" in inner.attrs:
                    raise SvgRefused("clip_path_nested")
        for node in _walk(root):
            if node.name != "use":
                continue
            target = by_id.get(node.attrs["href"][1:])
            if target is None:
                raise SvgRefused("href_target")
            if target is node or any(target is a for a in ancestors[id(node)]):
                raise SvgRefused("href_ancestor")
            if any(n.name == "use" for n in _walk(target)):
                raise SvgRefused("href_chain")  # no use of a use: no chains, so no cycles


def _walk(node: _Node) -> Iterable[_Node]:
    yield node
    for child in node.children:
        yield from _walk(child)


def _escape(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _serialise(root: _Node, root_attrs: dict[str, str]) -> str:
    parts: list[str] = []

    def write(node: _Node) -> None:
        attrs = dict(sorted(node.attrs.items()))
        if node.name == "svg":
            attrs = {"xmlns": SVG_NS, **root_attrs, **{k: v for k, v in attrs.items() if k not in ROOT_KEYS}}
        rendered = "".join(f' {key}="{_escape(value)}"' for key, value in attrs.items())
        if node.children:
            parts.append(f"<{node.name}{rendered}>")
            for child in node.children:
                write(child)
            parts.append(f"</{node.name}>")
        else:
            parts.append(f"<{node.name}{rendered}/>")

    write(root)
    return "".join(parts)

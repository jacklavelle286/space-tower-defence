"""shared/svg_sanitise.py: the fail-closed sanitiser for Claude's drawings (Gate P, Phase 42b).

Every attack here must be refused outright (SvgRefused), or, for the few things dropped silently, come out holding only
allow-listed names. The house-style regression runs all 72 activity pictures through it: the rules fit the art the
game already uses.
"""

from __future__ import annotations

import random
import xml.etree.ElementTree as ET

import pytest
from conftest import REPO

from shared.svg_sanitise import (
    ELEMENTS,
    GEOMETRY,
    MAX_BYTES,
    PRESENTATION,
    SVG_NS,
    SanitisedSvg,
    SvgRefused,
    palette_from_style,
    sanitise,
)

EM_SPACE = "\u2003"  # Unicode whitespace inside url( ... )
OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">'
XLINK_OPEN = (
    '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 256 256" '
    'width="256" height="256">'
)
ACTIVITY_SVGS = sorted((REPO / "art" / "svg" / "activity").glob("*.svg"))
PALETTE = palette_from_style((REPO / "art" / "STYLE.md").read_text(encoding="utf-8"))
ALLOWED_NAMES = ELEMENTS | {"svg"}
ALLOWED_ATTRIBUTES = PRESENTATION | {a for names in GEOMETRY.values() for a in names} | {"xmlns", "viewBox"}


def svg(inner: str, opening: str = OPEN) -> str:
    return f"{opening}{inner}</svg>"


def refused(data: str | bytes) -> str:
    with pytest.raises(SvgRefused) as error:
        sanitise(data)
    return error.value.reason


def only_allowed_names(output: str) -> None:
    root = ET.fromstring(output)  # noqa: S314 - our own output, parsed to inspect it
    for element in root.iter():
        assert element.tag.startswith("{" + SVG_NS + "}"), element.tag
        assert element.tag.split("}")[1] in ALLOWED_NAMES
        for name in element.attrib:
            assert name in ALLOWED_ATTRIBUTES, name


# --- A good drawing ---------------------------------------------------------------------------------------------


GOOD = svg(
    '<g id="cat" stroke="#2A1E3D" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" '
    'transform="translate(0 -4)">'
    '<clipPath id="body-clip"><path d="M10 10 L20 20 Z"/></clipPath>'
    '<g clip-path="url(#body-clip)"><circle cx="128" cy="128" r="40" fill="#A7B0C8"/></g>'
    '<ellipse cx="1" cy="2" rx="3" ry="4" fill="none" opacity="0.85"/>'
    '<rect x="1" y="2" width="3" height="4" rx="1" fill="#FFF"/>'
    '<line x1="0" y1="0" x2="1e2" y2="-1.5" stroke-dasharray="4 2"/>'
    '<polygon points="0,0 10,10 20,0" fill-rule="evenodd"/>'
    "</g>"
    '<defs><path id="spot" d="M0 0 h4 v4 z"/></defs><use href="#spot" x="10" y="10"/>'
)


def test_a_house_style_drawing_comes_through_unchanged_in_substance() -> None:
    result = sanitise(GOOD, PALETTE)
    assert isinstance(result, SanitisedSvg)
    assert result.svg.startswith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256"')
    only_allowed_names(result.svg)
    assert 'clip-path="url(#body-clip)"' in result.svg and '<use href="#spot"' in result.svg


def test_sanitising_twice_gives_identical_bytes() -> None:
    once = sanitise(GOOD).svg
    assert sanitise(once).svg == once


def test_comments_title_desc_metadata_class_data_and_aria_are_dropped() -> None:
    result = sanitise(
        svg(
            "<!-- made by a person --><title>Cat</title><desc>a cat</desc>"
            '<metadata><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"/></metadata>'
            '<g class="x" data-name="y" aria-label="z"><path d="M0 0"/></g>'
        )
    )
    assert result.svg == svg('<g><path d="M0 0"/></g>')


def test_the_root_viewbox_width_and_height_are_forced() -> None:
    result = sanitise('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9999 1" width="5000"><g/></svg>')
    assert result.svg == svg("<g/>")


def test_xlink_href_is_written_as_href_and_a_leading_xml_declaration_is_allowed() -> None:
    text = '<?xml version="1.0" encoding="UTF-8"?>\n' + svg(
        '<defs><circle id="a" r="1"/></defs><use xlink:href="#a"/>', XLINK_OPEN
    )
    assert sanitise(text).svg == svg('<defs><circle id="a" r="1"/></defs><use href="#a"/>')


def test_colours_outside_the_palette_warn_but_pass() -> None:
    assert sanitise(svg('<path d="M0 0" fill="#123456"/>'), PALETTE).warnings == ("colours_outside_palette",)
    assert sanitise(svg('<path d="M0 0" fill="#2a1e3d" stroke="#FFF"/>'), PALETTE).warnings == ()


# --- Attacks: every one refused -----------------------------------------------------------------------------------

ATTACKS = {
    # scripts in every spelling
    "script": svg("<script>alert(1)</script>"),
    "SCRIPT": svg("<SCRIPT>alert(1)</SCRIPT>"),
    "svg:script": '<svg:svg xmlns:svg="http://www.w3.org/2000/svg"><svg:script>alert(1)</svg:script></svg:svg>',
    "html:script": svg('<html:script xmlns:html="http://www.w3.org/1999/xhtml">alert(1)</html:script>'),
    "svg-ns-rebound-to-xhtml": '<svg xmlns="http://www.w3.org/1999/xhtml"><script>alert(1)</script></svg>',
    "cdata-script": svg("<script><![CDATA[alert(1)]]></script>"),
    # event handlers in any case
    "onload": svg('<g onload="alert(1)"/>'),
    "ONLOAD": svg('<g ONLOAD="alert(1)"/>'),
    "onLoad-root": '<svg xmlns="http://www.w3.org/2000/svg" onLoad="alert(1)"><g/></svg>',
    "onclick-path": svg('<path d="M0 0" onclick="alert(1)"/>'),
    # foreign content and images
    "foreignObject-iframe": svg(
        '<foreignObject><iframe xmlns="http://www.w3.org/1999/xhtml" src="https://evil"/></foreignObject>'
    ),
    "image-https": svg('<image href="https://evil/x.png"/>'),
    "image-data": svg('<image href="data:image/png;base64,AAAA"/>'),
    # external and scripted references
    "use-external": svg('<use href="https://evil/x.svg#a"/>'),
    "use-other-file": svg('<use href="other.svg#a"/>'),
    "use-xlink-data": svg('<use xlink:href="data:image/svg+xml,&lt;svg/&gt;"/>', XLINK_OPEN),
    "use-javascript": svg('<use href="javascript:alert(1)"/>'),
    "use-entity-javascript": svg('<use href="&#106;avascript:alert(1)"/>'),
    "a-javascript": svg('<a href="javascript:alert(1)"><path d="M0 0"/></a>'),
    "href-on-path": svg('<defs><path id="a" d="M0 0"/></defs><path d="M0 0" href="#a"/>'),
    # CSS
    "style-element-import": svg("<style>@import url(//evil/x.css);</style>"),
    "style-attribute-url": svg('<path d="M0 0" style="fill:url(https://evil#g)"/>'),
    "fill-url": svg('<path d="M0 0" fill="url(https://evil#g)"/>'),
    "fill-local-url": svg('<path d="M0 0" fill="url(#g)"/>'),
    "clip-path-data": svg('<path d="M0 0" clip-path="url(data:image/svg+xml,x)"/>'),
    "clip-path-unicode-space": svg(
        '<clipPath id="a"><path d="M0 0"/></clipPath><g clip-path="url(' + EM_SPACE + '#a)"/>'
    ),
    "clip-path-missing": svg('<g clip-path="url(#nowhere)"/>'),
    "clip-path-not-a-clippath": svg('<path id="p" d="M0 0"/><g clip-path="url(#p)"/>'),
    "named-colour": svg('<path d="M0 0" fill="red"/>'),
    "fill-expression": svg('<path d="M0 0" fill="#fff;background:url(x)"/>'),
    # animation
    "animate-href": svg('<a><animate attributeName="href" to="javascript:alert(1)"/></a>'),
    "animate": svg('<path d="M0 0"><animate attributeName="d" to="M1 1"/></path>'),
    "set": svg('<path d="M0 0"><set attributeName="fill" to="#000"/></path>'),
    "animateTransform": svg('<g><animateTransform attributeName="transform" type="rotate"/></g>'),
    # everything else the allow-list leaves out
    "filter-feImage": svg('<filter id="f"><feImage href="https://evil/x.png"/></filter>'),
    "mask": svg('<mask id="m"><path d="M0 0"/></mask>'),
    "pattern": svg('<pattern id="p"><path d="M0 0"/></pattern>'),
    "marker": svg('<marker id="m"><path d="M0 0"/></marker>'),
    "symbol": svg('<symbol id="s"><path d="M0 0"/></symbol>'),
    "switch": svg("<switch><g/></switch>"),
    "gradient": svg('<linearGradient id="g"><stop offset="0"/></linearGradient>'),
    "nested-svg": svg("<svg><path d='M0 0'/></svg>"),
    "nested-svg-in-g": svg('<g><svg xmlns="http://www.w3.org/2000/svg"/></g>'),
    "text": svg("<text>A</text>"),
    "tspan": svg("<g><tspan>1</tspan></g>"),
    "textPath": svg("<textPath>2</textPath>"),
    "bare-text": svg("<g>A</g>"),
    "tail-text": svg("<g/>B"),
    "other-namespace": svg('<x:thing xmlns:x="urn:x"/>'),
    # XML-level attacks
    "doctype-xxe": '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + svg("<g>&x;</g>"),
    "billion-laughs": '<!DOCTYPE svg [<!ENTITY a "lol"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;">]>' + svg("<g>&b;</g>"),
    "doctype-lowercase": "<!doctype svg>" + svg("<g/>"),
    "xml-stylesheet": '<?xml-stylesheet href="https://evil/x.css"?>' + svg("<g/>"),
    "pi-inside": svg("<?php echo 1 ?><g/>"),
    "utf16-declaration": '<?xml version="1.0" encoding="UTF-16"?>' + svg("<g/>"),
    "undefined-entity": svg("<g>&nbsp;</g>"),
    "comment-trick": svg("<!-- a --!> <script>alert(1)</script> -->"),
    "trailing-junk": svg("<g/>") + "<script>alert(1)</script>",
    "root-html": "<html><body><svg xmlns='http://www.w3.org/2000/svg'/></body></html>",
    "no-namespace": '<svg viewBox="0 0 256 256"><g/></svg>',
    "not-xml": "this is not a drawing",
    # attribute and value tricks
    "id-quote-injection": svg("<g id='a\" onload=\"x'/>"),
    "duplicate-ids": svg('<g id="a"/><g id="a"/>'),
    "href-missing-target": svg('<use href="#nowhere"/>'),
    "use-without-href": svg("<use/>"),
    "use-cycle": svg('<g id="a"><use href="#b"/></g><g id="b"><use href="#a"/></g>'),
    "use-self-ancestor": svg('<g id="a"><use href="#a"/></g>'),
    "use-chain": svg('<path id="p" d="M0 0"/><g id="q"><use href="#p"/></g><use href="#q"/>'),
    # reference cycles and fan-out through clip-path (a clipPath holds plain shapes only)
    "clip-path-self": svg('<clipPath id="c" clip-path="url(#c)"><path d="M0 0"/></clipPath>'),
    "clip-path-use-cycle": svg(
        '<clipPath id="c"><use href="#g"/></clipPath><g id="g" clip-path="url(#c)"><path d="M0 0"/></g>'
    ),
    "clip-path-nested-inside": svg(
        '<clipPath id="a"><path d="M0 0"/></clipPath><clipPath id="b"><path d="M0 0" clip-path="url(#a)"/></clipPath>'
    ),
    "clip-path-use-fan-out": svg(
        "".join(
            f'<clipPath id="c{i}"><use href="#g{i}"/><use href="#g{i}" x="1"/></clipPath>'
            f'<g id="g{i}" clip-path="url(#c{i + 1})"><path d="M0 0"/></g>'
            for i in range(15)
        )
        + '<clipPath id="c15"><path d="M0 0"/></clipPath>'
    ),
    "both-hrefs": svg('<defs><path id="p" d="M0 0"/></defs><use href="#p" xlink:href="#p"/>', XLINK_OPEN),
    "transform-expression": svg('<g transform="translate(expression(alert(1)))"/>'),
    "transform-unknown": svg('<g transform="perspective(1)"/>'),
    "transform-arguments": svg('<g transform="matrix(1 2 3)"/>'),
    "d-injection": svg('<path d="M0 0 &quot; onload=&quot;alert(1)"/>'),
    "d-url": svg('<path d="url(x)"/>'),
    "points-injection": svg('<polygon points="0,0 javascript:1"/>'),
    "points-odd": svg('<polygon points="0,0 1"/>'),
    "huge-number": svg('<circle r="1e999"/>'),
    "nan": svg('<circle r="NaN"/>'),
    "over-range": svg('<circle cx="10001"/>'),
    "opacity-over-one": svg('<path d="M0 0" opacity="2"/>'),
    "stroke-width-over": svg('<path d="M0 0" stroke-width="65"/>'),
    "bad-linecap": svg('<path d="M0 0" stroke-linecap="url(x)"/>'),
    "dasharray-too-long": svg('<path d="M0 0" stroke-dasharray="1 1 1 1 1 1 1 1 1"/>'),
    "geometry-on-wrong-element": svg('<g cx="1"/>'),
    "xml-base": svg('<g xml:base="https://evil/"/>'),
    "xml-space": svg('<g xml:space="preserve"/>'),
    "style-attribute": svg('<g style="fill:#000"/>'),
    "version-attribute": '<svg xmlns="http://www.w3.org/2000/svg" version="1.1"><g/></svg>',
    "33-uses": svg('<defs><path id="p" d="M0 0"/></defs>' + '<use href="#p"/>' * 33),
}


@pytest.mark.parametrize("name", sorted(ATTACKS))
def test_every_attack_is_refused(name: str) -> None:
    refused(ATTACKS[name])


@pytest.mark.parametrize(
    ("name", "reason"),
    [
        ("clip-path-self", "clip_path_nested"),
        ("clip-path-use-cycle", "clip_path_use"),
        ("clip-path-nested-inside", "clip_path_nested"),
        ("clip-path-use-fan-out", "clip_path_use"),
    ],
)
def test_clip_path_cycles_and_fan_out_are_refused_by_the_reference_check(name: str, reason: str) -> None:
    with pytest.raises(SvgRefused) as caught:
        sanitise(ATTACKS[name])
    assert caught.value.reason == reason


def test_a_bom_and_non_utf8_are_refused() -> None:
    assert refused(b"\xef\xbb\xbf" + svg("<g/>").encode()) == "bom"
    assert refused(b"\xff\xfe" + svg("<g/>").encode("utf-16-le")) == "bom"
    assert refused(svg("<g/>").encode("utf-16")) == "bom"
    assert refused(svg("<g id='\xe9'/>").encode("latin-1")) == "not_utf8"


def test_size_depth_and_element_limits() -> None:
    assert refused(svg("<g/>" * 20_000)) == "too_large"  # 80 KB of input
    assert len(svg("<g/>" * 20_000).encode()) > MAX_BYTES
    assert refused(svg("<g>" * 1000 + "</g>" * 1000)) == "too_deep"
    assert refused(svg("<g/>" * 3001)) == "too_many_elements"
    assert refused(svg('<defs><path id="p" d="M0 0"/></defs>' + '<use href="#p"/>' * 33)) == "too_many_uses"
    sanitise(svg('<defs><path id="p" d="M0 0"/></defs>' + '<use href="#p"/>' * 32))  # 32 is fine


def test_a_long_path_is_refused() -> None:
    assert refused(svg('<path d="' + "L1 1 " * 1700 + '"/>')) == "path"


# --- The house style passes ---------------------------------------------------------------------------------------


def test_there_are_72_activity_pictures() -> None:
    assert len(ACTIVITY_SVGS) == 72


@pytest.mark.parametrize("path", ACTIVITY_SVGS, ids=lambda p: p.stem)
def test_every_activity_picture_passes_losing_only_comments_and_class(path) -> None:  # type: ignore[no-untyped-def]
    source = path.read_text(encoding="utf-8")
    result = sanitise(source, PALETTE)
    only_allowed_names(result.svg)
    assert sanitise(result.svg, PALETTE).svg == result.svg
    # Every element survives, and only `class` attributes are lost (comments are not elements).
    before = ET.fromstring(source)  # noqa: S314 - a repository file
    after = ET.fromstring(result.svg)  # noqa: S314 - our own output
    assert [e.tag for e in before.iter()] == [e.tag for e in after.iter()]
    for old, new in zip(before.iter(), after.iter(), strict=True):
        lost = set(old.attrib) - set(new.attrib) - {"{http://www.w3.org/1999/xlink}href"}
        assert lost <= {"class"}, (path.name, lost)


# --- Property: random allow-listed trees round-trip and are fixed points --------------------------------------------


def _random_tree(rng: random.Random, depth: int, ids: list[str]) -> str:
    parts = []
    for _ in range(rng.randint(0, 3)):
        kind = rng.choice(["g", "path", "circle", "rect", "ellipse", "line", "polygon"])
        attrs = {"fill": rng.choice(["none", "#2A1E3D", "#fff", "#A7B0C8"])}
        if rng.random() < 0.3:
            attrs["id"] = f"n{len(ids)}"
            ids.append(attrs["id"])
        if rng.random() < 0.3:
            dx, dy, turn = rng.randint(-50, 50), rng.randint(-50, 50), rng.randint(0, 90)
            attrs["transform"] = f"translate({dx} {dy}) rotate({turn})"
        if kind == "path":
            attrs["d"] = f"M{rng.randint(0, 256)} {rng.randint(0, 256)} L{rng.randint(0, 256)} 3 Z"
        elif kind == "circle":
            attrs.update(cx=str(rng.randint(0, 256)), cy="10", r=str(rng.randint(1, 60)))
        elif kind == "rect":
            attrs.update(x="1", y="2", width=str(rng.randint(1, 100)), height="5")
        elif kind == "ellipse":
            attrs.update(cx="1", cy="2", rx="3", ry=f"{rng.random() * 9:.3f}")
        elif kind == "line":
            attrs.update(x1="0", y1="0", x2=str(rng.randint(0, 9)), y2="-4.5")
        elif kind == "polygon":
            attrs["points"] = "0,0 5,5 9,0"
        rendered = "".join(f' {k}="{v}"' for k, v in attrs.items())
        children = _random_tree(rng, depth + 1, ids) if kind == "g" and depth < 5 else ""
        parts.append(f"<{kind}{rendered}>{children}</{kind}>" if children else f"<{kind}{rendered}/>")
    return "".join(parts)


@pytest.mark.parametrize("seed", range(40))
def test_random_allow_listed_trees_round_trip(seed: int) -> None:
    rng = random.Random(seed)  # noqa: S311 - test data, not security
    text = svg(_random_tree(rng, 1, []))
    once = sanitise(text).svg
    only_allowed_names(once)
    assert sanitise(once).svg == once
    elements = len(list(ET.fromstring(text).iter()))  # noqa: S314 - built by this test
    assert len(list(ET.fromstring(once).iter())) == elements  # noqa: S314 - our own output


# --- Gate P2: the background kind's canvas (1920 x 1056) -------------------------------------------------------------

BG = (1920, 1056)
BG_MAX = 196_608  # contracts/limits.json background svgMaxBytes
BACKDROP = (REPO / "art" / "svg" / "map" / "luna-backdrop.svg").read_text(encoding="utf-8")


def bg_open(viewbox: str) -> str:
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="1" height="2">'


@pytest.mark.parametrize("viewbox", ["0 0 1920 1056", "0 0 3840 2112", "0,0,3840,2112", "0 0 1920.0 1056"])
def test_a_background_keeps_a_viewbox_of_its_aspect_and_gets_its_size(viewbox: str) -> None:
    result = sanitise(svg('<rect width="10" height="10"/>', bg_open(viewbox)), canvas=BG, max_bytes=BG_MAX)
    scale = 2 if "3840" in viewbox else 1
    assert result.svg.startswith(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {1920 * scale} {1056 * scale}" width="1920" '
        'height="1056">'
    )
    assert sanitise(result.svg, canvas=BG, max_bytes=BG_MAX).svg == result.svg  # stable


@pytest.mark.parametrize(
    "viewbox",
    ["0 0 256 256", "0 0 1920 1080", "0 0 3840 2160", "10 0 1920 1056", "0 0 960 528", "0 0 1920", "a b c d", None],
)
def test_a_background_with_another_aspect_or_no_viewbox_is_refused(viewbox: str | None) -> None:
    opening = bg_open(viewbox) if viewbox is not None else '<svg xmlns="http://www.w3.org/2000/svg">'
    with pytest.raises(SvgRefused, match="viewbox"):
        sanitise(svg("<g/>", opening), canvas=BG, max_bytes=BG_MAX)


def test_the_house_backdrop_passes_as_a_background_and_not_as_a_256_kind() -> None:
    assert MAX_BYTES < len(BACKDROP.encode()) <= BG_MAX
    result = sanitise(BACKDROP, PALETTE, canvas=BG, max_bytes=BG_MAX)  # its ground tints only warn (palette)
    assert result.svg.startswith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3840 2112" width="1920"')
    with pytest.raises(SvgRefused, match="too_large"):
        sanitise(BACKDROP)


def test_a_256_canvas_still_forces_its_viewbox_whatever_the_file_says() -> None:
    """Every 256 kind exactly as before Gate P2: a 3840 viewBox is overwritten, not refused."""
    result = sanitise(svg("<g/>", bg_open("0 0 3840 2112")))
    assert result.svg == sanitise(svg("<g/>")).svg
    assert result.svg.startswith(OPEN[:-1])


def test_the_background_size_limit_is_its_own() -> None:
    big = svg("<g/>" * 50_000, bg_open("0 0 1920 1056"))  # 200 KB
    with pytest.raises(SvgRefused, match="too_large"):
        sanitise(big, canvas=BG, max_bytes=BG_MAX)

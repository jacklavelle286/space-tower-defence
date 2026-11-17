"""Asset manifests in Python (Gate M, LD8): the shared contract fixtures (the player's parser reads the same file), the
roles kept equal to the TypeScript MAP_ART keys, the published m1 file, the pictures a manifest uses, and the reader
listing every published manifest."""

from __future__ import annotations

import json
import re
from typing import Any

import boto3
import pytest
from conftest import REPO

from shared.asset_manifest import ART_SET_ROLES, ManifestInvalid, manifest_pictures, parse_manifest
from shared.game_data import GameDataReader, GameDataUnavailable

CASES = json.loads((REPO / "contracts" / "fixtures" / "asset-manifest" / "cases.json").read_text())
LIB = "lib-0123456789abcdef0123456789abcdef"


@pytest.mark.parametrize("case", CASES["valid"], ids=lambda c: c["name"])
def test_accepts(case: dict[str, Any]) -> None:
    assert parse_manifest(case["manifest"])["version"] == "m9"


@pytest.mark.parametrize("case", CASES["invalid"], ids=lambda c: c["name"])
def test_refuses(case: dict[str, Any]) -> None:
    with pytest.raises(ManifestInvalid) as error:
        parse_manifest(case["manifest"])
    assert str(error.value).startswith(case["field"])


def test_the_roles_are_the_map_art_keys() -> None:
    source = (REPO / "web" / "shared" / "src" / "map" / "art.ts").read_text()
    block = source[source.index("export const MAP_ART = {") : source.index("} as const satisfies")]
    assert tuple(re.findall(r"^  (\w+): ", block, re.MULTILINE)) == ART_SET_ROLES


def test_the_published_m1_parses_and_uses_no_library_picture() -> None:
    m1 = parse_manifest(json.loads((REPO / "game-data" / "asset-manifest" / "m1.json").read_text()), "m1")
    assert manifest_pictures(m1) == set()


def test_the_pictures_a_manifest_draws_with() -> None:
    assert manifest_pictures(CASES["valid"][1]["manifest"]) == {LIB}


def test_the_reader_lists_every_published_manifest_and_fails_closed(ddb: Any) -> None:  # ddb: moto running
    client = boto3.client("s3", region_name="eu-west-2")
    client.create_bucket(Bucket="site", CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
    good = CASES["valid"][0]["manifest"]
    client.put_object(Bucket="site", Key="game-data/asset-manifest/m9.json", Body=json.dumps(good).encode())
    reader = GameDataReader(bucket="site", s3=client)
    assert [m["version"] for m in reader.asset_manifests()] == ["m9"]
    client.put_object(Bucket="site", Key="game-data/asset-manifest/m10.json", Body=b'{"kind": "asset-manifest"}')
    with pytest.raises(GameDataUnavailable):
        reader.asset_manifests()

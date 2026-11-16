"""Template generators (C25, spine S5.2; Phase 41, M3-06): pure, versioned functions from a template's domain to
concrete activity instances. Used by admin-api (validate, publish) and player-api (run creation). The browser never
runs a generator.

A template is an ordinary activity with `authoringMode: TEMPLATE` and, in place of prompt, payload and answer:

    template: {generatorKind, generatorVersion, domain, presentation?}

`generatorKind` and `generatorVersion` pick one Generator (REGISTRY). `domain` holds the kind's bounds (numbers.py,
objects.py list each kind's fields). `presentation` holds what the activity's interaction type needs to show every
instance (base.read_output: a NUMBER_SELECT number set and display, a TYPED maxLength; nothing for the others).

The domain is every parameter combination the generator enumerates, minus the ones its build removes (a result out of
range, too few distractors...). It is capped at DOMAIN_MAX = 5,000 instances (contracts/limits.json
`templateDomainMax`, spine S5.2, C25.3 rule 1): a larger domain is refused at validate and publish (rule
`domain_too_large`), never sampled, because the publish check must see every instance (C25.3 rule 2). The cap counts
instances, so a domain whose build removes combinations (a + b within 100 over two ranges of 0-100) may enumerate
more than 5,000 raw combinations. To keep publish cheap, enumeration itself stops at ENUMERATION_MAX = 50,000 raw
combinations, and a domain above that is also `domain_too_large` [ASSUMPTION, Phase 41 review].

`(kind, version)` never changes its output once released (C25.1): api/tests/unit/test_generators.py compares each one
with a snapshot file that is never edited. A change in behaviour is a new version: add a Generator with the next
version number (and its snapshot), keep the old one, so published templates keep producing exactly what was reviewed.

Kinds in C25.2 not implemented in version 1 (DEFERRED, refused with rule `not_supported_yet`): each needs something
the learning panel cannot show yet, or text the content rules refuse.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from itertools import islice
from typing import Any

from shared.generators import numbers, objects
from shared.generators.base import (
    Generator,
    Instance,
    Output,
    Params,
    Problem,
    as_int,
    canonical_params,
    problem,
    read_output,
)
from shared.rules.contracts import LIMITS

DOMAIN_MAX: int = LIMITS["templateDomainMax"]
ENUMERATION_MAX: int = 10 * DOMAIN_MAX  # raw combinations enumerated at most (a work bound, not the domain cap)
REGISTRY: dict[tuple[str, int], Generator] = {
    (g.kind, g.version): g for g in (*numbers.GENERATORS, *objects.GENERATORS)
}
KINDS: tuple[str, ...] = tuple(sorted({kind for kind, _ in REGISTRY}))
DEFERRED: dict[str, str] = {
    "PATTERN_NEXT": "needs a row of shape pictures as the question; the panel shows one question picture",
    "EQUAL_GROUPS": "needs groups or an array of pictured objects; the panel shows one question picture",
    "COMPARE_FILL": "needs < and > in the prompt or options, which the plain-text rule refuses as markup",
}
TEMPLATE_FIELDS = frozenset({"generatorKind", "generatorVersion", "domain", "presentation"})

__all__ = [
    "DEFERRED",
    "DOMAIN_MAX",
    "ENUMERATION_MAX",
    "KINDS",
    "REGISTRY",
    "Instance",
    "Prepared",
    "canonical_params",
    "domain_params",
    "instance_at",
    "instances",
    "prepare",
]


@dataclass(frozen=True)
class Prepared:
    """A template whose generator, domain and presentation all checked: ready to enumerate and build."""

    generator: Generator
    config: Any
    output: Output

    @property
    def kind(self) -> str:
        return self.generator.kind

    @property
    def version(self) -> int:
        return self.generator.version

    def build(self, params: Params) -> Instance | None:
        return self.generator.build(params, self.config, self.output)


def prepare(template: Any, interaction_type: Any) -> tuple[Prepared | None, list[Problem]]:
    """Check a definition's `template` against its interaction type: (Prepared, []) or (None, problems)."""
    if not isinstance(template, Mapping):
        return None, [problem("template", "type")]
    problems = [problem(f"template.{k}", "additionalProperties") for k in template if k not in TEMPLATE_FIELDS]
    problems += [
        problem(f"template.{k}", "required")
        for k in ("generatorKind", "generatorVersion", "domain")
        if k not in template
    ]
    if problems:
        return None, problems
    kind, version = template["generatorKind"], as_int(template["generatorVersion"])
    if kind in DEFERRED:
        return None, [problem("template.generatorKind", "not_supported_yet")]
    if kind not in KINDS:
        return None, [problem("template.generatorKind", "unknown_generator")]
    generator = REGISTRY.get((str(kind), version)) if version is not None else None
    if generator is None:
        return None, [problem("template.generatorVersion", "unknown_version")]
    if interaction_type not in generator.outputs:
        return None, [problem("interactionType", "generator_output")]
    config, problems = generator.prepare(template["domain"])
    output, output_problems = read_output(str(interaction_type), template.get("presentation"))
    problems = problems + output_problems
    if config is None or output is None or problems:
        return None, problems
    rule = generator.output_rule(config, output)
    if rule is not None:
        return None, [problem("interactionType", rule)]
    return Prepared(generator, config, output), []


def domain_params(prepared: Prepared) -> list[Params] | None:
    """Every raw parameter combination in enumeration order, or None when there are more than ENUMERATION_MAX.
    The DOMAIN_MAX cap is on instances (the combinations build keeps): `instances` and shared/content.py count them."""
    raw = list(islice(prepared.generator.params(prepared.config), ENUMERATION_MAX + 1))
    return None if len(raw) > ENUMERATION_MAX else raw


def instance_at(prepared: Prepared, raw: list[Params], index: int) -> Instance | None:
    """The instance for raw combination `index` (None when the generator removes it from the domain)."""
    return prepared.build(raw[index])


def instances(prepared: Prepared, raw: list[Params]) -> list[Instance]:
    """Every instance in the domain, in enumeration order."""
    return [inst for inst in (prepared.build(params) for params in raw) if inst is not None]

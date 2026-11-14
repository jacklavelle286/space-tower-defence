#!/usr/bin/env python3
"""Assembles the design report from design.tmpl and tables.json (run tables.py first).

Placeholders: {{T:name}} -> a generated Markdown table; {{F:key}} or {{F:key.sub}} -> a scalar fact computed from the data.
Fails loudly if a placeholder is unknown, so the report cannot silently drift from the data.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "research", "10-game-design.md")


def main():
    tj = json.load(open(os.path.join(HERE, "tables.json")))
    tables, facts = tj["tables"], tj["facts"]
    text = open(os.path.join(HERE, "design.tmpl")).read()

    def rep_t(m):
        k = m.group(1)
        if k not in tables:
            raise SystemExit("unknown table placeholder: " + k)
        return tables[k]

    def rep_f(m):
        cur = facts
        for part in m.group(1).split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                raise SystemExit("unknown fact placeholder: " + m.group(1))
        if isinstance(cur, list):
            return ", ".join(str(x) for x in cur)
        return str(cur)
    text = re.sub(r"\{\{T:([a-zA-Z0-9_]+)\}\}", rep_t, text)
    text = re.sub(r"\{\{F:([a-zA-Z0-9_.]+)\}\}", rep_f, text)
    left = re.findall(r"\{\{[^}]*\}\}", text)
    if left:
        raise SystemExit("unresolved placeholders: %s" % left[:5])
    with open(OUT, "w") as f:
        f.write(text)
    print("wrote %s (%d lines, %d characters)" % (OUT, text.count("\n") + 1, len(text)))


if __name__ == "__main__":
    main()

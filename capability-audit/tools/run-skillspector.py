#!/usr/bin/env python3
"""SkillSpector launcher — copies YARA rules to an ASCII temp path on Windows.

yara-python fails to compile rules when the package lives under non-ASCII paths
(e.g. Chinese directory names). Patch the built-in rules dir before the graph runs.
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def _needs_ascii_yara_fixup(rules_dir: Path) -> bool:
    if not rules_dir.exists():
        return False
    if not str(rules_dir).isascii():
        return True
    # yara.compile is brittle on Windows even when paths look ASCII; always cache on win32.
    return os.name == "nt"


def _ensure_ascii_yara_rules() -> None:
    import skillspector.nodes.analyzers.static_yara as static_yara

    rules_dir: Path = static_yara._BUILTIN_RULES_DIR
    if not _needs_ascii_yara_fixup(rules_dir):
        return

    cache_root = Path(os.environ.get("TEMP", os.environ.get("TMP", "/tmp"))) / "zhian-safe-skillspector-yara"
    cache_root.mkdir(parents=True, exist_ok=True)
    marker = cache_root / ".source"
    source = str(rules_dir.resolve())

    if marker.exists() and marker.read_text(encoding="utf-8") == source:
        static_yara._BUILTIN_RULES_DIR = cache_root
        static_yara._compiled_rules = None
        static_yara._rules_hash = None
        return

    for child in cache_root.iterdir():
        if child.name == ".source":
            continue
        if child.is_dir():
            shutil.rmtree(child, ignore_errors=True)
        else:
            child.unlink(missing_ok=True)

    copied = 0
    for pattern in ("*.yar", "*.yara"):
        for rule_file in rules_dir.glob(pattern):
            shutil.copy2(rule_file, cache_root / rule_file.name)
            copied += 1

    if copied == 0:
        raise FileNotFoundError(f"No YARA rules found under {rules_dir}")

    marker.write_text(source, encoding="utf-8")
    static_yara._BUILTIN_RULES_DIR = cache_root
    static_yara._compiled_rules = None
    static_yara._rules_hash = None


def main() -> None:
    _ensure_ascii_yara_rules()
    from skillspector.cli import app

    app()


if __name__ == "__main__":
    main()

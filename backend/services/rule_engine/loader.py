"""
Rule Engine — Rule Loader

Loads rule definitions from JSON files in the rules/ directory.
Uses rules/index.json as the manifest to discover all available rules.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .models import RuleDefinition

logger = logging.getLogger(__name__)

# Default path to rules/ directory (relative to project root)
_DEFAULT_RULES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "rules"


def load_index(rules_dir: Path | None = None) -> list[dict]:
    """
    Load rules/index.json and return the list of rule entries.

    Args:
        rules_dir: Path to the rules/ directory. Defaults to project root/rules/.

    Returns:
        List of rule entries from the manifest.
    """
    rules_dir = rules_dir or _DEFAULT_RULES_DIR
    index_path = rules_dir / "index.json"

    if not index_path.exists():
        raise FileNotFoundError(f"Rule index not found: {index_path}")

    with open(index_path, "r", encoding="utf-8") as f:
        index = json.load(f)

    return index.get("rules", [])


def load_rule(rule_id: str, rules_dir: Path | None = None) -> RuleDefinition:
    """
    Load a single rule definition by its rule_id.

    Args:
        rule_id: The rule ID (e.g., "MVP-A1").
        rules_dir: Path to the rules/ directory.

    Returns:
        A RuleDefinition instance.

    Raises:
        FileNotFoundError: If the rule file or index is not found.
        ValueError: If the rule_id is not in the index.
    """
    rules_dir = rules_dir or _DEFAULT_RULES_DIR
    index_entries = load_index(rules_dir)

    # Find the rule entry in the index
    entry = None
    for e in index_entries:
        if e.get("rule_id") == rule_id:
            entry = e
            break

    if entry is None:
        raise ValueError(f"Rule '{rule_id}' not found in index")

    # Load the rule JSON file
    rule_file = rules_dir / entry["file"]
    if not rule_file.exists():
        raise FileNotFoundError(f"Rule file not found: {rule_file}")

    with open(rule_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    return RuleDefinition(
        rule_id=data["rule_id"],
        title=data["title"],
        field=data["field"],
        description=data["description"],
        rule_reference=data["rule_reference"],
        source_document=data["source_document"],
        source_version=data["source_version"],
        mandatory=data["mandatory"],
        detection_method=data["detection_method"],
        validation_logic=data["validation_logic"],
        cannot_conclude=data.get("cannot_conclude", []),
        limitations=data.get("limitations", []),
        notes=data.get("notes", []),
    )


def load_all_rules(rules_dir: Path | None = None) -> list[RuleDefinition]:
    """
    Load all rule definitions from the index.

    Args:
        rules_dir: Path to the rules/ directory.

    Returns:
        List of RuleDefinition instances.
    """
    index_entries = load_index(rules_dir)
    rules = []

    for entry in index_entries:
        try:
            rule = load_rule(entry["rule_id"], rules_dir)
            rules.append(rule)
        except (FileNotFoundError, ValueError) as e:
            logger.warning(f"Failed to load rule {entry.get('rule_id', '?')}: {e}")

    return rules


def get_rule_ids(rules_dir: Path | None = None) -> list[str]:
    """Return all rule IDs from the index."""
    index_entries = load_index(rules_dir)
    return [e["rule_id"] for e in index_entries]


def get_rule_set_version(rules_dir: Path | None = None) -> str:
    """Return the rule-set version from the index manifest.

    This version identifies which set of rules was used for a scan.
    It is application-controlled (not a government version number).
    """
    rules_dir = rules_dir or _DEFAULT_RULES_DIR
    index_path = rules_dir / "index.json"

    if not index_path.exists():
        return "unknown"

    with open(index_path, "r", encoding="utf-8") as f:
        index = json.load(f)

    return index.get("rule_set_version", "v1.0")

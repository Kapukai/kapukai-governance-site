"""Validate sourced decision paths before they enter any public export.

This validates structure and provenance requirements, not the truth of a source
or a government's current performance. Source interpretation requires review.
"""
from datetime import date
from urllib.parse import urlsplit

SCHEMA_VERSION = "1.0"
PHASES = ("information", "decision", "impact", "correction")
ROLES = {"institutional_operator", "decision_authority", "affected_person", "reviewer", "representative"}
EVIDENCE = {"court_finding", "allegation", "settlement_term", "court_order", "source_described"}
PILOT_CASE_IDS = {"barry-2016", "turner-rogers-2011", "williams-detroit-2024"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def text(value, location):
    require(isinstance(value, str) and bool(value.strip()), f"{location}: nonempty text required")


def citations(refs, location, required=True):
    require(isinstance(refs, list), f"{location}: source_refs must be a list")
    require(not required or bool(refs), f"{location}: sourced claims require a citation")
    for i, ref in enumerate(refs):
        require(isinstance(ref, dict), f"{location}[{i}]: citation must be an object")
        text(ref.get("url"), f"{location}[{i}].url")
        url = urlsplit(ref["url"])
        require(url.scheme == "https" and bool(url.hostname) and not url.username and not url.password,
                f"{location}[{i}]: public HTTPS source required")
        text(ref.get("pinpoint"), f"{location}[{i}].pinpoint")


def validate_path(path, case_id):
    require(isinstance(path, dict), f"{case_id}: path must be an object")
    require(path.get("schema_version") == SCHEMA_VERSION, f"{case_id}: unsupported schema version")
    reviewed_at = path.get("reviewed_at")
    text(reviewed_at, f"{case_id}.reviewed_at")
    try:
        require(date.fromisoformat(reviewed_at).isoformat() == reviewed_at,
                f"{case_id}: reviewed_at must be YYYY-MM-DD")
    except ValueError as exc:
        raise ValueError(f"{case_id}: reviewed_at must be YYYY-MM-DD") from exc
    text(path.get("review_method"), f"{case_id}.review_method")
    actors = path.get("actors")
    require(isinstance(actors, list) and bool(actors), f"{case_id}: actors required")
    actor_ids = set()
    for actor in actors:
        require(isinstance(actor, dict), f"{case_id}: actor must be an object")
        for key in ("id", "label", "affiliation"):
            text(actor.get(key), f"{case_id}.actor.{key}")
        require(actor["id"] not in actor_ids, f"{case_id}: duplicate actor ID {actor['id']}")
        actor_ids.add(actor["id"])
        require(actor.get("kind") in {"person", "institution", "group"}, f"{case_id}: invalid actor kind")
        require(actor.get("role") in ROLES, f"{case_id}: invalid actor role")
        citations(actor.get("source_refs"), f"{case_id}.{actor['id']}")
    steps = path.get("steps")
    require(isinstance(steps, list) and len(steps) == 4, f"{case_id}: exactly four reading stages required")
    require(all(isinstance(step, dict) for step in steps), f"{case_id}: steps must be objects")
    require(tuple(step.get("phase") for step in steps) == PHASES,
            f"{case_id}: reading stages must follow information, decision, impact, correction")
    step_ids = set()
    for step in steps:
        for key in ("id", "title", "account"):
            text(step.get(key), f"{case_id}.step.{key}")
        require(step["id"] not in step_ids, f"{case_id}: duplicate step ID {step['id']}")
        step_ids.add(step["id"])
        for key in ("actor_ids", "affected_actor_ids"):
            ids = step.get(key)
            require(isinstance(ids, list) and all(isinstance(i, str) for i in ids),
                    f"{case_id}.{step['id']}.{key}: actor ID list required")
            require(len(set(ids)) == len(ids), f"{case_id}.{step['id']}.{key}: duplicate reference")
            require(set(ids) <= actor_ids, f"{case_id}.{step['id']}.{key}: dangling actor reference")
        require(bool(step["actor_ids"]), f"{case_id}.{step['id']}: an acting source-defined actor is required")
        require(step.get("evidence_status") in EVIDENCE, f"{case_id}.{step['id']}: invalid evidence status")
        citations(step.get("source_refs"), f"{case_id}.{step['id']}")
    for field, classifier, allowed_values, allowed_statuses in (
        ("access", "capability", {"see", "challenge", "correct"},
         {"documented_available", "documented_barrier", "alleged_barrier", "required_by_remedy", "not_established"}),
        ("technology", "kind", {"ai", "automation"}, {"documented_use", "alleged_use", "not_established"}),
    ):
        rows = path.get(field)
        require(isinstance(rows, list), f"{case_id}.{field}: list required")
        seen = set()
        for row in rows:
            require(isinstance(row, dict), f"{case_id}.{field}: object required")
            require(row.get("actor_id") in actor_ids, f"{case_id}.{field}: dangling actor reference")
            require(row.get(classifier) in allowed_values, f"{case_id}.{field}: invalid {classifier}")
            identity = (row["actor_id"], row[classifier])
            require(identity not in seen, f"{case_id}.{field}: duplicate actor/classification")
            seen.add(identity)
            require(row.get("status") in allowed_statuses, f"{case_id}.{field}: invalid status")
            if row["status"] != "not_established" or "evidence_status" in row:
                require(row.get("evidence_status") in EVIDENCE, f"{case_id}.{field}: invalid evidence status")
            if row["status"] in {"alleged_use", "alleged_barrier"}:
                require(row.get("evidence_status") == "allegation", f"{case_id}.{field}: alleged status requires allegation posture")
            if row["status"] == "required_by_remedy":
                require(row.get("evidence_status") in {"court_order", "settlement_term"},
                        f"{case_id}.{field}: remedy requirement needs order or settlement posture")
            if row["status"] in {"documented_available", "documented_barrier", "documented_use"}:
                require(row.get("evidence_status") not in {"allegation", "settlement_term"},
                        f"{case_id}.{field}: allegations or settlement terms cannot establish documented use or availability")
            text(row.get("detail"), f"{case_id}.{field}.detail")
            citations(row.get("source_refs"), f"{case_id}.{field}", row["status"] != "not_established")
    correction = path.get("correction")
    require(isinstance(correction, dict), f"{case_id}: correction required")
    require(correction.get("status") in {"ordered", "agreed"}, f"{case_id}: invalid correction status")
    text(correction.get("description"), f"{case_id}.correction.description")
    require(correction.get("implementation_status") == "not_independently_verified",
            f"{case_id}: this pilot does not establish implemented correction")
    citations(correction.get("source_refs"), f"{case_id}.correction")
    limitations = path.get("limitations")
    require(isinstance(limitations, list) and bool(limitations), f"{case_id}: limitations required")
    for limit in limitations:
        text(limit, f"{case_id}.limitations")


def validate_paths(paths, case_ids, expected_ids=None):
    require(isinstance(paths, dict), "Decision paths must be keyed by case ID")
    require(set(paths) <= set(case_ids), "Decision path refers to an unindexed case")
    if expected_ids is not None:
        require(set(paths) == set(expected_ids), "Pilot coverage must match the declared case IDs")
    for case_id, path in paths.items():
        validate_path(path, case_id)

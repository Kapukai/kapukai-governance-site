"""Evidence-contract and cross-export checks, not government-system tests."""
import copy
import csv
import hashlib
import json
from pathlib import Path
import sqlite3
import unittest

from decision_path_contract import PHASES, PILOT_CASE_IDS, validate_path, validate_paths

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parent / "public/evidence/decision-failures"


def fixture():
    citation = [{"url": "https://example.org/source", "pinpoint": "Section 1"}]
    return {
        "schema_version": "1.0", "reviewed_at": "2026-11-01",
        "review_method": "Synthetic contract fixture; not a case finding.",
        "actors": [{"id": "operator", "label": "Example agency", "kind": "institution",
                    "role": "institutional_operator", "affiliation": "Example agency", "source_refs": citation},
                   {"id": "person", "label": "Affected person", "kind": "person",
                    "role": "affected_person", "affiliation": "Outside the agency", "source_refs": citation}],
        "steps": [{"id": phase, "phase": phase, "title": phase.title(),
                   "actor_ids": ["operator"], "affected_actor_ids": ["person"],
                   "account": "Synthetic account.", "evidence_status": "source_described",
                   "source_refs": copy.deepcopy(citation)} for phase in PHASES],
        "access": [{"actor_id": "person", "capability": "challenge", "status": "not_established",
                    "detail": "Access is not established by this fixture.", "source_refs": []}],
        "technology": [{"actor_id": "operator", "kind": "automation", "status": "documented_use",
                        "detail": "A deterministic record match is described.", "evidence_status": "source_described", "source_refs": citation},
                       {"actor_id": "operator", "kind": "ai", "status": "not_established",
                        "detail": "AI use is not established.", "source_refs": []}],
        "correction": {"status": "ordered", "description": "A correction was ordered.",
                       "implementation_status": "not_independently_verified", "source_refs": citation},
        "limitations": ["Synthetic fixture only."],
    }


class ContractRejectionTests(unittest.TestCase):
    def reject(self, mutate, expected):
        path = fixture()
        mutate(path)
        with self.assertRaisesRegex(ValueError, expected):
            validate_path(path, "fixture")

    def test_dangling_actor_is_rejected(self):
        self.reject(lambda p: p["steps"][0]["actor_ids"].append("missing"), "dangling actor")

    def test_duplicate_actor_is_rejected(self):
        self.reject(lambda p: p["actors"].append(copy.deepcopy(p["actors"][0])), "duplicate actor")

    def test_missing_step_source_is_rejected(self):
        self.reject(lambda p: p["steps"][0].update(source_refs=[]), "require a citation")

    def test_missing_pinpoint_is_rejected(self):
        self.reject(lambda p: p["steps"][0]["source_refs"][0].update(pinpoint=""), "pinpoint")

    def test_non_https_source_is_rejected(self):
        self.reject(lambda p: p["steps"][0]["source_refs"][0].update(url="javascript:alert(1)"), "HTTPS")

    def test_invalid_evidence_status_is_rejected(self):
        self.reject(lambda p: p["steps"][0].update(evidence_status="proven_guilty"), "evidence status")

    def test_reading_stages_cannot_silently_change(self):
        self.reject(lambda p: p["steps"][1].update(phase="impact"), "reading stages")

    def test_claiming_documented_ai_requires_a_source(self):
        self.reject(lambda p: p["technology"][1].update(status="documented_use", evidence_status="source_described"), "require a citation")

    def test_allegation_cannot_be_promoted_to_documented_use(self):
        self.reject(lambda p: p["technology"][0].update(evidence_status="allegation"), "cannot establish")

    def test_documented_use_requires_explicit_evidence_posture(self):
        self.reject(lambda p: p["technology"][0].pop("evidence_status"), "evidence status")

    def test_alleged_use_requires_allegation_posture(self):
        self.reject(lambda p: p["technology"][0].update(status="alleged_use"), "allegation posture")

    def test_remedy_requirement_requires_order_or_agreement(self):
        self.reject(lambda p: p["access"][0].update(status="required_by_remedy", evidence_status="allegation"), "order or settlement")

    def test_settlement_does_not_establish_available_access(self):
        self.reject(lambda p: p["access"][0].update(status="documented_available", evidence_status="settlement_term"), "cannot establish")

    def test_remedy_requirement_is_not_implemented_access(self):
        path = fixture()
        path["access"][0].update(status="required_by_remedy", evidence_status="court_order",
                                 source_refs=copy.deepcopy(path["steps"][0]["source_refs"]))
        validate_path(path, "fixture")
        self.assertEqual(path["access"][0]["status"], "required_by_remedy")
        self.reject(lambda p: p["correction"].update(implementation_status="verified"), "does not establish")

    def test_alleged_use_keeps_its_posture(self):
        path = fixture()
        path["technology"][0].update(status="alleged_use", evidence_status="allegation")
        validate_path(path, "fixture")
        self.assertEqual(path["technology"][0]["status"], "alleged_use")

    def test_automation_does_not_become_ai_and_unknown_is_preserved(self):
        path = fixture()
        original = copy.deepcopy(path)
        validate_path(path, "fixture")
        self.assertEqual(path, original)
        self.assertEqual(path["technology"][0]["kind"], "automation")
        self.assertEqual(path["technology"][1]["status"], "not_established")

    def test_unindexed_path_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "unindexed"):
            validate_paths({"missing-case": fixture()}, {"existing-case"})


class PublishedEditionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.paths = json.loads((ROOT / "decision-paths.json").read_text())
        cls.export_bytes = (PUBLIC / "cases.json").read_bytes()
        cls.edition = json.loads(cls.export_bytes)
        cls.cases = {c["id"]: c for c in cls.edition["cases"]}

    def test_three_real_paths_satisfy_contract(self):
        validate_paths(self.paths, self.cases, PILOT_CASE_IDS)

    def test_only_three_paths_added_to_twenty_cases(self):
        self.assertEqual(self.edition["edition"], "4.0", "Run build.py before checking exports")
        self.assertEqual(len(self.cases), 20)
        self.assertEqual({c["id"] for c in self.cases.values() if "decision_path" in c}, PILOT_CASE_IDS)
        for case_id, path in self.paths.items():
            self.assertEqual(self.cases[case_id]["decision_path"], path)

    def test_software_checks_do_not_create_operational_measurements(self):
        for case in self.cases.values():
            self.assertEqual(case["mission_capability"]["current_status"], "UNASSESSED")
            self.assertIsNone(case["mission_capability"]["assessed_at"])
            for field in ("operational_test_runs", "metrics", "independent_replications"):
                self.assertEqual(case["verification"][field], [])

    def test_csv_preserves_paths_and_missing_values(self):
        with (PUBLIC / "cases.csv").open(newline="") as source:
            rows = {r["id"]: r for r in csv.DictReader(source)}
        self.assertEqual(set(rows), set(self.cases))
        for case_id, row in rows.items():
            if case_id in self.paths:
                self.assertEqual(json.loads(row["decision_path"]), self.paths[case_id])
            else:
                self.assertEqual(row["decision_path"], "")

    def test_sqlite_matches_json_and_checksum(self):
        with sqlite3.connect(f"file:{PUBLIC / 'cases.sqlite'}?mode=ro", uri=True) as db:
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            records = {case_id: json.loads(record) for case_id, record in db.execute("SELECT id,record_json FROM cases")}
            self.assertEqual(records, self.cases)
            self.assertEqual(db.execute("SELECT version,sha256 FROM edition").fetchone(),
                             ("4.0", hashlib.sha256(self.export_bytes).hexdigest()))

    def test_sql_keeps_immutable_edition_guard(self):
        sql = (ROOT / "seed.sql").read_text()
        self.assertIn("edition='4.0'", sql)
        self.assertIn(hashlib.sha256(self.export_bytes).hexdigest(), sql)
        self.assertIn("Edition ID already has a different snapshot", sql)
        self.assertIn("ON CONFLICT(edition) DO NOTHING", sql)


if __name__ == "__main__":
    unittest.main()

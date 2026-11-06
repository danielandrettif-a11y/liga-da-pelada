#!/usr/bin/env python3

import csv
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name('compare-production-proof.py')
SPEC = importlib.util.spec_from_file_location('compare_production_proof', SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CompareProductionProofTest(unittest.TestCase):
    def test_load_and_compare_equal_inventories(self):
        source = {
            'exact_public_counts': {
                'table_count': 2,
                'total_rows': 3,
                'rows': {'a': 1, 'b': 2},
            },
            'signatures': {'columns': {'count': 4, 'md5': 'abc'}},
        }
        self.assertEqual(MODULE.compare(source, source), ([], []))

    def test_compare_reports_rows_and_signature_groups(self):
        source = {
            'exact_public_counts': {'rows': {'a': 1, 'b': 2}},
            'signatures': {'columns': {'count': 4, 'md5': 'abc'}},
        }
        destination = {
            'exact_public_counts': {'rows': {'a': 1, 'b': 3, 'c': 0}},
            'signatures': {'columns': {'count': 5, 'md5': 'def'}},
        }
        self.assertEqual(
            MODULE.compare(source, destination),
            (['b', 'c'], ['columns']),
        )

    def test_compare_ignores_capture_timestamp(self):
        source = {
            'exact_public_counts': {'rows': {}},
            'signatures': {'captured_at': 'first'},
        }
        destination = {
            'exact_public_counts': {'rows': {}},
            'signatures': {'captured_at': 'second'},
        }
        self.assertEqual(MODULE.compare(source, destination), ([], []))

    def test_browser_csv_requires_expected_shape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            counts = root / 'counts.csv'
            signatures = root / 'signatures.csv'
            with counts.open('w', newline='', encoding='utf-8') as stream:
                csv.writer(stream).writerows([
                    ['exact_public_counts'],
                    [json.dumps({'rows': {}})],
                ])
            with signatures.open('w', newline='', encoding='utf-8') as stream:
                csv.writer(stream).writerows([
                    ['wrong'],
                    [json.dumps({})],
                ])
            with self.assertRaisesRegex(ValueError, 'export CSV inesperado'):
                MODULE.load_browser_csv(counts, signatures)

    def test_load_combined_browser_csv(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'combined.csv'
            with path.open('w', newline='', encoding='utf-8') as stream:
                csv.writer(stream).writerows([
                    ['section', 'payload'],
                    ['exact_public_counts', json.dumps({'rows': {}})],
                    ['signatures', json.dumps({'columns': {'count': 1}})],
                ])
            self.assertEqual(
                set(MODULE.load_combined_browser_csv(path)),
                {'exact_public_counts', 'signatures'},
            )

    def test_psql_tsv_rejects_missing_section(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'inventory.tsv'
            path.write_text(
                'exact_public_counts\t{"rows":{}}\n', encoding='utf-8'
            )
            with self.assertRaisesRegex(ValueError, 'secoes ausentes'):
                MODULE.load_psql_tsv(path)


if __name__ == '__main__':
    unittest.main()

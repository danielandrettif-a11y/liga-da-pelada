import importlib.util
import io
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('verifier', Path(__file__).with_name('verify-local-filtered-export.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)

BASE = ('COPY public.example (value) FROM stdin;\nrow\n\\.\n'
        'COPY auth.users (id) FROM stdin;\n\\.\n'
        'COPY storage.buckets (id) FROM stdin;\n\\.\n'
        'COPY storage.objects (id) FROM stdin;\n\\.\n')


class ExportCountsTest(unittest.TestCase):
    def test_counts_selected_copy_blocks(self):
        counts = verifier.export_counts(io.StringIO(BASE))
        self.assertEqual(counts['public.example'], 1)
        self.assertEqual(counts['auth.users'], 0)
        self.assertNotEqual(counts, verifier.destination_counts('public.example\t2\n'))

    def test_rejects_incomplete_and_duplicate_blocks(self):
        with self.assertRaises(ValueError):
            verifier.export_counts(io.StringIO(BASE + 'COPY public.extra (x) FROM stdin;\nrow\n'))
        with self.assertRaises(ValueError):
            verifier.export_counts(io.StringIO(BASE + 'COPY public.example (x) FROM stdin;\n\\.\n'))

    def test_rejects_missing_required_tables_and_invalid_inventory(self):
        with self.assertRaises(ValueError):
            verifier.export_counts(io.StringIO('COPY public.example (x) FROM stdin;\n\\.\n'))
        with self.assertRaises(ValueError):
            verifier.destination_counts('public.example\t1\npublic.example\t1\n')


if __name__ == '__main__':
    unittest.main()

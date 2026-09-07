import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('export_usage', Path(__file__).parents[1] / 'scripts/export_usage.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class ExportTest(unittest.TestCase):
    def test_valid_samples_replace_only_their_own_model_and_group(self):
        rows = [{'model': 'gpt-6-astra', 'group_id': 2, 'requests': 20, 'days': 2,
                 'total_tokens': 6000000, 'actual_cost': 2, 'multiplier': 0.4},
                {'model': 'gpt-5.3-codex-spark', 'group_id': 2, 'requests': 500, 'days': 30,
                 'total_tokens': 9000000, 'actual_cost': 1, 'multiplier': 0.4}]
        result = exporter.make_snapshot(rows, {}, '2026-08-08', '2026-09-07')
        astra = next(m for m in result['models'] if m['id'] == 'gpt-6-astra')
        self.assertEqual(astra['samples'][0]['actual_cost'], 2)
        self.assertFalse(any(m['id'] == 'gpt-5.3-codex-spark' for m in result['models']))
        with self.assertRaises(ValueError):
            exporter.make_snapshot([], {}, '2026-08-08', '2026-09-07')

    def test_sparse_sample_retains_previous_window(self):
        old = {'version': 1, 'models': [{'id': 'gpt-6-astra', 'samples': [
            {'group_id': 2, 'requests': 20, 'days': 2, 'window_end': '2026-09-06',
             'total_tokens': 1000000, 'actual_cost': 2, 'multiplier': 0.4}]}]}
        new = [{'model': 'gpt-6-astra', 'group_id': 2, 'requests': 1, 'days': 1,
                'total_tokens': 100, 'actual_cost': 0.1, 'multiplier': 0.4}]
        result = exporter.make_snapshot(new, old, '2026-08-08', '2026-09-07')
        astra = next(m for m in result['models'] if m['id'] == 'gpt-6-astra')
        self.assertEqual(astra['samples'][0]['window_end'], '2026-09-06')


if __name__ == '__main__':
    unittest.main()

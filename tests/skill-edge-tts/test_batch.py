import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('batch', Path(__file__).resolve().parents[2] / 'skills/vnve/scripts/edge_tts_batch.py')
batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(batch)

class BatchTest(unittest.TestCase):
    def item(self, node='line'):
        return dict(sceneId='scene', nodeId=node, expectedActorId=None, expectedText='明天，一起出发。', voice='zh-CN-YunyangNeural', rate='-8%')

    def test_options_and_retry_import_snapshot(self):
        item = self.item()
        calls, waits = [], []
        def run(args, **kwargs):
            calls.append(args)
            target = Path(args[args.index('--write-media') + 1])
            target.write_bytes(b'a' * (20 if len(calls) == 1 else 1200))
            return subprocess.CompletedProcess(args, 0)
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'new'
            report = batch.generate([item], output, '/edge-tts', run, waits.append)
            self.assertTrue(report['ok'])
            self.assertEqual(waits, [2])
            self.assertEqual(calls[0][1:3], ['--voice', item['voice']])
            self.assertIn('--rate=-8%', calls[0])
            import json
            saved = json.loads((output / 'import.json').read_text())['items'][0]
            self.assertIsNone(saved['expectedActorId'])
            self.assertEqual(saved['expectedText'], item['expectedText'])
            self.assertEqual(saved['file'], 'scene/line.mp3')
            with self.assertRaises(FileExistsError):
                batch.generate([item], output, '/edge-tts', run, waits.append)

    def test_failure_is_bounded_and_not_imported(self):
        waits = []
        with tempfile.TemporaryDirectory() as temp:
            report = batch.generate([self.item()], Path(temp)/'new', '/edge-tts',
                                    lambda *a, **k: subprocess.CompletedProcess(a, 1), waits.append)
            self.assertFalse(report['ok'])
            self.assertEqual(report['generated'], 0)
            self.assertEqual(waits, [2, 5, 8])

    def test_rejects_unsafe_targets_duplicate_ids_and_unsupported_markers(self):
        for update in [dict(nodeId='../line'), dict(expectedText='停<#1#>一下'), dict(expectedText='(laughs)'), dict(rate='--voice=bad')]:
            with self.assertRaises(ValueError):
                batch.validate({'items': [self.item() | update]})
        with self.assertRaises(ValueError):
            batch.validate({'items': [self.item(), self.item()]})
        item = self.item(); del item['expectedActorId']
        with self.assertRaises(ValueError):
            batch.validate({'items': [item]})

if __name__ == '__main__':
    unittest.main()

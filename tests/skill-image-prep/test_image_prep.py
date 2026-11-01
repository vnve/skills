import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'skills/vnve/scripts/image_prep.py'
spec = importlib.util.spec_from_file_location('image_prep', SCRIPT)
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)


class ImagePrepTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def image(self, name, mode='RGBA', color=(0, 0, 0, 0)):
        image = Image.new(mode, (64, 96), color)
        ImageDraw.Draw(image).rectangle((20, 10, 43, 85), fill='red')
        path = self.directory / name
        image.save(path)
        return path

    def run_cli(self, *args, status=0):
        result = subprocess.run([sys.executable, str(SCRIPT), *map(str, args)], capture_output=True, text=True)
        self.assertEqual(result.returncode, status, result.stderr)
        return json.loads(result.stdout if status != 1 else result.stderr)

    def test_alpha_distinguishes_opaque_checkerboard_and_empty_from_cutout(self):
        opaque = self.image('opaque.png', 'RGB', 'white')
        checker = Image.new('RGB', (64, 96), 'white')
        draw = ImageDraw.Draw(checker)
        for y in range(0, 96, 8):
            for x in range(0, 64, 8):
                if (x // 8 + y // 8) % 2:
                    draw.rectangle((x, y, x + 7, y + 7), fill='gray')
        checker_path = self.directory / 'fake-checker.png'
        checker.save(checker_path)
        checker_info = self.run_cli('inspect', checker_path, '--require-transparent', status=2)['images'][0]
        self.assertEqual(checker_info['source_mode'], 'RGB')
        self.assertEqual(checker_info['source_format'], 'PNG')
        self.assertEqual(checker_info['alpha_extrema'], [255, 255])
        rgba = self.image('cutout.png')
        empty = self.directory / 'empty.png'
        Image.new('RGBA', (64, 96)).save(empty)
        self.run_cli('inspect', opaque, empty, '--require-transparent', status=2)
        result = self.run_cli('inspect', rgba, '--require-transparent')
        self.assertEqual(result['images'][0]['visible_bbox'], [20, 10, 44, 86])
        self.assertTrue(result['images'][0]['ready_for_review'])

    def test_border_key_keeps_enclosed_same_color_and_preserves_source(self):
        image = Image.new('RGBA', (11, 11), 'white')
        draw = ImageDraw.Draw(image)
        draw.rectangle((2, 2, 8, 8), fill='black')
        draw.rectangle((4, 4, 6, 6), fill='white')
        result = prep.key_background(image, (255, 255, 255), 0)
        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertEqual(result.getpixel((5, 5))[3], 255)
        self.assertEqual(image.getpixel((0, 0))[3], 255)

    def test_mask_and_local_patch_preserve_alpha_and_unselected_pixels(self):
        source = self.image('source.png')
        original = source.read_bytes()
        mask = self.directory / 'mask.png'
        Image.new('L', (64, 96), 128).save(mask)
        out = self.directory / 'masked.png'
        self.run_cli('mask', source, '--mask', mask, '--output', out)
        self.assertEqual(prep.load(out).getpixel((22, 20))[3], 128)
        repair = self.directory / 'repair.png'
        Image.new('RGBA', (64, 96), 'blue').save(repair)
        area = Image.new('L', (64, 96), 0)
        ImageDraw.Draw(area).rectangle((22, 20, 25, 25), fill=255)
        area.save(mask)
        patched = self.directory / 'patched.png'
        self.run_cli('patch', source, '--mask', mask, '--replacement', repair, '--output', patched)
        result = prep.load(patched)
        self.assertEqual(result.getpixel((22, 20)), (0, 0, 255, 255))
        self.assertEqual(result.getpixel((30, 40)), (255, 0, 0, 255))
        self.assertEqual(result.getchannel('A').tobytes(), prep.load(source).getchannel('A').tobytes())
        self.assertEqual(source.read_bytes(), original)
        self.run_cli('mask', source, '--mask', mask, '--output', source, status=1)
        self.assertEqual(source.read_bytes(), original)

    def test_normalization_shares_scale_and_refuses_clipping_before_writing(self):
        source = self.image('source.png')
        expression = self.image('happy.png')
        output = self.directory / 'normalized'
        args = ('normalize', source, expression, '--reference', source, '--canvas', 128, 192,
                '--height', 152, '--baseline', 172, '--output-dir', output)
        self.run_cli(*args)
        self.assertEqual(prep.load(output / 'source.png').size, (128, 192))
        self.assertEqual(prep.bbox(prep.load(output / 'source.png')), prep.bbox(prep.load(output / 'happy.png')))
        original = source.read_bytes()
        self.run_cli(*args, status=1)
        clipped = self.directory / 'clipped'
        self.run_cli('normalize', source, '--reference', source, '--canvas', 16, 16,
                     '--height', 152, '--baseline', 10, '--output-dir', clipped, status=1)
        self.assertFalse(clipped.exists())
        self.assertEqual(source.read_bytes(), original)

    def test_review_creates_light_dark_checker_and_scene_panels(self):
        source = self.image('source.png')
        background = self.image('background.png', 'RGB', 'green')
        output = self.directory / 'review.png'
        result = self.run_cli('review', source, '--background', background, '--output', output)
        self.assertEqual(result['panels'], ['white', 'dark', 'checker', 'scene'])
        self.assertEqual(prep.load(output).size, (1120, 340))


if __name__ == '__main__':
    unittest.main()

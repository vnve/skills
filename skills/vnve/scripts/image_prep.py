#!/usr/bin/env python3
"""Optional offline image preparation; requires Python 3.10+ and Pillow.

Writes new PNGs only. No model download, paid service, or project mutation.
"""
import argparse
from collections import deque
import json
import math
from pathlib import Path
import sys

try:
    from PIL import Image, ImageChops, ImageDraw, ImageOps
except ImportError:
    raise SystemExit('Pillow is missing. Use a host image tool or an isolated environment: python -m pip install Pillow')

Image.MAX_IMAGE_PIXELS = 40_000_000


def load(path, mode='RGBA'):
    with Image.open(path) as source:
        if getattr(source, 'n_frames', 1) != 1:
            raise ValueError('Animated images need frame-aware processing; this script accepts static images only')
        return ImageOps.exif_transpose(source).convert(mode)


def save_new(image, destination):
    path = Path(destination)
    if path.suffix.lower() != '.png':
        raise ValueError('Output must be a new .png file')
    path.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation also prevents overwriting a source or racing another job.
    with path.open('xb') as output:
        image.save(output, format='PNG')


def bbox(image, threshold=0):
    return image.getchannel('A').point(lambda value: 255 if value > threshold else 0).getbbox()


def inspect(path):
    with Image.open(path) as source:
        source_mode = source.mode
        source_format = source.format
    image = load(path)
    alpha = image.getchannel('A')
    histogram = alpha.histogram()
    total = image.width * image.height
    bounds = bbox(image)
    return {'file': str(path), 'size': list(image.size), 'source_mode': source_mode, 'source_format': source_format, 'alpha_extrema': list(alpha.getextrema()),
            'transparent_fraction': histogram[0] / total,
            'partial_alpha_fraction': sum(histogram[1:255]) / total,
            'has_transparency': sum(histogram[:255]) > 0,
            'visible_bbox': list(bounds) if bounds else None,
            'touches_canvas_edge': bool(bounds and (bounds[0] == 0 or bounds[1] == 0 or bounds[2] == image.width or bounds[3] == image.height)),
            'ready_for_review': bool(bounds and sum(histogram[:255]) > 0)}


def mask_image(source, mask):
    if source.size != mask.size:
        raise ValueError('Mask and image dimensions must match after EXIF orientation')
    source = source.copy()
    source.putalpha(ImageChops.multiply(source.getchannel('A'), mask))
    return source


def key_background(image, color, tolerance):
    """Remove only matching pixels connected to the canvas border, not all white."""
    rgb = image.convert('RGB')
    width, height = rgb.size
    pixels = rgb.load()
    selected = bytearray(width * height)
    queue = deque()

    def visit(x, y):
        index = y * width + x
        if selected[index]:
            return
        selected[index] = 1
        if max(abs(pixels[x, y][i] - color[i]) for i in range(3)) <= tolerance:
            queue.append((x, y))
            selected[index] = 2

    for x in range(width):
        visit(x, 0)
        visit(x, height - 1)
    for y in range(height):
        visit(0, y)
        visit(width - 1, y)
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
            if 0 <= nx < width and 0 <= ny < height:
                visit(nx, ny)
    keep = Image.frombytes('L', image.size, bytes(0 if value == 2 else 255 for value in selected))
    return mask_image(image, keep)


def normalize(args):
    reference = load(args.reference)
    bounds = bbox(reference)
    if not bounds or not inspect(args.reference)['has_transparency']:
        raise ValueError('Reference needs a visible foreground and real transparency')
    width, height = args.canvas
    if width <= 0 or height <= 0 or width * height > Image.MAX_IMAGE_PIXELS:
        raise ValueError('Invalid target canvas')
    if args.height <= 0 or not 0 < args.baseline <= height:
        raise ValueError('Positive height and a baseline inside the target canvas are required')
    scale = args.height / (bounds[3] - bounds[1])
    size = (max(1, round(reference.width * scale)), max(1, round(reference.height * scale)))
    if size[0] * size[1] > Image.MAX_IMAGE_PIXELS:
        raise ValueError('Scaled canvas is too large; reduce target height')
    # One common transform preserves pose/size differences. Optional human/model
    # landmarks move each sprite without independently resizing its alpha bounds.
    anchors = json.loads(Path(args.anchors).read_text()) if args.anchors else None
    default_anchor = ((bounds[0] + bounds[2]) / 2, bounds[3])
    plans = []
    names = set()
    for file in args.inputs:
        image = load(file)
        if image.size != reference.size:
            raise ValueError('Inputs must share the reference canvas; establish common scale before normalization')
        if not inspect(file)['ready_for_review']:
            raise ValueError(f'{file}: missing foreground or transparency')
        anchor = anchors.get(Path(file).name) if anchors is not None else default_anchor
        if not isinstance(anchor, (list, tuple)) or len(anchor) != 2 or not all(isinstance(v, (float, int)) and math.isfinite(v) for v in anchor):
            raise ValueError(f'{file}: provide a finite [x,y] anchor by input filename')
        sx, sy = size[0] / image.width, size[1] / image.height
        offset = (round(width / 2 - anchor[0] * sx), round(args.baseline - anchor[1] * sy))
        resized = image.resize(size, Image.Resampling.LANCZOS)
        visible = bbox(resized)
        if not visible or visible[0] + offset[0] < 0 or visible[1] + offset[1] < 0 or visible[2] + offset[0] > width or visible[3] + offset[1] > height:
            raise ValueError(f'{file}: foreground would be clipped; adjust canvas, height or anchors')
        name = Path(file).stem + '.png'
        if name in names:
            raise ValueError('Input filenames must have distinct stems')
        names.add(name)
        plans.append((file, name, offset))
    destination = Path(args.output_dir)
    destination.mkdir(parents=True, exist_ok=False)
    for file, name, offset in plans:
        canvas = Image.new('RGBA', (width, height))
        canvas.alpha_composite(load(file).resize(size, Image.Resampling.LANCZOS), offset)
        save_new(canvas, destination / name)
    return {'output_dir': str(destination), 'scale': scale, 'outputs': [name for _, name, _ in plans]}


def review(args):
    if len(args.inputs) > 20:
        raise ValueError('Review at most 20 images per sheet')
    cell_w, cell_h = 280, 340
    panels = [('white', '#ffffff'), ('dark', '#202124'), ('checker', None)]
    if args.background:
        panels.append(('scene', load(args.background, 'RGB')))
    sheet = Image.new('RGB', (cell_w * len(panels), cell_h * len(args.inputs)), '#353535')
    draw = ImageDraw.Draw(sheet)
    for row, file in enumerate(args.inputs):
        image = load(file)
        sprite = ImageOps.contain(image, (cell_w - 24, cell_h - 44), Image.Resampling.LANCZOS)
        for column, (name, background) in enumerate(panels):
            if isinstance(background, Image.Image):
                tile = ImageOps.fit(background, (cell_w, cell_h - 24)).convert('RGBA')
            elif background is None:
                tile = Image.new('RGBA', (cell_w, cell_h - 24), '#dddddd')
                grid = ImageDraw.Draw(tile)
                for y in range(0, tile.height, 16):
                    for x in range(0, tile.width, 16):
                        if (x // 16 + y // 16) % 2:
                            grid.rectangle((x, y, x + 15, y + 15), fill='#999999')
            else:
                tile = Image.new('RGBA', (cell_w, cell_h - 24), background)
            tile.alpha_composite(sprite, ((cell_w-sprite.width)//2, (tile.height-sprite.height)//2))
            sheet.paste(tile.convert('RGB'), (column*cell_w, row*cell_h+24))
            draw.text((column*cell_w+5, row*cell_h+5), f'{row+1}: {name}', fill='white')
    save_new(sheet, args.output)
    return {'output': args.output, 'rows': [str(path) for path in args.inputs], 'panels': [name for name, _ in panels]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    check = commands.add_parser('inspect', help='Report real alpha and foreground bounds')
    check.add_argument('inputs', nargs='+')
    check.add_argument('--require-transparent', action='store_true')
    for command in ('mask', 'key', 'patch'):
        sub = commands.add_parser(command)
        sub.add_argument('input')
        sub.add_argument('--output', required=True)
        if command in ('mask', 'patch'):
            sub.add_argument('--mask', required=True, help='Opaque grayscale mask: white=foreground/repaired region')
        if command == 'patch':
            sub.add_argument('--replacement', required=True, help='Same-sized repaired image from a host editing tool')
        if command == 'key':
            sub.add_argument('--color', required=True, help='Explicit flat background color, e.g. #00ff00')
            sub.add_argument('--tolerance', type=int, default=15)
    align = commands.add_parser('normalize', help='Apply a shared reference scale and baseline')
    align.add_argument('inputs', nargs='+')
    align.add_argument('--reference', required=True)
    align.add_argument('--canvas', nargs=2, type=int, required=True, metavar=('WIDTH', 'HEIGHT'))
    align.add_argument('--height', type=float, required=True, help='Reference foreground height in output pixels')
    align.add_argument('--baseline', type=int, required=True, help='Output anchor y in pixels')
    align.add_argument('--anchors', help='Optional JSON map: filename -> [anchor_x, anchor_y] on source canvas')
    align.add_argument('--output-dir', required=True, help='Must be a new directory')
    sheet = commands.add_parser('review', help='Compare light/dark/checker and optional scene composites')
    sheet.add_argument('inputs', nargs='+')
    sheet.add_argument('--background')
    sheet.add_argument('--output', required=True)
    args = parser.parse_args()
    if args.command == 'inspect':
        results = [inspect(path) for path in args.inputs]
        print(json.dumps({'images': results}, ensure_ascii=False))
        return 2 if args.require_transparent and any(not item['ready_for_review'] for item in results) else 0
    if args.command == 'normalize':
        result = normalize(args)
    elif args.command == 'review':
        result = review(args)
    else:
        image = load(args.input)
        if args.command == 'mask':
            output = mask_image(image, load(args.mask, 'L'))
        elif args.command == 'key':
            if not 0 <= args.tolerance <= 255:
                raise ValueError('Tolerance must be in 0..255')
            color = args.color.lstrip('#')
            if len(color) != 6:
                raise ValueError('Color must be a six-digit RGB hex value')
            output = key_background(image, tuple(int(color[i:i+2], 16) for i in (0, 2, 4)), args.tolerance)
        else:
            replacement = load(args.replacement)
            mask = load(args.mask, 'L')
            if image.size != replacement.size or image.size != mask.size:
                raise ValueError('Original, replacement and mask dimensions must match')
            output = Image.composite(replacement, image, mask)
            output.putalpha(image.getchannel('A'))
        save_new(output, args.output)
        result = {'output': args.output}
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, Image.DecompressionBombError) as error:
        print(json.dumps({'ok': False, 'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)

#!/usr/bin/env python3
"""Generate PWA and Android launcher icons from a square or portrait source logo.

Usage: python3 scripts/generate_app_icons.py path/to/new-logo.png
Requires: Pillow (python3 -m pip install Pillow)
"""
from __future__ import annotations

import argparse
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]


def square_contain(source: Image.Image, size: int, margin: float = 0.0) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), (255, 255, 255, 255))
    max_size = int(size * (1 - margin * 2))
    artwork = ImageOps.contain(source.convert('RGBA'), (max_size, max_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(artwork, ((size - artwork.width) // 2, (size - artwork.height) // 2))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path, help='Source logo file, such as PNG or JPEG')
    args = parser.parse_args()
    if not args.source.is_file():
        parser.error(f'Logo file not found: {args.source}')

    source = Image.open(args.source)
    pwa_dir = ROOT / 'public' / 'pwa'
    pwa_dir.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        square_contain(source, size).save(pwa_dir / f'icon-{size}.png', optimize=True)
    square_contain(source, 512, margin=0.10).save(pwa_dir / 'icon-maskable-512.png', optimize=True)

    resources = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
    mipmaps = [('mipmap-mdpi', 48), ('mipmap-hdpi', 72), ('mipmap-xhdpi', 96), ('mipmap-xxhdpi', 144), ('mipmap-xxxhdpi', 192)]
    for folder, size in mipmaps:
        directory = resources / folder
        directory.mkdir(parents=True, exist_ok=True)
        icon = square_contain(source, size)
        icon.save(directory / 'ic_launcher.png', optimize=True)
        icon.save(directory / 'ic_launcher_round.png', optimize=True)
    drawable = resources / 'drawable'
    drawable.mkdir(parents=True, exist_ok=True)
    square_contain(source, 512, margin=0.20).save(drawable / 'ic_launcher_foreground.png', optimize=True)
    print('Updated PWA and Android launcher icons. Review the generated images before committing.')


if __name__ == '__main__':
    main()

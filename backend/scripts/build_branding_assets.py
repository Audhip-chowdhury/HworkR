#!/usr/bin/env python3
"""Generate committed branding PNGs under app/assets/branding (stdlib only).

Run from repo root:  python backend/scripts/build_branding_assets.py
"""

from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = BACKEND_ROOT / "app" / "assets" / "branding" / "fox_inc_logo.png"


def png_rgb(width: int, height: int, rgb_pixels: memoryview | bytes) -> bytes:
    """rgb_pixels row-major RGB, length width*height*3."""
    stride = width * 3
    rows = [bytes([0]) + bytes(rgb_pixels[y * stride : y * stride + stride]) for y in range(height)]
    raw = b"".join(rows)
    comp = zlib.compress(raw, level=9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", comp) + chunk(b"IEND", b"")


def fox_inc_demo_logo(width: int = 260, height: int = 64) -> bytes:
    """Navy field, warm orange icon, minimal wordmark."""
    bg = (30, 58, 138)
    accent = (234, 88, 12)
    coral = (253, 186, 116)
    white = (252, 250, 245)
    muted = (180, 198, 240)
    pix = bytearray(width * height * 3)

    def px(x: int, y: int, r: int, g: int, b: int) -> None:
        if 0 <= x < width and 0 <= y < height:
            i = (y * width + x) * 3
            pix[i : i + 3] = bytes([r, g, b])

    for y in range(height):
        for x in range(width):
            px(x, y, *bg)

    cx, cy = 52, height // 2
    for y in range(height):
        for x in range(width):
            if x > int(width * 0.38):
                continue
            dx = (x - cx) / 38.0
            dy = (y - cy) / 26.0
            d = dx * dx + dy * dy
            if 0.15 < d < 1.0:
                t = max(0.0, min(1.0, (1.05 - d) * 2.2))
                r = int(accent[0] * (1 - t * 0.35) + coral[0] * (t * 0.35))
                g = int(accent[1] * (1 - t * 0.35) + coral[1] * (t * 0.35))
                b = int(accent[2] * (1 - t * 0.35) + coral[2] * (t * 0.35))
                px(x, y, r, g, b)

    def line(x0: int, y0: int, x1: int, y1: int, wth: int, col: tuple[int, int, int]) -> None:
        steps = max(abs(x1 - x0), abs(y1 - y0), 1)
        for s in range(steps + 1):
            x = x0 + (x1 - x0) * s // steps
            y = y0 + (y1 - y0) * s // steps
            for dy in range(-wth, wth + 1):
                for dx in range(-wth, wth + 1):
                    px(x + dx, y + dy, *col)

    x0 = int(width * 0.48)
    y0 = 17
    line(x0, y0, x0, y0 + 28, 1, white)
    line(x0, y0, x0 + 14, y0, 1, white)
    line(x0, y0 + 12, x0 + 12, y0 + 12, 1, white)
    cxo = x0 + 28
    for ang in range(0, 360, 12):
        pxx = cxo + int(9 * math.cos(math.radians(ang)))
        pyy = y0 + 14 + int(9 * math.sin(math.radians(ang)))
        px(pxx, pyy, *white)
    cxx = x0 + 52
    line(cxx - 9, y0 + 6, cxx + 9, y0 + 24, 0, white)
    line(cxx + 9, y0 + 6, cxx - 9, y0 + 24, 0, white)
    line(x0 + 71, y0 + 6, x0 + 71, y0 + 24, 0, muted)
    acc = (226, 176, 112)
    line(x0 - 4, y0 + 32, min(x0 + 78, width - 24), y0 + 32, 0, acc)

    return bytes(pix)


def main() -> None:
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    w, h = 260, 64
    OUT_PATH.write_bytes(png_rgb(w, h, fox_inc_demo_logo(w, h)))
    print(f"Wrote {OUT_PATH.relative_to(BACKEND_ROOT)}")


if __name__ == "__main__":
    main()

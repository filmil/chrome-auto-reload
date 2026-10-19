#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Draws the extension's icon, a circular arrow, as PNGs in four sizes.

Standard library only, so the icons can be rebuilt and checked from source:
    python3 scripts/make_icons.py extension/icons
"""
import math
import struct
import sys
import zlib
from pathlib import Path

COLOR = (0x1A, 0x73, 0xE8)
SIZES = (16, 32, 48, 128)
SS = 4  # supersampling per axis


def inside(x, y):
    """Is the point (in a 1x1 square) on the arrow?"""
    cx, cy = x - 0.5, y - 0.5
    r = math.hypot(cx, cy)
    angle = math.degrees(math.atan2(-cy, cx)) % 360
    # The ring, open between 20 and 70 degrees (upper right).
    if 0.25 <= r <= 0.40 and not (20 <= angle <= 70):
        return True
    # The arrowhead at the ring's end at 70 degrees, pointing clockwise.
    a = math.radians(70)
    tip_r = 0.325
    bx, by = tip_r * math.cos(a), -tip_r * math.sin(a)
    tangent = (math.sin(a), math.cos(a))   # clockwise direction, in image axes
    normal = (math.cos(a), -math.sin(a))
    p0 = (bx + normal[0] * 0.15, by + normal[1] * 0.15)
    p1 = (bx - normal[0] * 0.15, by - normal[1] * 0.15)
    p2 = (bx - tangent[0] * 0.17, by - tangent[1] * 0.17)
    return in_triangle((cx, cy), p0, p1, p2)


def in_triangle(p, a, b, c):
    def side(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = side(p, a, b), side(p, b, c), side(p, c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def png(size):
    rows = []
    for py in range(size):
        row = bytearray([0])  # filter: none
        for px in range(size):
            hits = sum(
                inside((px + (i + 0.5) / SS) / size, (py + (j + 0.5) / SS) / size)
                for i in range(SS) for j in range(SS)
            )
            row += bytes(COLOR) + bytes([round(255 * hits / (SS * SS))])
        rows.append(bytes(row))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b""))


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "extension/icons")
    out.mkdir(parents=True, exist_ok=True)
    for size in SIZES:
        (out / f"icon{size}.png").write_bytes(png(size))


if __name__ == "__main__":
    main()

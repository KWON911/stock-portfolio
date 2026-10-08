"""Resize the user-supplied source only; requires Pillow (no app dependency)."""
from pathlib import Path
from hashlib import sha256
from shutil import copyfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "app-icon.png"
OUT = ROOT / "public" / "icons"


def main():
    original_hash = sha256(SOURCE.read_bytes()).hexdigest()
    with Image.open(SOURCE) as image:
        if image.width != image.height or image.width < 512:
            raise ValueError("Source must be square and at least 512x512")
        source = image.convert("RGB")
        OUT.mkdir(parents=True, exist_ok=True)
        for filename, size in [
            ("icon-192.png", 192), ("icon-512.png", 512),
            ("apple-touch-icon.png", 180),
            ("favicon-32x32.png", 32), ("favicon-16x16.png", 16),
        ]:
            source.resize((size, size), Image.Resampling.LANCZOS).save(OUT / filename)
        # Also expose Safari's conventional root discovery path unchanged.
        copyfile(OUT / "apple-touch-icon.png", ROOT / "public" / "apple-touch-icon.png")
        # Entire square artwork fits within the central radius-40% safe circle:
        # 55% * sqrt(2) / 2 < 40%. No cropping or graphic reconstruction.
        for size in (192, 512):
            inset_size = int(size * 0.55)
            canvas = Image.new("RGB", (size, size), source.getpixel((0, 0)))
            offset = (size - inset_size) // 2
            canvas.paste(source.resize((inset_size, inset_size), Image.Resampling.LANCZOS), (offset, offset))
            canvas.save(OUT / f"icon-{size}-maskable.png")
        source.save(ROOT / "public" / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48)])
    assert sha256(SOURCE.read_bytes()).hexdigest() == original_hash, "Source was modified"
    for path in sorted(OUT.glob("*.png")):
        with Image.open(path) as icon:
            print(f"{path.name}: {icon.size}, {icon.mode}")
    with Image.open(ROOT / "public" / "favicon.ico") as icon:
        assert icon.ico.sizes() == {(16, 16), (32, 32), (48, 48)}
        print(f"favicon.ico: {sorted(icon.ico.sizes())}")
    print("Original source unchanged")


if __name__ == "__main__":
    main()

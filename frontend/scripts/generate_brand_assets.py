from pathlib import Path

from PIL import Image, ImageDraw


FRONTEND = Path(__file__).resolve().parents[1]
BRAND_DIR = FRONTEND / "public" / "brand"
APP_DIR = FRONTEND / "src" / "app"

BRIGHT = "#22C55E"
STRONG = "#15803D"
SOFT = "#DCFCE7"
LIGHT = "#4ADE80"
WHITE = "#FFFFFF"

OUTER = [(48, 10), (86, 78), (67, 85), (48, 49), (29, 85), (10, 78)]
CROSSBAR = [(32, 62), (64, 62), (72, 76), (24, 76)]
END_FACE = [(67, 85), (86, 78), (76, 60)]


def svg_path(points: list[tuple[int, int]]) -> str:
    head, *tail = points
    return "M" + " ".join(map(str, head)) + " " + " ".join(
        "L" + " ".join(map(str, point)) for point in tail
    ) + "Z"


def write_svg(path: Path, colors: tuple[str, str, str]) -> None:
    outer, crossbar, end_face = colors
    path.write_text(
        "\n".join(
            [
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">',
                f'  <path d="{svg_path(OUTER)}" fill="{outer}"/>',
                f'  <path d="{svg_path(CROSSBAR)}" fill="{crossbar}"/>',
                f'  <path d="{svg_path(END_FACE)}" fill="{end_face}"/>',
                "</svg>",
                "",
            ]
        ),
        encoding="utf-8",
    )


def transformed(
    points: list[tuple[int, int]], size: int, scale: float
) -> list[tuple[float, float]]:
    factor = size / 96
    return [
        (
            (48 + (x - 48) * scale) * factor,
            (48 + (y - 48) * scale) * factor,
        )
        for x, y in points
    ]


def app_icon(size: int, scale: float) -> Image.Image:
    supersampled = size * 4
    image = Image.new("RGBA", (supersampled, supersampled), BRIGHT)
    draw = ImageDraw.Draw(image)
    draw.polygon(transformed(OUTER, supersampled, scale), fill=WHITE)
    draw.polygon(transformed(CROSSBAR, supersampled, scale), fill=SOFT)
    draw.polygon(transformed(END_FACE, supersampled, scale), fill=SOFT)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    write_svg(BRAND_DIR / "logo-mark.svg", (BRIGHT, STRONG, LIGHT))
    write_svg(BRAND_DIR / "logo-mark-monochrome.svg", ("#000000", "#000000", "#000000"))

    app_icon(192, 0.78).save(BRAND_DIR / "pwa-192.png")
    app_icon(512, 0.78).save(BRAND_DIR / "pwa-512.png")
    app_icon(192, 0.62).save(BRAND_DIR / "pwa-maskable-192.png")
    app_icon(512, 0.62).save(BRAND_DIR / "pwa-maskable-512.png")
    app_icon(180, 0.78).save(BRAND_DIR / "apple-touch-icon.png")

    favicon = app_icon(256, 0.72).convert("RGBA")
    favicon.save(APP_DIR / "favicon.ico", sizes=[(16, 16), (32, 32)])


if __name__ == "__main__":
    main()

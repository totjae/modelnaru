from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "apps" / "web" / "public"
ICON_OUTPUT = OUTPUT / "icons"
PURPLE = "#7c3aed"
OFF_WHITE = "#f8f7fc"
POINTS = ((208, 720), (208, 304), (372, 520), (536, 304), (800, 720), (800, 304))
SOURCE_SIZE = 4096
SCALE = SOURCE_SIZE / 1024


def scaled(value: int) -> int:
    return round(value * SCALE)


def render(size: int, full_bleed: bool = False) -> Image.Image:
    image = Image.new("RGBA", (SOURCE_SIZE, SOURCE_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    inset = 0 if full_bleed else scaled(32)
    radius = 0 if full_bleed else scaled(224)
    draw.rounded_rectangle(
        (inset, inset, SOURCE_SIZE - inset, SOURCE_SIZE - inset),
        radius=radius,
        fill=PURPLE,
    )

    line_points = [(scaled(x), scaled(y)) for x, y in POINTS]
    width = scaled(86)
    draw.line(line_points, fill=OFF_WHITE, width=width, joint="curve")
    endpoint_radius = width // 2
    for x, y in (line_points[0], line_points[-1]):
        draw.ellipse(
            (
                x - endpoint_radius,
                y - endpoint_radius,
                x + endpoint_radius,
                y + endpoint_radius,
            ),
            fill=OFF_WHITE,
        )

    return image.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    ICON_OUTPUT.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 192, 512):
        render(size).save(ICON_OUTPUT / f"icon-{size}.png", optimize=True)

    render(180, full_bleed=True).save(
        ICON_OUTPUT / "apple-touch-icon.png", optimize=True
    )
    render(512, full_bleed=True).save(
        ICON_OUTPUT / "icon-maskable-512.png", optimize=True
    )
    render(48).save(
        OUTPUT / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import json
import os
import zipfile
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


MIB = 1024 * 1024
PAGE_WIDTH, PAGE_HEIGHT = A4


def find_font() -> Path:
    candidates = [
        Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/malgun.ttf",
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/nanum/NanumGothic.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise RuntimeError("No usable TrueType font was found.")


def write_text_fixtures(output: Path) -> None:
    (output / "01-text-utf8.txt").write_text(
        "\n".join(
            [
                "MODELNARU-TEXT-START-1842",
                "이 파일은 UTF-8 텍스트 첨부 처리 시험용입니다.",
                "English marker: BLUE-HARBOR-27",
                "핵심 값: 프로젝트=ModelNaru, 단계=Runtime Stability, 결과=정상",
                "MODELNARU-TEXT-END-9751",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (output / "02-structured.md").write_text(
        """# ModelNaru 수동 시험 문서

## 확인 항목

- 소유자: runtime-auditor
- 우선순위: high
- 승인 코드: MN-MARKDOWN-513

| 구성 요소 | 상태 |
| --- | --- |
| Web | ready |
| API | ready |
| Storage | ready |
""",
        encoding="utf-8",
    )
    (output / "03-data.json").write_text(
        json.dumps(
            {
                "fixture": "modelnaru-runtime",
                "marker": "MN-JSON-8264",
                "items": [
                    {"name": "alpha", "value": 17},
                    {"name": "beta", "value": 29},
                ],
                "expectedSum": 46,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    (output / "08-empty.txt").write_bytes(b"")
    with (output / "09-over-10mb.txt").open("wb") as stream:
        stream.write(b"MODELNARU-OVERSIZE-START\n")
        remaining = 10 * MIB + 1 - stream.tell()
        block = b"A" * MIB
        while remaining > 0:
            chunk = block[: min(remaining, len(block))]
            stream.write(chunk)
            remaining -= len(chunk)


def register_pdf_font(font_path: Path) -> str:
    font_name = "ModelNaruFixtureFont"
    pdfmetrics.registerFont(TTFont(font_name, str(font_path)))
    return font_name


def create_text_pdf(output: Path, font_name: str) -> None:
    target = output / "04-text-layer.pdf"
    document = canvas.Canvas(str(target), pagesize=A4, pageCompression=1)
    pages = [
        (
            "텍스트 PDF 1페이지",
            [
                "시작 표식: MN-PDF-START-318",
                "이 문장은 이미지가 아니라 선택 가능한 텍스트 레이어입니다.",
                "English value: ORANGE-RIVER-41",
            ],
        ),
        (
            "텍스트 PDF 2페이지",
            [
                "계산 항목: 125 + 375 = 500",
                "서비스 계층: Nginx -> Next.js/NestJS -> PostgreSQL/Valkey",
                "페이지 표식: MN-PDF-PAGE2-774",
            ],
        ),
        (
            "텍스트 PDF 3페이지",
            [
                "최종 결론: 텍스트 추출 정상",
                "끝 표식: MN-PDF-END-902",
            ],
        ),
    ]
    for page_number, (heading, lines) in enumerate(pages, start=1):
        document.setTitle("ModelNaru text-layer PDF fixture")
        document.setFont(font_name, 22)
        document.drawString(54, PAGE_HEIGHT - 72, heading)
        document.setFont(font_name, 12)
        y = PAGE_HEIGHT - 120
        for line in lines:
            document.drawString(54, y, line)
            y -= 28
        document.setFont(font_name, 9)
        document.drawRightString(PAGE_WIDTH - 54, 36, f"{page_number} / {len(pages)}")
        document.showPage()
    document.save()


def create_scanned_pdf(output: Path, font_path: Path) -> None:
    target = output / "05-scanned-ocr.pdf"
    document = canvas.Canvas(str(target), pagesize=A4, pageCompression=1)
    heading_font = ImageFont.truetype(str(font_path), 58)
    body_font = ImageFont.truetype(str(font_path), 34)
    small_font = ImageFont.truetype(str(font_path), 26)

    for page_number in range(1, 7):
        image = Image.new("RGB", (1654, 2339), "white")
        draw = ImageDraw.Draw(image)
        draw.rectangle((90, 90, 1564, 2249), outline=(65, 45, 85), width=6)
        draw.text(
            (140, 150),
            f"ModelNaru 스캔 OCR 시험 {page_number}페이지",
            font=heading_font,
            fill="black",
        )
        lines = [
            f"페이지 표식: MN-OCR-PAGE-{page_number:02d}-64",
            "이 PDF에는 선택 가능한 텍스트 레이어가 없습니다.",
            "한국어와 English 문장을 로컬 OCR로 인식해야 합니다.",
            f"검증 숫자: {page_number * 137}",
            "Queue stability marker: SILVER-FOREST-88",
        ]
        y = 330
        for line in lines:
            draw.text((140, y), line, font=body_font, fill="black")
            y += 95
        for row in range(12):
            draw.text(
                (140, 930 + row * 80),
                f"OCR 부하 문장 {row + 1:02d} - ModelNaru runtime processing test.",
                font=small_font,
                fill=(25, 25, 25),
            )
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=88, optimize=True)
        buffer.seek(0)
        document.drawInlineImage(
            Image.open(buffer),
            0,
            0,
            width=PAGE_WIDTH,
            height=PAGE_HEIGHT,
        )
        document.showPage()
    document.save()


def create_page_limit_pdf(output: Path, font_name: str) -> None:
    target = output / "06-page-limit-101.pdf"
    document = canvas.Canvas(str(target), pagesize=A4, pageCompression=1)
    for page_number in range(1, 102):
        document.setFont(font_name, 14)
        document.drawString(54, PAGE_HEIGHT - 72, "ModelNaru PDF 페이지 제한 시험")
        document.setFont(font_name, 11)
        document.drawString(54, PAGE_HEIGHT - 105, f"현재 페이지: {page_number} / 101")
        document.drawString(54, PAGE_HEIGHT - 132, "표식: MN-PAGE-LIMIT-101")
        document.showPage()
    document.save()


def create_invalid_and_unsupported_files(output: Path) -> None:
    (output / "07-invalid-signature.pdf").write_bytes(
        b"%PDF-1.7\nMODELNARU-INVALID-PDF\nThis is deliberately not a valid PDF object graph.\n"
    )
    docx_buffer = BytesIO()
    with zipfile.ZipFile(docx_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
        )
        archive.writestr("word/document.xml", "<document>MN-DOCX-UNSUPPORTED-39</document>")
    (output / "10-unsupported.docx").write_bytes(docx_buffer.getvalue())


def create_image_fixture(output: Path, font_path: Path) -> None:
    image = Image.new("RGB", (1200, 800), (245, 245, 245))
    draw = ImageDraw.Draw(image)
    heading_font = ImageFont.truetype(str(font_path), 58)
    body_font = ImageFont.truetype(str(font_path), 40)
    draw.rectangle((70, 70, 1130, 730), outline=(125, 70, 190), width=12)
    draw.ellipse((130, 210, 390, 470), fill=(34, 190, 184))
    draw.rectangle((470, 210, 730, 470), fill=(245, 140, 35))
    draw.polygon([(940, 200), (1080, 470), (800, 470)], fill=(225, 65, 80))
    draw.text((130, 110), "ModelNaru 이미지 인식 시험", font=heading_font, fill="black")
    draw.text((130, 550), "표식: MN-VISION-742", font=body_font, fill="black")
    draw.text((130, 630), "도형 순서: 원 - 사각형 - 삼각형", font=body_font, fill="black")
    image.save(output / "11-image-vision.png", format="PNG", optimize=True)


def create_attachment_count_files(output: Path) -> None:
    count_dir = output / "12-attachment-count"
    count_dir.mkdir(parents=True, exist_ok=True)
    for number in range(1, 12):
        (count_dir / f"attachment-{number:02d}.txt").write_text(
            f"ModelNaru attachment count fixture {number:02d}\n",
            encoding="utf-8",
        )


def create_image_request_limit_files(output: Path) -> None:
    limit_dir = output / "13-image-request-limit"
    limit_dir.mkdir(parents=True, exist_ok=True)
    for number in range(1, 4):
        image = Image.effect_noise((2800, 2800), 70 + number * 5).convert("L")
        image.save(
            limit_dir / f"image-limit-{number}.png",
            format="PNG",
            compress_level=0,
        )


def write_manifest(output: Path) -> None:
    files = []
    for path in sorted(output.rglob("*")):
        if path.is_file() and path.name != "fixture-manifest.json":
            files.append(
                {
                    "path": path.relative_to(output).as_posix(),
                    "bytes": path.stat().st_size,
                }
            )
    (output / "fixture-manifest.json").write_text(
        json.dumps({"generatedFiles": files}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate ModelNaru runtime test fixtures.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("output/pdf/runtime-stability"),
        help="Output directory for generated fixtures.",
    )
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)

    font_path = find_font()
    font_name = register_pdf_font(font_path)
    write_text_fixtures(output)
    create_text_pdf(output, font_name)
    create_scanned_pdf(output, font_path)
    create_page_limit_pdf(output, font_name)
    create_invalid_and_unsupported_files(output)
    create_image_fixture(output, font_path)
    create_attachment_count_files(output)
    create_image_request_limit_files(output)
    write_manifest(output)
    print(f"Generated runtime fixtures in {output}")


if __name__ == "__main__":
    main()

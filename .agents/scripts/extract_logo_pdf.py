from pathlib import Path

import fitz


source = Path("attached_assets/logo_70cm_x_70cm_1787435558761.pdf")
output_dir = Path(".agents/outputs/logo-pdf")
output_dir.mkdir(parents=True, exist_ok=True)

document = fitz.open(source)
print(f"Pages: {document.page_count}")

for index, page in enumerate(document):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=True)
    rendered_path = output_dir / f"page-{index + 1}.png"
    pixmap.save(rendered_path)
    print(f"Rendered: {rendered_path}")

    for image_index, image in enumerate(page.get_images(full=True)):
        extracted = document.extract_image(image[0])
        extension = extracted["ext"]
        image_path = output_dir / f"embedded-{index + 1}-{image_index + 1}.{extension}"
        image_path.write_bytes(extracted["image"])
        print(f"Extracted: {image_path}")
"""
Genera el sitio del flipbook a partir de los PDF de `libros/`.

Cada `libros/<cliente>/<nombre>.pdf` se publica en `/<cliente>/<nombre>/`: páginas en WebP (dos tamaños),
manifest.json con medidas y links, una copia del PDF para descargar y la imagen
para compartir (og.jpg). Opcional: un .json con el mismo nombre, con {"titulo", "fondo"}.

Uso: python build.py            -> genera _site/
     BASE_URL=https://... python build.py   (para las URLs absolutas de og:image)
"""

import json
import os
import re
import shutil
from pathlib import Path

import pymupdf
from PIL import Image

ROOT = Path(__file__).parent
LIBROS = ROOT / "libros"
VIEWER = ROOT / "viewer"
OUT = ROOT / "_site"
BASE_URL = os.environ.get("BASE_URL", "https://flipbook.bongstudio.ar").rstrip("/")

# Alto de página en píxeles para cada tamaño. El visor elige según pantalla.
TAMANOS = {"sm": 1100, "lg": 2200}
CALIDAD = {"sm": 80, "lg": 78}


def slugify(texto):
    texto = texto.lower()
    for a, b in zip("áéíóúüñ", "aeiouun"):
        texto = texto.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", texto).strip("-")


def render(pagina, alto):
    escala = alto / pagina.rect.height
    pix = pagina.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=False)
    return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)


def links_de(pagina):
    w, h = pagina.rect.width, pagina.rect.height
    salida = []
    for link in pagina.get_links():
        r = link["from"]
        caja = [round(r.x0 / w, 4), round(r.y0 / h, 4), round(r.width / w, 4), round(r.height / h, 4)]
        if link.get("uri"):
            salida.append({"caja": caja, "url": link["uri"]})
        elif link.get("kind") == pymupdf.LINK_GOTO and link.get("page", -1) >= 0:
            salida.append({"caja": caja, "pagina": link["page"] + 1})
    return salida


def construir_libro(pdf_path, plantilla):
    rel = pdf_path.relative_to(LIBROS).with_suffix("")
    ruta = "/".join(slugify(p) for p in rel.parts)
    slug = slugify(rel.name)
    config_path = pdf_path.with_suffix(".json")
    config = json.loads(config_path.read_text("utf-8")) if config_path.exists() else {}

    doc = pymupdf.open(pdf_path)
    titulo = config.get("titulo") or doc.metadata.get("title") or pdf_path.stem
    destino = OUT / ruta
    for tam in TAMANOS:
        (destino / "paginas" / tam).mkdir(parents=True, exist_ok=True)

    paginas = []
    for i, pagina in enumerate(doc):
        nombre = f"{i + 1:03d}.webp"
        for tam, alto in TAMANOS.items():
            render(pagina, alto).save(destino / "paginas" / tam / nombre, "WEBP", quality=CALIDAD[tam], method=6)
        links = links_de(pagina)
        paginas.append({"links": links} if links else {})
        print(f"  {ruta}: página {i + 1}/{doc.page_count}", flush=True)

    # Imagen para compartir (WhatsApp, mail): la tapa en JPG.
    render(doc[0], 630).save(destino / "og.jpg", "JPEG", quality=85)

    pdf_nombre = f"{slug}.pdf"
    shutil.copy2(pdf_path, destino / pdf_nombre)

    primera = doc[0].rect
    manifest = {
        "titulo": titulo,
        "ancho": primera.width,
        "alto": primera.height,
        "total": doc.page_count,
        "tamanos": TAMANOS,
        "pdf": pdf_nombre,
        "fondo": config.get("fondo"),
        "paginas": paginas,
    }
    (destino / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), "utf-8")

    html = (
        plantilla.replace("{{TITULO}}", titulo)
        .replace("{{OG_IMAGE}}", f"{BASE_URL}/{ruta}/og.jpg")
        .replace("{{URL}}", f"{BASE_URL}/{ruta}/")
        .replace("{{RAIZ}}", "../" * len(rel.parts))
    )
    (destino / "index.html").write_text(html, "utf-8")
    return ruta, titulo


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    shutil.copytree(VIEWER / "assets", OUT / "assets")
    shutil.copy2(VIEWER / "raiz.html", OUT / "index.html")
    shutil.copy2(VIEWER / "404.html", OUT / "404.html")
    shutil.copy2(VIEWER / "CNAME", OUT / "CNAME")
    plantilla = (VIEWER / "libro.html").read_text("utf-8")

    libros = sorted(LIBROS.rglob("*.pdf"))
    if not libros:
        print("No hay PDF en libros/")
    for pdf in libros:
        ruta, titulo = construir_libro(pdf, plantilla)
        print(f"OK  /{ruta}/  ({titulo})")


if __name__ == "__main__":
    main()

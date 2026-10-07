# Flipbook · Bong Studio

Visor de libros hojeables propio, sin librerías. Se publica en
**https://flipbook.bongstudio.ar** desde este repo, con GitHub Pages.

Cada PDF de `libros/` se convierte en un libro con su propia dirección:

| PDF | Dirección |
|---|---|
| `libros/profertil/educar-para-transformar.pdf` | flipbook.bongstudio.ar/profertil/educar-para-transformar/ |
| `libros/profertil/mesa-de-proyectos-2026.pdf` | flipbook.bongstudio.ar/profertil/mesa-de-proyectos-2026/ |

## Resubir un PDF

1. Reemplazá el archivo en `libros/` **con el mismo nombre** (si cambia el nombre, cambia la dirección).
2. Commit y push.
3. GitHub genera las páginas y publica solo, en 1-2 minutos. Se ve en la pestaña *Actions* del repo.

## Sumar un libro nuevo

1. Poné el PDF en `libros/<cliente>/<nombre-del-libro>.pdf`, en minúsculas y con guiones.
2. Opcional: al lado, un `.json` con el mismo nombre para el título de la pestaña y el color de fondo:
   ```json
   { "titulo": "Educar para Transformar · Profertil", "fondo": "#e9e7e2", "anillado": "#1f4fa8" }
   ```
   Si no está, toma el título de las propiedades del PDF. `anillado` dibuja un anillado 3D de ese color sobre el lomo; sin esa línea, el libro va con lomo pegado.
3. Commit y push.

## Cómo se arma el libro

- La tapa va sola a la derecha, después los pares (2-3, 4-5...) y la contratapa sola a la izquierda. Si el PDF tiene páginas impares, se agrega una blanca antes de la contratapa.
- En pantallas angostas (celular parado) se ve de a una página.
- Se pasa con clic, arrastrando la esquina, deslizando en el celular o con las flechas del teclado.
- Cada página se publica como imagen en dos tamaños, y el visor carga la que corresponde a la pantalla. El lector no tiene que bajar el PDF entero para empezar a leer. El botón de descarga entrega el PDF original.
- Si el PDF tiene links, siguen siendo clickeables.
- El símbolo de Bong en la barra lleva a bongstudio.ar.
- La dirección recuerda la página: `.../#p=12` abre directo en la 12.
- Las páginas llevan `noindex`: no aparecen en Google. Pero el repo es público, así que no subir nada confidencial.

## Probar en la compu

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python build.py
python3 -m http.server 8794 --directory _site
```

Y abrir http://localhost:8794/profertil/educar-para-transformar/

## Archivos

- `build.py` convierte los PDF y arma `_site/` (no se sube: lo genera GitHub).
- `viewer/assets/flipbook.js` es el motor: la hoja, el pliegue y las sombras.
- `viewer/assets/flipbook.css` tiene los estilos. `viewer/libro.html` es la plantilla de cada libro.
- `.github/workflows/publicar.yml` es la publicación automática.

## CRÉDITOS

María Lopez / Brand Designer
Marcos Cousseau / Creative Director

## CONTACTO

BONG STUDIO · 2026 — Brutally Clear Branding — bongstudio.ar

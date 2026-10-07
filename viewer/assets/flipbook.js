/*
 * Flipbook de Bong Studio. Sin dependencias.
 *
 * Modelo (el mismo que turn.js): la tapa va sola a la derecha, después los pares
 * 2-3, 4-5..., y la contratapa sola a la izquierda. Si el PDF tiene páginas
 * impares se agrega una blanca antes de la contratapa.
 *
 * Geometría de la hoja: todo se calcula en coordenadas de la página derecha
 * (0,0 arriba a la izquierda, junto al lomo; W,H abajo afuera). C es la esquina
 * que se agarra y P adonde está ahora. El pliegue es la mediatriz de C-P: lo que
 * queda del lado de C se levanta y se ve reflejado (el dorso, que es la página
 * siguiente). Una página que vuelve es la misma hoja recorriendo el camino al revés.
 */
(() => {
  'use strict';

  const raiz = document.getElementById('flipbook');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let man;            // manifest.json
  let W = 0, H = 0;   // tamaño de una página en px
  let doble = true;   // dos páginas o una
  let seq = [];       // seq[i] = número de página del PDF (0 = blanca), i desde 1
  let seqD = [], seqS = [];
  let cur = 1;        // doble: índice de la página derecha del pliego. simple: página visible
  let tam = 'sm';
  let estado = 'quieto'; // quieto | asomo | arrastre | anim
  let hoja = null;    // { R, dir, C, E, P }
  let raf = 0, animFin = null;

  /* ---------- DOM ---------- */

  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html) e.innerHTML = html;
    return e;
  };
  const crearPagina = cls => {
    const p = el('div', 'fb-page ' + cls,
      '<img alt="" draggable="false" decoding="async"><div class="fb-gutter"></div><div class="fb-links"></div>');
    const img = p.firstChild;
    img.onerror = () => { // si se corta la conexión, un reintento
      const s = img.getAttribute('src');
      if (s && !img.dataset.reintento) { img.dataset.reintento = 1; setTimeout(() => img.setAttribute('src', s + '?r'), 800); }
    };
    img.onload = () => delete img.dataset.reintento;
    return p;
  };

  const visor = el('div', 'fb-viewport');
  const libro = el('div', 'fb-book');
  const escena = el('div', 'fb-stage');
  const sombraLibro = el('div', 'fb-bookshadow');
  const pIzq = crearPagina('fb-left side-l');
  const pDer = crearPagina('fb-right side-r');
  const sombraBajo = el('div', 'fb-undershadow', '<div class="fb-sh"></div>');
  const pFrente = crearPagina('fb-front side-r');
  const solapaWrap = el('div', 'fb-flapwrap');
  const pSolapa = crearPagina('fb-flap side-l');
  pSolapa.appendChild(el('div', 'fb-sh'));
  solapaWrap.appendChild(pSolapa);
  // Dos capas de aros: una debajo de la hoja que se da vuelta y otra encima,
  // recortada a la hoja, que aparece cuando la hoja se apoya.
  const anillos = el('div', 'fb-rings');
  const anillosSobre = el('div', 'fb-rings fb-rings-top');
  escena.append(sombraLibro, pIzq, pDer, sombraBajo, pFrente, anillos, solapaWrap, anillosSobre);
  libro.appendChild(escena);
  visor.appendChild(libro);

  const ico = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const barra = el('nav', 'fb-bar', `
    <button class="fb-btn" data-acc="prev" aria-label="Página anterior">${ico('<path d="M15 5l-7 7 7 7"/>')}</button>
    <span class="fb-ind" aria-live="polite"></span>
    <button class="fb-btn" data-acc="next" aria-label="Página siguiente">${ico('<path d="M9 5l7 7-7 7"/>')}</button>
    <span class="fb-sep"></span>
    <button class="fb-btn" data-acc="full" aria-label="Pantalla completa">${ico('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>')}</button>
    <a class="fb-btn" data-acc="pdf" aria-label="Descargar PDF" download>${ico('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>')}</a>
  `);
  const cabeza = el('header', 'fb-head', '<div class="fb-card"><h1></h1><p></p></div>' +
    '<a class="fb-bong" href="https://bongstudio.ar" target="_blank" rel="noopener" aria-label="Bong Studio" title="Bong Studio"><svg viewBox="0 0 82 96" aria-hidden="true" class="fb-logo"><path d="M72.8 6.7c4.1 4.1 6.7 9.9 6.7 16.1s-2.6 12-6.7 16.1c-4.1 4.2-9.8 6.7-16.1 6.7s-11.9-2.5-16-6.7c-4.1-4.1-6.7-9.9-6.7-16.1s2.6-12 6.7-16.1C44.8 2.5 50.5 0 56.8 0s11.9 2.5 16 6.7zM27.3 7c1 2.7 1 5.8 0 8.6-1 2.4-2.7 4.4-5.2 5.5 13 2.3 12.3 24-2.4 24H0V.7h18C22.8.7 25.9 3.4 27.3 7zM0 50.5l.04 45.1h31.3V51.1H16.8v18.8L.7 50.5zM57.8 73.2l11.9-20.5a22.9 22.9 0 1 0 12.3 20.4H57.8z"/></svg></a>');
  const cargando = el('div', 'fb-loading', '<span></span>');
  raiz.append(cabeza, visor, barra, cargando);
  const ind = barra.querySelector('.fb-ind');
  const btnPrev = barra.querySelector('[data-acc=prev]');
  const btnNext = barra.querySelector('[data-acc=next]');
  const btnFull = barra.querySelector('[data-acc=full]');

  /* ---------- páginas ---------- */

  const pg = i => (i >= 1 && i < seq.length ? seq[i] : undefined);
  const src = n => `paginas/${tam}/${String(n).padStart(3, '0')}.webp`;

  function ponerPagina(nodo, n, conLinks) {
    const img = nodo.firstChild;
    nodo.classList.toggle('is-none', n === undefined);
    nodo.classList.toggle('is-blank', n === 0 || n === 'papel');
    nodo.classList.toggle('is-paper', n === 'papel');
    if (n > 0) {
      const s = src(n);
      if (img.getAttribute('src') !== s) img.setAttribute('src', s);
    } else {
      img.removeAttribute('src');
    }
    const capa = nodo.querySelector('.fb-links');
    capa.textContent = '';
    if (!conLinks || !(n > 0)) return;
    for (const l of (man.paginas[n - 1] || {}).links || []) {
      const a = el('a');
      const [x, y, w, h] = l.caja;
      Object.assign(a.style, { left: x * 100 + '%', top: y * 100 + '%', width: w * 100 + '%', height: h * 100 + '%' });
      if (l.url) { a.href = l.url; a.target = '_blank'; a.rel = 'noopener'; }
      else { a.href = '#p=' + l.pagina; a.dataset.goto = l.pagina; }
      capa.appendChild(a);
    }
  }

  const precargadas = new Set();
  function precargar() {
    for (let i = cur - 3; i <= cur + 4; i++) {
      const n = pg(i);
      if (n > 0 && !precargadas.has(src(n))) {
        precargadas.add(src(n));
        new Image().src = src(n);
      }
    }
  }

  /* ---------- pliegos ---------- */

  // En simple con anillado, la página se corre para que los aros entren en pantalla.
  const desplaz = c => (!doble ? (man.anillado ? W * 0.03 : 0) : c === 1 ? -W / 2 : pg(c) === undefined ? W / 2 : 0);

  function sombraDe(izq, der) {
    raiz.classList.toggle('sin-izq', !izq);
    raiz.classList.toggle('sin-der', !der);
    sombraLibro.style.left = (izq ? -W : 0) + 'px';
    sombraLibro.style.width = ((izq ? W : 0) + (der ? W : 0)) + 'px';
  }

  function mostrarPliego() {
    raiz.classList.remove('is-flipping');
    if (doble) {
      ponerPagina(pIzq, pg(cur - 1), true);
      ponerPagina(pDer, pg(cur), true);
      sombraDe(pg(cur - 1) !== undefined, pg(cur) !== undefined);
    } else {
      ponerPagina(pIzq, undefined);
      ponerPagina(pDer, pg(cur), true);
      sombraDe(false, true);
    }
    libro.style.transform = `translateX(${desplaz(cur)}px)`;
    actualizarBarra();
    precargar();
  }

  function visibles() {
    const v = doble ? [pg(cur - 1), pg(cur)] : [pg(cur)];
    return v.filter(n => n > 0);
  }

  function actualizarBarra() {
    const v = visibles();
    ind.textContent = (v.length > 1 ? `${v[0]}-${v[1]}` : `${v[0] || ''}`) + ` / ${man.total}`;
    btnPrev.disabled = !puede(-1);
    btnNext.disabled = !puede(1);
    if (v[0]) history.replaceState(null, '', '#p=' + v[0]);
  }

  function puede(dir) {
    if (doble) return dir > 0 ? pg(cur) !== undefined : cur >= 3;
    return dir > 0 ? pg(cur + 1) !== undefined : cur > 1;
  }

  function irA(numPdf) {
    terminarYa();
    const i = Math.max(1, seq.indexOf(numPdf));
    cur = doble ? (i % 2 ? i : i + 1) : i;
    mostrarPliego();
  }

  /* ---------- geometría de la hoja ---------- */

  function recortar(poli, f) { // se queda con f >= 0 (Sutherland-Hodgman, un solo plano)
    const out = [];
    for (let i = 0; i < poli.length; i++) {
      const a = poli[i], b = poli[(i + 1) % poli.length];
      const fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  }
  const poliCss = p => p.length < 3 ? 'polygon(0 0,0 0,0 0)'
    : `polygon(${p.map(q => `${q[0].toFixed(2)}px ${q[1].toFixed(2)}px`).join(',')})`;

  function acotar(P) {
    const C = hoja.C;
    let [x, y] = P;
    y = C[1] > 0 ? Math.min(y, H) : Math.max(y, 0); // no pasar del borde de la esquina
    // La hoja está pegada al lomo: la esquina no puede alejarse del lomo más que
    // el borde (W) ni que la diagonal desde la otra punta del lomo.
    const anclas = [[[0, C[1]], W], [[0, H - C[1]], Math.hypot(W, H)]];
    for (const [[ax, ay], r] of anclas) {
      const dx = x - ax, dy = y - ay, d = Math.hypot(dx, dy);
      if (d > r) { x = ax + dx * r / d; y = ay + dy * r / d; }
    }
    return [x, y];
  }

  function dibujar() {
    const { C, E, P } = hoja;
    const dx = P[0] - C[0], dy = P[1] - C[1];
    const largo = Math.hypot(dx, dy);
    const progreso = Math.min(1, Math.max(0, (W - P[0]) / (2 * W)));
    if (doble) {
      const d = desplaz(hoja.R) + (desplaz(hoja.R + 2) - desplaz(hoja.R)) * progreso;
      libro.style.transform = `translateX(${d}px)`;
    }
    if (largo < 0.5) {
      pFrente.style.clipPath = 'none';
      solapaWrap.style.visibility = 'hidden';
      sombraBajo.style.visibility = 'hidden';
      return;
    }
    solapaWrap.style.visibility = sombraBajo.style.visibility = '';
    const nx = dx / largo, ny = dy / largo;
    const M = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2];
    const f = X => (X[0] - M[0]) * nx + (X[1] - M[1]) * ny;
    const rect = [[0, 0], [W, 0], [W, H], [0, H]];
    const queda = recortar(rect, f);
    const levantado = recortar(rect, X => -f(X));

    pFrente.style.clipPath = poliCss(queda);
    sombraBajo.style.clipPath = poliCss(levantado);

    // Dorso: espejo horizontal de la hoja (u -> W-u) y reflexión sobre el pliegue.
    const k = M[0] * nx + M[1] * ny;
    const a = 2 * nx * nx - 1, b = 2 * nx * ny, c = -2 * nx * ny, d = 1 - 2 * ny * ny;
    const e = W * (1 - 2 * nx * nx) + 2 * k * nx, g = -2 * W * nx * ny + 2 * k * ny;
    pSolapa.style.transform = `matrix(${a},${b},${c},${d},${e},${g})`;
    pSolapa.style.clipPath = poliCss(levantado.map(([x, y]) => [W - x, y]));

    // Sombras: fuertes a mitad de camino, nulas en los extremos.
    const fin = Math.hypot(P[0] - E[0], P[1] - E[1]);
    const s = Math.min(1, largo / (0.25 * W), fin / (0.25 * W));
    const ancho = Math.min(largo / 2, W * 0.3);
    const shS = pSolapa.querySelector('.fb-sh').style;
    shS.left = (W - M[0]) + 'px'; shS.top = M[1] + 'px';
    shS.transform = `rotate(${Math.atan2(-ny, nx)}rad) translateY(-50%)`;
    shS.background = `linear-gradient(90deg, rgba(0,0,0,${0.22 * s}) 0, rgba(0,0,0,${0.05 * s}) ${ancho * 0.35}px, rgba(255,255,255,${0.14 * s}) ${ancho * 0.75}px, rgba(255,255,255,0) ${ancho * 1.5}px)`;
    const shB = sombraBajo.firstChild.style;
    shB.left = M[0] + 'px'; shB.top = M[1] + 'px';
    shB.transform = `rotate(${Math.atan2(-ny, -nx)}rad) translateY(-50%)`;
    shB.background = `linear-gradient(90deg, rgba(0,0,0,${0.38 * s}) 0, rgba(0,0,0,0) ${Math.max(8, ancho * 1.2)}px)`;
    if (man.anillado) {
      const ref = ([x, y]) => { const t = 2 * ((x - M[0]) * nx + (y - M[1]) * ny); return [x - t * nx, y - t * ny]; };
      anillosSobre.style.clipPath = poliCss(levantado.map(ref));
      anillosSobre.style.opacity = Math.min(1, Math.max(0, (progreso - 0.9) / 0.1)).toFixed(3);
    }
    solapaWrap.style.filter = `drop-shadow(0 0 ${Math.round(10 * s)}px rgba(0,0,0,${(0.28 * s).toFixed(3)}))`;
  }

  // Anillado: aros sobre el lomo, con agujeros en cada página. Cada aro es un tubo:
  // degradé oscuro-claro-oscuro, un brillo fino arriba y su sombra corrida abajo.
  function anillar() {
    anillos.textContent = anillosSobre.textContent = '';
    if (!man.anillado) return;
    // Cantidad fija y medidas relativas a la página: el anillado se ve igual en cualquier pantalla.
    const n = 30, m = H * 0.035, p = (H - 2 * m) / (n - 1);
    const g = p * 0.75, sw = p * 0.27, alto = p * 0.1;
    const f = v => v.toFixed(1);
    let aros = '';
    for (let i = 0; i < n; i++) {
      const y = m + i * p;
      const d = (dy, dx = 0) => `M${f(-g + dx)} ${f(y + alto + dy)} Q${f(dx)} ${f(y - alto * 3.2 + dy)} ${f(g + dx)} ${f(y - alto + dy)}`;
      aros += `<ellipse class="l" cx="${f(-g)}" cy="${f(y + alto)}" rx="${f(sw * 0.6)}" ry="${f(sw * 0.8)}"/>` +
        `<ellipse class="r" cx="${f(g)}" cy="${f(y - alto)}" rx="${f(sw * 0.6)}" ry="${f(sw * 0.8)}"/>` +
        `<path class="sombra" d="${d(sw * 0.9, sw * 0.4)}" stroke-width="${f(sw * 1.1)}"/>` +
        `<path class="tubo" d="${d(0)}" stroke-width="${f(sw)}"/>` +
        `<path class="brillo" d="${d(-sw * 0.22)}" stroke-width="${f(sw * 0.28)}"/>`;
    }
    anillos.innerHTML = anillosSobre.innerHTML = `<svg style="left:${f(-2 * g)}px" width="${f(4 * g)}" height="${H}" viewBox="${f(-2 * g)} 0 ${f(4 * g)} ${H}" aria-hidden="true">` +
      `<defs><linearGradient id="fb-aro" x1="0" x2="1" y1="0" y2="0"><stop offset="0" class="o"/><stop offset=".45" class="c"/><stop offset="1" class="o"/></linearGradient></defs>${aros}</svg>`;
  }

  function moverA(P) { hoja.P = acotar(P); dibujar(); }

  /* ---------- una hoja en movimiento ---------- */

  // dir 1: se da vuelta la página derecha. dir -1: vuelve la hoja anterior.
  function empezar(dir, esquina) {
    if (!puede(dir)) return false;
    const R = dir > 0 ? cur : cur - (doble ? 2 : 1);
    const y = esquina === 't' ? 0 : H;
    hoja = { R, dir, C: [W, y], E: [-W, y], P: null };
    hoja.P = dir > 0 ? hoja.C.slice() : hoja.E.slice();
    raiz.classList.add('is-flipping');
    if (doble) {
      ponerPagina(pIzq, pg(R - 1));
      ponerPagina(pDer, pg(R + 2));
      ponerPagina(pSolapa, pg(R + 1));
      sombraDe(pg(R - 1) !== undefined, pg(R + 2) !== undefined);
    } else {
      ponerPagina(pIzq, undefined);
      ponerPagina(pDer, pg(R + 1));
      ponerPagina(pSolapa, 'papel');
    }
    ponerPagina(pFrente, pg(R));
    dibujar();
    return true;
  }

  function terminar(dadaVuelta) {
    cancelAnimationFrame(raf);
    cur = dadaVuelta ? hoja.R + (doble ? 2 : 1) : hoja.R;
    hoja = null; estado = 'quieto'; animFin = null;
    mostrarPliego();
  }

  const suave = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const salida = t => 1 - Math.pow(1 - t, 3);

  function animar(dadaVuelta, curva = suave) {
    cancelAnimationFrame(raf);
    estado = 'anim';
    const desde = hoja.P.slice();
    const hasta = (dadaVuelta ? hoja.E : hoja.C).slice();
    const tramo = Math.abs(hasta[0] - desde[0]) / (2 * W);
    const dur = (reducido ? 0.25 : 1) * (220 + 620 * tramo);
    const arriba = hoja.C[1] > 0 ? -1 : 1;
    const t0 = performance.now();
    animFin = () => terminar(dadaVuelta);
    const paso = ahora => {
      const t = Math.min(1, (ahora - t0) / dur), e = curva(t);
      const x = desde[0] + (hasta[0] - desde[0]) * e;
      const y = desde[1] + (hasta[1] - desde[1]) * e + arriba * H * 0.14 * tramo * Math.sin(Math.PI * e);
      moverA([x, y]);
      if (t < 1) raf = requestAnimationFrame(paso); else animFin();
    };
    raf = requestAnimationFrame(paso);
  }

  function terminarYa() { if (estado === 'anim' && animFin) animFin(); }

  function pasar(dir) {
    terminarYa();
    if (hoja && hoja.dir !== dir) terminar(hoja.dir < 0); // asomaba la del otro lado
    if (!hoja && !empezar(dir, 'b')) return;
    animar(dir > 0);
  }

  /* ---------- puntero ---------- */

  let toque = null;

  const local = ev => {
    const r = escena.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };
  const dirDe = ([x]) => (doble ? (x >= 0 ? 1 : -1) : (x >= W / 2 ? 1 : -1));

  visor.addEventListener('pointerdown', ev => {
    if (ev.button !== 0 || ev.target.closest('a')) return;
    terminarYa();
    toque = { x: ev.clientX, y: ev.clientY, l: local(ev), movido: false, hist: [] };
    try { visor.setPointerCapture(ev.pointerId); } catch {}
  });

  visor.addEventListener('pointermove', ev => {
    if (!toque) { if (ev.pointerType === 'mouse') asomar(local(ev)); return; }
    const dx = ev.clientX - toque.x, dy = ev.clientY - toque.y;
    if (!toque.movido) {
      if (Math.hypot(dx, dy) < 6) return;
      const dir = dirDe(toque.l);
      const esquina = toque.l[1] < H / 2 ? 't' : 'b';
      if (!(hoja && hoja.dir === dir)) {
        if (hoja) terminar(hoja.dir < 0);
        if (!empezar(dir, esquina)) { toque = null; return; }
      }
      toque.movido = true; toque.P0 = hoja.P.slice();
      estado = 'arrastre';
    }
    const k = doble ? 1 : 2;
    moverA([toque.P0[0] + dx * k, toque.P0[1] + dy * k]);
    toque.hist.push([performance.now(), ev.clientX]);
    if (toque.hist.length > 6) toque.hist.shift();
  });

  const soltar = ev => {
    if (!toque) return;
    const t = toque; toque = null;
    if (!t.movido) { if (ev.type === 'pointerup') pasar(dirDe(t.l)); return; }
    let vel = 0;
    if (t.hist.length > 1) {
      const [t1, x1] = t.hist[0], [t2, x2] = t.hist[t.hist.length - 1];
      vel = (x2 - x1) / Math.max(1, t2 - t1);
    }
    const dadaVuelta = Math.abs(vel) > 0.6 ? vel < 0 : hoja.P[0] < 0;
    animar(dadaVuelta, salida);
  };
  visor.addEventListener('pointerup', soltar);
  visor.addEventListener('pointercancel', soltar);

  // Con el mouse cerca de una esquina, la hoja se asoma.
  function asomar(l) {
    if (estado === 'anim' || estado === 'arrastre') return;
    const zona = Math.min(90, W * 0.18), r = zona * 0.45;
    let cual = null;
    for (const [dir, cx] of [[1, W], [-1, doble ? -W : 0]]) {
      for (const cy of [0, H]) {
        if (Math.hypot(l[0] - cx, l[1] - cy) < zona && puede(dir)) cual = { dir, esquina: cy ? 'b' : 't' };
      }
    }
    if (!doble && cual && cual.dir < 0) cual = null; // en simple solo se asoma la siguiente
    if (cual) {
      if (!hoja || hoja.dir !== cual.dir || (hoja.C[1] > 0) !== (cual.esquina === 'b')) {
        if (hoja) terminar(hoja.dir < 0);
        empezar(cual.dir, cual.esquina);
      }
      estado = 'asomo';
      const base = cual.dir > 0 ? hoja.C : hoja.E;
      const sy = cual.esquina === 'b' ? -1 : 1;
      const cerca = Math.min(1, 1.3 - Math.hypot(l[0] - base[0], l[1] - base[1]) / zona);
      moverA([base[0] - cual.dir * r * cerca, base[1] + sy * r * cerca]);
    } else if (estado === 'asomo') {
      animar(hoja.dir < 0, salida);
    }
  }
  visor.addEventListener('pointerleave', () => { if (estado === 'asomo' && !toque) animar(hoja.dir < 0, salida); });

  /* ---------- barra y teclado ---------- */

  barra.addEventListener('click', ev => {
    const b = ev.target.closest('[data-acc]');
    if (!b) return;
    if (b.dataset.acc === 'prev') pasar(-1);
    if (b.dataset.acc === 'next') pasar(1);
    if (b.dataset.acc === 'full') {
      if (document.fullscreenElement) document.exitFullscreen();
      else raiz.requestFullscreen?.();
    }
  });
  if (!document.fullscreenEnabled) btnFull.hidden = true;

  raiz.addEventListener('click', ev => {
    const a = ev.target.closest('a[data-goto]');
    if (a) { ev.preventDefault(); irA(+a.dataset.goto); }
  });

  addEventListener('keydown', ev => {
    if (ev.key === 'ArrowRight' || ev.key === 'PageDown') { ev.preventDefault(); pasar(1); }
    if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); pasar(-1); }
    if (ev.key === 'Home') irA(1);
    if (ev.key === 'End') irA(man.total);
  });

  /* ---------- tamaño ---------- */

  function medir() {
    terminarYa();
    if (hoja) terminar(hoja.dir < 0);
    const visible = (man && seq.length ? visibles()[0] : 0) || 1;
    const r = visor.getBoundingClientRect();
    const margen = Math.max(16, Math.min(r.width, r.height) * 0.04);
    const prop = man.ancho / man.alto;
    const calcular = reserva => {
      const aw = r.width - margen * 2, ah = r.height - reserva - margen * 2;
      const wDoble = Math.min(aw / 2, ah * prop), wSimple = Math.min(aw * (man.anillado ? 0.94 : 1), ah * prop);
      doble = wDoble >= wSimple * 0.8;
      W = Math.floor(doble ? wDoble : wSimple);
    };
    // La cabecera (título y logo) flota arriba; si choca con el libro, se le hace lugar.
    calcular(0);
    let reserva = 0;
    const bw = doble ? 2 * W : W, bh = W / prop;
    const libroRect = { l: r.left + (r.width - bw) / 2, t: r.top + (r.height - bh) / 2, r: r.left + (r.width + bw) / 2 };
    for (const nodo of cabeza.children) {
      if (nodo.hidden) continue;
      const c = nodo.getBoundingClientRect();
      if (c.right > libroRect.l && c.left < libroRect.r && c.bottom + 24 > libroRect.t) {
        reserva = Math.max(reserva, c.bottom - r.top + 24 - margen);
      }
    }
    if (reserva) calcular(reserva);
    visor.style.paddingTop = reserva + 'px';
    H = Math.round(W / prop);
    seq = doble ? seqD : seqS;
    tam = H * (devicePixelRatio || 1) > man.tamanos.sm * 1.05 ? 'lg' : 'sm';
    raiz.classList.toggle('is-single', !doble);
    libro.style.width = (doble ? 2 * W : W) + 'px';
    libro.style.height = H + 'px';
    escena.style.left = (doble ? W : 0) + 'px';
    for (const p of [pIzq, pDer, pFrente, pSolapa, sombraBajo, anillos, anillosSobre]) {
      p.style.width = W + 'px'; p.style.height = H + 'px';
    }
    pIzq.style.left = -W + 'px';
    anillar();
    const i = Math.max(1, seq.indexOf(visible));
    cur = doble ? (i % 2 ? i : i + 1) : i;
    mostrarPliego();
  }

  let rz = 0;
  new ResizeObserver(() => { cancelAnimationFrame(rz); rz = requestAnimationFrame(medir); }).observe(visor);

  /* ---------- arranque ---------- */

  fetch('manifest.json').then(r => r.json()).then(m => {
    man = m;
    if (m.fondo) raiz.style.setProperty('--fb-bg', m.fondo);
    cabeza.querySelector('h1').textContent = m.titulo;
    cabeza.querySelector('p').textContent = m.bajada || '';
    cabeza.querySelector('.fb-card').hidden = !m.titulo;
    if (m.anillado) { raiz.classList.add('is-ringed'); raiz.style.setProperty('--fb-ring', m.anillado); }
    barra.querySelector('[data-acc=pdf]').href = m.pdf;
    const n = m.total;
    seqS = [undefined];
    for (let i = 1; i <= n; i++) seqS.push(i);
    seqD = seqS.slice();
    if (n % 2) seqD.splice(n, 0, 0); // blanca antes de la contratapa
    const h = /#p=(\d+)/.exec(location.hash);
    seq = seqD;
    cur = 1;
    medir();
    if (h) irA(Math.min(n, Math.max(1, +h[1])));
    const tapa = new Image();
    tapa.onload = tapa.onerror = () => raiz.classList.add('is-ready');
    tapa.src = src(1);
  }).catch(() => { cargando.textContent = 'No se pudo cargar el libro.'; });
})();

/* ==========================================================================
   ACTIVOS DE CIUDAD — Ciudad Juan Bosch
   · Vista satelital por mosaicos en caché de Esri (World Imagery) colocados
     sobre el Master Plan con la georreferencia calculada (lon/lat → SVG).
   · Capas de activos levantados en campo (imbornales; luego postes, rampas…)
     y capa de charcos de la Dirección Técnica (opcional, archivo local).
   · Panel compacto tipo desplegable, como los filtros de Estado de Obra.

   Datos: data/activos_cjb.json (público) y data/charcos_cjb.json (local,
   fuera del repositorio). Ambos los genera tools/generar_activos_cjb.py.
   ========================================================================== */
(function () {
    'use strict';

    const NS = 'http://www.w3.org/2000/svg';
    const DATA_URL = 'data/activos_cjb.json';
    const CHARCOS_URL = 'data/charcos_cjb.json';
    const STORE_KEY = 'vbc-activos-cjb-v2';
    const UBIC_LABEL = { 'Calle': 'En calles', 'Dentro de lote': 'Dentro de lotes', 'Fuera de lotes del Master Plan': 'Fuera del Master Plan' };
    const CRIT_ORDEN = { rojo: 3, amarillo: 2, verde: 1 };
    const EARTH = 40075016.686;
    const ZOOMS_SAT = [12, 13, 14, 15, 16, 17, 18, 19];
        // Símbolos para los imbornales (el usuario elige en el panel)
    const SIMBOLOS = {
        rejilla: { nombre: 'Rejilla',  icono: '▦', w: 1.0, h: 1.0, ancla: 'centro' },
        pin:     { nombre: 'Marcador', icono: '📍', w: 1.0, h: 1.35, ancla: 'abajo' },
        embudo:  { nombre: 'Flecha',   icono: '▼', w: 1.0, h: 1.0, ancla: 'centro' },
        punto:   { nombre: 'Punto',    icono: '●', w: 1.0, h: 1.0, ancla: 'centro' }
    };
    const M_POR_UNIDAD = 4.3184;

    const Activos = {
        data: null,
        charcos: [],
        cats: [],
        svg: null,
        els: new Map(),        // id imbornal -> <circle>
        chEls: new Map(),      // id charco -> <g>
        byId: new Map(),
        chById: new Map(),
        cotaRange: [0, 1],
        px: 1,                 // píxeles de pantalla por unidad SVG
        state: {
            capas: { satelite: false },
            subs: {},
            ubic: { 'Calle': true, 'Dentro de lote': true, 'Fuera de lotes del Master Plan': true },
            calle: '',
            colorBy: 'tipo',
            simbolo: 'rejilla',
            satOpacity: 1,
            lotOpacity: 0.3,
            sel: null           // { tipo: 'imb' | 'charco', id }
        },

        /* ============================================================ INIT */
        async init() {
            if (!(await this.waitForMap())) { console.warn('[Activos] El mapa no cargó; módulo inactivo.'); return; }
            try {
                this.data = await (await fetch(DATA_URL, { cache: 'no-store' })).json();
            } catch (e) { console.error('[Activos] No se pudo leer ' + DATA_URL, e); return; }
            try {
                const r = await fetch(CHARCOS_URL, { cache: 'no-store' });
                if (r.ok) {
                    const ch = await r.json();
                    this.charcos = ch.charcos || [];
                    this.charcosCat = ch.categoria;
                }
            } catch (e) { /* sin capa de charcos local */ }

            this.svg = document.querySelector('#mapContainer svg');
            this.data.activos.forEach(a => this.byId.set(a.id, a));
            this.charcos.forEach(c => this.chById.set(c.id, c));
            const cotas = this.data.activos.map(a => a.cota).filter(v => typeof v === 'number');
            this.cotaRange = [Math.min(...cotas), Math.max(...cotas)];

            // Categorías: las del archivo público + charcos si existe el archivo local
            this.cats = this.data.categorias.map(c => (c.id === 'charcos' && this.charcos.length && this.charcosCat)
                ? { ...this.charcosCat } : { ...c });
            this.cats.forEach(c => {
                c.disponible = c.estado !== 'pendiente';
                this.state.capas[c.id] = false;
                c.subcategorias.forEach(s => { this.state.subs[s.id] = true; });
            });
            this.loadPrefs();

            this.buildGrafo();
            this.buildSatellite();
            this.buildLayers();
            this.buildPanel();
            this.buildDetailsCard();
            this.hookApp();
            this.refresh();
            console.log(`🗺️ Activos de Ciudad: ${this.data.activos.length} imbornales · ${this.charcos.length} charcos`);
        },

        waitForMap() {
            return new Promise(resolve => {
                let tries = 0;
                const t = setInterval(() => {
                    const svg = document.querySelector('#mapContainer svg');
                    const ready = svg && window.App && App.State && App.State.svgElementsMap.size > 0;
                    if (ready || ++tries > 150) { clearInterval(t); resolve(!!ready); }
                }, 200);
            });
        },

        loadPrefs() {
            try {
                const p = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
                if (p.capas) Object.keys(p.capas).forEach(k => {
                    if (k in this.state.capas) {
                        const cat = this.cats.find(c => c.id === k);
                        this.state.capas[k] = !!p.capas[k] && (k === 'satelite' || !!cat?.disponible);
                    }
                });
                if (p.subs) Object.assign(this.state.subs, p.subs);
                ['colorBy', 'satOpacity', 'lotOpacity', 'simbolo'].forEach(k => { if (p[k] !== undefined) this.state[k] = p[k]; });
                if (!SIMBOLOS[this.state.simbolo]) this.state.simbolo = 'rejilla';
            } catch (e) { /* almacenamiento no disponible */ }
        },
        savePrefs() {
            try {
                const { capas, subs, colorBy, satOpacity, lotOpacity, simbolo } = this.state;
                localStorage.setItem(STORE_KEY, JSON.stringify({ capas, subs, colorBy, satOpacity, lotOpacity, simbolo }));
            } catch (e) { /* almacenamiento no disponible */ }
        },

        /* ======================================== GRAFO DE ESCORRENTÍA */
        /** Une cada imbornal con sus vecinos cercanos sobre la vía; la cota indica hacia dónde baja el agua. */
        buildGrafo() {
            const R = 95 / M_POR_UNIDAD;            // vecinos a menos de ~95 m
            const pts = this.data.activos;
            this.vecinos = new Map();
            pts.forEach(a => {
                const cand = [];
                pts.forEach(b => {
                    if (a === b) return;
                    const d = Math.hypot(a.svg_x - b.svg_x, a.svg_y - b.svg_y);
                    if (d > R) return;
                    // misma calle, o muy cerca (cruces e intersecciones)
                    if (a.calle_id && b.calle_id && a.calle_id !== b.calle_id && d > 30 / M_POR_UNIDAD) return;
                    cand.push({ b, d });
                });
                cand.sort((p, q) => p.d - q.d);
                this.vecinos.set(a.id, cand.slice(0, 6));
            });
        },

        /** Camino que sigue el agua desde un imbornal hasta el charco: cuesta abajo y acercándose. */
        caminoHasta(inicio, ch) {
            const dist = a => Math.hypot(a.svg_x - ch.svg_x, a.svg_y - ch.svg_y);
            const cerca = 35 / M_POR_UNIDAD;
            const camino = [inicio];
            const vistos = new Set([inicio.id]);
            let act = inicio;
            for (let i = 0; i < 40 && dist(act) > cerca; i++) {
                const opciones = (this.vecinos.get(act.id) || [])
                    .map(v => v.b)
                    .filter(b => !vistos.has(b.id) && dist(b) < dist(act) - 3 / M_POR_UNIDAD && b.cota <= act.cota + 0.15);
                if (!opciones.length) break;
                // Preferir el que más baja; a igualdad, el que más se acerca
                opciones.sort((p, q) => (p.cota - q.cota) || (dist(p) - dist(q)));
                act = opciones[0];
                vistos.add(act.id);
                camino.push(act);
            }
            return camino;
        },

        /** Escorrentía de la calle que llega al charco: imbornales aguas arriba (más altos) conectados. */
        aguasArriba(ch) {
            const R0 = 45 / M_POR_UNIDAD, MAX = 320 / M_POR_UNIDAD;
            const dist = a => Math.hypot(a.svg_x - ch.svg_x, a.svg_y - ch.svg_y);
            const semillas = this.data.activos.filter(a => dist(a) <= R0);
            const aristas = [];
            const vistos = new Set(semillas.map(a => a.id));
            let frente = semillas;
            for (let nivel = 0; nivel < 8 && frente.length; nivel++) {
                const sig = [];
                frente.forEach(a => (this.vecinos.get(a.id) || []).forEach(({ b }) => {
                    if (vistos.has(b.id) || dist(b) > MAX || b.cota < a.cota + 0.03 || dist(b) <= dist(a)) return;
                    vistos.add(b.id);
                    aristas.push([b, a]);                     // el agua va de b (más alto) a a
                    sig.push(b);
                }));
                frente = sig;
            }
            return { semillas, aristas };
        },

        /* ================================================ SATÉLITE (lienzo de mosaicos)
           La imagen se pinta en un <canvas> fijo detrás del mapa, no dentro del SVG:
           · mover o hacer zoom solo vuelve a pintar imágenes ya descargadas (rápido);
           · nunca se borra lo que se ve: mientras llega el detalle se muestra el nivel
             anterior ampliado, y se cambia sin parpadeo cuando el nuevo está listo;
           · se descargan solo los mosaicos visibles, del centro hacia afuera, y se
             guardan en memoria para volver a usarlos. */
        buildSatellite() {
            const sat = this.data.meta.satelite;
            const A = sat.lonlat_a_svg;
            const area = document.querySelector('.panel-map');
            const cv = document.createElement('canvas');
            cv.className = 'act-sat-canvas';
            cv.setAttribute('aria-hidden', 'true');
            cv.style.display = 'none';
            area.insertBefore(cv, area.firstChild);
            this.sat = {
                cfg: sat, A,
                det: A[0] * A[4] - A[1] * A[3],
                canvas: cv, ctx: cv.getContext('2d'),
                group: cv,                // compatibilidad: display / opacidad
                cache: new Map(),         // "z/x/y" -> { img, ok, err, cargando, uso }
                mats: new Map(),          // "z/x/y" -> matriz mosaico→SVG
                cola: [], enVuelo: 0, pending: 0,
                z: null, frame: 0, necesarios: []
            };
            const attr = document.createElement('div');
            attr.className = 'activos-atribucion';
            attr.innerHTML = `<span class="act-sat-fecha"></span><span>${sat.atribucion}</span>`;
            area.appendChild(attr);
            this.sat.fechaEl = attr.querySelector('.act-sat-fecha');
        },

        ll2svg(lon, lat) {
            const A = this.sat.A;
            return [A[0] * lon + A[1] * lat + A[2], A[3] * lon + A[4] * lat + A[5]];
        },
        svg2ll(x, y) {
            const A = this.sat.A, d = this.sat.det;
            const u = x - A[2], v = y - A[5];
            return [(A[4] * u - A[1] * v) / d, (-A[3] * u + A[0] * v) / d];
        },
        lon2tx: (lon, z) => (lon + 180) / 360 * 2 ** z,
        lat2ty: (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z; },
        tx2lon: (x, z) => x / 2 ** z * 360 - 180,
        ty2lat: (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(Math.sinh(n)); },

        rangoTiles(z, x0, y0, x1, y1) {
            const [lonA, latA] = this.svg2ll(x0, y0), [lonB, latB] = this.svg2ll(x1, y1);
            const [lonC, latC] = this.svg2ll(x0, y1), [lonD, latD] = this.svg2ll(x1, y0);
            const lons = [lonA, lonB, lonC, lonD], lats = [latA, latB, latC, latD];
            return [Math.floor(this.lon2tx(Math.min(...lons), z)), Math.floor(this.lon2tx(Math.max(...lons), z)),
                    Math.floor(this.lat2ty(Math.max(...lats), z)), Math.floor(this.lat2ty(Math.min(...lats), z))];
        },

        /** Matriz que lleva un píxel del mosaico (0‥256) a coordenadas del SVG. */
        matTile(z, x, y) {
            const k = `${z}/${x}/${y}`;
            let m = this.sat.mats.get(k);
            if (m) return m;
            const lon0 = this.tx2lon(x, z), lon1 = this.tx2lon(x + 1, z);
            const lat0 = this.ty2lat(y, z), lat1 = this.ty2lat(y + 1, z);
            const p00 = this.ll2svg(lon0, lat0), p10 = this.ll2svg(lon1, lat0), p01 = this.ll2svg(lon0, lat1);
            m = [(p10[0] - p00[0]) / 256, (p10[1] - p00[1]) / 256, (p01[0] - p00[0]) / 256, (p01[1] - p00[1]) / 256, p00[0], p00[1]];
            if (this.sat.mats.size > 4000) this.sat.mats.clear();
            this.sat.mats.set(k, m);
            return m;
        },

        tile(z, x, y) {
            const k = `${z}/${x}/${y}`;
            let t = this.sat.cache.get(k);
            if (!t) { t = { k, z, x, y, img: null, ok: false, err: 0, cargando: false, uso: 0 }; this.sat.cache.set(k, t); }
            return t;
        },

        cargarTile(t) {
            const s = this.sat;
            t.cargando = true;
            s.enVuelo++;
            const img = new Image();
            img.decoding = 'async';
            const fin = ok => {
                t.cargando = false; s.enVuelo--;
                if (ok) { t.img = img; t.ok = true; s.okAlguna = true; s.version = (s.version || 0) + 1; this.satPintarPronto(); }
                else { t.err = Date.now(); s.errores = (s.errores || 0) + 1; }
                this.satBombear();
                this.satStatus();
            };
            img.onload = () => { (img.decode ? img.decode() : Promise.resolve()).then(() => fin(true), () => fin(true)); };
            img.onerror = () => fin(false);
            img.src = s.cfg.tiles_url.replace('{z}', t.z).replace('{x}', t.x).replace('{y}', t.y);
        },

        satBombear() {
            const s = this.sat;
            while (s.enVuelo < 8 && s.cola.length) {
                const t = s.cola.shift();
                if (!t.ok && !t.cargando) this.cargarTile(t);
            }
            this.satStatus();
        },

        satStatus() {
            const el = document.getElementById('actSatStatus');
            const s = this.sat;
            s.pending = s.enVuelo + s.cola.length;
            if (!el) return;
            if (s.pending > 0) el.textContent = 'Cargando…';
            else if (s.errores && !s.okAlguna) el.textContent = 'Sin conexión';
            else el.textContent = '';
        },

        /** Afín SVG → píxeles del lienzo (incluye la escala de pantalla del dispositivo). */
        satAfin() {
            const M = this.svg.getScreenCTM();
            if (!M) return null;
            const r = this.sat.canvas.parentNode.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            return { a: M.a * dpr, b: M.b * dpr, c: M.c * dpr, d: M.d * dpr, e: (M.e - r.left) * dpr, f: (M.f - r.top) * dpr, r, dpr };
        },

        /** Nivel de detalle: el más bajo que se ve nítido, con un margen para no saltar de nivel a cada paso. */
        satNivel(pxDev, lat) {
            const zc = Math.log2(EARTH * Math.cos(lat * Math.PI / 180) * pxDev / (256 * M_POR_UNIDAD));
            const zMin = ZOOMS_SAT[0], zMax = ZOOMS_SAT[ZOOMS_SAT.length - 1];
            const cur = this.sat.z;
            if (cur !== null && cur >= Math.min(zc - 0.35, zMax) && cur <= Math.max(zc + 0.9, zMin)) return cur;
            return Math.min(zMax, Math.max(zMin, Math.ceil(zc - 0.15)));
        },

        satPintarPronto() {
            if (this.sat.raf) return;
            this.sat.raf = requestAnimationFrame(() => { this.sat.raf = 0; this.satPintar(); });
        },

        /** Repinta en cada cuadro durante `ms` (cubre la animación de zoom y el arrastre). */
        satAnimar(ms = 450) {
            const s = this.sat;
            s.hasta = Math.max(s.hasta || 0, performance.now() + ms);
            if (s.loop) return;
            const paso = () => {
                this.satPintar();
                s.loop = performance.now() < s.hasta ? requestAnimationFrame(paso) : 0;
            };
            s.loop = requestAnimationFrame(paso);
        },

        dibujarTile(ctx, T, img, m, sx, sy, sw) {
            // Compone afín de pantalla ∘ matriz del mosaico
            ctx.setTransform(
                T.a * m[0] + T.c * m[1], T.b * m[0] + T.d * m[1],
                T.a * m[2] + T.c * m[3], T.b * m[2] + T.d * m[3],
                T.a * m[4] + T.c * m[5] + T.e, T.b * m[4] + T.d * m[5] + T.f);
            // Medio píxel de solape para que no se vean costuras entre mosaicos
            const escala = Math.hypot(T.a * m[0] + T.c * m[1], T.b * m[0] + T.d * m[1]) || 1;
            const pad = 0.5 / escala;
            ctx.drawImage(img, sx, sy, sw, sw, sx - pad, sy - pad, sw + 2 * pad, sw + 2 * pad);
        },

        satPintar() {
            const s = this.sat;
            if (!this.state.capas.satelite) return;
            const T = this.satAfin();
            if (!T) return;
            const cv = s.canvas, ctx = s.ctx;
            const W = Math.max(1, Math.round(T.r.width * T.dpr)), H = Math.max(1, Math.round(T.r.height * T.dpr));
            // Mientras el mapa se mueve se pinta en calidad rápida; al detenerse, una pasada nítida
            const rapido = !!cv.parentNode.classList?.contains('mapa-moviendo');
            // Nada cambió desde el último cuadro (misma vista, mismos mosaicos): no repintar
            const firma = `${W}|${H}|${T.a.toFixed(6)}|${T.b.toFixed(6)}|${T.c.toFixed(6)}|${T.d.toFixed(6)}|${T.e.toFixed(2)}|${T.f.toFixed(2)}|${s.version || 0}|${rapido}`;
            if (firma === s.firma) return;
            s.firma = firma;
            if (rapido) { clearTimeout(s.tHQ); s.tHQ = setTimeout(() => this.satPintarPronto(), 260); }
            if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, W, H);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = rapido ? 'low' : 'high';

            // Zona visible en coordenadas del SVG
            const det = T.a * T.d - T.b * T.c;
            if (!det) return;
            const inv = (X, Y) => { const u = X - T.e, v = Y - T.f; return [(T.d * u - T.c * v) / det, (-T.b * u + T.a * v) / det]; };
            const q = [inv(0, 0), inv(W, 0), inv(0, H), inv(W, H)];
            const [rx, ry, rw, rh] = s.cfg.svg_rect;
            const lim = 6000 / M_POR_UNIDAD;
            const box = [Math.max(rx - lim, Math.min(...q.map(p => p[0]))), Math.max(ry - lim, Math.min(...q.map(p => p[1]))),
                         Math.min(rx + rw + lim, Math.max(...q.map(p => p[0]))), Math.min(ry + rh + lim, Math.max(...q.map(p => p[1])))];
            if (box[2] <= box[0] || box[3] <= box[1]) return;

            const lat = this.svg2ll(rx + rw / 2, ry + rh / 2)[1];
            let z = this.satNivel(Math.hypot(T.a, T.b), lat);
            const contar = zz => { const [a, b, c, d] = this.rangoTiles(zz, ...box); return (b - a + 1) * (d - c + 1); };
            while (z > ZOOMS_SAT[0] && contar(z) > 260) z--;
            s.z = z;
            s.frame++;

            const [tx0, tx1, ty0, ty1] = this.rangoTiles(z, ...box);
            const lista = [];
            for (let x = tx0; x <= tx1; x++) for (let y = ty0; y <= ty1; y++) lista.push(this.tile(z, x, y));

            // 1) Donde falta el detalle: nivel superior ya descargado (ampliado) o, al alejar, los hijos
            const st = { exactos: 0, respaldo: 0, vacios: 0 };
            lista.forEach(t => {
                t.uso = s.frame;
                if (t.ok) { st.exactos++; return; }
                for (let k = 1; k <= 7 && z - k >= 0; k++) {
                    const pz = z - k, px = t.x >> k, py = t.y >> k;
                    const p = s.cache.get(`${pz}/${px}/${py}`);
                    if (p && p.ok) {
                        p.uso = s.frame;
                        const tam = 256 / 2 ** k;
                        this.dibujarTile(ctx, T, p.img, this.matTile(pz, px, py), (t.x - (px << k)) * tam, (t.y - (py << k)) * tam, tam);
                        st.respaldo++;
                        return;
                    }
                }
                let hijos = 0;
                for (let i = 0; i < 4; i++) {
                    const cx = t.x * 2 + (i & 1), cy = t.y * 2 + (i >> 1);
                    const h = s.cache.get(`${z + 1}/${cx}/${cy}`);
                    if (h && h.ok) { h.uso = s.frame; hijos++; this.dibujarTile(ctx, T, h.img, this.matTile(z + 1, cx, cy), 0, 0, 256); }
                }
                if (hijos) st.respaldo++; else st.vacios++;
            });
            // 2) El nivel correcto encima
            lista.forEach(t => { if (t.ok) this.dibujarTile(ctx, T, t.img, this.matTile(z, t.x, t.y), 0, 0, 256); });

            s.stats = st;
            s.necesarios = { z, box, lista };
            clearTimeout(s.tq);
            s.tq = setTimeout(() => this.satProgramar(), 90);
        },

        /** Arma la cola de descarga: primero una base liviana (z−3) y luego el detalle, del centro hacia afuera. */
        satProgramar() {
            const s = this.sat;
            const n = s.necesarios;
            if (!n || !n.lista) return;
            const ahora = Date.now();
            const util = t => !t.ok && !t.cargando && (!t.err || ahora - t.err > 30000);
            const cx = (n.box[0] + n.box[2]) / 2, cy = (n.box[1] + n.box[3]) / 2;
            const [clon, clat] = this.svg2ll(cx, cy);
            const ordenar = (arr, z) => {
                const fx = this.lon2tx(clon, z) - 0.5, fy = this.lat2ty(clat, z) - 0.5;
                return arr.sort((a, b) => Math.hypot(a.x - fx, a.y - fy) - Math.hypot(b.x - fx, b.y - fy));
            };
            const zb = Math.max(ZOOMS_SAT[0], n.z - 3);
            const base = [];
            if (zb < n.z) {
                const [a, b, c, d] = this.rangoTiles(zb, ...n.box);
                for (let x = a; x <= b; x++) for (let y = c; y <= d; y++) base.push(this.tile(zb, x, y));
                base.forEach(t => { t.uso = s.frame; });
            }
            s.cola = [...ordenar(base.filter(util), zb), ...ordenar(n.lista.filter(util), n.z)];
            this.satBombear();
            this.satPodar();
            clearTimeout(s.tf);
            s.tf = setTimeout(() => this.satFecha(clon, clat, n.z), 700);
        },

        /** Libera memoria: conserva lo usado recientemente. */
        satPodar() {
            const s = this.sat;
            if (s.cache.size <= 700) return;
            const viejos = [...s.cache.values()].filter(t => !t.cargando && t.uso < s.frame).sort((a, b) => a.uso - b.uso);
            for (const t of viejos.slice(0, s.cache.size - 500)) { s.cache.delete(t.k); t.img = null; }
        },

        /** Fecha de la imagen que se está viendo (metadatos públicos de Esri). */
        async satFecha(lon, lat, z) {
            const s = this.sat;
            if (!s.fechaEl) return;
            try {
                if (!s.metaSrv) {
                    const r = await fetch('https://metadata.maptiles.arcgis.com/arcgis/rest/services?f=json');
                    const j = await r.json();
                    s.metaSrv = j.services.map(x => x.name).filter(x => /^World_Imagery_Metadata_\d{4}_r\d+$/.test(x)).sort().pop();
                    if (!s.metaSrv) return;
                }
                const k = `${lon.toFixed(3)},${lat.toFixed(3)},${z >= 19 ? 19 : 18}`;
                s.fechas = s.fechas || new Map();
                let txt = s.fechas.get(k);
                if (txt === undefined) {
                    const d = 0.002;
                    const u = `https://metadata.maptiles.arcgis.com/arcgis/rest/services/${s.metaSrv}/MapServer/identify?geometry=${lon},${lat}` +
                        `&geometryType=esriGeometryPoint&sr=4326&layers=all:4,5&tolerance=0&mapExtent=${lon - d},${lat - d},${lon + d},${lat + d}` +
                        `&imageDisplay=400,400,96&returnGeometry=false&f=json`;
                    const j = await (await fetch(u)).json();
                    const res = (j.results || []).map(x => x.attributes).find(a => +a.MinMapLevel <= z && z <= +a.MaxMapLevel) || (j.results || [])[0]?.attributes;
                    txt = '';
                    if (res && /^\d{8}$/.test(res.SRC_DATE)) {
                        const f = new Date(+res.SRC_DATE.slice(0, 4), +res.SRC_DATE.slice(4, 6) - 1, +res.SRC_DATE.slice(6, 8));
                        txt = `Imagen del ${f.toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}` +
                              (res.SRC_RES ? ` · ${(+res.SRC_RES).toFixed(2).replace('.', ',')} m/píxel` : '');
                    }
                    s.fechas.set(k, txt);
                }
                s.fechaEl.textContent = txt;
                s.fechaEl.style.display = txt ? '' : 'none';
            } catch (e) { /* sin conexión a los metadatos: se omite la fecha */ }
        },

        /** Compatibilidad con llamadas anteriores. */
        updateTiles() { this.satPintar(); },

        visibleBox() {
            const area = document.querySelector('.panel-map');
            const ctm = this.svg.getScreenCTM();
            if (!area || !ctm) return null;
            const r = area.getBoundingClientRect();
            const inv = ctm.inverse();
            const pts = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([x, y]) => {
                const p = this.svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(inv);
            });
            return [Math.min(...pts.map(p => p.x)), Math.min(...pts.map(p => p.y)),
                    Math.max(...pts.map(p => p.x)), Math.max(...pts.map(p => p.y))];
        },

        /* ======================================================== CAPAS */
        buildLayers() {
            const mk = id => { const g = document.createElementNS(NS, 'g'); g.id = id; this.svg.appendChild(g); return g; };
            this.gRel = mk('capaRelaciones');
            this.gImb = mk('capaActivos');
            this.gCh = mk('capaCharcos');

            // Flecha para las líneas de flujo lote → charco
            const defs = document.createElementNS(NS, 'defs');
            defs.innerHTML = ['rojo', 'amarillo', 'verde', 'agua'].map(c => `
                <marker id="actFlecha-${c}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto">
                    <path d="M0,0 L10,5 L0,10 z" class="act-flecha-${c}"/>
                </marker>`).join('');
            this.gRel.appendChild(defs);

            // Símbolos (se colorean con currentColor; detalles en blanco)
            const defsSim = document.createElementNS(NS, 'defs');
            defsSim.innerHTML = `
                <symbol id="imb-pin" viewBox="0 0 24 32"><path d="M12 31C12 31 3 19.6 3 11.5a9 9 0 0 1 18 0C21 19.6 12 31 12 31z" fill="currentColor" stroke="#fff" stroke-width="1.6"/><circle cx="12" cy="11.5" r="3.6" fill="#fff"/></symbol>
                <symbol id="imb-pin-doble" viewBox="0 0 24 32"><path d="M12 31C12 31 3 19.6 3 11.5a9 9 0 0 1 18 0C21 19.6 12 31 12 31z" fill="currentColor" stroke="#fff" stroke-width="1.6"/><rect x="7" y="8.2" width="4" height="6.6" rx=".8" fill="#fff"/><rect x="13" y="8.2" width="4" height="6.6" rx=".8" fill="#fff"/></symbol>
                <symbol id="imb-rejilla" viewBox="0 0 24 24"><rect x="2.5" y="2.5" width="19" height="19" rx="4" fill="currentColor" stroke="#fff" stroke-width="1.8"/><path d="M8 7v10M12 7v10M16 7v10" stroke="#fff" stroke-width="2" stroke-linecap="round"/></symbol>
                <symbol id="imb-rejilla-doble" viewBox="0 0 24 24"><rect x="1.5" y="4.5" width="21" height="15" rx="3.5" fill="currentColor" stroke="#fff" stroke-width="1.8"/><path d="M12 6v12" stroke="#fff" stroke-width="1.6"/><path d="M5.5 8.5v7M8.5 8.5v7M15.5 8.5v7M18.5 8.5v7" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></symbol>
                <symbol id="imb-embudo" viewBox="0 0 24 24"><path d="M3 4.5h18L12 21z" fill="currentColor" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></symbol>
                <symbol id="imb-embudo-doble" viewBox="0 0 24 24"><path d="M3 4.5h18L12 21z" fill="currentColor" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 8.5h8" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></symbol>
                <symbol id="imb-punto" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="#fff" stroke-width="2.4"/></symbol>
                <symbol id="imb-punto-doble" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5" fill="currentColor" stroke="#fff" stroke-width="2.4"/><circle cx="12" cy="12" r="3.2" fill="#fff"/></symbol>`;
            this.gImb.appendChild(defsSim);

            [...this.data.activos].sort((p, q) => p.svg_y - q.svg_y).forEach(a => {
                const c = document.createElementNS(NS, 'use');
                c.setAttribute('class', 'activo-punto');
                c.dataset.id = a.id;
                c.addEventListener('click', ev => { ev.stopPropagation(); this.select('imb', a.id); });
                c.addEventListener('mouseenter', ev => this.showTip(ev, this.tipImb(a)));
                c.addEventListener('mousemove', ev => App.Map.updateTooltipPosition(ev));
                c.addEventListener('mouseleave', () => App.Map.hideTooltip());
                this.gImb.appendChild(c);
                this.els.set(a.id, c);
            });

            this.charcos.forEach(ch => {
                const g = document.createElementNS(NS, 'g');
                g.setAttribute('class', `charco crit-${ch.subcategoria}`);
                g.innerHTML = `<circle class="charco-halo"/><circle class="charco-nucleo"/><text class="charco-label"></text>`;
                g.querySelectorAll('circle').forEach(c => { c.setAttribute('cx', ch.svg_x); c.setAttribute('cy', ch.svg_y); });
                const t = g.querySelector('text');
                t.setAttribute('x', ch.svg_x); t.setAttribute('y', ch.svg_y); t.textContent = ch.id.replace(/^CH-0*/, '');
                g.addEventListener('click', ev => { ev.stopPropagation(); this.select('charco', ch.id); });
                g.addEventListener('mouseenter', ev => this.showTip(ev, this.tipCharco(ch)));
                g.addEventListener('mousemove', ev => App.Map.updateTooltipPosition(ev));
                g.addEventListener('mouseleave', () => App.Map.hideTooltip());
                this.gCh.appendChild(g);
                this.chEls.set(ch.id, g);
            });
            this.gClusters = document.createElementNS(NS, 'g');
            this.gClusters.id = 'capaCharcosGrupos';
            this.gCh.appendChild(this.gClusters);
        },

        visibleImb(a) {
            const s = this.state;
            if (!s.capas.drenaje_pluvial) return false;
            if (s.subs[a.subcategoria] === false) return false;
            if (!s.ubic[a.ubicacion]) return false;
            if (s.calle && a.calle_id !== s.calle) return false;
            return true;
        },
        visibleCharco(c) {
            return !!this.state.capas.charcos && this.state.subs[c.subcategoria] !== false;
        },

        colorImb(a) {
            if (this.state.colorBy === 'cota' && typeof a.cota === 'number') {
                const [lo, hi] = this.cotaRange;
                return this.ramp(Math.min(Math.max((a.cota - lo) / ((hi - lo) || 1), 0), 1));
            }
            const cat = this.cats.find(c => c.id === a.categoria);
            return cat?.subcategorias.find(s => s.id === a.subcategoria)?.color || '#0ea5e9';
        },
        // Cota baja (azul: donde se acumula el agua) → alta (ámbar)
        ramp(t) {
            const st = [[0, [29, 78, 216]], [0.5, [34, 197, 94]], [1, [245, 158, 11]]];
            const i = t > 0.5 ? 1 : 0, [t0, c0] = st[i], [t1, c1] = st[i + 1], k = (t - t0) / (t1 - t0);
            const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
            return `rgb(${c[0]},${c[1]},${c[2]})`;
        },

        /** Aplica capas, filtros y estilos. */
        refresh() {
            const s = this.state;
            // Satélite
            this.sat.group.style.display = s.capas.satelite ? '' : 'none';
            this.sat.group.style.opacity = s.satOpacity;
            document.body.classList.toggle('activos-sat-on', !!s.capas.satelite);
            document.documentElement.style.setProperty('--activos-lote-op', s.lotOpacity);

            let nImb = 0;
            const simId = this.state.simbolo in SIMBOLOS ? this.state.simbolo : 'rejilla';
            this.data.activos.forEach(a => {
                const u = this.els.get(a.id);
                const href = `#imb-${simId}${a.subcategoria === 'filtrante_doble' ? '-doble' : ''}`;
                if (u.getAttribute('href') !== href) u.setAttribute('href', href);
                const c = this.els.get(a.id);
                const v = this.visibleImb(a);
                c.style.display = v ? '' : 'none';
                c.style.color = this.colorImb(a);
                if (v) nImb++;
            });
            let nCh = 0;
            this.charcos.forEach(ch => { if (this.visibleCharco(ch)) nCh++; });
            this.counts = { imb: nImb, ch: nCh };
            // Con charcos visibles, los imbornales pasan a segundo plano
            this.gImb.classList.toggle('en-segundo-plano', !!s.capas.charcos && nCh > 0);
            if (s.sel && ((s.sel.tipo === 'imb' && !this.visibleImb(this.byId.get(s.sel.id))) ||
                          (s.sel.tipo === 'charco' && !this.visibleCharco(this.chById.get(s.sel.id))))) {
                this.clearSelection();
            }
            this.onZoom(true);
            this.updatePanel();
            this.savePrefs();
        },

        /** Tamaños estables en pantalla, agrupación de charcos y mosaicos según el zoom. */
        onZoom(inmediato) {
            const ctm = this.gImb.getScreenCTM();
            this.px = (ctm && Math.hypot(ctm.a, ctm.b)) || 1;
            const px = this.px;
            // Solo se desplazó (misma escala): no hace falta redimensionar símbolos
            if (!inmediato && this._pxUlt && Math.abs(px - this._pxUlt) / px < 1e-4) {
                if (this.state.capas.satelite) this.satPintarPronto();
                return;
            }
            this._pxUlt = px;
            // Tamaño en pantalla: crece suave con el zoom (7 px en la vista general → 18 px de cerca)
            const tamPx = Math.min(Math.max(7 * Math.pow(px / 0.65, 0.5), 7), 18);
            const enFondo = this.gImb.classList.contains('en-segundo-plano');
            const base = (enFondo ? tamPx * 0.8 : tamPx) / px;
            const sim = SIMBOLOS[this.state.simbolo] || SIMBOLOS.rejilla;
            this.els.forEach((c, id) => {
                const a = this.byId.get(id);
                const sel = this.state.sel?.tipo === 'imb' && this.state.sel.id === id;
                const k = sel ? 1.7 : c.classList.contains('cercano') ? 1.35 : 1;
                const w = base * sim.w * k, h = base * sim.h * k;
                c.setAttribute('width', w);
                c.setAttribute('height', h);
                c.setAttribute('x', a.svg_x - w / 2);
                c.setAttribute('y', sim.ancla === 'abajo' ? a.svg_y - h : a.svg_y - h / 2);
            });
            this.layoutCharcos();
            if (this.state.capas.satelite) this.satPintarPronto();
        },

        layoutCharcos() {
            if (!this.charcos.length) return;
            const px = this.px;
            const tam = { rojo: 12, amarillo: 10, verde: 8 };
            const visibles = this.charcos.filter(c => this.visibleCharco(c));
            const agrupar = px < 1.5 && !this.state.sel;      // vista general: agrupar puntos cercanos
            const celda = 40 / px;                             // 40 px de pantalla
            const grupos = new Map();
            visibles.forEach(c => {
                const k = agrupar ? `${Math.floor(c.svg_x / celda)}:${Math.floor(c.svg_y / celda)}` : c.id;
                if (!grupos.has(k)) grupos.set(k, []);
                grupos.get(k).push(c);
            });
            this.gClusters.replaceChildren();
            const enGrupo = new Set();
            grupos.forEach(lista => {
                if (lista.length < 2) return;
                lista.forEach(c => enGrupo.add(c.id));
                const peor = lista.reduce((a, b) => CRIT_ORDEN[b.subcategoria] > CRIT_ORDEN[a.subcategoria] ? b : a);
                const x = lista.reduce((s, c) => s + c.svg_x, 0) / lista.length;
                const y = lista.reduce((s, c) => s + c.svg_y, 0) / lista.length;
                const r = Math.min(10 + lista.length * 1.6, 20) / px;
                const g = document.createElementNS(NS, 'g');
                g.setAttribute('class', `charco-grupo crit-${peor.subcategoria}`);
                const cuenta = { rojo: 0, amarillo: 0, verde: 0 };
                lista.forEach(c => cuenta[c.subcategoria]++);
                g.innerHTML = `<circle cx="${x}" cy="${y}" r="${r * 1.35}" class="charco-grupo-halo"/>
                    <circle cx="${x}" cy="${y}" r="${r}" class="charco-grupo-nucleo" style="stroke-width:${2 / px}"/>
                    <text x="${x}" y="${y}" style="font-size:${11 / px}px">${lista.length}</text>`;
                g.addEventListener('mouseenter', ev => this.showTip(ev,
                    `<strong>${lista.length} charcos</strong><br>${cuenta.rojo} muy críticos · ${cuenta.amarillo} intermedios · ${cuenta.verde} menores<br><em>Clic para acercar</em>`));
                g.addEventListener('mousemove', ev => App.Map.updateTooltipPosition(ev));
                g.addEventListener('mouseleave', () => App.Map.hideTooltip());
                g.addEventListener('click', ev => {
                    ev.stopPropagation();
                    App.Map.hideTooltip();
                    if (window.MapaUX) MapaUX.zoomAt(2.4, ev.clientX, ev.clientY);
                });
                this.gClusters.appendChild(g);
            });
            const sel = this.state.sel?.tipo === 'charco' ? this.state.sel.id : null;
            this.charcos.forEach(c => {
                const g = this.chEls.get(c.id);
                const v = this.visibleCharco(c) && !enGrupo.has(c.id);
                g.style.display = v ? '' : 'none';
                if (!v) return;
                const k = c.id === sel ? 1.35 : 1;
                g.querySelector('.charco-halo').setAttribute('r', tam[c.subcategoria] * 1.7 * k / px);
                g.querySelector('.charco-nucleo').setAttribute('r', tam[c.subcategoria] * 0.62 * k / px);
                g.querySelector('.charco-nucleo').style.strokeWidth = (2 / px).toFixed(3);
                const t = g.querySelector('.charco-label');
                t.style.fontSize = `${9 / px}px`;
                t.style.display = px > 2.2 ? '' : 'none';
                g.classList.toggle('atenuado', !!sel && c.id !== sel);
            });
            this.renderFlujos();
        },

        /* ===================================================== SELECCIÓN */
        select(tipo, id) {
            const s = this.state;
            if (s.sel && s.sel.tipo === tipo && s.sel.id === id) { this.clearSelection(); return; }
            this.clearSelection(true);
            s.sel = { tipo, id };
            if (App.State.selectedId) { App.State.selectedId = null; App.Map.render(); }
            document.getElementById('emptyState')?.style.setProperty('display', 'none');
            document.getElementById('lotDetails')?.classList.remove('active');
            if (tipo === 'imb') {
                const c = this.els.get(id);
                c?.classList.add('selected'); c?.parentNode.appendChild(c);
                this.renderImb(this.byId.get(id));
            } else {
                const ch = this.chById.get(id);
                this.chEls.get(id)?.classList.add('selected');
                this.focusCharco(ch);
                this.renderCharco(ch);
            }
            this.onZoom(true);
        },

        clearSelection(silencioso) {
            const s = this.state;
            if (!s.sel) return;
            if (s.sel.tipo === 'imb') this.els.get(s.sel.id)?.classList.remove('selected');
            else this.chEls.get(s.sel.id)?.classList.remove('selected');
            s.sel = null;
            this.clearFlujo();
            const card = document.getElementById('activoDetails');
            if (card) { card.classList.remove('active'); card.innerHTML = ''; }
            if (!silencioso) {
                if (!App.State.selectedId) document.getElementById('emptyState')?.style.setProperty('display', 'flex');
                this.onZoom(true);
            }
        },

        focusCharco(ch) {
            // Imbornales cercanos resaltados; el resto se atenúa
            this.gImb.classList.add('con-foco');
            (ch.imbornales_cercanos || []).forEach(id => this.els.get(id)?.classList.add('cercano'));
            this.flujos = [{ ch, lotes: ch.lotes_origen || [] }];
            this.renderFlujos();
        },

        /** Sentido del agua: por la calle (según la cota de los imbornales) y desde los lotes de origen. */
        renderFlujos() {
            [...this.gRel.querySelectorAll('.flujo, .flujo-salida, .flujo-borde')].forEach(e => e.remove());
            document.querySelectorAll('#mapContainer svg .lote.act-origen').forEach(e => e.classList.remove('act-origen'));
            const px = this.px;
            const colores = Object.fromEntries((this.cats.find(c => c.id === 'charcos')?.subcategorias || []).map(s => [s.id, s.color]));
            const linea = (pts, clase, ancho, crit) => {
                if (pts.length < 2) return;
                const d = 'M' + pts.map(q => `${q[0]},${q[1]}`).join(' L');
                const borde = document.createElementNS(NS, 'path');      // contorno blanco para que se lea sobre cualquier fondo
                borde.setAttribute('d', d);
                borde.setAttribute('class', 'flujo-borde');
                borde.style.strokeWidth = ((ancho + 2.2) / px).toFixed(3);
                this.gRel.appendChild(borde);
                const p = document.createElementNS(NS, 'path');
                p.setAttribute('d', d);
                p.setAttribute('class', clase);
                p.setAttribute('marker-mid', `url(#actFlecha-${crit})`);
                p.setAttribute('marker-end', `url(#actFlecha-${crit})`);
                p.style.strokeWidth = (ancho / px).toFixed(3);
                p.style.strokeDasharray = `${6 / px} ${5 / px}`;
                p.style.setProperty('--dash', `${-11 / px}`);
                this.gRel.appendChild(p);
            };
            // recorta el último tramo para que la flecha no quede dentro del círculo del charco
            const hastaCharco = (pts, ch) => {
                const [x0, y0] = pts[pts.length - 1];
                const d = Math.hypot(ch.svg_x - x0, ch.svg_y - y0) || 1, r = 14 / px;
                if (d > r) pts.push([ch.svg_x - (ch.svg_x - x0) / d * r, ch.svg_y - (ch.svg_y - y0) / d * r]);
                return pts;
            };
            (this.flujos || []).forEach(({ ch, lotes }) => {
                if (!ch || !this.visibleCharco(ch)) return;
                const crit = ch.subcategoria;
                // 1) Escorrentía por la calle hacia el charco
                const { semillas, aristas } = this.aguasArriba(ch);
                aristas.forEach(([b, a]) => linea([[b.svg_x, b.svg_y], [a.svg_x, a.svg_y]], `flujo calle crit-${crit}`, 2.4, 'agua'));
                semillas.forEach(a => linea(hastaCharco([[a.svg_x, a.svg_y]], ch), `flujo calle crit-${crit}`, 2.4, 'agua'));
                // 2) Agua que sale de cada lote de origen y corre por la vía hasta el charco
                lotes.forEach((lid, i) => {
                    const el = App.State.svgElementsMap.get(lid);
                    if (!el) return;
                    el.classList.add('act-origen');
                    el.style.setProperty('--act-origen-color', colores[crit] || '#dc2626');
                    const bb = el.getBBox();
                    const dBox = a => Math.hypot(Math.max(bb.x - a.svg_x, 0, a.svg_x - bb.x - bb.width), Math.max(bb.y - a.svg_y, 0, a.svg_y - bb.y - bb.height));
                    // Imbornal de su frente: el más cercano al lote, prefiriendo los que llevan al charco
                    const cand = this.data.activos.map(a => ({ a, d: dBox(a) })).filter(o => o.d <= 60 / M_POR_UNIDAD)
                        .sort((p, q) => (p.d + Math.hypot(p.a.svg_x - ch.svg_x, p.a.svg_y - ch.svg_y) * 0.25) - (q.d + Math.hypot(q.a.svg_x - ch.svg_x, q.a.svg_y - ch.svg_y) * 0.25));
                    const ancho = i === 0 ? 3.6 : 2.8;
                    if (!cand.length) {      // sin imbornales cerca: flecha directa
                        const c = [bb.x + bb.width / 2, bb.y + bb.height / 2];
                        linea(hastaCharco([c], ch), `flujo lote principal-${i === 0} crit-${crit}`, ancho, crit);
                        return;
                    }
                    const ini = cand[0].a;
                    // punto de salida: borde del lote frente a ese imbornal
                    const sx = Math.min(Math.max(ini.svg_x, bb.x), bb.x + bb.width), sy = Math.min(Math.max(ini.svg_y, bb.y), bb.y + bb.height);
                    const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
                    const salida = document.createElementNS(NS, 'path');
                    salida.setAttribute('d', `M${cx + (sx - cx) * 0.55},${cy + (sy - cy) * 0.55} L${ini.svg_x},${ini.svg_y}`);
                    salida.setAttribute('class', `flujo-salida crit-${crit}`);
                    salida.setAttribute('marker-end', `url(#actFlecha-${crit})`);
                    salida.style.strokeWidth = ((ancho + 1.4) / px).toFixed(3);
                    this.gRel.appendChild(salida);
                    const camino = this.caminoHasta(ini, ch).map(a => [a.svg_x, a.svg_y]);
                    linea(hastaCharco(camino, ch), `flujo lote${i === 0 ? ' principal' : ''} crit-${crit}`, ancho, crit);
                });
            });
        },

        clearFlujo() {
            this.flujos = [];
            this.renderFlujos();
            this.gImb.classList.remove('con-foco');
            this.els.forEach(c => c.classList.remove('cercano'));
        },

        /** Al elegir un lote: dibuja hacia qué charcos aporta agua. */
        flujoDesdeLote(loteId) {
            this.clearFlujo();
            if (!this.state.capas.charcos) return [];
            const destinos = this.charcos.filter(c => this.visibleCharco(c) && (c.lotes_origen || []).includes(loteId));
            this.flujos = destinos.map(ch => ({ ch, lotes: [loteId] }));
            this.renderFlujos();
            return destinos;
        },

        /* ===================================================== TOOLTIPS */
        lugar(a) {
            return a.ubicacion === 'Calle' ? (a.calle || 'Calle')
                : a.ubicacion === 'Dentro de lote' ? `Dentro del lote ${a.lote_id}` : a.ubicacion;
        },
        tipImb(a) {
            return `<strong>${a.id}</strong> · ${this.esc(a.tipo)}<br>${this.esc(this.lugar(a))}<br>Cota: <strong>${a.cota.toFixed(2)} m</strong>`;
        },
        tipCharco(c) {
            return `<strong>${c.id}</strong> · ${this.esc(c.tipo)}<br>${this.esc(c.referencia || this.lugar(c))}<br>` +
                `Lotes de origen: <strong>${(c.lotes_origen || []).join(', ') || '—'}</strong>`;
        },
        showTip(ev, html) {
            const tip = document.getElementById('mapTooltip');
            if (!tip) return;
            tip.innerHTML = html;
            tip.style.display = 'block';
            tip.classList.add('visible');
            App.Map.updateTooltipPosition(ev);
        },

        /* ===================================================== PANEL */
        buildPanel() {
            const mount = document.getElementById('activosCiudadPanel');
            if (!mount) return;
            const calles = {};
            this.data.activos.forEach(a => {
                if (!a.calle_id) return;
                calles[a.calle_id] = calles[a.calle_id] || { nombre: a.calle, n: 0 };
                calles[a.calle_id].n++;
            });
            const callesOpts = Object.entries(calles).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'))
                .map(([id, c]) => `<option value="${id}">${this.esc(c.nombre)} (${c.n})</option>`).join('');
            const ubicaciones = Object.keys(UBIC_LABEL).filter(u => this.data.activos.some(a => a.ubicacion === u));
            const nCat = id => id === 'charcos' ? this.charcos.length : this.data.activos.filter(a => a.categoria === id).length;

            const filasCapas = this.cats.map(c => {
                const subs = c.disponible ? c.subcategorias.map(s => `
                    <label class="multi-select-option act-opt act-sub" data-sub-row="${c.id}">
                        <input type="checkbox" data-sub="${s.id}" ${this.state.subs[s.id] !== false ? 'checked' : ''}>
                        <span class="act-dot" style="background:${s.color}"></span>
                        <span class="act-opt-txt">${this.esc(s.nombre)}</span>
                        <span class="dev-count-badge" data-count-sub="${s.id}">0</span>
                    </label>`).join('') : '';
                return `
                    <label class="multi-select-option act-opt ${c.disponible ? '' : 'act-pend'}" title="${this.esc(c.fuente)}">
                        <input type="checkbox" data-capa="${c.id}" ${c.disponible ? '' : 'disabled'} ${this.state.capas[c.id] ? 'checked' : ''}>
                        <span class="act-ico">${c.icono}</span>
                        <span class="act-opt-txt">${this.esc(c.nombre)}</span>
                        ${c.disponible ? `<span class="dev-count-badge">${nCat(c.id)}</span>` : '<span class="act-chip">Pendiente</span>'}
                    </label>${subs}`;
            }).join('');
            const enVal = (this.data.en_validacion || []).length;

            mount.innerHTML = `
                <div class="act-head">
                    <label class="filter-label" style="margin:0;">🗺️ Activos de Ciudad (<span id="actActiveCount">0</span>)</label>
                    <button type="button" id="actOcultarTodo" class="act-limpiar" style="display:none;">Ocultar todo</button>
                </div>
                <div class="multi-select-container" id="actMs">
                    <div class="multi-select-trigger" id="actTrigger" role="button" tabindex="0" aria-haspopup="true" aria-expanded="false">
                        <span id="actPlaceholder">Sin capas activas</span>
                        <span class="multi-select-arrow">▼</span>
                    </div>
                    <div class="multi-select-chips" id="actChips" style="display:none;"></div>
                    <div class="multi-select-dropdown act-dropdown" id="actDropdown" style="display:none;">
                        <div class="act-dd">
                            <div class="act-dd-title">Base</div>
                            <label class="multi-select-option act-opt">
                                <input type="checkbox" data-capa="satelite" ${this.state.capas.satelite ? 'checked' : ''}>
                                <span class="act-ico">🛰️</span><span class="act-opt-txt">Vista satelital</span>
                                <span class="act-sat-status" id="actSatStatus"></span>
                            </label>
                            <div class="act-sliders" id="actSatControls">
                                <label><span>Imagen</span><input type="range" id="actSatOpacity" min="0.2" max="1" step="0.05" value="${this.state.satOpacity}"></label>
                                <label><span>Lotes</span><input type="range" id="actLotOpacity" min="0" max="1" step="0.05" value="${this.state.lotOpacity}"></label>
                            </div>

                            <div class="act-dd-title">Capas</div>
                            ${filasCapas}

                            <div class="act-dd-sec" id="actFiltrosImb">
                                <div class="act-dd-title">Imbornales</div>
                                <div class="act-chips">
                                    ${ubicaciones.map(u => `<button type="button" class="act-toggle ${this.state.ubic[u] ? 'active' : ''}" data-ubic="${u}">${UBIC_LABEL[u]} <span data-count-ubic="${u}">0</span></button>`).join('')}
                                </div>
                                <select id="actCalleSelect" class="act-select">
                                    <option value="">Todas las calles</option>${callesOpts}
                                </select>
                                <div class="act-simbolos" role="radiogroup" aria-label="Símbolo de los imbornales">
                                    ${Object.entries(SIMBOLOS).map(([k, v]) => `<button type="button" role="radio" aria-checked="${this.state.simbolo === k}" data-simbolo="${k}" class="${this.state.simbolo === k ? 'active' : ''}" title="${v.nombre}"><svg viewBox="0 0 24 ${k === 'pin' ? 32 : 24}"><use href="#imb-${k}"/></svg><span>${v.nombre}</span></button>`).join('')}
                                </div>
                                <div class="act-seg">
                                    <button type="button" data-colorby="tipo" class="${this.state.colorBy === 'tipo' ? 'active' : ''}">Color por tipo</button>
                                    <button type="button" data-colorby="cota" class="${this.state.colorBy === 'cota' ? 'active' : ''}">Color por cota</button>
                                </div>
                            </div>

                            <div class="act-dd-foot">
                                <button type="button" class="act-link-btn" id="actExport">⬇ Inventario CSV</button>
                                ${enVal ? `<span class="act-val" title="Pendientes de confirmar con Verasol; no se muestran">⏳ ${enVal} en validación</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="act-legend" id="actLegend"></div>`;

            const $ = id => document.getElementById(id);
            const ms = $('actMs'), dd = $('actDropdown'), trig = $('actTrigger');
            const abrir = v => {
                ms.classList.toggle('open', v); dd.style.display = v ? 'flex' : 'none';
                trig.setAttribute('aria-expanded', String(v));
            };
            trig.addEventListener('click', e => { e.stopPropagation(); abrir(dd.style.display === 'none'); });
            trig.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(dd.style.display === 'none'); } });
            dd.addEventListener('click', e => e.stopPropagation());
            // pointerdown en captura: cierra aunque el clic caiga en un punto del mapa que detiene la propagación
            document.addEventListener('pointerdown', e => { if (dd.style.display !== 'none' && !ms.contains(e.target)) abrir(false); }, true);
            document.addEventListener('keydown', e => { if (e.key === 'Escape' && dd.style.display !== 'none') abrir(false); });

            mount.querySelectorAll('[data-capa]').forEach(cb => cb.addEventListener('change', () => {
                this.state.capas[cb.dataset.capa] = cb.checked;
                this.refresh();
            }));
            mount.querySelectorAll('[data-sub]').forEach(cb => cb.addEventListener('change', () => {
                this.state.subs[cb.dataset.sub] = cb.checked; this.refresh();
            }));
            mount.querySelectorAll('[data-ubic]').forEach(b => b.addEventListener('click', () => {
                const u = b.dataset.ubic;
                this.state.ubic[u] = !this.state.ubic[u];
                b.classList.toggle('active', this.state.ubic[u]);
                this.refresh();
            }));
            $('actCalleSelect').addEventListener('change', e => {
                this.state.calle = e.target.value; this.refresh();
                if (e.target.value) this.flashLot(e.target.value);
            });
            mount.querySelectorAll('[data-simbolo]').forEach(b => b.addEventListener('click', () => {
                mount.querySelectorAll('[data-simbolo]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-checked', String(x === b)); });
                this.state.simbolo = b.dataset.simbolo; this.refresh();
            }));
            mount.querySelectorAll('[data-colorby]').forEach(b => b.addEventListener('click', () => {
                mount.querySelectorAll('[data-colorby]').forEach(x => x.classList.toggle('active', x === b));
                this.state.colorBy = b.dataset.colorby; this.refresh();
            }));
            $('actSatOpacity').addEventListener('input', e => { this.state.satOpacity = +e.target.value; this.sat.group.style.opacity = this.state.satOpacity; this.savePrefs(); });
            $('actLotOpacity').addEventListener('input', e => {
                this.state.lotOpacity = +e.target.value;
                document.documentElement.style.setProperty('--activos-lote-op', this.state.lotOpacity);
                this.savePrefs();
            });
            $('actExport').addEventListener('click', () => this.exportCSV());
            $('actOcultarTodo').addEventListener('click', () => {
                Object.keys(this.state.capas).forEach(k => { this.state.capas[k] = false; });
                mount.querySelectorAll('[data-capa]').forEach(cb => { cb.checked = false; });
                this.refresh();
            });
        },

        updatePanel() {
            const mount = document.getElementById('activosCiudadPanel');
            if (!mount) return;
            const s = this.state;
            const activas = [];
            if (s.capas.satelite) activas.push({ k: 'satelite', t: '🛰️ Satélite' });
            this.cats.forEach(c => {
                if (s.capas[c.id]) activas.push({ k: c.id, t: `${c.icono} ${c.id === 'drenaje_pluvial' ? 'Imbornales' : c.nombre.split(' /')[0]} · ${c.id === 'charcos' ? this.counts.ch : this.counts.imb}` });
            });
            document.getElementById('actActiveCount').textContent = activas.length;
            document.getElementById('actPlaceholder').textContent = activas.length ? `${activas.length} capa${activas.length > 1 ? 's' : ''} activa${activas.length > 1 ? 's' : ''}` : 'Sin capas activas';
            document.getElementById('actOcultarTodo').style.display = activas.length ? '' : 'none';
            const chips = document.getElementById('actChips');
            chips.style.display = activas.length ? 'flex' : 'none';
            chips.innerHTML = activas.map(a => `<span class="multi-chip">${this.esc(a.t)} <span class="chip-remove" data-quitar="${a.k}" title="Quitar">×</span></span>`).join('');
            chips.querySelectorAll('[data-quitar]').forEach(x => x.addEventListener('click', e => {
                e.stopPropagation();
                this.state.capas[x.dataset.quitar] = false;
                const cb = mount.querySelector(`[data-capa="${x.dataset.quitar}"]`);
                if (cb) cb.checked = false;
                this.refresh();
            }));
            // Subcategorías y filtros solo cuando su capa está encendida
            this.cats.forEach(c => mount.querySelectorAll(`[data-sub-row="${c.id}"]`).forEach(r => r.classList.toggle('oculto', !s.capas[c.id])));
            document.getElementById('actFiltrosImb').classList.toggle('oculto', !s.capas.drenaje_pluvial);
            document.getElementById('actSatControls').classList.toggle('oculto', !s.capas.satelite);

            // Conteos
            const base = this.data.activos.filter(a => !s.calle || a.calle_id === s.calle);
            const bySub = {}, byUbic = {};
            base.forEach(a => {
                if (s.ubic[a.ubicacion]) bySub[a.subcategoria] = (bySub[a.subcategoria] || 0) + 1;
                if (s.subs[a.subcategoria] !== false) byUbic[a.ubicacion] = (byUbic[a.ubicacion] || 0) + 1;
            });
            this.charcos.forEach(c => { bySub[c.subcategoria] = (bySub[c.subcategoria] || 0) + 1; });
            mount.querySelectorAll('[data-count-sub]').forEach(el => { el.textContent = bySub[el.dataset.countSub] || 0; });
            mount.querySelectorAll('[data-count-ubic]').forEach(el => { el.textContent = byUbic[el.dataset.countUbic] || 0; });

            // Leyenda compacta bajo el selector
            const leg = [];
            if (s.capas.drenaje_pluvial && s.colorBy === 'cota') {
                const [lo, hi] = this.cotaRange;
                leg.push(`<div class="act-leg-row"><span class="act-leg-lbl">Cota</span><span class="act-ramp"></span><span class="act-leg-val">${lo.toFixed(0)}–${hi.toFixed(0)} m</span></div>`);
            }
            if (s.capas.charcos && this.charcos.length) {
                const cat = this.cats.find(c => c.id === 'charcos');
                leg.push(`<div class="act-leg-row">${cat.subcategorias.map(x => `<span class="act-leg-item"><span class="act-dot" style="background:${x.color}"></span>${this.esc(x.nombre)}</span>`).join('')}</div>`);
            }
            const legEl = document.getElementById('actLegend');
            legEl.innerHTML = leg.join('');
            legEl.style.display = leg.length ? '' : 'none';
        },

        /* ============================================ PANEL DERECHO */
        buildDetailsCard() {
            const panel = document.querySelector('.panel-details');
            if (!panel || document.getElementById('activoDetails')) return;
            const card = document.createElement('div');
            card.id = 'activoDetails';
            card.className = 'activo-details';
            const h2 = panel.querySelector('h2');
            h2 && h2.nextSibling ? panel.insertBefore(card, h2.nextSibling) : panel.appendChild(card);
        },

        renderImb(a) {
            const card = document.getElementById('activoDetails');
            if (!card || !a) return;
            const cat = this.cats.find(c => c.id === a.categoria);
            const color = cat?.subcategorias.find(s => s.id === a.subcategoria)?.color || '#0ea5e9';
            const lugar = a.ubicacion === 'Calle'
                ? `<dd>${this.esc(a.calle)} <button class="act-link" data-lot="${a.calle_id}">${a.calle_id}</button></dd>`
                : a.ubicacion === 'Dentro de lote'
                    ? `<dd>Dentro de <button class="act-link" data-lot="${a.lote_id}">${a.lote_id}</button> · ${this.esc(a.lote_nombre || '')}</dd>`
                    : `<dd>${this.esc(a.ubicacion)}</dd>`;
            const frente = a.lote_frente_id && a.ubicacion !== 'Dentro de lote'
                ? `<dt>Lote más cercano</dt><dd><button class="act-link" data-lot="${a.lote_frente_id}">${a.lote_frente_id}</button> · a ${a.lote_frente_dist_m} m · ${this.esc(App.State.lotesMap.get(a.lote_frente_id)?.nombre || '')}</dd>` : '';
            const obs = (a.observaciones || []).map(o => `<li>${this.esc(o)}</li>`).join('');
            card.innerHTML = `
                <div class="detail-header-v2">
                    <span class="status-badge-large act-badge" style="background:${color}">${cat?.icono || ''} ${this.esc(a.tipo)}</span>
                    <span class="lot-id">${a.id}</span>
                </div>
                <div class="area-primary-box"><span class="area-label">COTA (ELEVACIÓN)</span><span class="area-value">${a.cota.toFixed(2)} m</span></div>
                <div class="detail-section static-section">
                    <h4>📍 Ubicación</h4>
                    <dl class="detail-grid">
                        <dt>Ubicación</dt>${lugar}${frente}
                        <dt>UTM 19N</dt><dd>E ${a.utm_e.toFixed(2)} · N ${a.utm_n.toFixed(2)}</dd>
                        <dt>Lat / Lon</dt><dd>${a.lat.toFixed(6)}, ${a.lon.toFixed(6)}</dd>
                        <dt>Levantamiento</dt><dd>No. ${a.no_levantamiento} · anotado «${this.esc(a.tipo_original)}»</dd>
                        ${'tipo_en_plano' in a ? `<dt>Plano de Verasol</dt><dd>${a.tipo_en_plano ? this.esc(a.tipo_en_plano) : 'Sin símbolo'}</dd>` : ''}
                    </dl>
                    <a class="act-btn-link" href="https://www.google.com/maps?q=${a.lat},${a.lon}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a>
                </div>
                ${obs ? `<div class="detail-section static-section"><h4>📝 Notas</h4><ul class="act-obs">${obs}</ul></div>` : ''}`;
            card.classList.add('active');
            card.querySelectorAll('[data-lot]').forEach(b => b.addEventListener('click', () => this.openLot(b.dataset.lot)));
        },

        renderCharco(c) {
            const card = document.getElementById('activoDetails');
            if (!card || !c) return;
            const cat = this.cats.find(x => x.id === 'charcos');
            const color = cat?.subcategorias.find(s => s.id === c.subcategoria)?.color || '#dc2626';
            const lotes = (c.lotes_origen || []).map((l, i) => {
                const lo = App.State.lotesMap.get(l);
                return `<li><button class="act-link" data-lot="${l}">${l}</button> ${this.esc(lo?.nombre || '')}${i === 0 ? ' <span class="act-pill">principal</span>' : ''}</li>`;
            }).join('');
            const imbs = (c.imbornales_cercanos || []).map(id => `<button class="act-link" data-imb="${id}">${id}</button>`).join(' ');
            const dato = (k, v, u) => (v !== null && v !== undefined && v !== '') ? `<dt>${k}</dt><dd>${this.esc(v)}${u || ''}</dd>` : '';
            card.innerHTML = `
                <div class="detail-header-v2">
                    <span class="status-badge-large act-badge" style="background:${color}">🌊 ${this.esc(c.tipo)}</span>
                    <span class="lot-id">${this.esc(c.id)}</span>
                </div>
                <div class="detail-section static-section">
                    <h4>📍 Ubicación</h4>
                    <dl class="detail-grid">
                        ${dato('Referencia', c.referencia)}
                        <dt>Vía</dt><dd>${this.esc(this.lugar(c))}</dd>
                        ${dato('Levantado el', c.fecha ? c.fecha.split('-').reverse().join('/') : '')}
                        <dt>Lat / Lon</dt><dd>${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}</dd>
                    </dl>
                </div>
                <div class="detail-section static-section">
                    <h4>💧 ¿De dónde viene el agua?</h4>
                    ${c.origen_tipo ? `<p class="act-origen-tipo">${this.esc(c.origen_tipo)}</p>` : ''}
                    ${lotes ? `<ul class="act-lotes">${lotes}</ul>` : (c.origen_tipo ? '' : '<p class="act-empty">Sin lotes de origen indicados.</p>')}
                    <p class="act-note">${lotes ? 'En el mapa, las flechas salen de estos lotes hacia el charco; ' : 'En el mapa, '}las flechas azules marcan cómo baja el agua por la calle.</p>
                </div>
                <div class="detail-section static-section">
                    <h4>📏 Análisis técnico</h4>
                    <dl class="detail-grid">
                        ${dato('Causa probable', c.causa)}${dato('Afecta', c.afecta)}${dato('Área aprox.', c.area_m2, ' m²')}
                        ${dato('Profundidad', c.profundidad_cm, ' cm')}${dato('Se seca en', c.drenaje_horas, ' h')}
                        ${dato('Observaciones', c.observaciones)}
                    </dl>
                    ${imbs ? `<div class="act-sub-title">Imbornales cercanos</div><div class="act-lot-ids">${imbs}</div>` : ''}
                    ${c.evidencia ? `<a class="act-btn-link" href="${this.esc(c.evidencia)}" target="_blank" rel="noopener">Ver evidencia ↗</a>` : ''}
                    <a class="act-btn-link" href="https://www.google.com/maps?q=${c.lat},${c.lon}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a>
                </div>`;
            card.classList.add('active');
            card.querySelectorAll('[data-lot]').forEach(b => b.addEventListener('click', () => this.openLot(b.dataset.lot)));
            card.querySelectorAll('[data-imb]').forEach(b => b.addEventListener('click', () => {
                if (!this.state.capas.drenaje_pluvial) {
                    this.state.capas.drenaje_pluvial = true;
                    const cb = document.querySelector('[data-capa="drenaje_pluvial"]'); if (cb) cb.checked = true;
                    this.refresh();
                }
                this.select('imb', b.dataset.imb);
            }));
        },

        openLot(id) {
            if (!App.State.lotesMap.has(id)) { this.toast(`El lote ${id} no está en la base de datos del mapa.`); return; }
            this.clearSelection(true);
            App.State.selectedId = null;
            App.UI.selectLot(id);
        },

        flashLot(id) {
            const el = App.State.svgElementsMap.get(id);
            if (!el) return;
            el.classList.add('act-flash');
            setTimeout(() => el.classList.remove('act-flash'), 1600);
        },

        /* ================================ INTEGRACIÓN CON EL VISOR */
        hookApp() {
            const self = this;
            const origRender = App.UI.renderDetails.bind(App.UI);
            App.UI.renderDetails = function (lote) {
                if (lote && self.state.sel) self.clearSelection(true);
                origRender(lote);
                if (lote) self.renderLotSection(lote);
                else self.clearFlujo();
            };
            const origUpd = App.Map.updateMapTransform.bind(App.Map);
            App.Map.updateMapTransform = function () {
                origUpd();
                if (self.state.capas.satelite) self.satAnimar(700);
                clearTimeout(self._rz); clearTimeout(self._rz2);
                self._rz = setTimeout(() => self.onZoom(), 140);
                self._rz2 = setTimeout(() => self.onZoom(), 420);
            };
            window.addEventListener('resize', () => { if (this.state.capas.satelite) this.satAnimar(400); setTimeout(() => this.onZoom(), 150); });
            document.addEventListener('fullscreenchange', () => setTimeout(() => this.onZoom(), 300));
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && this.state.sel && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) this.clearSelection();
            });
        },

        renderLotSection(lote) {
            const details = document.getElementById('lotDetails');
            if (!details) return;
            let sec = document.getElementById('loteActivosSection');
            if (!sec) {
                sec = document.createElement('div');
                sec.id = 'loteActivosSection';
                sec.className = 'detail-section static-section act-lot-section';
                const ref = details.querySelector('.static-section');
                ref ? details.insertBefore(sec, ref.nextElementSibling) : details.appendChild(sec);
            }
            const r = this.data.resumen_por_lote[lote.id];
            const dentro = (r?.dentro || []).map(id => this.byId.get(id)).filter(Boolean);
            const frente = (r?.frente || []).map(id => this.byId.get(id)).filter(Boolean);
            const isCalle = dentro.length && dentro[0].calle_id === lote.id;
            const cuenta = arr => {
                const m = {}; arr.forEach(a => { m[a.tipo] = (m[a.tipo] || 0) + 1; });
                return Object.entries(m).map(([t, n]) => `<span class="act-pill">${n} ${this.esc(t.toLowerCase())}</span>`).join(' ');
            };
            const chips = arr => arr.map(a => `<button class="act-link" data-imb="${a.id}">${a.id}</button>`).join(' ');
            let html = '<h4>🗺️ Activos de Ciudad</h4>';
            if (!dentro.length && !frente.length) {
                html += '<p class="act-empty">Sin imbornales levantados en el lote ni en su frente de calle (≤ 20 m).</p>';
            } else {
                if (dentro.length) html += `<div class="act-lot-row"><strong>💧 ${isCalle ? 'En esta calle' : 'Dentro del lote'}: ${dentro.length}</strong><div>${cuenta(dentro)}</div><div class="act-lot-ids">${chips(dentro)}</div></div>`;
                if (frente.length) html += `<div class="act-lot-row"><strong>💧 En su frente de calle: ${frente.length}</strong><div>${cuenta(frente)}</div><div class="act-lot-ids">${chips(frente)}</div></div>`;
            }
            const destinos = this.flujoDesdeLote(lote.id);
            if (this.charcos.length) {
                const todos = this.charcos.filter(c => (c.lotes_origen || []).includes(lote.id));
                if (todos.length) {
                    html += `<div class="act-lot-row"><strong>🌊 Aporta agua a ${todos.length} charco${todos.length > 1 ? 's' : ''}</strong>
                        <div class="act-lot-ids">${todos.map(c => `<button class="act-link crit-${c.subcategoria}" data-ch="${c.id}">${this.esc(c.id)}</button>`).join(' ')}</div>
                        ${this.state.capas.charcos ? '' : '<div class="act-note">Encienda la capa de charcos para ver las flechas en el mapa.</div>'}</div>`;
                }
            }
            if (!destinos.length && (lote.tipo === 'Habitacional' || lote.tipo === 'Comercial')) {
                html += '<p class="act-note">Los filtrantes internos de residenciales y plazas aún no se han levantado.</p>';
            }
            sec.innerHTML = html;
            sec.querySelectorAll('[data-imb]').forEach(b => b.addEventListener('click', () => {
                if (!this.state.capas.drenaje_pluvial) {
                    this.state.capas.drenaje_pluvial = true;
                    const cb = document.querySelector('[data-capa="drenaje_pluvial"]'); if (cb) cb.checked = true;
                    this.refresh();
                }
                this.select('imb', b.dataset.imb);
            }));
            sec.querySelectorAll('[data-ch]').forEach(b => b.addEventListener('click', () => {
                if (!this.state.capas.charcos) {
                    this.state.capas.charcos = true;
                    const cb = document.querySelector('[data-capa="charcos"]'); if (cb) cb.checked = true;
                    this.refresh();
                }
                this.select('charco', b.dataset.ch);
            }));
        },

        /* ===================================================== EXPORTAR */
        exportCSV() {
            const cols = ['id', 'tipo', 'tipo_original', 'tipo_en_plano', 'ubicacion', 'calle', 'calle_id', 'lote_id', 'lote_nombre',
                'lote_frente_id', 'lote_frente_dist_m', 'cota', 'utm_e', 'utm_n', 'lat', 'lon', 'no_levantamiento', 'observaciones'];
            const filas = this.data.activos.filter(a => this.state.capas.drenaje_pluvial ? this.visibleImb(a) : true);
            const q = v => {
                const s = Array.isArray(v) ? v.join(' | ') : (v ?? '');
                return /[",;\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : s;
            };
            const csv = '﻿' + cols.join(',') + '\n' + filas.map(a => cols.map(c => q(a[c])).join(',')).join('\n');
            const link = document.createElement('a');
            link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
            link.download = `imbornales_cjb_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link); link.click(); link.remove();
            this.toast(`Inventario descargado: ${filas.length} imbornales`);
        },

        toast(msg) {
            if (App.UI && typeof App.UI.showToast === 'function') App.UI.showToast(msg); else console.log(msg);
        },
        esc(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
    };

    window.ActivosCiudad = Activos;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Activos.init());
    else Activos.init();
})();

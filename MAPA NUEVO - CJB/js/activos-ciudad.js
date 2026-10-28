/* ==========================================================================
   ACTIVOS DE CIUDAD — Ciudad Juan Bosch
   Capa satelital (Esri World Imagery) georreferenciada bajo el Master Plan y
   activos urbanos levantados en campo (imbornales, y luego charcos, postes,
   rampas…) con filtros por categoría, subcategoría, ubicación y calle.

   Datos: data/activos_cjb.json (generado por tools/generar_activos_cjb.py)
   Georreferencia del SVG:  E = E0 + s·x ;  N = N0 − s·y   (UTM 19N)
   ========================================================================== */
(function () {
    'use strict';

    const NS = 'http://www.w3.org/2000/svg';
    const DATA_URL = 'data/activos_cjb.json';
    const STORE_KEY = 'vbc-activos-cjb';
    const UBICACIONES = ['Calle', 'Dentro de lote', 'Fuera de lotes del Master Plan'];

    const Activos = {
        data: null,
        svg: null,
        els: new Map(),          // id -> <circle>
        byId: new Map(),         // id -> activo
        cotaRange: [0, 1],
        state: {
            satelite: false,
            satOpacity: 1,
            lotOpacity: 0.35,
            colorBy: 'tipo',
            cats: {},            // categoria -> bool
            subs: {},            // subcategoria -> bool
            ubic: { 'Calle': true, 'Dentro de lote': true, 'Fuera de lotes del Master Plan': true },
            calle: '',
            selected: null,
            open: true
        },

        /* ------------------------------------------------------------ init */
        async init() {
            const ok = await this.waitForMap();
            if (!ok) { console.warn('[Activos] El mapa no cargó; módulo inactivo.'); return; }
            try {
                const res = await fetch(DATA_URL, { cache: 'no-store' });
                this.data = await res.json();
            } catch (e) {
                console.error('[Activos] No se pudo leer ' + DATA_URL, e);
                return;
            }
            this.svg = document.querySelector('#mapContainer svg');
            this.data.activos.forEach(a => this.byId.set(a.id, a));
            const cotas = this.data.activos.map(a => a.cota).filter(v => typeof v === 'number');
            this.cotaRange = [Math.min(...cotas), Math.max(...cotas)];
            this.data.categorias.forEach(c => {
                this.state.cats[c.id] = c.estado !== 'pendiente';
                c.subcategorias.forEach(s => { this.state.subs[s.id] = true; });
            });
            this.loadPrefs();
            this.buildSatellite();
            this.buildLayer();
            this.buildPanel();
            this.buildDetailsCard();
            this.hookApp();
            this.apply();
            this.setSatellite(this.state.satelite, true);
            console.log(`🗺️ Activos de Ciudad: ${this.data.activos.length} activos cargados`);
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
                ['satelite', 'satOpacity', 'lotOpacity', 'colorBy', 'open'].forEach(k => {
                    if (p[k] !== undefined) this.state[k] = p[k];
                });
            } catch (e) { /* almacenamiento no disponible */ }
        },
        savePrefs() {
            try {
                const { satelite, satOpacity, lotOpacity, colorBy, open } = this.state;
                localStorage.setItem(STORE_KEY, JSON.stringify({ satelite, satOpacity, lotOpacity, colorBy, open }));
            } catch (e) { /* almacenamiento no disponible */ }
        },

        /* ----------------------------------------------- capa satelital */
        buildSatellite() {
            const sat = this.data.meta.satelite;
            const [x, y, w, h] = sat.svg_rect;
            const g = document.createElementNS(NS, 'g');
            g.id = 'capaSatelite';
            g.style.display = 'none';
            const img = document.createElementNS(NS, 'image');
            img.setAttribute('x', x); img.setAttribute('y', y);
            img.setAttribute('width', w); img.setAttribute('height', h);
            img.setAttribute('preserveAspectRatio', 'none');
            img.dataset.src = sat.url;   // se carga al encender la capa
            img.addEventListener('error', () => {
                this.toast('No se pudo cargar la imagen satelital. Verifique la conexión a internet.');
                const st = document.getElementById('actSatStatus');
                if (st) st.textContent = 'Sin conexión';
            });
            img.addEventListener('load', () => {
                const st = document.getElementById('actSatStatus');
                if (st) st.textContent = '';
            });
            g.appendChild(img);
            this.svg.insertBefore(g, this.svg.firstChild);
            this.satImg = img;
            this.satGroup = g;

            const attr = document.createElement('div');
            attr.className = 'activos-atribucion';
            attr.id = 'activosAtribucion';
            attr.textContent = sat.atribucion;
            document.querySelector('.panel-map')?.appendChild(attr);
        },

        setSatellite(on, silent) {
            this.state.satelite = !!on;
            if (on && this.satImg && !this.satImg.getAttribute('href')) {
                const st = document.getElementById('actSatStatus');
                if (st) st.textContent = 'Cargando…';
                this.satImg.setAttribute('href', this.satImg.dataset.src);
            }
            this.satGroup.style.display = on ? '' : 'none';
            this.satGroup.style.opacity = this.state.satOpacity;
            document.body.classList.toggle('activos-sat-on', !!on);
            document.documentElement.style.setProperty('--activos-lote-op', this.state.lotOpacity);
            const sw = document.getElementById('actSatToggle');
            if (sw) sw.checked = !!on;
            document.getElementById('actSatControls')?.classList.toggle('disabled', !on);
            if (!silent) this.savePrefs();
        },

        /* --------------------------------------------- capa de activos */
        buildLayer() {
            const g = document.createElementNS(NS, 'g');
            g.id = 'capaActivos';
            this.data.activos.forEach(a => {
                if (typeof a.svg_x !== 'number') return;
                const c = document.createElementNS(NS, 'circle');
                c.setAttribute('cx', a.svg_x);
                c.setAttribute('cy', a.svg_y);
                c.setAttribute('class', 'activo-punto');
                c.dataset.id = a.id;
                c.addEventListener('click', ev => { ev.stopPropagation(); this.select(a.id); });
                c.addEventListener('mouseenter', ev => this.showTip(ev, a));
                c.addEventListener('mousemove', ev => App.Map.updateTooltipPosition(ev));
                c.addEventListener('mouseleave', () => App.Map.hideTooltip());
                g.appendChild(c);
                this.els.set(a.id, c);
            });
            this.svg.appendChild(g);
            this.layer = g;
            this.resize();
        },

        // Mantiene el tamaño del punto estable en pantalla al hacer zoom.
        resize() {
            if (!this.svg) return;
            const ctm = this.layer.getScreenCTM();
            const pxPerUnit = (ctm && Math.hypot(ctm.a, ctm.b)) || 1;
            const r = Math.min(Math.max(4.2 / pxPerUnit, 0.35), 8);
            this.layer.style.setProperty('--act-sw', (1.2 / pxPerUnit).toFixed(3));
            this.els.forEach(c => c.setAttribute('r', c.classList.contains('selected') ? r * 1.7 : r));
            this.radius = r;
        },

        colorFor(a) {
            if (this.state.colorBy === 'cota' && typeof a.cota === 'number') {
                const [lo, hi] = this.cotaRange;
                const t = Math.min(Math.max((a.cota - lo) / ((hi - lo) || 1), 0), 1);
                return this.ramp(t);
            }
            const cat = this.data.categorias.find(c => c.id === a.categoria);
            const sub = cat?.subcategorias.find(s => s.id === a.subcategoria);
            return sub?.color || '#0ea5e9';
        },

        // Cota baja (azul intenso: donde se acumula el agua) → alta (ámbar)
        ramp(t) {
            const stops = [[0, [29, 78, 216]], [0.5, [34, 197, 94]], [1, [245, 158, 11]]];
            let i = 0; while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
            const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
            const k = (t - t0) / (t1 - t0);
            const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
            return `rgb(${c[0]},${c[1]},${c[2]})`;
        },

        visible(a) {
            const s = this.state;
            if (!s.cats[a.categoria]) return false;
            if (a.subcategoria && s.subs[a.subcategoria] === false) return false;
            if (!s.ubic[a.ubicacion]) return false;
            if (s.calle && a.calle_id !== s.calle) return false;
            return true;
        },

        apply() {
            let n = 0;
            this.data.activos.forEach(a => {
                const c = this.els.get(a.id);
                if (!c) return;
                const v = this.visible(a);
                c.style.display = v ? '' : 'none';
                c.style.fill = this.colorFor(a);
                if (v) n++;
            });
            this.visibleCount = n;
            const cnt = document.getElementById('actVisibleCount');
            if (cnt) cnt.textContent = n.toLocaleString('es-DO');
            this.renderLegend();
            this.updateCounts();
        },

        /* ------------------------------------------------- panel filtros */
        buildPanel() {
            const mount = document.getElementById('activosCiudadPanel');
            if (!mount) return;
            const total = this.data.activos.length;
            const calles = {};
            this.data.activos.forEach(a => {
                if (a.calle_id) calles[a.calle_id] = calles[a.calle_id] || { nombre: a.calle, n: 0 };
                if (a.calle_id) calles[a.calle_id].n++;
            });
            const callesOpts = Object.entries(calles)
                .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, 'es'))
                .map(([id, c]) => `<option value="${id}">${this.esc(c.nombre)} (${c.n})</option>`).join('');

            const catsHtml = this.data.categorias.map(c => {
                const pend = c.estado === 'pendiente';
                const n = this.data.activos.filter(a => a.categoria === c.id).length;
                const subs = c.subcategorias.map(s => `
                    <label class="act-sub">
                        <input type="checkbox" data-sub="${s.id}" checked>
                        <span class="act-dot" style="background:${s.color}"></span>
                        <span class="act-sub-name">${this.esc(s.nombre)}</span>
                        <span class="act-count" data-count-sub="${s.id}">0</span>
                    </label>`).join('');
                return `
                <div class="act-cat ${pend ? 'pendiente' : ''}" data-cat-row="${c.id}">
                    <div class="act-cat-head">
                        <label class="act-cat-label" title="${this.esc(c.fuente)}">
                            <input type="checkbox" data-cat="${c.id}" ${pend ? 'disabled' : 'checked'}>
                            <span class="act-cat-icon">${c.icono}</span>
                            <span class="act-cat-name">${this.esc(c.nombre)}</span>
                        </label>
                        ${pend ? '<span class="act-chip">Pendiente</span>'
                               : `<span class="act-count act-count-cat" data-count-cat="${c.id}">${n}</span>
                                  <button type="button" class="act-expand" data-expand="${c.id}" aria-label="Ver subcategorías">▾</button>`}
                    </div>
                    ${pend ? `<div class="act-pend-note">${this.esc(c.fuente)}</div>` : `<div class="act-subs open" data-subs="${c.id}">${subs}</div>`}
                </div>`;
            }).join('');

            mount.innerHTML = `
            <div class="activos-card ${this.state.open ? 'open' : ''}" id="activosCard">
                <button type="button" class="activos-card-head" id="actCardToggle">
                    <span class="activos-title">🗺️ Activos de Ciudad</span>
                    <span class="activos-total"><span id="actVisibleCount">${total}</span> / ${total}</span>
                    <span class="accordion-chevron">▾</span>
                </button>
                <div class="activos-card-body">
                    <div class="act-block">
                        <label class="act-switch">
                            <input type="checkbox" id="actSatToggle">
                            <span class="act-switch-track"></span>
                            <span>🛰️ Vista satelital</span>
                            <span class="act-sat-status" id="actSatStatus"></span>
                        </label>
                        <div class="act-sliders" id="actSatControls">
                            <label>Imagen <input type="range" id="actSatOpacity" min="0.2" max="1" step="0.05" value="${this.state.satOpacity}"></label>
                            <label>Relleno de lotes <input type="range" id="actLotOpacity" min="0" max="1" step="0.05" value="${this.state.lotOpacity}"></label>
                        </div>
                    </div>

                    <div class="act-block">
                        <div class="act-block-title">Categorías</div>
                        ${catsHtml}
                    </div>

                    <div class="act-block">
                        <div class="act-block-title">Ubicación</div>
                        <div class="act-chips">
                            ${UBICACIONES.map(u => `<button type="button" class="act-toggle active" data-ubic="${u}">${u === 'Fuera de lotes del Master Plan' ? 'Fuera del Master Plan' : u} <span class="act-count" data-count-ubic="${u}">0</span></button>`).join('')}
                        </div>
                        <select id="actCalleSelect" class="filter-select act-select">
                            <option value="">Todas las calles</option>
                            ${callesOpts}
                        </select>
                    </div>

                    <div class="act-block">
                        <div class="act-block-title">Color de los puntos</div>
                        <div class="segmented-control act-seg">
                            <button type="button" class="segment-btn ${this.state.colorBy === 'tipo' ? 'active' : ''}" data-colorby="tipo">Por tipo</button>
                            <button type="button" class="segment-btn ${this.state.colorBy === 'cota' ? 'active' : ''}" data-colorby="cota">Por cota (elevación)</button>
                        </div>
                        <div class="act-legend" id="actLegend"></div>
                    </div>

                    <div class="act-actions">
                        <button type="button" class="act-btn" id="actExport">📥 Descargar inventario (CSV)</button>
                    </div>
                    <div class="act-source">Fuente: ${this.esc(this.data.categorias[0].fuente)} · Georreferencia del Master Plan: precisión ${this.esc(this.data.meta.georreferencia_master_plan.precision_estimada_m)}</div>
                </div>
            </div>`;

            const $ = id => document.getElementById(id);
            $('actCardToggle').addEventListener('click', () => {
                this.state.open = !this.state.open;
                $('activosCard').classList.toggle('open', this.state.open);
                this.savePrefs();
            });
            $('actSatToggle').addEventListener('change', e => this.setSatellite(e.target.checked));
            $('actSatOpacity').addEventListener('input', e => {
                this.state.satOpacity = +e.target.value; this.satGroup.style.opacity = this.state.satOpacity; this.savePrefs();
            });
            $('actLotOpacity').addEventListener('input', e => {
                this.state.lotOpacity = +e.target.value;
                document.documentElement.style.setProperty('--activos-lote-op', this.state.lotOpacity);
                this.savePrefs();
            });
            mount.querySelectorAll('[data-cat]').forEach(cb => cb.addEventListener('change', () => {
                this.state.cats[cb.dataset.cat] = cb.checked;
                mount.querySelector(`[data-subs="${cb.dataset.cat}"]`)?.classList.toggle('muted', !cb.checked);
                this.apply();
            }));
            mount.querySelectorAll('[data-sub]').forEach(cb => cb.addEventListener('change', () => {
                this.state.subs[cb.dataset.sub] = cb.checked; this.apply();
            }));
            mount.querySelectorAll('[data-expand]').forEach(b => b.addEventListener('click', () => {
                const el = mount.querySelector(`[data-subs="${b.dataset.expand}"]`);
                el?.classList.toggle('open'); b.classList.toggle('collapsed');
            }));
            mount.querySelectorAll('[data-ubic]').forEach(b => b.addEventListener('click', () => {
                const u = b.dataset.ubic;
                this.state.ubic[u] = !this.state.ubic[u];
                b.classList.toggle('active', this.state.ubic[u]);
                this.apply();
            }));
            $('actCalleSelect').addEventListener('change', e => {
                this.state.calle = e.target.value;
                this.apply();
                if (e.target.value) this.focusLot(e.target.value);
            });
            mount.querySelectorAll('[data-colorby]').forEach(b => b.addEventListener('click', () => {
                mount.querySelectorAll('[data-colorby]').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                this.state.colorBy = b.dataset.colorby; this.savePrefs(); this.apply();
            }));
            $('actExport').addEventListener('click', () => this.exportCSV());
        },

        updateCounts() {
            const mount = document.getElementById('activosCiudadPanel');
            if (!mount) return;
            const s = this.state;
            const base = this.data.activos.filter(a => s.cats[a.categoria] && (!s.calle || a.calle_id === s.calle));
            const bySub = {}, byUbic = {};
            base.forEach(a => {
                if (s.ubic[a.ubicacion]) bySub[a.subcategoria] = (bySub[a.subcategoria] || 0) + 1;
                if (a.subcategoria == null || s.subs[a.subcategoria] !== false) byUbic[a.ubicacion] = (byUbic[a.ubicacion] || 0) + 1;
            });
            mount.querySelectorAll('[data-count-sub]').forEach(el => { el.textContent = bySub[el.dataset.countSub] || 0; });
            mount.querySelectorAll('[data-count-ubic]').forEach(el => { el.textContent = byUbic[el.dataset.countUbic] || 0; });
        },

        renderLegend() {
            const el = document.getElementById('actLegend');
            if (!el) return;
            if (this.state.colorBy === 'cota') {
                const [lo, hi] = this.cotaRange;
                el.innerHTML = `
                    <div class="act-ramp"></div>
                    <div class="act-ramp-labels"><span>${lo.toFixed(1)} m · baja</span><span>${hi.toFixed(1)} m · alta</span></div>
                    <div class="act-legend-note">Los puntos más bajos (azul) son donde tiende a acumularse el agua.</div>`;
            } else {
                el.innerHTML = '';
            }
        },

        /* --------------------------------------------------- selección */
        showTip(ev, a) {
            const tip = document.getElementById('mapTooltip');
            if (!tip) return;
            const lugar = a.ubicacion === 'Calle' ? (a.calle || 'Calle') :
                a.ubicacion === 'Dentro de lote' ? `Dentro del lote ${a.lote_id}` : a.ubicacion;
            tip.innerHTML = `<strong>${a.id}</strong> · ${this.esc(a.tipo)}<br>${this.esc(lugar)}<br>Cota: <strong>${a.cota.toFixed(2)} m</strong>`;
            tip.style.display = 'block';
            App.Map.updateTooltipPosition(ev);
        },

        select(id) {
            const prev = this.state.selected;
            if (prev) this.els.get(prev)?.classList.remove('selected');
            if (prev === id) { this.state.selected = null; this.renderAsset(null); this.resize(); return; }
            this.state.selected = id;
            const c = this.els.get(id);
            if (c) { c.classList.add('selected'); c.parentNode.appendChild(c); }
            // Deseleccionar lote activo para mostrar la ficha del activo
            if (App.State.selectedId) { App.State.selectedId = null; App.Map.render(); }
            const empty = document.getElementById('emptyState');
            if (empty) empty.style.display = 'none';
            document.getElementById('lotDetails')?.classList.remove('active');
            this.renderAsset(this.byId.get(id));
            this.resize();
        },

        buildDetailsCard() {
            const panel = document.querySelector('.panel-details');
            if (!panel || document.getElementById('activoDetails')) return;
            const card = document.createElement('div');
            card.id = 'activoDetails';
            card.className = 'activo-details';
            const h2 = panel.querySelector('h2');
            (h2 && h2.nextSibling) ? panel.insertBefore(card, h2.nextSibling) : panel.appendChild(card);
        },

        renderAsset(a) {
            const card = document.getElementById('activoDetails');
            if (!card) return;
            if (!a) {
                card.classList.remove('active'); card.innerHTML = '';
                if (!App.State.selectedId) {
                    const empty = document.getElementById('emptyState');
                    if (empty) empty.style.display = 'flex';
                }
                return;
            }
            const cat = this.data.categorias.find(c => c.id === a.categoria);
            const lugar = a.ubicacion === 'Calle'
                ? `<dd>${this.esc(a.calle)} <button class="act-link" data-lot="${a.calle_id}">${a.calle_id}</button></dd>`
                : a.ubicacion === 'Dentro de lote'
                    ? `<dd>Dentro de <button class="act-link" data-lot="${a.lote_id}">${a.lote_id}</button> · ${this.esc(a.lote_nombre || '')}</dd>`
                    : `<dd>${this.esc(a.ubicacion)}</dd>`;
            const frente = a.lote_frente_id && a.ubicacion !== 'Dentro de lote'
                ? `<dt>Lote más cercano</dt><dd><button class="act-link" data-lot="${a.lote_frente_id}">${a.lote_frente_id}</button> · a ${a.lote_frente_dist_m} m · ${this.esc(App.State.lotesMap.get(a.lote_frente_id)?.nombre || '')}</dd>` : '';
            const obs = (a.observaciones || []).map(o => `<li>${this.esc(o)}</li>`).join('');
            const gmaps = `https://www.google.com/maps?q=${a.lat},${a.lon}`;
            card.innerHTML = `
                <div class="detail-header-v2">
                    <span class="status-badge-large act-badge" style="background:${this.colorFor({ ...a, __t: 1 }) }">${cat?.icono || ''} ${this.esc(a.tipo)}</span>
                    <span class="lot-id">${a.id}</span>
                </div>
                <div class="area-primary-box">
                    <span class="area-label">COTA (ELEVACIÓN)</span>
                    <span class="area-value">${a.cota.toFixed(2)} m</span>
                </div>
                <div class="detail-section static-section">
                    <h4>📍 Ubicación</h4>
                    <dl class="detail-grid">
                        <dt>Categoría</dt><dd>${this.esc(cat?.nombre || '')}</dd>
                        <dt>Ubicación</dt>${lugar}
                        ${frente}
                        <dt>UTM 19N</dt><dd>E ${a.utm_e.toFixed(2)} · N ${a.utm_n.toFixed(2)}</dd>
                        <dt>Lat / Lon</dt><dd>${a.lat.toFixed(6)}, ${a.lon.toFixed(6)}</dd>
                        <dt>Levantamiento</dt><dd>No. ${a.no_levantamiento} · tipo anotado «${this.esc(a.tipo_original)}»</dd>
                    </dl>
                    <a class="act-btn act-btn-link" href="${gmaps}" target="_blank" rel="noopener">Abrir en Google Maps ↗</a>
                </div>
                ${obs ? `<div class="detail-section static-section"><h4>⚠️ Observaciones del levantamiento</h4><ul class="act-obs">${obs}</ul></div>` : ''}`;
            card.classList.add('active');
            card.querySelectorAll('[data-lot]').forEach(b => b.addEventListener('click', () => this.openLot(b.dataset.lot)));
        },

        openLot(id) {
            if (!App.State.lotesMap.has(id)) { this.toast(`El lote ${id} no está en la base de datos del mapa.`); return; }
            if (this.state.selected) { this.els.get(this.state.selected)?.classList.remove('selected'); this.state.selected = null; this.resize(); }
            this.renderAsset(null);
            App.State.selectedId = null;
            App.UI.selectLot(id);
        },

        focusLot(id) {
            const el = App.State.svgElementsMap.get(id);
            if (!el) return;
            el.classList.add('act-flash');
            setTimeout(() => el.classList.remove('act-flash'), 1600);
        },

        /* ----------------------------------- integración con la ficha */
        hookApp() {
            const self = this;
            const origRender = App.UI.renderDetails.bind(App.UI);
            App.UI.renderDetails = function (lote) {
                if (lote && self.state.selected) {
                    self.els.get(self.state.selected)?.classList.remove('selected');
                    self.state.selected = null; self.resize();
                    const card = document.getElementById('activoDetails');
                    if (card) { card.classList.remove('active'); card.innerHTML = ''; }
                }
                origRender(lote);
                if (lote) self.renderLotSection(lote);
            };
            const origUpd = App.Map.updateMapTransform.bind(App.Map);
            App.Map.updateMapTransform = function () {
                origUpd();
                clearTimeout(self._rz); clearTimeout(self._rz2);
                self._rz = setTimeout(() => self.resize(), 140);
                self._rz2 = setTimeout(() => self.resize(), 400);
            };
            window.addEventListener('resize', () => this.resize());
            document.addEventListener('fullscreenchange', () => setTimeout(() => this.resize(), 300));
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
            const chips = arr => arr.map(a => `<button class="act-link" data-act="${a.id}">${a.id}</button>`).join(' ');
            let html = '<h4>💧 Drenaje pluvial (imbornales)</h4>';
            if (!dentro.length && !frente.length) {
                html += '<p class="act-empty">Sin imbornales levantados dentro de este lote ni en su frente de calle (≤ 20 m).</p>';
            } else {
                if (dentro.length) html += `<div class="act-lot-row"><strong>${isCalle ? 'En esta calle' : 'Dentro del lote'}: ${dentro.length}</strong><div>${cuenta(dentro)}</div><div class="act-lot-ids">${chips(dentro)}</div></div>`;
                if (frente.length) html += `<div class="act-lot-row"><strong>En su frente de calle (≤ 20 m): ${frente.length}</strong><div>${cuenta(frente)}</div><div class="act-lot-ids">${chips(frente)}</div></div>`;
            }
            if (lote.tipo === 'Habitacional' || lote.tipo === 'Comercial') {
                html += '<p class="act-note">El levantamiento actual cubre los imbornales de las calles; los filtrantes internos de residenciales y plazas aún no se han levantado.</p>';
            }
            sec.innerHTML = html;
            sec.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => this.select(b.dataset.act)));
        },

        /* --------------------------------------------------- exportar */
        exportCSV() {
            const cols = ['id', 'tipo', 'tipo_original', 'ubicacion', 'calle', 'calle_id', 'lote_id', 'lote_nombre',
                'lote_frente_id', 'lote_frente_dist_m', 'cota', 'utm_e', 'utm_n', 'lat', 'lon', 'no_levantamiento', 'observaciones'];
            const rows = this.data.activos.filter(a => this.visible(a));
            const q = v => {
                const s = Array.isArray(v) ? v.join(' | ') : (v ?? '');
                return /[",;\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : s;
            };
            const csv = '﻿' + cols.join(',') + '\n' + rows.map(a => cols.map(c => q(a[c])).join(',')).join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `activos_cjb_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link); link.click(); link.remove();
            this.toast(`Inventario descargado: ${rows.length} activos`);
        },

        toast(msg) {
            if (App.UI && typeof App.UI.showToast === 'function') App.UI.showToast(msg);
            else console.log(msg);
        },
        esc(s) {
            return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }
    };

    window.ActivosCiudad = Activos;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => Activos.init());
    else Activos.init();
})();

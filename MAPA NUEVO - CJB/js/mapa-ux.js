/* ==========================================================================
   MAPA UX — controles de navegación del mapa CJB
   · Pestañas en los bordes del mapa para ocultar el panel izquierdo o el
     derecho por separado (teclas [ y ]). Se recuerda entre visitas.
   · «Solo mapa»: oculta paneles laterales y encabezado y pasa a pantalla
     completa (botón ⤢ en los controles del mapa, tecla M; Esc para salir).
   · Zoom hacia el cursor con:
       - rueda del mouse,
       - clic derecho presionado + ↑ / ↓ (o + / −),
       - teclas + / − y 0 (restablecer) con el cursor sobre el mapa.
   ========================================================================== */
(function () {
    'use strict';

    const MapaUX = {
        mouse: { x: null, y: null, dentro: false },
        derecho: false,
        usoZoomDerecho: false,
        entroFullscreen: false,

        init() {
            const area = document.querySelector('.panel-map');
            if (!area || !window.App || !App.Map) { setTimeout(() => this.init(), 300); return; }
            this.area = area;
            this.rendimiento();
            this.pestanasPaneles();
            this.leyendaPlegable();
            this.botonSoloMapa();
            this.eventos();
        },

        /* ------------------------------------------------ zoom al cursor */
        zoomAt(factor, cx, cy) {
            const t = App.Map.transform || { scale: 1, x: 0, y: 0 };
            const s0 = t.scale;
            const s1 = Math.min(Math.max(0.2, s0 * factor), 10);
            if (s1 === s0) return;
            const r = this.area.getBoundingClientRect();
            const mx = cx ?? (r.left + r.width / 2), my = cy ?? (r.top + r.height / 2);
            const C = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
            // Punto del mapa bajo el cursor (coordenadas del contenedor, origen en su centro)
            const px = (mx - C.x - t.x) / s0, py = (my - C.y - t.y) / s0;
            t.scale = s1;
            t.x = mx - C.x - s1 * px;
            t.y = my - C.y - s1 * py;
            App.Map.transform = t;
            App.Map.updateMapTransform();
            const z = document.getElementById('zoomLevel');
            if (z) z.value = Math.round(s1 * 100) + '%';
        },

        escribiendo() {
            const el = document.activeElement;
            return el && (/INPUT|SELECT|TEXTAREA/.test(el.tagName) || el.isContentEditable);
        },

        eventos() {
            const area = this.area;
            area.addEventListener('mousemove', e => { this.mouse = { x: e.clientX, y: e.clientY, dentro: true }; });
            area.addEventListener('mouseleave', () => { this.mouse.dentro = false; });
            area.addEventListener('mousedown', e => {
                if (e.button === 2) { this.derecho = true; this.usoZoomDerecho = false; }
            });
            window.addEventListener('mouseup', e => { if (e.button === 2) this.derecho = false; });
            window.addEventListener('blur', () => { this.derecho = false; });
            // Evitar el menú contextual solo si el clic derecho se usó para el zoom
            area.addEventListener('contextmenu', e => {
                if (this.usoZoomDerecho) { e.preventDefault(); this.usoZoomDerecho = false; }
            });

            // Rueda: zoom hacia el cursor (reemplaza el zoom al centro).
            // Los eventos se acumulan y se aplican una vez por cuadro: un touchpad
            // envía decenas por segundo y antes cada uno redibujaba el mapa completo.
            let acum = 0, punto = null, rafRueda = 0;
            area.addEventListener('wheel', e => {
                if (!e.target.closest('#mapContainer')) return;
                e.preventDefault();
                e.stopPropagation();
                acum += e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
                punto = [e.clientX, e.clientY];
                if (rafRueda) return;
                rafRueda = requestAnimationFrame(() => {
                    rafRueda = 0;
                    const d = Math.max(-500, Math.min(500, acum));
                    acum = 0;
                    if (d) this.zoomAt(Math.exp(-d * 0.0014), punto[0], punto[1]);   // 1 paso de rueda ≈ ±15 %
                });
            }, { capture: true, passive: false });

            document.addEventListener('keydown', e => {
                if (this.escribiendo() || e.ctrlKey || e.metaKey || e.altKey) return;
                const k = e.key;
                const acercar = k === '+' || k === '=' || (this.derecho && k === 'ArrowUp');
                const alejar = k === '-' || k === '_' || (this.derecho && k === 'ArrowDown');
                const sobreMapa = this.mouse.dentro || this.derecho || document.body.classList.contains('vbc-solo-mapa');
                if ((acercar || alejar) && sobreMapa) {
                    e.preventDefault();
                    if (this.derecho) this.usoZoomDerecho = true;
                    this.zoomAt(acercar ? 1.2 : 1 / 1.2, this.mouse.dentro ? this.mouse.x : null, this.mouse.dentro ? this.mouse.y : null);
                } else if (k === '0' && sobreMapa) {
                    e.preventDefault();
                    App.Map.resetMap();
                } else if (k === '[') {
                    e.preventDefault();
                    this.togglePanel('izq');
                } else if (k === ']') {
                    e.preventDefault();
                    this.togglePanel('der');
                } else if ((k === 'm' || k === 'M') && !e.shiftKey) {
                    e.preventDefault();
                    this.toggleSoloMapa();
                } else if (k === 'Escape' && document.body.classList.contains('vbc-solo-mapa') && !document.fullscreenElement) {
                    this.toggleSoloMapa(false);
                }
            });
        },

        /* ------------------------------------------------ rendimiento */
        /** Arrastre fluido: una actualización por cuadro, sin animación de retraso,
         *  y el mapa en «modo movimiento» (sin hover ni animaciones) mientras se mueve. */
        rendimiento() {
            const area = this.area;
            const cont = document.getElementById('mapContainer');
            if (!cont || App.Map._uxRendimiento) return;
            App.Map._uxRendimiento = true;
            let arrastre = false, rafArr = 0, tFin = null;
            cont.addEventListener('mousedown', e => { if (e.button === 0 || e.button === 2) arrastre = true; }, true);
            window.addEventListener('mouseup', () => { arrastre = false; }, true);
            window.addEventListener('blur', () => { arrastre = false; });
            const moviendo = () => {
                if (!area.classList.contains('mapa-moviendo')) area.classList.add('mapa-moviendo');
                clearTimeout(tFin);
                tFin = setTimeout(() => area.classList.remove('mapa-moviendo'), 200);
            };
            const orig = App.Map.updateMapTransform.bind(App.Map);
            App.Map.updateMapTransform = function () {
                moviendo();
                if (!arrastre) { orig(); return; }
                // Arrastrando: el mouse puede enviar varios eventos por cuadro → aplicar solo el último
                if (rafArr) return;
                rafArr = requestAnimationFrame(() => {
                    rafArr = 0;
                    orig();
                    cont.style.transition = 'none';   // seguir al mouse sin retraso
                });
            };
        },

        /* ------------------------------------------------ leyenda plegable */
        leyendaPlegable() {
            const box = document.getElementById('colorModeLegendContainer');
            const head = box?.querySelector('.legend-box-header');
            if (!box || !head || head.querySelector('.legend-toggle')) return;
            const flecha = document.createElement('span');
            flecha.className = 'legend-toggle';
            flecha.textContent = '▾';
            head.appendChild(flecha);
            head.setAttribute('role', 'button');
            head.tabIndex = 0;
            head.title = 'Mostrar u ocultar la leyenda';
            let colapsada = true;            // por defecto plegada para ahorrar espacio
            try { const v = localStorage.getItem('vbc-leyenda-cjb'); if (v !== null) colapsada = v === '1'; } catch (e) { /* */ }
            const aplicar = () => {
                box.classList.toggle('colapsada', colapsada);
                head.setAttribute('aria-expanded', String(!colapsada));
            };
            const alternar = () => {
                colapsada = !colapsada; aplicar();
                try { localStorage.setItem('vbc-leyenda-cjb', colapsada ? '1' : '0'); } catch (e) { /* */ }
            };
            head.addEventListener('click', alternar);
            head.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); } });
            aplicar();
        },

        /* ------------------------------------------------ paneles laterales */
        pestanasPaneles() {
            const crear = (lado, titulo) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `panel-pestana panel-pestana-${lado}`;
                b.dataset.lado = lado;
                b.title = titulo;
                b.setAttribute('aria-label', titulo);
                b.innerHTML = '<span></span>';
                b.addEventListener('click', e => { e.stopPropagation(); this.togglePanel(lado); });
                b.addEventListener('mousedown', e => e.stopPropagation());
                this.area.appendChild(b);
            };
            crear('izq', 'Ocultar / mostrar filtros (tecla [)');
            crear('der', 'Ocultar / mostrar detalles (tecla ])');
            let pref = {};
            try { pref = JSON.parse(localStorage.getItem('vbc-paneles-cjb') || '{}'); } catch (e) { /* sin almacenamiento */ }
            if (pref.izq) this.togglePanel('izq', true, true);
            if (pref.der) this.togglePanel('der', true, true);
        },

        togglePanel(lado, ocultar, silencioso) {
            const cls = lado === 'izq' ? 'vbc-sin-izq' : 'vbc-sin-der';
            const v = typeof ocultar === 'boolean' ? ocultar : !document.body.classList.contains(cls);
            document.body.classList.toggle(cls, v);
            try {
                localStorage.setItem('vbc-paneles-cjb', JSON.stringify({
                    izq: document.body.classList.contains('vbc-sin-izq'),
                    der: document.body.classList.contains('vbc-sin-der')
                }));
            } catch (e) { /* sin almacenamiento */ }
            if (!silencioso) setTimeout(() => { window.dispatchEvent(new Event('resize')); App.Map.updateMapTransform(); }, 320);
        },

        /* ------------------------------------------------ solo mapa */
        botonSoloMapa() {
            const ctrls = document.querySelector('.map-controls');
            if (!ctrls || document.getElementById('btnSoloMapa')) return;
            const b = document.createElement('button');
            b.id = 'btnSoloMapa';
            b.className = 'map-btn';
            b.type = 'button';
            b.title = 'Solo mapa: ocultar paneles y pantalla completa (tecla M · Esc para salir)';
            b.setAttribute('aria-pressed', 'false');
            b.textContent = '⤢';
            b.addEventListener('click', () => this.toggleSoloMapa());
            ctrls.appendChild(b);

            const ayuda = document.createElement('button');
            ayuda.className = 'map-btn map-btn-ayuda';
            ayuda.type = 'button';
            ayuda.textContent = '?';
            ayuda.title = 'Atajos del mapa';
            ayuda.addEventListener('click', () => {
                const msg = 'Rueda: zoom al cursor · Clic derecho presionado + ↑/↓: zoom · Teclas + / −: zoom · 0: restablecer · [ y ]: ocultar paneles · M: solo mapa · Esc: salir';
                if (App.UI?.showToast) App.UI.showToast(msg); else alert(msg);
            });
            ctrls.appendChild(ayuda);

            document.addEventListener('fullscreenchange', () => {
                // Si el usuario sale de pantalla completa (Esc), también vuelven los paneles
                if (!document.fullscreenElement && this.entroFullscreen && document.body.classList.contains('vbc-solo-mapa')) {
                    this.entroFullscreen = false;
                    this.toggleSoloMapa(false);
                }
            });
        },

        toggleSoloMapa(forzar) {
            const activo = typeof forzar === 'boolean' ? forzar : !document.body.classList.contains('vbc-solo-mapa');
            document.body.classList.toggle('vbc-solo-mapa', activo);
            const b = document.getElementById('btnSoloMapa');
            if (b) {
                b.textContent = activo ? '⤡' : '⤢';
                b.setAttribute('aria-pressed', String(activo));
                b.title = activo ? 'Mostrar paneles (M o Esc)' : 'Solo mapa: ocultar paneles y pantalla completa (tecla M · Esc para salir)';
            }
            if (activo && !document.fullscreenElement && document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().then(() => { this.entroFullscreen = true; }).catch(() => {});
            } else if (!activo && document.fullscreenElement && this.entroFullscreen) {
                this.entroFullscreen = false;
                document.exitFullscreen?.();
            }
            setTimeout(() => { window.dispatchEvent(new Event('resize')); App.Map.updateMapTransform(); }, 220);
        }
    };

    window.MapaUX = MapaUX;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => MapaUX.init());
    else MapaUX.init();
})();

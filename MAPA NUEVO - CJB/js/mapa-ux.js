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
            this.pestanasPaneles();
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

            // Rueda: zoom hacia el cursor (reemplaza el zoom al centro)
            area.addEventListener('wheel', e => {
                if (!e.target.closest('#mapContainer')) return;
                e.preventDefault();
                e.stopPropagation();
                this.zoomAt(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY);
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

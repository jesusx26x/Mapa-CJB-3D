/* ==================================================
   VBC THEME SYNC
   Mantiene el tema claro/oscuro (body.light-mode) igual en todas las
   páginas del Sistema VBC. No reemplaza los botones de tema de cada
   página: solo guarda cada cambio y lo aplica al cargar.

   Uso: <script src="vbc-core/vbc-theme-sync.js"></script> como primer
   elemento de <body>. Opcional: data-default="light" para que la página
   abra en claro cuando no hay preferencia guardada.
   ================================================== */
(function () {
    'use strict';

    var KEY = 'vbc-theme';
    var script = document.currentScript;
    var porDefecto = script ? script.getAttribute('data-default') : null;

    function leer() {
        try { return localStorage.getItem(KEY); } catch (e) { return null; }
    }

    function guardar(tema) {
        try { localStorage.setItem(KEY, tema); } catch (e) { /* almacenamiento bloqueado */ }
    }

    function temaActual() {
        return document.body.classList.contains('light-mode') ? 'light' : 'dark';
    }

    function hayApp() {
        return typeof App !== 'undefined' && App && App.UI && typeof App.UI.toggleTheme === 'function';
    }

    // Las apps CJB/CPAG guardan su propio estado (CJB_MAP_STATE_V1) con el tema y lo
    // reaplican al iniciar sin repintar el mapa. Se alinea para que no pise la preferencia común.
    function alinearEstadoApps(tema) {
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (!/_MAP_STATE_V\d+$/.test(k)) continue;
                var st = JSON.parse(localStorage.getItem(k));
                if (st && st.theme && st.theme !== tema) {
                    st.theme = tema;
                    localStorage.setItem(k, JSON.stringify(st));
                }
            }
        } catch (e) { /* estado ilegible: se ignora */ }
    }

    function actualizarBoton() {
        var btn = document.getElementById('themeToggle');
        if (!btn) return;
        var light = temaActual() === 'light';
        var ico = btn.querySelector('.ico');
        var txt = btn.querySelector('.txt');
        if (ico || txt) {
            // Botones con texto: muestran el modo al que se cambia
            if (ico) ico.textContent = light ? '🌙' : '☀️';
            if (txt) txt.textContent = light ? 'Modo oscuro' : 'Modo claro';
            return;
        }
        if (btn.children.length) return;
        // Solo ícono: las apps CJB/CPAG (App.UI.toggleTheme) muestran el modo al que se cambia;
        // timelapse y evolución muestran el modo actual. Se respeta la convención de cada página.
        btn.textContent = hayApp() ? (light ? '🌙' : '☀️') : (light ? '☀️' : '🌙');
    }

    function aplicar(tema, repintar) {
        var light = tema === 'light';
        if (document.body.classList.contains('light-mode') === light) return;
        document.body.classList.toggle('light-mode', light);
        if (repintar && typeof App !== 'undefined' && App && App.Map && typeof App.Map.render === 'function') {
            try { App.Map.render(); } catch (e) { /* mapa aún no listo */ }
        }
    }

    function iniciar() {
        var guardado = leer();
        var tema = guardado || porDefecto;
        if (tema === 'light' || tema === 'dark') {
            aplicar(tema, false); // antes de que las apps pinten el mapa
            // El tema por defecto de la página pasa a ser el del sistema, para que se mantenga al navegar
            if (!guardado) guardar(tema);
            alinearEstadoApps(tema);
        }

        new MutationObserver(function () {
            var t = temaActual();
            if (leer() !== t) {
                guardar(t);
                alinearEstadoApps(t);
            }
            actualizarBoton();
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

        // Otra pestaña cambió el tema
        window.addEventListener('storage', function (e) {
            if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) aplicar(e.newValue, true);
        });

        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', actualizarBoton);
        else actualizarBoton();
    }

    if (document.body) iniciar();
    else document.addEventListener('DOMContentLoaded', iniciar);
})();

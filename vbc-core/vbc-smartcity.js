/**
 * ====================================================================
 * VBC-CORE: Smart City & Executive Dossier Module (vbc-smartcity.js)
 * Fideicomiso VBC - Sistema de Gestión Territorial
 * Ultra-Ligero, 60 FPS, Sin elementos flotantes intrusivos
 * ====================================================================
 */

(function (window) {
    'use strict';

    window.VBC = window.VBC || {};

    const SmartCity = {
        init() {
            // Inicializar enlace de impresión de Dossier si el botón existe
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setup());
            } else {
                this.setup();
            }
        },

        setup() {
            const btnPrint = document.getElementById('btnPrint');
            if (btnPrint) {
                btnPrint.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.generateExecutiveDossier();
                });
            }
            console.log("🌐 [VBC SmartCity] Módulo Smart City integrado sin colisiones visuales.");
        },

        getState() {
            if (window.App && window.App.State) return window.App.State;
            if (window.VBC.Engine && window.VBC.Engine.state) return window.VBC.Engine.state;
            return { lotesMap: new Map(), selectedId: null };
        },

        /**
         * Generador de Dossier Técnico Ejecutivo en 1 Clic (PDF)
         */
        generateExecutiveDossier() {
            const state = this.getState();
            const selectedId = state.selectedId;

            if (!selectedId) {
                alert("Por favor selecciona un lote en el mapa antes de imprimir o generar su Ficha Técnica.");
                return;
            }

            const lote = state.lotesMap.get(selectedId);
            if (!lote) return;

            const areaFormat = (lote._parsedArea || parseFloat(String(lote.area_m2 || 0).replace(/,/g, '')) || 0).toLocaleString('es-DO');
            const fechaHoy = new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });

            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                window.print();
                return;
            }

            printWindow.document.write(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <meta charset="UTF-8">
                    <title>Ficha Técnica Oficial - Lote ${lote.id} | Fideicomiso VBC</title>
                    <style>
                        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 36px; color: #0f172a; background: #fff; line-height: 1.5; margin: 0; }
                        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #00a8ff; padding-bottom: 16px; margin-bottom: 24px; }
                        .title h1 { margin: 0; font-size: 22px; color: #1e3a8a; }
                        .title p { margin: 4px 0 0 0; color: #64748b; font-size: 13px; }
                        .badge { background: #00a8ff; color: #fff; padding: 6px 14px; border-radius: 20px; font-weight: bold; font-size: 13px; text-transform: uppercase; }
                        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
                        .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
                        .card h3 { margin: 0 0 4px 0; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
                        .card p { font-size: 16px; font-weight: bold; margin: 0; color: #0f172a; }
                        .obs-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px; border-radius: 4px; margin-bottom: 24px; font-size: 13px; }
                        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 11px; color: #94a3b8; }
                        @media print { .btn-print { display: none; } }
                    </style>
                </head>
                <body>
                    <button class="btn-print" onclick="window.print()" style="position:fixed; top:20px; right:20px; background:#00a8ff; color:#fff; border:none; padding:10px 18px; border-radius:6px; font-weight:bold; cursor:pointer; box-shadow: 0 4px 12px rgba(0,168,255,0.3);">🖨️ Imprimir / Guardar en PDF</button>
                    <div class="header">
                        <div class="title">
                            <h1>FIDEICOMISO VBC — FICHA TÉCNICA OFICIAL</h1>
                            <p>Sistema de Gestión Territorial • Lote ${lote.id}</p>
                        </div>
                        <div class="badge">${lote.estado || 'Adjudicado'}</div>
                    </div>

                    <div class="grid">
                        <div class="card">
                            <h3>Identificador de Lote</h3>
                            <p>${lote.id}</p>
                        </div>
                        <div class="card">
                            <h3>Superficie Total</h3>
                            <p>${areaFormat} m²</p>
                        </div>
                        <div class="card">
                            <h3>Categoría / Uso</h3>
                            <p>${lote.tipo} ${lote.subtipo ? '• ' + lote.subtipo : ''}</p>
                        </div>
                        <div class="card">
                            <h3>Nombre del Proyecto</h3>
                            <p>${lote.nombre || 'Por Definir'}</p>
                        </div>
                        <div class="card">
                            <h3>Empresa Desarrolladora</h3>
                            <p>${lote.desarrollador || 'Pendiente de Asignación'}</p>
                        </div>
                        <div class="card">
                            <h3>Unidades / Locales</h3>
                            <p>${lote.unidades && lote.unidades !== '0' ? lote.unidades : 'N/A'}</p>
                        </div>
                    </div>

                    <div class="obs-box">
                        <strong>Estatus Contractual y Observaciones Técnicas:</strong><br>
                        ${lote.observaciones || 'Sin observaciones registradas.'}
                    </div>

                    <div class="footer">
                        <span>Dirección de Gestión Territorial — Fideicomiso VBC</span>
                        <span>Emitido: ${fechaHoy}</span>
                    </div>
                </body>
                </html>
            `);
            printWindow.document.close();
        }
    };

    window.VBC.SmartCity = SmartCity;
    SmartCity.init();

})(window);

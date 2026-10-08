/**
 * ====================================================================
 * VBC-CORE: Master Executive Reporting & PDF Export Engine (vbc-reporter.js)
 * Fideicomiso VBC - Sistema de Gestión Territorial
 * Diseñado para Mesas de Trabajo Semanales y Control Ministerial
 * ====================================================================
 */

(function (window) {
    'use strict';

    window.VBC = window.VBC || {};

    const Reporter = {
        init() {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setup());
            } else {
                this.setup();
            }
        },

        setup() {
            this.bindUI();
            console.log("📑 [VBC Reporter] Motor de Reportería Ejecutiva inicializado.");
        },

        bindUI() {
            // Vincular botón en panel de filtros si existe
            const btn = document.getElementById('btnExportFilteredReport');
            if (btn) {
                btn.addEventListener('click', () => this.generateExecutiveReport());
            }
        },

        getState() {
            if (window.App && window.App.State) return window.App.State;
            if (typeof App !== 'undefined' && App.State) return App.State;
            if (window.VBC && window.VBC.Engine && window.VBC.Engine.state) return window.VBC.Engine.state;
            return { filtered: [], lotesMap: new Map(), filters: {} };
        },

        getProjectName() {
            if (window.App && window.App.Config && window.App.Config.name) return window.App.Config.name;
            if (typeof App !== 'undefined' && App.Config && App.Config.name) return App.Config.name;
            if (window.VBC && window.VBC.Engine && window.VBC.Engine.config && window.VBC.Engine.config.name) return window.VBC.Engine.config.name;
            return document.title.includes('Guzmán') || document.title.includes('CPAG') ? 'Ciudad Presidente Antonio Guzmán' : 'Ciudad Juan Bosch';
        },

        getFilteredLots() {
            const state = this.getState();
            if (state.filtered && state.filtered.length > 0) return state.filtered;

            const lotesMap = state.lotesMap || (window.App && window.App.State && window.App.State.lotesMap);
            if (lotesMap && lotesMap.size > 0) {
                if (window.App && window.App.Filter && typeof window.App.Filter.matchesFilters === 'function') {
                    const res = [];
                    lotesMap.forEach(l => {
                        if (window.App.Filter.matchesFilters(l)) res.push(l);
                    });
                    if (res.length > 0) return res;
                }
                return Array.from(lotesMap.values());
            }
            return [];
        },

        /**
         * Captura y auto-ajuste vectorial del mapa con los lotes filtrados resaltados
         */
        generateMapSnapshot(lotes) {
            const svgEl = document.querySelector('#mapContainer svg') || document.querySelector('svg');
            if (!svgEl) return '';

            const filteredSet = new Set(lotes.map(l => l.id));
            const clone = svgEl.cloneNode(true);

            // Eliminar cualquier transformación inline de zoom/pan del usuario para que el plano salga 100% completo
            clone.removeAttribute('style');
            clone.removeAttribute('transform');

            // Asegurar viewBox oficial del plano maestro completo (793.7 x 1122.5)
            const origViewBox = svgEl.getAttribute('viewBox') || '0 0 793.70079 1122.5197';
            clone.setAttribute('viewBox', origViewBox);
            clone.setAttribute('width', '100%');
            clone.setAttribute('height', '360px');
            clone.style.width = '100%';
            clone.style.height = '360px';
            clone.style.maxHeight = '360px';
            clone.style.background = '#090d16';
            clone.style.borderRadius = '8px';
            clone.style.display = 'block';
            clone.style.margin = '0 auto';
            clone.style.overflow = 'hidden';

            const state = this.getState();
            const lotesMap = state.lotesMap || new Map();
            const idPattern = /^(\d{2}-\d{2}-\d{2}|[Cc]-\d{1,2})$/;

            // Colorear explícitamente los lotes en el SVG clonado
            clone.querySelectorAll('path, polygon, rect, circle').forEach(el => {
                const id = el.id;
                if (id && idPattern.test(id)) {
                    const lote = lotesMap.get(id);
                    if (filteredSet.has(id)) {
                        // Lote filtrado activo: color oficial brillante y trazo resaltado blanco
                        let color = '#00a8ff';
                        if (window.App && window.App.Map && typeof window.App.Map.getColor === 'function') {
                            color = window.App.Map.getColor(lote);
                        } else if (lote) {
                            const tipo = (lote.tipo || '').toLowerCase();
                            if (tipo.includes('comercial')) color = '#f59e0b';
                            else if (tipo.includes('institucional')) color = '#a855f7';
                            else if (tipo.includes('verde')) color = '#22c55e';
                            else if (tipo.includes('infraestructura')) color = '#94a3b8';
                            else color = '#00a8ff';
                        }
                        el.setAttribute('fill', color);
                        el.setAttribute('opacity', '1');
                        el.setAttribute('stroke', '#ffffff');
                        el.setAttribute('stroke-width', '2');
                        el.style.fill = color;
                        el.style.opacity = '1';
                        el.style.stroke = '#ffffff';
                        el.style.strokeWidth = '2px';
                    } else {
                        // Lote no filtrado: fondo atenuado y trazo tenue para ver la trama urbana completa
                        el.setAttribute('fill', '#1e293b');
                        el.setAttribute('opacity', '0.4');
                        el.setAttribute('stroke', 'rgba(255, 255, 255, 0.12)');
                        el.setAttribute('stroke-width', '0.5');
                        el.style.fill = '#1e293b';
                        el.style.opacity = '0.4';
                        el.style.stroke = 'rgba(255, 255, 255, 0.12)';
                        el.style.strokeWidth = '0.5px';
                    }
                } else {
                    // Calles, avenidas y manzanas del plano
                    if (el.tagName.toLowerCase() !== 'g') {
                        el.setAttribute('stroke', 'rgba(255, 255, 255, 0.14)');
                        el.setAttribute('stroke-width', '0.4');
                    }
                }
            });

            return clone.outerHTML;
        },

        /**
         * Generar el Informe Ejecutivo Completo con Mapa y Tablas
         */
        generateExecutiveReport() {
            const lotes = this.getFilteredLots();
            const state = this.getState();

            if (!lotes || lotes.length === 0) {
                alert("No hay lotes que coincidan con los filtros seleccionados para generar el informe.");
                return;
            }

            const projectName = this.getProjectName();
            const fechaHoy = new Date().toLocaleDateString('es-DO', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
            const horaHoy = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

            // 1. Cálculos y Métricas Consolidadas
            let totalArea = 0;
            let totalUnidades = 0;
            let totalTerminadas = 0;
            const estadosCount = {
                'Terminado': 0,
                'En Construcción': 0,
                'En Licitación': 0,
                'Adjudicado': 0,
                'Disponible': 0,
                'Paralizado': 0,
                'No Iniciado': 0
            };

            const tiposCount = {};

            lotes.forEach(l => {
                const area = l._parsedArea || parseFloat(String(l.area_m2 || 0).replace(/,/g, '')) || 0;
                totalArea += area;

                const unid = parseInt(String(l.unidades || 0).replace(/,/g, ''), 10) || 0;
                totalUnidades += unid;

                const term = parseInt(String(l['Unidades terminadas'] || l.unidades_terminadas || 0).replace(/,/g, ''), 10) || 0;
                totalTerminadas += term;

                // Conteo por estado normalizado
                const est = (l.estado || '').toLowerCase();
                if (est.includes('terminado') || est.includes('concluido')) estadosCount['Terminado']++;
                else if (est.includes('construcc')) estadosCount['En Construcción']++;
                else if (est.includes('licita')) estadosCount['En Licitación']++;
                else if (est.includes('adjudicado')) estadosCount['Adjudicado']++;
                else if (est.includes('disponible')) estadosCount['Disponible']++;
                else if (est.includes('paraliz')) estadosCount['Paralizado']++;
                else estadosCount['No Iniciado']++;

                // Conteo por tipo
                const t = l.tipo || 'Otros';
                tiposCount[t] = (tiposCount[t] || 0) + 1;
            });

            const totalHectareas = (totalArea / 10000).toFixed(2);
            const totalAreaFormat = totalArea.toLocaleString('es-DO', { maximumFractionDigits: 2 });
            
            // % Avance Ponderado de la selección
            const finishedLots = estadosCount['Terminado'];
            const inProgressLots = estadosCount['En Construcción'];
            const totalLotes = lotes.length;
            const percentAvance = (finishedLots === 0 && inProgressLots === 0)
                ? '0.0'
                : (totalLotes > 0 ? (((finishedLots * 1.0 + inProgressLots * 0.5) / totalLotes) * 100).toFixed(1) : '0.0');

            // 2. Título Dinámico según Filtros
            let dynamicTitle = `Informe de Gestión Territorial — ${projectName}`;
            const activeFilterDetails = [];

            if (state.filters) {
                if (state.filters.types && state.filters.types.length > 0 && state.filters.types.length < 5) {
                    activeFilterDetails.push(`Tipo: ${state.filters.types.join(', ')}`);
                }
                if (state.filters.estado) activeFilterDetails.push(`Estado: ${state.filters.estado}`);
                if (state.filters.cuadrante) activeFilterDetails.push(`Cuadrante: ${state.filters.cuadrante}`);
                if (state.filters.desarrollador) activeFilterDetails.push(`Desarrollador: ${state.filters.desarrollador}`);
                if (state.filters.searchQuery) activeFilterDetails.push(`Búsqueda: "${state.filters.searchQuery}"`);
            }

            if (activeFilterDetails.length > 0) {
                dynamicTitle = `Informe Especial: ${activeFilterDetails.join(' • ')}`;
            }

            // 3. Captura Vectorial del Plano SVG (Ajuste Automático y Resaltado de Lotes)
            const svgCloneHtml = this.generateMapSnapshot(lotes);

            // 4. Función Auxiliar para formatear cada Fila
            const formatRowHtml = (lote) => {
                const areaFormat = (lote._parsedArea || parseFloat(String(lote.area_m2 || 0).replace(/,/g, '')) || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });
                const estado = lote.estado || 'Adjudicado';
                const estadoClass = estado.toLowerCase().replace(/\s+/g, '-');
                
                let unidadesStr = '-';
                if (lote.unidades && lote.unidades !== '0') {
                    if (lote['Unidades terminadas'] !== undefined && lote['Unidades terminadas'] !== '') {
                        unidadesStr = `<strong>${lote['Unidades terminadas']}</strong> / ${lote.unidades}`;
                    } else {
                        unidadesStr = `${lote.unidades}`;
                    }
                } else if (lote['Unidades terminadas'] && lote['Unidades terminadas'] !== '0') {
                    unidadesStr = `<strong>${lote['Unidades terminadas']}</strong>`;
                }

                const fechaAdj = lote['Fecha adjudicacion'] || lote.fecha_adjudicacion || '-';
                
                let terms = null;
                if (window.App && window.App.Map && typeof window.App.Map.calculateContractualTerms === 'function') {
                    terms = window.App.Map.calculateContractualTerms(lote);
                }
                const fechaTermino = terms ? terms.fechaTermino : (lote['Fecha entrega'] || lote.fecha_entrega || '-');
                const plazoBadge = terms ? `<span class="report-badge" style="background:${terms.color}; color:#fff; font-size:8.5px; padding:2px 5px;">${terms.criticidad}</span>` : '-';

                const dev = lote.desarrollador && lote.desarrollador !== 'nan' ? lote.desarrollador : '<span style="color:#94a3b8; font-style:italic;">[Sin asignar]</span>';
                const nombreProj = lote.nombre && lote.nombre !== 'nan' ? lote.nombre : '<span style="color:#94a3b8; font-style:italic;">[Sin nombre]</span>';
                
                let rawObs = lote.observaciones && lote.observaciones !== 'nan' ? lote.observaciones : '-';
                let formattedObs = rawObs;
                if (rawObs !== '-') {
                    formattedObs = rawObs
                        .replace(/DESGLOSE DE VIVIENDAS \([^)]+\):/gi, '<b style="color:#0284c7;">Desglose:</b>')
                        .replace(/ÚLTIMA FISCALIZACIÓN \([^)]+\):/gi, '<b style="color:#0284c7;">Fiscalización:</b>')
                        .replace(/ESTATUS LEGAL:/gi, '<b style="color:#0284c7;">Legal:</b>')
                        .replace(/\[Adjudicación original:[^\]]+\]/gi, '');
                }

                return `
                    <tr>
                        <td class="cell-id"><strong>${lote.id}</strong></td>
                        <td class="cell-proj"><strong>${nombreProj}</strong><br><span class="cell-sub">${lote.tipo}${lote.subtipo ? ' • ' + lote.subtipo : ''}</span></td>
                        <td class="cell-dev">${dev}</td>
                        <td class="cell-status" style="text-align:center;"><span class="report-badge ${estadoClass}">${estado}</span></td>
                        <td class="cell-num" style="text-align:right;">${areaFormat} m²</td>
                        <td class="cell-num" style="text-align:center;">${unidadesStr}</td>
                        <td class="cell-date" style="text-align:center;">${fechaAdj}</td>
                        <td class="cell-date" style="text-align:center;">${fechaTermino}</td>
                        <td class="cell-status" style="text-align:center;">${plazoBadge}</td>
                        <td class="cell-obs" style="font-size:9.5px; line-height:1.2; color:#334155;">${formattedObs}</td>
                    </tr>
                `;
            };

            const theadHtml = `
                <thead>
                    <tr>
                        <th style="width:68px;">ID Lote</th>
                        <th style="width:140px;">Proyecto / Uso</th>
                        <th style="width:130px;">Empresa Desarrolladora</th>
                        <th style="width:85px; text-align:center;">Estatus Obra</th>
                        <th style="width:80px; text-align:right;">Superficie</th>
                        <th style="width:75px; text-align:center;">Unidades</th>
                        <th style="width:75px; text-align:center;">F. Adjudicación</th>
                        <th style="width:75px; text-align:center;">F. Término</th>
                        <th style="width:105px; text-align:center;">Estatus Plazo</th>
                        <th>Observaciones / Fiscalización</th>
                    </tr>
                </thead>
            `;

            // 5. Paginación Inteligente para Garantizar Cabeceras en Cada Hoja FÍSICA
            let pages = [];
            const lotsPerPageFirst = svgCloneHtml ? 4 : 8;
            const lotsPerPageOther = 8;

            if (lotes.length <= lotsPerPageFirst) {
                // Todo en 1 página
                pages.push(lotes);
            } else {
                pages.push(lotes.slice(0, lotsPerPageFirst));
                let remaining = lotes.slice(lotsPerPageFirst);
                while (remaining.length > 0) {
                    pages.push(remaining.slice(0, lotsPerPageOther));
                    remaining = remaining.slice(lotsPerPageOther);
                }
            }

            const totalPages = pages.length;

            let allPagesHtml = '';
            pages.forEach((pageLots, pageIdx) => {
                const pageNum = pageIdx + 1;
                const pageRowsHtml = pageLots.map(l => formatRowHtml(l)).join('');

                if (pageNum === 1) {
                    // PÁGINA 1: Portada Ejecutiva + KPIs + Mapa + Primera sección de tabla (4 lotes)
                    allPagesHtml += `
                        <div class="report-page" data-page="${pageNum}">
                            <!-- ENCABEZADO MINISTERIAL OFICIAL -->
                            <div class="report-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; border-bottom:2px solid #0284c7; padding-bottom:4px;">
                                <div class="report-header-left">
                                    <div class="report-institution" style="font-size:0.65rem; font-weight:800; color:#0284c7; letter-spacing:1px;">REPÚBLICA DOMINICANA • FIDEICOMISO VBC</div>
                                    <h1 class="report-title" style="font-size:1.05rem; font-weight:900; color:#0f172a; margin:1px 0;">${dynamicTitle}</h1>
                                    <div class="report-meta" style="font-size:0.65rem;">
                                        <span><strong>Ámbito:</strong> ${projectName}</span> | 
                                        <span><strong>Emisión:</strong> ${fechaHoy}, ${horaHoy}</span> | 
                                        <span><strong>Registros:</strong> ${lotes.length} lotes</span>
                                    </div>
                                </div>
                                <div class="report-header-right">
                                    <div class="report-logo-box" style="font-size:1.1rem; padding:4px 10px;">🏛️ VBC</div>
                                </div>
                            </div>

                            <!-- TARJETAS DE KPIS Y RESUMEN EJECUTIVO -->
                            <div class="report-kpi-grid" style="gap:6px; margin-bottom:6px;">
                                <div class="report-kpi-card" style="padding:4px 8px;">
                                    <div class="kpi-tag">TOTAL LOTES</div>
                                    <div class="kpi-val" style="font-size:1.05rem;">${lotes.length}</div>
                                    <div class="kpi-sub">Lotes en selección</div>
                                </div>
                                <div class="report-kpi-card" style="padding:4px 8px;">
                                    <div class="kpi-tag">SUPERFICIE TOTAL</div>
                                    <div class="kpi-val" style="font-size:1.05rem;">${totalAreaFormat} <small style="font-size:0.6em;">m²</small></div>
                                    <div class="kpi-sub">${totalHectareas} Hectáreas</div>
                                </div>
                                <div class="report-kpi-card" style="padding:4px 8px;">
                                    <div class="kpi-tag">UNIDADES / LOCALES</div>
                                    <div class="kpi-val" style="font-size:1.05rem;">${totalUnidades.toLocaleString('es-DO')}</div>
                                    <div class="kpi-sub">${totalTerminadas > 0 ? totalTerminadas.toLocaleString('es-DO') + ' concluidas' : 'Proyectadas'}</div>
                                </div>
                                <div class="report-kpi-card highlight" style="padding:4px 8px;">
                                    <div class="kpi-tag">ESTIMACIÓN AVANCE</div>
                                    <div class="kpi-val" style="font-size:1.05rem;">${percentAvance}%</div>
                                    <div class="kpi-sub">${finishedLots} concluidos • ${inProgressLots} en obra</div>
                                </div>
                            </div>

                            <!-- DESGLOSE DE ESTADOS -->
                            <div class="report-status-summary" style="padding:4px 8px; margin-bottom:6px; font-size:0.62rem;">
                                <span class="status-pill terminado">Terminados: <strong>${estadosCount['Terminado']}</strong></span>
                                <span class="status-pill construccion">En Construcción: <strong>${estadosCount['En Construcción']}</strong></span>
                                <span class="status-pill licitacion">En Licitación: <strong>${estadosCount['En Licitación']}</strong></span>
                                <span class="status-pill adjudicado">Adjudicados: <strong>${estadosCount['Adjudicado']}</strong></span>
                                <span class="status-pill disponible">Disponibles: <strong>${estadosCount['Disponible']}</strong></span>
                                <span class="status-pill paralizado">Paralizados: <strong>${estadosCount['Paralizado']}</strong></span>
                                <span class="status-pill no-iniciado">No Iniciados: <strong>${estadosCount['No Iniciado']}</strong></span>
                            </div>

                            <!-- PLANO VECTORIAL FILTRADO -->
                            ${svgCloneHtml ? `
                            <div class="report-map-section" style="margin-bottom:6px;">
                                <div class="report-map-container" style="max-height:140px; padding:4px;">
                                    ${svgCloneHtml}
                                </div>
                            </div>
                            ` : ''}

                            <!-- TABLA DETALLADA DE LOTES Y CONTRATOS -->
                            <div class="report-table-section" style="margin-top:0; flex-grow:1;">
                                <table class="report-table">
                                    ${theadHtml}
                                    <tbody>
                                        ${pageRowsHtml}
                                    </tbody>
                                </table>
                            </div>

                            <!-- PIE DE PÁGINA OFICIAL -->
                            <div class="report-page-footer">
                                <div>Documento Oficial de Seguimiento Territorial • Fideicomiso VBC</div>
                                <div>Página ${pageNum} de ${totalPages}</div>
                            </div>
                        </div>
                    `;
                } else {
                    // PÁGINAS 2..N: Cabecera resumida + Tabla con TH repetido + 8 Filas
                    allPagesHtml += `
                        <div class="report-page" data-page="${pageNum}">
                            <!-- CABECERA RESUMIDA CONTINUA -->
                            <div class="report-page-header-mini">
                                <div>REPÚBLICA DOMINICANA • FIDEICOMISO VBC — ${dynamicTitle}</div>
                                <div>Página ${pageNum} de ${totalPages}</div>
                            </div>

                            <!-- TABLA CON CABECERA REPETIDA -->
                            <div class="report-table-section" style="margin-top:0; flex-grow:1;">
                                <table class="report-table">
                                    ${theadHtml}
                                    <tbody>
                                        ${pageRowsHtml}
                                    </tbody>
                                </table>
                            </div>

                            <!-- PIE DE PÁGINA OFICIAL -->
                            <div class="report-page-footer">
                                <div>Documento Oficial de Seguimiento Territorial • Fideicomiso VBC</div>
                                <div>Página ${pageNum} de ${totalPages}</div>
                            </div>
                        </div>
                    `;
                }
            });

            const reportHtml = `
                <div class="vbc-report-wrapper" id="vbcReportPrintArea">
                    ${allPagesHtml}
                </div>
            `;

            // 6. Abrir Modal de Previsualización y Descarga
            this.showPreviewModal(reportHtml, dynamicTitle);
        },

        showPreviewModal(reportHtml, title) {
            let modal = document.getElementById('vbcReportModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'vbcReportModal';
                modal.className = 'vbc-report-modal-backdrop';
                document.body.appendChild(modal);
            }

            modal.innerHTML = `
                <div class="vbc-report-modal-content">
                    <div class="vbc-report-modal-bar">
                        <div class="modal-bar-title">📑 Vista Previa de Informe Ejecutivo (Formato Horizontal con Cabeceras en Cada Hoja)</div>
                        <div class="modal-bar-actions">
                            <button class="btn-modal-action btn-pdf" id="btnDownloadPDF">
                                📥 Descargar PDF Oficial
                            </button>
                            <button class="btn-modal-action btn-print" id="btnPrintReport">
                                🖨️ Imprimir
                            </button>
                            <button class="btn-modal-action btn-close" id="btnCloseReportModal">
                                ✖ Cerrar
                            </button>
                        </div>
                    </div>
                    <div class="vbc-report-modal-body" id="vbcReportModalBody">
                        ${reportHtml}
                    </div>
                </div>
            `;

            modal.style.display = 'flex';

            // Bind Close
            document.getElementById('btnCloseReportModal').addEventListener('click', () => {
                modal.style.display = 'none';
            });

            // Bind Print
            document.getElementById('btnPrintReport').addEventListener('click', () => {
                window.print();
            });

            // Bind PDF Download via html2pdf
            document.getElementById('btnDownloadPDF').addEventListener('click', () => {
                this.downloadPDF(title);
            });
        },

        downloadPDF(title) {
            const element = document.getElementById('vbcReportPrintArea');
            if (!element) return;

            const filename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;

            if (typeof html2pdf !== 'undefined') {
                const opt = {
                    margin: [0, 0, 0, 0],
                    filename: filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0 },
                    jsPDF: { unit: 'mm', format: 'letter', orientation: 'landscape' },
                    pagebreak: { mode: ['css', 'legacy'] }
                };

                const btn = document.getElementById('btnDownloadPDF');
                if (btn) btn.textContent = '⏳ Generando PDF...';

                html2pdf().set(opt).from(element).save().then(() => {
                    if (btn) btn.textContent = '📥 Descargar PDF Oficial';
                }).catch(err => {
                    console.error("Error al exportar PDF con html2pdf:", err);
                    window.print();
                    if (btn) btn.textContent = '📥 Descargar PDF Oficial';
                });
            } else {
                window.print();
            }
        }
    };

    window.VBC.Reporter = Reporter;
    Reporter.init();

})(window);

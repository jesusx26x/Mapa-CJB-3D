const CONFIG = {
    paths: {
        lotes: 'data/lotesv2.csv',
        habitacional: 'data/Planilla Base Habitacionales.csv',
        comercial: 'data/Planilla general Comercial.csv',
        svg: 'assets/mapa.svg'
    },
    baseline: {
        viviendas2020: 4600,
        equipamientos2020: 3
    }
};

const App = {
    State: {
        lotesMap: new Map(),
        svgElementsMap: new Map(),
        habitacionalMap: new Map(),
        comercialMap: new Map(),
        filters: {
            types: [],
            cuadrante: '',
            pilar: '',
            estado: '',
            etapa: '',
            desarrollador: '',
            yearMax: 9999,
            areaMin: null,
            areaMax: null,
            multipleIds: []
        },
        filtered: [],
        selectedId: null,

        getAll() {
            return Array.from(this.lotesMap.values());
        },

        setFiltered(arr) {
            this.filtered = arr;
        }
    },

    Data: {
        async init() {
            try {
                // Load secondary CSVs first to build index
                const [habText, comText] = await Promise.all([
                    this.fetchCSV(CONFIG.paths.habitacional),
                    this.fetchCSV(CONFIG.paths.comercial)
                ]);

                this.indexSecondaryData(habText, App.State.habitacionalMap);
                this.indexSecondaryData(comText, App.State.comercialMap);

                // Load main CSV
                const mainText = await this.fetchCSV(CONFIG.paths.lotes);
                const lotes = this.parseCSV(mainText);

                // Merge and index lotes
                lotes.forEach(lote => {
                    const merged = this.mergeLote(lote);
                    App.State.lotesMap.set(merged.id, merged);
                });

                console.log(`✅ Datos cargados: ${App.State.lotesMap.size} lotes.`);
                App.State.setFiltered(Array.from(App.State.lotesMap.values()));

            } catch (error) {
                console.error("❌ Error cargando datos:", error);
                alert("Error cargando base de datos. Ver consola.");
            }
        },

        async fetchCSV(url) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
            return await response.text();
        },

        parseCSV(text) {
            const rows = [];
            let currentRow = [];
            let currentField = '';
            let inQuotes = false;

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const nextChar = text[i + 1];

                if (inQuotes) {
                    if (char === '"') {
                        if (nextChar === '"') {
                            currentField += '"';
                            i++;
                        } else {
                            inQuotes = false;
                        }
                    } else {
                        currentField += char;
                    }
                } else {
                    if (char === '"') {
                        inQuotes = true;
                    } else if (char === ',') {
                        currentRow.push(currentField.trim());
                        currentField = '';
                    } else if (char === '\n' || char === '\r') {
                        if (currentField || currentRow.length > 0) {
                            currentRow.push(currentField.trim());
                            rows.push(currentRow);
                        }
                        currentRow = [];
                        currentField = '';
                        if (char === '\r' && nextChar === '\n') i++;
                    } else {
                        currentField += char;
                    }
                }
            }
            if (currentField || currentRow.length > 0) {
                currentRow.push(currentField.trim());
                rows.push(currentRow);
            }

            const headers = rows[0].map(h => h.trim());
            return rows.slice(1).map(row => {
                const obj = {};
                headers.forEach((h, index) => {
                    obj[h] = row[index] || '';
                });
                if (obj.id) {
                    const parts = obj.id.split('-');
                    if (parts.length >= 2) {
                        obj._cuadrante = parts[0];
                        obj._manzana = parts[1];
                        obj._lote = parts[2] || '';
                    }
                }
                return obj;
            });
        },

        indexSecondaryData(text, map) {
            const rows = this.parseCSV(text);
            rows.forEach(row => {
                if (row.id) map.set(row.id, row);
            });
        },

        mergeLote(lote) {
            const hab = App.State.habitacionalMap.get(lote.id);
            const com = App.State.comercialMap.get(lote.id);
            const extra = hab || com || {};

            return {
                ...lote,
                ...extra,
                area_m2: lote.area_m2 || extra.area_m2 || '0',
                tipo: lote.tipo || extra.tipo || 'Desconocido',
                _parsedArea: this.parseArea(lote.area_m2 || extra.area_m2),
                _parsedYear: this.parseYear(lote['Fecha entrega'] || extra['Fecha entrega'])
            };
        },

        parseArea(str) {
            if (!str) return 0;
            return parseFloat(str.replace(/,/g, '')) || 0;
        },

        parseYear(str) {
            if (!str) return null;
            if (str.match(/^\d{4}$/)) return parseInt(str);
            const parts = str.split('/');
            if (parts.length === 3) return parseInt(parts[2]);
            return null;
        }
    },

    Map: {
        async init() {
            try {
                const response = await fetch(CONFIG.paths.svg);
                const svgText = await response.text();
                // CORRECTED ID: mapContainer
                document.getElementById('mapContainer').innerHTML = svgText;

                this.setupInteraction();
                this.validateSync();
                this.setupZoom();
            } catch (error) {
                console.error("❌ Error cargando SVG:", error);
            }
        },

        setupInteraction() {
            // CORRECTED ID SELECTOR
            const svg = document.querySelector('#mapContainer svg');

            svg.querySelectorAll('path, polygon, rect, circle').forEach(el => {
                const id = el.id;
                if (id && id.match(/^\d{2}-\d{2}-\d{2}$/)) {
                    App.State.svgElementsMap.set(id, el);
                    el.classList.add('lote');
                    el.addEventListener('click', () => App.UI.selectLot(id));
                    el.addEventListener('mouseenter', (e) => this.showTooltip(e, id));
                    el.addEventListener('mouseleave', () => this.hideTooltip());
                }
            });
        },

        validateSync() {
            let orphansCSV = 0;
            let orphansSVG = 0;

            App.State.lotesMap.forEach((_, id) => {
                if (!App.State.svgElementsMap.has(id)) orphansCSV++;
            });

            App.State.svgElementsMap.forEach((_, id) => {
                if (!App.State.lotesMap.has(id)) orphansSVG++;
            });

            if (orphansCSV > 0 || orphansSVG > 0) {
                console.warn(`⚠️ Mismatch detectado: ${orphansCSV} IDs en CSV sin mapa, ${orphansSVG} IDs en Mapa sin CSV.`);
            }
        },

        render() {
            App.State.svgElementsMap.forEach(el => {
                el.style.fill = '#1e293b';
                el.style.opacity = '0.3';
                el.classList.remove('highlighted');
            });

            App.State.filtered.forEach(lote => {
                const el = App.State.svgElementsMap.get(lote.id);
                if (el) {
                    el.style.fill = this.getColor(lote.tipo);
                    el.style.opacity = '1';
                }
            });

            if (App.State.selectedId) {
                const el = App.State.svgElementsMap.get(App.State.selectedId);
                if (el) el.classList.add('highlighted');
            }
        },

        getColor(tipo) {
            switch (tipo) {
                case 'Habitacional': return '#00a8ff';
                case 'Comercial': return '#f59e0b';
                case 'Institucional': return '#a855f7';
                case 'Equipamiento': return '#10b981';
                case 'Área Verde': return '#22c55e';
                default: return '#64748b';
            }
        },

        showTooltip(e, id) {
            const lote = App.State.lotesMap.get(id);
            const tooltip = document.getElementById('mapTooltip');
            if (!lote || !tooltip) return;

            tooltip.innerHTML = `<strong>${id}</strong><br>${lote.nombre || lote.tipo}<br>${lote.area_m2} m²`;
            tooltip.style.display = 'block';
            tooltip.style.left = e.pageX + 10 + 'px';
            tooltip.style.top = e.pageY + 10 + 'px';
        },

        hideTooltip() {
            const tooltip = document.getElementById('mapTooltip');
            if (tooltip) tooltip.style.display = 'none';
        },

        setupZoom() {
            this.transform = { scale: 1, x: 0, y: 0 };
            const container = document.getElementById('mapContainer');

            document.getElementById('zoomIn')?.addEventListener('click', () => this.zoom(0.2));
            document.getElementById('zoomOut')?.addEventListener('click', () => this.zoom(-0.2));
            document.getElementById('zoomReset')?.addEventListener('click', () => this.resetMap());

            let isDragging = false;
            let start = { x: 0, y: 0 };

            container.addEventListener('mousedown', (e) => {
                isDragging = true;
                start = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
                container.style.cursor = 'grabbing';
            });

            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                e.preventDefault();
                this.transform.x = e.clientX - start.x;
                this.transform.y = e.clientY - start.y;
                this.updateMapTransform();
            });

            window.addEventListener('mouseup', () => {
                isDragging = false;
                container.style.cursor = 'default';
            });

            container.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.1 : 0.1;
                this.zoom(delta);
            });
        },

        zoom(delta) {
            this.transform.scale = Math.max(0.5, Math.min(5, this.transform.scale + delta));
            this.updateMapTransform();
            const zoomEl = document.getElementById('zoomLevel');
            if (zoomEl) zoomEl.value = Math.round(this.transform.scale * 100) + '%';
        },

        resetMap() {
            this.transform = { scale: 1, x: 0, y: 0 };
            this.updateMapTransform();
            const zoomEl = document.getElementById('zoomLevel');
            if (zoomEl) zoomEl.value = '100%';
        },

        updateMapTransform() {
            const svg = document.querySelector('#mapContainer svg');
            if (svg) {
                svg.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
                svg.style.transformOrigin = 'center center';
                svg.style.transition = 'transform 0.1s ease-out';
            }
        }
    },

    Filter: {
        init() {
            this.populateSelects();
            this.initYearSlider();
            this.bindEvents();
        },

        populateSelects() {
            const lotes = Array.from(App.State.lotesMap.values());
            const getUnique = (key, extractFn) => {
                const values = new Set();
                lotes.forEach(l => {
                    const val = extractFn ? extractFn(l) : l[key];
                    if (val) values.add(val.trim());
                });
                return Array.from(values).sort();
            };

            const populate = (id, options) => {
                const sel = document.getElementById(id);
                if (!sel) return;
                options.forEach(opt => {
                    const el = document.createElement('option');
                    el.value = opt;
                    el.textContent = opt;
                    sel.appendChild(el);
                });
            };

            populate('filterCuadrante', getUnique('Cuadrante', l => l.Cuadrante || l._cuadrante));
            populate('filterPilar', getUnique('Pilar'));
            populate('filterEstado', getUnique('estado'));
            populate('filterEtapa', getUnique('etapa'));
            populate('filterDesarrollador', getUnique('desarrollador'));
        },

        initYearSlider() {
            const slider = document.getElementById('yearRangeSlider');
            if (!slider) return;

            const lotes = Array.from(App.State.lotesMap.values());
            const years = lotes.map(l => l._parsedYear).filter(y => y && y >= 2013 && y <= 2030);

            if (years.length > 0) {
                const min = Math.min(...years);
                const max = Math.max(...years);
                slider.min = min;
                slider.max = max;
                slider.value = max;
                document.getElementById('yearMinLabel').textContent = min;
                document.getElementById('yearMaxLabel').textContent = max;
                document.getElementById('yearCurrentValue').textContent = max;
                App.State.filters.yearMax = max;
            }
        },

        bindEvents() {
            document.querySelectorAll('.filter-btn[data-tipo]').forEach(btn => {
                btn.addEventListener('click', () => {
                    btn.classList.toggle('active');
                    this.apply();
                });
            });

            ['filterCuadrante', 'filterPilar', 'filterEstado', 'filterEtapa', 'filterDesarrollador'].forEach(id => {
                document.getElementById(id)?.addEventListener('change', () => this.apply());
            });

            const yearSlider = document.getElementById('yearRangeSlider');
            yearSlider?.addEventListener('input', (e) => {
                document.getElementById('yearCurrentValue').textContent = e.target.value;
                App.State.filters.yearMax = parseInt(e.target.value);
                this.apply();
            });

            document.getElementById('filterAreaMin')?.addEventListener('input', () => this.apply());
            document.getElementById('filterAreaMax')?.addEventListener('input', () => this.apply());
            document.getElementById('filterMultipleIds')?.addEventListener('input', () => this.apply());

            document.getElementById('searchInput')?.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });

            document.getElementById('btnReset')?.addEventListener('click', () => this.reset());
        },

        apply() {
            const activeTypes = [];
            document.querySelectorAll('.filter-btn.active[data-tipo]').forEach(btn => {
                activeTypes.push(btn.dataset.tipo);
            });

            const cuadrante = document.getElementById('filterCuadrante')?.value || '';
            const pilar = document.getElementById('filterPilar')?.value || '';
            const estado = document.getElementById('filterEstado')?.value || '';
            const etapa = document.getElementById('filterEtapa')?.value || '';
            const desarrollador = document.getElementById('filterDesarrollador')?.value || '';
            const yearMax = parseInt(document.getElementById('yearRangeSlider')?.value) || 9999;

            const areaMinVal = document.getElementById('filterAreaMin')?.value;
            const areaMaxVal = document.getElementById('filterAreaMax')?.value;
            const areaMin = areaMinVal ? parseFloat(areaMinVal) : null;
            const areaMax = areaMaxVal ? parseFloat(areaMaxVal) : null;

            const multipleIdsText = document.getElementById('filterMultipleIds')?.value || '';
            const multipleIds = multipleIdsText
                .split(/[\s,;]+/)
                .map(id => id.trim().toUpperCase())
                .filter(Boolean);

            App.State.filters = {
                types: activeTypes,
                cuadrante, pilar, estado, etapa, desarrollador,
                yearMax, areaMin, areaMax, multipleIds
            };

            const filtered = [];
            App.State.lotesMap.forEach(lote => {
                if (!App.Filter.matchesFilters(lote)) return;
                filtered.push(lote);
            });

            App.State.setFiltered(filtered);

            App.Map.render();
            App.UI.updateStats();
            App.UI.updateKPIs();
        },

        matchesFilters(lote) {
            const f = App.State.filters;

            if (f.multipleIds.length > 0) {
                if (!f.multipleIds.includes(lote.id?.toUpperCase())) return false;
            }

            if (f.types.length > 0 && !f.types.includes(lote.tipo)) return false;

            const cLote = lote.Cuadrante || lote._cuadrante || '';
            if (f.cuadrante && cLote !== f.cuadrante) return false;

            if (f.pilar && lote.Pilar !== f.pilar) return false;
            if (f.estado && lote.estado !== f.estado) return false;
            if (f.etapa && lote.etapa !== f.etapa) return false;
            if (f.desarrollador && lote.desarrollador !== f.desarrollador) return false;

            if (lote._parsedYear && lote._parsedYear > f.yearMax) return false;

            if (f.areaMin !== null && lote._parsedArea < f.areaMin) return false;
            if (f.areaMax !== null && lote._parsedArea > f.areaMax) return false;

            return true;
        },

        handleSearch(query) {
            if (!query) {
                this.apply();
                return;
            }
            const term = query.toLowerCase();
            const filtered = [];

            App.State.lotesMap.forEach(lote => {
                if (
                    lote.id.toLowerCase().includes(term) ||
                    lote.nombre?.toLowerCase().includes(term) ||
                    lote.desarrollador?.toLowerCase().includes(term)
                ) {
                    filtered.push(lote);
                }
            });

            App.State.setFiltered(filtered);
            App.Map.render();
        },

        reset() {
            App.State.filters.types = [];
            App.State.selectedId = null;
            App.State.filters.multipleIds = [];

            document.querySelectorAll('.filter-btn.active').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('select').forEach(s => s.value = '');
            document.querySelectorAll('input').forEach(i => i.value = '');
            document.querySelectorAll('textarea').forEach(t => t.value = '');

            const slider = document.getElementById('yearRangeSlider');
            if (slider) {
                slider.value = slider.max;
                document.getElementById('yearCurrentValue').textContent = slider.max;
            }

            this.apply();
            App.UI.renderDetails(null);
        }
    },

    UI: {
        selectLot(id) {
            if (App.State.selectedId === id) {
                App.State.selectedId = null;
            } else {
                App.State.selectedId = id;
            }
            App.Map.render();
            App.UI.renderDetails(App.State.selectedId ? App.State.lotesMap.get(App.State.selectedId) : null);
        },

        renderDetails(lote) {
            const emptyState = document.getElementById('emptyState');
            const detailsPanel = document.getElementById('lotDetails');

            if (!lote) {
                if (emptyState) emptyState.style.display = 'flex';
                if (detailsPanel) detailsPanel.classList.remove('active');
                return;
            }

            if (emptyState) emptyState.style.display = 'none';
            if (detailsPanel) detailsPanel.classList.add('active');

            document.getElementById('detailId').textContent = lote.id;
            const statusEl = document.getElementById('detailEstado');
            statusEl.textContent = lote.estado || 'Desconocido';

            statusEl.className = 'status-badge-large';
            const statusLower = (lote.estado || '').toLowerCase();
            if (statusLower.includes('terminado')) statusEl.classList.add('terminado');
            else if (statusLower.includes('construcc')) statusEl.classList.add('construccion');
            else if (statusLower.includes('disponible')) statusEl.classList.add('disponible');
            else if (statusLower.includes('paralizado')) statusEl.classList.add('paralizado');

            document.getElementById('detailAreaPrimary').textContent = lote._parsedArea.toLocaleString('es-DO') + ' m²';

            document.getElementById('detailTipo').textContent = lote.tipo || '-';
            document.getElementById('detailSubtipo').textContent = lote.subtipo || '-';
            document.getElementById('detailNombre').textContent = lote.nombre || '-';
            document.getElementById('detailCuadrante').textContent = lote.Cuadrante || '-';
            document.getElementById('detailPilar').textContent = lote.Pilar || '-';
            document.getElementById('detailEtapa').textContent = lote.etapa || '-';

            const areaDetail = document.getElementById('detailArea');
            if (areaDetail) areaDetail.textContent = lote._parsedArea.toLocaleString('es-DO') + ' m²';

            document.getElementById('detailUnidades').textContent =
                lote['Unidades terminadas'] || lote.unidades || '-';
            document.getElementById('detailEdificios').textContent = lote.edificios || '-';

            document.getElementById('detailDesarrollador').textContent = lote.desarrollador || '-';
            document.getElementById('detailFechaAdj').textContent = lote['Fecha adjudicacion'] || '-';
            document.getElementById('detailFechaEnt').textContent = lote['Fecha entrega'] || '-';

            document.getElementById('detailObservaciones').textContent = lote.observaciones || '-';
        },

        updateStats() {
            const total = App.State.lotesMap.size;
            const filtered = App.State.filtered.length;

            const unidadesSum = App.State.filtered.reduce((sum, l) => {
                return sum + (parseInt(l['Unidades terminadas']) || parseInt(l.unidades) || 0);
            }, 0);

            const areaSum = App.State.filtered.reduce((sum, l) => sum + l._parsedArea, 0);

            document.getElementById('statTotal').textContent = total;
            document.getElementById('statFiltered').textContent = filtered;
            document.getElementById('statUnidades').textContent = unidadesSum.toLocaleString('es-DO');

            const areaEl = document.getElementById('statAreaTotal');
            if (areaEl) {
                areaEl.textContent = areaSum.toLocaleString('es-DO') + ' m²';
            }
        },

        updateKPIs() {
            const yearMax = App.State.filters.yearMax || 9999;

            let viviendasSum = 0;
            App.State.filtered.forEach(lote => {
                // FIXED LOGIC: Strict date check
                const isTerminado = lote.estado?.toLowerCase().includes('terminado') ||
                    lote.estado?.toLowerCase().includes('concluido');
                const hasValidDate = lote._parsedYear && lote._parsedYear <= yearMax;

                if (lote.tipo === 'Habitacional' && (hasValidDate || (isTerminado && !lote._parsedYear))) {
                    const uTerminadas = typeof lote['Unidades terminadas'] === 'string'
                        ? parseInt(lote['Unidades terminadas'].replace(/,/g, ''))
                        : lote['Unidades terminadas'];

                    const uTotales = typeof lote.unidades === 'string'
                        ? parseInt(lote.unidades.replace(/,/g, ''))
                        : lote.unidades;

                    viviendasSum += (uTerminadas || uTotales || 0);
                }
            });

            const equipCount = App.State.filtered.filter(l =>
                l.tipo === 'Equipamiento' || l.tipo === 'Institucional'
            ).length;

            const comercialesTotal = App.State.getAll().filter(l => l.tipo === 'Comercial').length;
            const comercialesFiltered = App.State.filtered.filter(l => l.tipo === 'Comercial').length;

            const viv2020 = document.getElementById('kpiViviendas2020');
            const vivFiltered = document.getElementById('kpiViviendasFiltered');
            if (viv2020) viv2020.textContent = CONFIG.baseline.viviendas2020.toLocaleString('es-DO');
            if (vivFiltered) vivFiltered.textContent = viviendasSum.toLocaleString('es-DO');

            const equip2020 = document.getElementById('kpiEquip2020');
            const equipFiltered = document.getElementById('kpiEquipFiltered');
            if (equip2020) equip2020.textContent = CONFIG.baseline.equipamientos2020;
            if (equipFiltered) equipFiltered.textContent = equipCount;

            const comTotal = document.getElementById('kpiComTotal');
            const comFiltered = document.getElementById('kpiComFiltered');
            if (comTotal) comTotal.textContent = comercialesTotal;
            if (comFiltered) comFiltered.textContent = comercialesFiltered;

            const growthPercent = CONFIG.baseline.viviendas2020 > 0
                ? Math.round(((viviendasSum - CONFIG.baseline.viviendas2020) / CONFIG.baseline.viviendas2020) * 100)
                : 0;
            const growthEl = document.querySelector('.growth-value');
            if (growthEl) {
                growthEl.textContent = (growthPercent >= 0 ? '+' : '') + growthPercent + '%';
            }
        },

        bindGlobalEvents() {
            document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
            document.getElementById('highContrastToggle')?.addEventListener('click', () => this.toggleHighContrast());
            document.getElementById('btnExport')?.addEventListener('click', () => this.exportCSV());
            document.getElementById('btnPrint')?.addEventListener('click', () => this.printLote());
        },

        toggleTheme() {
            document.body.classList.toggle('light-mode');
            const btn = document.getElementById('themeToggle');
            if (btn) {
                btn.textContent = document.body.classList.contains('light-mode') ? '🌙' : '☀️';
            }
        },

        toggleHighContrast() {
            document.body.classList.toggle('high-contrast');
            const btn = document.getElementById('highContrastToggle');
            if (btn) {
                btn.textContent = document.body.classList.contains('high-contrast') ? '🔆' : '☀️';
            }
        },

        exportCSV() {
            const filtered = App.State.filtered;
            if (filtered.length === 0) {
                alert('No hay datos para exportar');
                return;
            }

            const headers = [
                'ID', 'Tipo', 'Subtipo', 'Estado', 'Área m²', 'Unidades',
                'Desarrollador', 'Cuadrante', 'Pilar', 'Fecha Adjudicación', 'Fecha Entrega',
                'Observaciones'
            ];

            const rows = filtered.map(l => [
                l.id,
                l.tipo,
                l.subtipo,
                l.estado,
                l._parsedArea,
                l['Unidades terminadas'] || l.unidades || '',
                l.desarrollador,
                l.Cuadrante,
                l.Pilar,
                l['Fecha adjudicacion'],
                l['Fecha entrega'],
                (l.observaciones || '').replace(/"/g, '""')
            ].map(v => `"${v || ''}"`).join(','));

            const csv = [headers.join(','), ...rows].join('\n');
            const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `lotes_filtrados_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();

            URL.revokeObjectURL(url);
        },

        printLote(id = null) {
            const loteId = id || App.State.selectedId;
            const lote = App.State.lotesMap.get(loteId);
            if (!lote) {
                alert('Seleccione un lote primero');
                return;
            }

            const printWindow = window.open('', '_blank');
            const dateStr = new Date().toLocaleDateString('es-DO', {
                day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            printWindow.document.write(`
                <!DOCTYPE html>
                <html lang="es">
                <head>
                    <title>Ficha Técnica - ${lote.id}</title>
                    <meta charset="UTF-8">
                    <style>
                        @page { size: A4; margin: 0; }
                        body {
                            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                            color: #1e293b;
                            line-height: 1.5;
                            margin: 0;
                            padding: 2cm 2.5cm;
                            background: white;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }

                        /* Header Section */
                        .header {
                            display: flex;
                            justify-content: space-between;
                            align-items: flex-start;
                            border-bottom: 4px solid #0f172a;
                            padding-bottom: 1.5rem;
                            margin-bottom: 3rem;
                        }
                        .branding h1 { 
                            margin: 0; 
                            font-size: 0.9rem; 
                            text-transform: uppercase; 
                            letter-spacing: 2px; 
                            color: #64748b; 
                        }
                        .branding h2 { 
                            margin: 0.5rem 0 0; 
                            font-size: 3rem; 
                            color: #0f172a; 
                            font-weight: 800; 
                            line-height: 1;
                        }
                        .meta-info {
                            text-align: right;
                        }
                        .status-badge {
                            background: #0f172a;
                            color: white;
                            padding: 0.5rem 1.25rem;
                            border-radius: 99px;
                            font-weight: 700;
                            font-size: 1rem;
                            text-transform: uppercase;
                            letter-spacing: 0.5px;
                            display: inline-block;
                            margin-bottom: 0.5rem;
                        }
                        .print-date {
                            display: block;
                            font-size: 0.8rem;
                            color: #94a3b8;
                            margin-top: 0.5rem;
                        }

                        /* KPI Grid */
                        .grid-kpi {
                            display: grid;
                            grid-template-columns: repeat(3, 1fr);
                            gap: 1.5rem;
                            margin-bottom: 3rem;
                        }
                        .kpi-card {
                            border: 1px solid #e2e8f0;
                            padding: 1.5rem;
                            border-radius: 12px;
                            background: #f8fafc;
                            position: relative;
                            overflow: hidden;
                        }
                        .kpi-card::after {
                            content: '';
                            position: absolute;
                            top: 0; left: 0; width: 4px; height: 100%;
                            background: #0f172a;
                        }
                        .kpi-label { 
                            font-size: 0.75rem; 
                            text-transform: uppercase; 
                            color: #64748b; 
                            font-weight: 700; 
                            letter-spacing: 1px; 
                        }
                        .kpi-value { 
                            font-size: 1.75rem; 
                            font-weight: 700; 
                            color: #0f172a; 
                            margin-top: 0.5rem; 
                            display: block; 
                            white-space: nowrap;
                        }

                        /* Content Section */
                        .section-title {
                            font-size: 0.85rem;
                            text-transform: uppercase;
                            letter-spacing: 1.5px;
                            color: #94a3b8;
                            font-weight: 700;
                            border-bottom: 1px solid #e2e8f0;
                            padding-bottom: 0.5rem;
                            margin-bottom: 1.5rem;
                            margin-top: 2.5rem;
                        }

                        table { width: 100%; border-collapse: collapse; }
                        th, td { padding: 0.85rem 0.5rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
                        th { width: 35%; color: #64748b; font-weight: 500; font-size: 0.9rem; }
                        td { color: #0f172a; font-weight: 600; font-size: 1rem; }
                        tr:last-child td, tr:last-child th { border-bottom: none; }

                        /* Observations Box */
                        .obs-box {
                            background: #fff;
                            border: 1px dashed #cbd5e1;
                            border-radius: 8px;
                            padding: 1.5rem;
                            font-size: 0.95rem;
                            color: #334155;
                            line-height: 1.6;
                        }

                        /* Footer */
                        .footer {
                            position: fixed;
                            bottom: 1.5cm;
                            left: 2.5cm;
                            right: 2.5cm;
                            border-top: 1px solid #e2e8f0;
                            padding-top: 1rem;
                            font-size: 0.75rem;
                            color: #cbd5e1;
                            display: flex;
                            justify-content: space-between;
                        }
                    </style>
                </head>
                <body>
                    <header class="header">
                        <div class="branding">
                            <h1>Ciudad Juan Bosch</h1>
                            <h2>${lote.id}</h2>
                        </div>
                        <div class="meta-info">
                            <span class="status-badge">${lote.estado}</span>
                            <span class="print-date">Generado el ${dateStr}</span>
                        </div>
                    </header>
                    
                    <div class="grid-kpi">
                        <div class="kpi-card">
                            <span class="kpi-label">Área Total</span>
                            <span class="kpi-value">${lote._parsedArea.toLocaleString('es-DO')} m²</span>
                        </div>
                        <div class="kpi-card">
                            <span class="kpi-label">Tipo</span>
                            <span class="kpi-value">${lote.tipo}</span>
                        </div>
                        <div class="kpi-card">
                            <span class="kpi-label">Unidades/Equip</span>
                            <span class="kpi-value">${lote['Unidades terminadas'] || lote.unidades || '-'}</span>
                        </div>
                    </div>

                    <div class="section-title">Detalles del Proyecto</div>
                    <table>
                        <tr><th>Nombre del Proyecto</th><td>${lote.nombre || '-'}</td></tr>
                        <tr><th>Desarrollador</th><td>${lote.desarrollador || '-'}</td></tr>
                        <tr><th>Subtipo</th><td>${lote.subtipo || '-'}</td></tr>
                        <tr><th>Cuadrante</th><td>${lote.Cuadrante || lote._cuadrante || '-'}</td></tr>
                        <tr><th>Pilar</th><td>${lote.Pilar || '-'}</td></tr>
                    </table>

                     <div class="section-title">Información de Ejecución</div>
                    <table>
                         <tr><th>Etapa</th><td>${lote.etapa || '-'}</td></tr>
                        <tr><th>Fecha Adjudicación</th><td>${lote['Fecha adjudicacion'] || '-'}</td></tr>
                        <tr><th>Fecha Entrega (Est.)</th><td>${lote['Fecha entrega'] || '-'}</td></tr>
                        <tr><th>Edificios</th><td>${lote.edificios || '-'}</td></tr>
                    </table>

                    <div class="section-title">Observaciones</div>
                    <div class="obs-box">
                        ${lote.observaciones || 'Sin observaciones registradas.'}
                    </div>

                    <footer class="footer">
                        <span>Fideicomiso para la Construcción de Viviendas de Bajo Costo RD</span>
                        <span>Documento Técnico Interno</span>
                    </footer>

                    <script>
                        window.onload = function() { 
                            setTimeout(() => { window.print(); }, 500);
                        }
                    </script>
                </body>
                </html>
            `);
            printWindow.document.close();
        }
    },

    async init() {
        console.log('🏗️ Iniciando Mapa Técnico CJB v2.0...');

        try {
            await this.Data.init();
            await this.Map.init();
            this.Filter.init();
            this.UI.bindGlobalEvents();
            this.Filter.apply();
            console.log('✅ Aplicación inicializada correctamente');
        } catch (error) {
            console.error('❌ Error fatal en inicialización:', error);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());

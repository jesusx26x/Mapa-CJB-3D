const CONFIG = {
    paths: {
        lotes: '../Datos de CJB.csv',
        habitacional: 'data/Planilla%20Base%20Habitacionales.csv',
        comercial: 'data/Planilla%20general%20Comercial.csv',
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
            titulacion: '',
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
                // Load secondary CSVs first (using allSettled to prevent total failure)
                console.log('Loading secondary CSVs...');
                const results = await Promise.allSettled([
                    this.fetchCSV(CONFIG.paths.habitacional),
                    this.fetchCSV(CONFIG.paths.comercial)
                ]);

                const habText = results[0].status === 'fulfilled' ? results[0].value : null;
                const comText = results[1].status === 'fulfilled' ? results[1].value : null;

                if (results[0].status === 'rejected') console.warn('⚠️ Could not load Habitacional CSV:', results[0].reason);
                if (results[1].status === 'rejected') console.warn('⚠️ Could not load Comercial CSV:', results[1].reason);

                if (habText) this.indexSecondaryData(habText, App.State.habitacionalMap);
                if (comText) this.indexSecondaryData(comText, App.State.comercialMap);

                // Load main CSV
                console.log('Loading main Lotes CSV...');
                const mainText = await this.fetchCSV(CONFIG.paths.lotes);
                const lotes = this.parseCSV(mainText);

                // Merge and index lotes
                lotes.forEach(lote => {
                    const merged = this.mergeLote(lote);
                    App.State.lotesMap.set(merged.id, merged);
                });

                console.log(`✅ Datos cargados: ${App.State.lotesMap.size} lotes.`);

                // Load lotes.csv from parent for "Año de titulación" column
                try {
                    const lotesOrigText = await this.fetchCSV('../Timelapse CJB/lotes.csv');
                    const lotesOrig = this.parseCSV(lotesOrigText);
                    lotesOrig.forEach(orig => {
                        const lote = App.State.lotesMap.get(orig.id);
                        if (lote) {
                            const val = orig['Año de titulación'] || orig['Año de titulacion'] || '';
                            lote.ano_titulacion = val.trim();
                        }
                    });
                    console.log('✅ Merged Año de titulación data');
                } catch (titError) {
                    console.warn('⚠️ Could not load lotes.csv for titulación:', titError.message);
                }

                App.State.setFiltered(Array.from(App.State.lotesMap.values()));

                App.Filter.initYearSlider();
                this.startLiveSync();

                // Validate data using shared-core (if available)
                if (typeof VBC !== 'undefined' && VBC.Validate) {
                    const allLotes = Array.from(App.State.lotesMap.values());
                    const validation = VBC.Validate.dataset(allLotes);
                    VBC.Validate.logResults(validation, 'CJB');

                    // Auto-backup to localStorage
                    VBC.Backup.save('cjb_lotes', allLotes);
                }

            } catch (error) {
                console.error("❌ Error cargando datos:", error);
                const mapContainer = document.getElementById('mapContainer');
                if (mapContainer) {
                    mapContainer.innerHTML = `
                        <div class="error-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; color: var(--text-primary, #fff); padding: 2rem;">
                            <span style="font-size: 3rem; margin-bottom: 1rem;">⚠️</span>
                            <h3 style="color: var(--danger-color, #ff3b30); margin-bottom: 0.5rem;">Error leyendo los Datos de Origen</h3>
                            <p style="opacity: 0.8; max-width: 400px; margin-bottom: 1rem;">Ocurrió un problema al interpretar el archivo CSV. Asegúrate de que no tenga caracteres corruptos o haya sido eliminado.</p>
                            <div style="background: rgba(255,59,48,0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,59,48,0.3); font-family: monospace; font-size: 0.9em; word-break: break-all;">
                                ${error.message}
                            </div>
                        </div>
                    `;
                }
            }
        },

        async fetchCSV(url) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
            return await response.text();
        },

        startLiveSync() {
            console.log('🔄 Batería de Live Sync Mágica Activada');
            this.lastModified = null;
            this.lastContentLength = null;

            const headerActions = document.querySelector('.header-actions');
            if (headerActions && !document.getElementById('liveSyncIndicator')) {
                const liveInd = document.createElement('div');
                liveInd.id = 'liveSyncIndicator';
                liveInd.innerHTML = '<span style="display:inline-block; width:8px; height:8px; background:#00ff00; border-radius:50%; margin-right:5px; box-shadow: 0 0 10px #00ff00;"></span> Live Sync';
                liveInd.style.cssText = 'display:flex; align-items:center; color:#00ff00; font-size:11px; font-weight:bold; margin-right:10px; border: 1px solid rgba(0,255,0,0.3); padding: 4px 10px; border-radius: 20px; background: rgba(0,255,0,0.1); cursor: help;';
                liveInd.title = 'Sincronización en tiempo real con CSV local (HEAD Polling)';
                headerActions.prepend(liveInd);
            }

            setInterval(async () => {
                try {
                    const cacheBuster = "?t=" + new Date().getTime();
                    const urlConCacheBuster = CONFIG.paths.lotes + cacheBuster;
                    
                    const response = await fetch(urlConCacheBuster, { method: 'HEAD' });
                    if (!response.ok) return;

                    const modified = response.headers.get('Last-Modified');
                    const length = response.headers.get('Content-Length');
                    
                    if (!modified && !length) return; 

                    if (!this.lastModified && !this.lastContentLength) {
                        this.lastModified = modified;
                        this.lastContentLength = length;
                        return;
                    }

                    if (this.lastModified !== modified || this.lastContentLength !== length) {
                        console.log('🚀 Detección de Cambios en CSV! Recargando silenciosamente...');
                        this.lastModified = modified;
                        this.lastContentLength = length;

                        // Recarga silenciosa usando GET con la misma URL con cache buster
                        const mainText = await this.fetchCSV(urlConCacheBuster);
                        const lotes = this.parseCSV(mainText);

                        App.State.lotesMap.clear();
                        lotes.forEach(lote => {
                            const merged = this.mergeLote(lote);
                            if (merged.id) {
                                App.State.lotesMap.set(merged.id, merged);
                            }
                        });

                        App.Filter.apply();
                        if (App.UI && App.UI.updateStats) App.UI.updateStats();
                        if (App.UI && App.UI.updateKPIs) App.UI.updateKPIs();

                        const ind = document.getElementById('liveSyncIndicator');
                        if (ind) {
                            ind.style.backgroundColor = 'rgba(0, 255, 0, 0.4)';
                            setTimeout(() => ind.style.backgroundColor = 'rgba(0,255,0,0.1)', 500);
                        }
                    }
                } catch (e) {
                    // Silencioso. Si falla (por ej. Excel bloqueó temporalmente el archivo local), 
                    // simplemente ignoramos el error en este ciclo y probamos de nuevo luego de 3s.
                }
            }, 3000);
        },

        parseCSV(text) {
            const results = Papa.parse(text, { header: true, skipEmptyLines: true });
            if (results.errors.length > 0) {
                console.warn("⚠️ Advertencia: Errores menores al parsear CSV:", results.errors);
            }
            return results.data.map(row => {
                const cleanRow = {};
                for (const key in row) {
                    cleanRow[key.trim()] = row[key] ? String(row[key]).trim() : '';
                }
                if (cleanRow.id) {
                    const parts = cleanRow.id.split('-');
                    if (parts.length >= 2) {
                        cleanRow._cuadrante = parts[0];
                        cleanRow._manzana = parts[1];
                        cleanRow._lote = parts[2] || '';
                    }
                }
                return cleanRow;
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

            // Normalize tipo from CSV uppercase to expected format
            let rawTipo = lote.tipo || extra.tipo || 'Desconocido';
            let normalizedTipo = rawTipo;

            // Map uppercase CSV values to expected capitalized values
            const tipoMap = {
                'HABITACIONAL': 'Habitacional',
                'COMERCIAL': 'Comercial',
                'INSTITUCIONAL': 'Institucional',
                'AREA VERDE': 'Área Verde',
                'INFRAESTRUCTURA': 'Infraestructura',
                'EQUIPAMIENTO': 'Equipamiento'
            };

            const upperTipo = rawTipo.toUpperCase().trim();
            if (tipoMap[upperTipo]) {
                normalizedTipo = tipoMap[upperTipo];
            }

            return {
                ...lote,
                ...extra,
                area_m2: lote.area_m2 || extra.area_m2 || '0',
                tipo: normalizedTipo,
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
            if (!svg) return;

            // ✅ FIX: Guard against duplicate listeners (QA Audit Fix 2.1)
            if (svg.dataset.interactivitySetup === 'true') {
                console.log('SVG interactivity already setup, skipping');
                return;
            }
            svg.dataset.interactivitySetup = 'true';

            svg.querySelectorAll('path, polygon, rect, circle').forEach(el => {
                const id = el.id;
                // Match numeric IDs (XX-XX-XX) AND infrastructure IDs (C-XX)
                if (id && (id.match(/^\d{2}-\d{2}-\d{2}$/) || id.match(/^[Cc]-\d{1,2}$/))) {
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
            const isBIModeActive = document.body.dataset.biMode === 'true';

            App.State.svgElementsMap.forEach(el => {
                el.style.fill = '#1e293b';
                el.style.opacity = isBIModeActive ? '0.05' : '0.3';
                el.classList.remove('highlighted');
                el.style.filter = 'none';
                el.style.stroke = 'none';
            });

            App.State.filtered.forEach(lote => {
                const el = App.State.svgElementsMap.get(lote.id);
                if (el) {
                    el.style.fill = this.getColor(lote.tipo);
                    el.style.opacity = '1';

                    if (isBIModeActive) {
                        const statusTarget = App.State.filters.estado;
                        if (statusTarget && lote.estado === statusTarget) {
                            if (lote.estado.toLowerCase().includes('paraliz')) {
                                el.style.filter = 'drop-shadow(0 0 10px rgba(255, 59, 48, 0.9))';
                                el.style.stroke = '#ff3b30';
                                el.style.strokeWidth = '2px';
                            } else {
                                el.style.filter = 'drop-shadow(0 0 10px rgba(0, 168, 255, 0.9))';
                                el.style.stroke = '#00a8ff';
                                el.style.strokeWidth = '2px';
                            }
                        } else if (App.State.filters.types.length > 0 && App.State.filters.types.includes(lote.tipo)) {
                            el.style.filter = 'drop-shadow(0 0 10px rgba(0, 168, 255, 0.9))';
                            el.style.stroke = '#00a8ff';
                            el.style.strokeWidth = '2px';
                        }
                    }
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

            // Populate Año de Titulación (filter out empty/0 values)
            const titulacionValues = new Set();
            lotes.forEach(l => {
                const val = l.ano_titulacion;
                if (val && val !== '0') titulacionValues.add(val);
            });
            populate('filterTitulacion', Array.from(titulacionValues).sort());
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

            ['filterCuadrante', 'filterPilar', 'filterEstado', 'filterEtapa', 'filterDesarrollador', 'filterTitulacion'].forEach(id => {
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
            const titulacion = document.getElementById('filterTitulacion')?.value || '';
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
                cuadrante, pilar, estado, etapa, desarrollador, titulacion,
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
            if (f.titulacion && lote.ano_titulacion !== f.titulacion) return false;

            // Filtro de año: si el slider está en un año menor al máximo, ocultar lotes sin fecha
            const maxYearAvailable = parseInt(document.getElementById('yearRangeSlider')?.max) || 2026;
            if (f.yearMax < maxYearAvailable) {
                // Filtro activo: solo mostrar lotes con año definido y <= yearMax
                if (!lote._parsedYear || lote._parsedYear > f.yearMax) return false;
            } else {
                // Filtro desactivado (en máximo): mostrar todos, excepto los que superan el máximo
                if (lote._parsedYear && lote._parsedYear > f.yearMax) return false;
            }

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
                    lote.desarrollador?.toLowerCase().includes(term) ||
                    lote.subtipo?.toLowerCase().includes(term)
                ) {
                    filtered.push(lote);
                }
            });

            App.State.setFiltered(filtered);
            App.Map.render();
            App.UI.updateStats();
            App.UI.updateKPIs();
        },

        applyBI(filterType, filterValue) {
            console.log(`📊 Aplicando BI Filter: ${filterType} = ${filterValue}`);
            this.reset();

            document.body.dataset.biMode = 'true';

            if (filterType === 'estado') {
                const el = document.getElementById('filterEstado');
                if (el) el.value = filterValue;
            } else if (filterType === 'tipo') {
                document.querySelectorAll('.filter-btn.active').forEach(b => b.classList.remove('active'));
                const btn = document.querySelector(`.filter-btn[data-tipo="${filterValue}"]`);
                if (btn) btn.classList.add('active');
            }

            this.apply();
            App.Map.zoom(1.5);

            let btnClear = document.getElementById('btnClearBI');
            if (!btnClear) {
                const panel = document.querySelector('.panel-filters .panel-header');
                if (panel) {
                    btnClear = document.createElement('button');
                    btnClear.id = 'btnClearBI';
                    btnClear.className = 'btn-action btn-clear-bi';
                    btnClear.innerHTML = '❌ Limpiar Filtro BI';
                    btnClear.style.cssText = 'background: #ff3b30; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 11px; margin-left: 10px; box-shadow: 0 4px 10px rgba(255,59,48,0.3); animation: pulse 2s infinite;';
                    btnClear.onclick = () => {
                        document.body.dataset.biMode = 'false';
                        this.reset();
                        btnClear.remove();
                        App.Map.resetMap();
                    };
                    panel.appendChild(btnClear);
                }
            }
        },

        reset() {
            // Reset Elite Features (Heatmap, Opportunity, Neighbors)
            if (typeof App !== 'undefined' && App.Elite && App.Elite.resetAll) {
                App.Elite.resetAll();
            }

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

            console.log('🧹 Filtros y capas reseteados (MAPA NUEVO)');
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

            // CRM Lead Generation (Inyección)
            const oldBtn = document.getElementById('btnCrmLeadGen');
            if (oldBtn) oldBtn.remove();

            if (lote.estado && lote.estado.trim().toLowerCase() === 'disponible') {
                const btnCrm = document.createElement('a');
                btnCrm.id = 'btnCrmLeadGen';
                btnCrm.className = 'btn-action btn-crm-lead';
                btnCrm.href = `https://docs.google.com/forms/d/e/TU_FORMULARIO/viewform?entry.123456=${encodeURIComponent(lote.id)}`;
                btnCrm.target = '_blank';
                btnCrm.rel = 'noopener noreferrer';
                btnCrm.style.cssText = `
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    background: linear-gradient(135deg, #2ecc71 0%, #27ae60 100%);
                    color: white; text-decoration: none; padding: 12px 16px;
                    border-radius: 6px; font-weight: 600; margin-top: 15px;
                    box-shadow: 0 4px 15px rgba(46, 204, 113, 0.3);
                    transition: transform 0.2s, box-shadow 0.2s;
                `;
                btnCrm.innerHTML = `<span>📝</span> Solicitar Información (Lote ${lote.id})`;
                btnCrm.onmouseover = () => {
                    btnCrm.style.transform = "translateY(-2px)";
                    btnCrm.style.boxShadow = "0 6px 20px rgba(46, 204, 113, 0.4)";
                };
                btnCrm.onmouseout = () => {
                    btnCrm.style.transform = "translateY(0)";
                    btnCrm.style.boxShadow = "0 4px 15px rgba(46, 204, 113, 0.3)";
                };
                if (detailsPanel) detailsPanel.appendChild(btnCrm);
            }
        },

        toggle3DView() {
            const mapContainer = document.getElementById('mapContainer');
            const btn = document.getElementById('btnToggle3D');

            if (!mapContainer) return;

            mapContainer.classList.toggle('view-3d');

            if (mapContainer.classList.contains('view-3d')) {
                if (btn) {
                    btn.classList.add('active');
                    btn.innerHTML = '🪐 2D';
                    btn.title = "Volver a Vista Plana";
                }
                if (App.Map.resetMap) App.Map.resetMap();
            } else {
                if (btn) {
                    btn.classList.remove('active');
                    btn.innerHTML = '👁️ 3D';
                    btn.title = "Alternar Vista Isométrica 3D";
                }
            }
        },

        exportExecutivePDF() {
            const elementosOcultar = document.querySelectorAll(
                '.map-controls, .panel-filters, header .header-actions, .btn-action'
            );
            elementosOcultar.forEach(el => el.style.display = 'none');

            const mapContainer = document.getElementById('mapContainer');
            const is3D = mapContainer && mapContainer.classList.contains('view-3d');
            if (is3D) mapContainer.classList.remove('view-3d');

            const contenedor = document.querySelector('.main-layout') || document.body;

            const options = {
                margin: 10,
                filename: `Reporte_Avance_CJB_${new Date().toISOString().split('T')[0]}.pdf`,
                image: { type: 'jpeg', quality: 1 },
                html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#0f172a' },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
            };

            html2pdf().set(options).from(contenedor).save().then(() => {
                elementosOcultar.forEach(el => el.style.display = '');
                if (is3D) mapContainer.classList.add('view-3d');
            }).catch(e => {
                console.error("Error al exportar PDF:", e);
                elementosOcultar.forEach(el => el.style.display = '');
                if (is3D) mapContainer.classList.add('view-3d');
            });
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
            // === VIVIENDAS ===
            const allHabitacionales = App.State.getAll().filter(l => l.tipo === 'Habitacional');
            const filteredHabitacionales = App.State.filtered.filter(l => l.tipo === 'Habitacional');

            // Lotes
            const vivLotesTotal = allHabitacionales.length;
            const vivLotesFiltered = filteredHabitacionales.length;

            // Unidades
            let vivUnitsTotal = 0;
            allHabitacionales.forEach(lote => {
                const uTerminadas = typeof lote['Unidades terminadas'] === 'string'
                    ? parseInt(lote['Unidades terminadas'].replace(/,/g, ''))
                    : lote['Unidades terminadas'];
                const uTotales = typeof lote.unidades === 'string'
                    ? parseInt(lote.unidades.replace(/,/g, ''))
                    : lote.unidades;
                vivUnitsTotal += (uTerminadas || uTotales || 0);
            });

            let vivUnitsFiltered = 0;
            filteredHabitacionales.forEach(lote => {
                const uTerminadas = typeof lote['Unidades terminadas'] === 'string'
                    ? parseInt(lote['Unidades terminadas'].replace(/,/g, ''))
                    : lote['Unidades terminadas'];
                const uTotales = typeof lote.unidades === 'string'
                    ? parseInt(lote.unidades.replace(/,/g, ''))
                    : lote.unidades;
                vivUnitsFiltered += (uTerminadas || uTotales || 0);
            });

            // Update Viviendas DOM
            const vivLotesTotalEl = document.getElementById('kpiViviendasLotesTotal');
            const vivLotesFilteredEl = document.getElementById('kpiViviendasLotesFiltered');
            const vivUnitsTotalEl = document.getElementById('kpiViviendasUnitsTotal');
            const vivUnitsFilteredEl = document.getElementById('kpiViviendasUnitsFiltered');

            if (vivLotesTotalEl) vivLotesTotalEl.textContent = vivLotesTotal.toLocaleString('es-DO');
            if (vivLotesFilteredEl) vivLotesFilteredEl.textContent = vivLotesFiltered.toLocaleString('es-DO');
            if (vivUnitsTotalEl) vivUnitsTotalEl.textContent = vivUnitsTotal.toLocaleString('es-DO');
            if (vivUnitsFilteredEl) vivUnitsFilteredEl.textContent = vivUnitsFiltered.toLocaleString('es-DO');

            // === EQUIPAMIENTOS ===
            const allEquip = App.State.getAll().filter(l => l.tipo === 'Equipamiento' || l.tipo === 'Institucional');
            const filteredEquip = App.State.filtered.filter(l => l.tipo === 'Equipamiento' || l.tipo === 'Institucional');

            const equipLotesTotal = allEquip.length;
            const equipLotesFiltered = filteredEquip.length;

            let equipUnitsTotal = 0;
            allEquip.forEach(lote => {
                const u = typeof lote.unidades === 'string' ? parseInt(lote.unidades.replace(/,/g, '')) : lote.unidades;
                equipUnitsTotal += (u || 0);
            });

            let equipUnitsFiltered = 0;
            filteredEquip.forEach(lote => {
                const u = typeof lote.unidades === 'string' ? parseInt(lote.unidades.replace(/,/g, '')) : lote.unidades;
                equipUnitsFiltered += (u || 0);
            });

            // Update Equipamientos DOM
            const equipLotesTotalEl = document.getElementById('kpiEquipLotesTotal');
            const equipLotesFilteredEl = document.getElementById('kpiEquipLotesFiltered');
            const equipUnitsTotalEl = document.getElementById('kpiEquipUnitsTotal');
            const equipUnitsFilteredEl = document.getElementById('kpiEquipUnitsFiltered');

            if (equipLotesTotalEl) equipLotesTotalEl.textContent = equipLotesTotal.toLocaleString('es-DO');
            if (equipLotesFilteredEl) equipLotesFilteredEl.textContent = equipLotesFiltered.toLocaleString('es-DO');
            if (equipUnitsTotalEl) equipUnitsTotalEl.textContent = equipUnitsTotal.toLocaleString('es-DO');
            if (equipUnitsFilteredEl) equipUnitsFilteredEl.textContent = equipUnitsFiltered.toLocaleString('es-DO');

            // === COMERCIALES ===
            const allCom = App.State.getAll().filter(l => l.tipo === 'Comercial');
            const filteredCom = App.State.filtered.filter(l => l.tipo === 'Comercial');

            const comLotesTotal = allCom.length;
            const comLotesFiltered = filteredCom.length;

            let comUnitsTotal = 0;
            allCom.forEach(lote => {
                const u = typeof lote.unidades === 'string' ? parseInt(lote.unidades.replace(/,/g, '')) : lote.unidades;
                comUnitsTotal += (u || 0);
            });

            let comUnitsFiltered = 0;
            filteredCom.forEach(lote => {
                const u = typeof lote.unidades === 'string' ? parseInt(lote.unidades.replace(/,/g, '')) : lote.unidades;
                comUnitsFiltered += (u || 0);
            });

            // Update Comerciales DOM
            const comLotesTotalEl = document.getElementById('kpiComLotesTotal');
            const comLotesFilteredEl = document.getElementById('kpiComLotesFiltered');
            const comUnitsTotalEl = document.getElementById('kpiComUnitsTotal');
            const comUnitsFilteredEl = document.getElementById('kpiComUnitsFiltered');

            if (comLotesTotalEl) comLotesTotalEl.textContent = comLotesTotal.toLocaleString('es-DO');
            if (comLotesFilteredEl) comLotesFilteredEl.textContent = comLotesFiltered.toLocaleString('es-DO');
            if (comUnitsTotalEl) comUnitsTotalEl.textContent = comUnitsTotal.toLocaleString('es-DO');
            if (comUnitsFilteredEl) comUnitsFilteredEl.textContent = comUnitsFiltered.toLocaleString('es-DO');

            // === CRECIMIENTO ===
            const growthPercent = vivUnitsTotal > 0
                ? Math.round(((vivUnitsFiltered - CONFIG.baseline.viviendas2020) / CONFIG.baseline.viviendas2020) * 100)
                : 0;
            const growthEl = document.querySelector('.growth-value');
            if (growthEl) {
                growthEl.textContent = (growthPercent >= 0 ? '+' : '') + growthPercent + '%';
            }

            // === INFRAESTRUCTURA ===
            this.updateInfrastructure();
        },

        updateInfrastructure() {
            // Obtener todos los lotes de infraestructura vial
            const allVial = App.State.getAll().filter(l =>
                l.tipo === 'Infraestructura' && l.subtipo?.toLowerCase().includes('víal')
            );
            const filteredVial = App.State.filtered.filter(l =>
                l.tipo === 'Infraestructura' && l.subtipo?.toLowerCase().includes('víal')
            );

            // Calcular km totales y filtrados
            const totalKm = allVial.reduce((sum, l) => sum + (l._parsedArea || 0), 0);
            const filteredKm = filteredVial.reduce((sum, l) => sum + (l._parsedArea || 0), 0);

            // Calcular porcentaje de terminados
            const completedVial = filteredVial.filter(l =>
                l.estado?.toLowerCase().includes('terminado')
            );
            const completedKm = completedVial.reduce((sum, l) => sum + (l._parsedArea || 0), 0);
            const vialPercent = filteredKm > 0 ? Math.round((completedKm / filteredKm) * 100) : 0;

            // Actualizar UI
            const vialBar = document.getElementById('infraVial');
            const vialText = document.getElementById('infraVialText');
            const vialKm = document.getElementById('infraVialKm');

            if (vialBar) vialBar.style.width = vialPercent + '%';
            if (vialText) vialText.textContent = vialPercent + '%';
            if (vialKm) vialKm.textContent = (filteredKm / 1000).toFixed(2) + ' km';
        },

        bindGlobalEvents() {
            document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
            document.getElementById('highContrastToggle')?.addEventListener('click', () => this.toggleHighContrast());
            document.getElementById('btnExport')?.addEventListener('click', () => this.exportCSV());
            document.getElementById('btnPrint')?.addEventListener('click', () => this.exportExecutivePDF());
            document.getElementById('btnToggle3D')?.addEventListener('click', () => this.toggle3DView());

            // Make KPIs Visually Clickable
            document.querySelectorAll('.kpi-comparison-card').forEach(c => {
                c.style.cursor = 'pointer';
                c.title = 'Haz clic para aislar esta categoría en el mapa';
            });
            // Update details badges directly
            document.getElementById('detailEstado')?.style.setProperty('cursor', 'pointer');

            // Global Cross-filtering Binder
            document.body.addEventListener('click', (e) => {
                const kpiCard = e.target.closest('.kpi-comparison-card');
                if (kpiCard) {
                    const titleEl = kpiCard.querySelector('.kpi-title');
                    if (titleEl) {
                        const title = titleEl.textContent.toLowerCase();
                        let tipo = '';
                        if (title.includes('vivienda') || title.includes('habitacional')) tipo = 'Habitacional';
                        else if (title.includes('equipamiento')) tipo = 'Equipamiento';
                        else if (title.includes('comercial')) tipo = 'Comercial';
                        if (tipo) App.Filter.applyBI('tipo', tipo);
                    }
                }

                const statusBadge = e.target.closest('.status-badge-large, .status-badge');
                if (statusBadge) {
                    const statusText = statusBadge.textContent.trim();
                    if (statusText && statusText !== 'Desconocido' && statusText !== 'Estado') {
                        App.Filter.applyBI('estado', statusText);
                    }
                }
            });

            // Bind Alerts Button
            document.getElementById('btnAlerts')?.addEventListener('click', () => {
                console.log('🔔 Alerts button clicked from app.js');
                if (typeof App !== 'undefined' && App.UI && App.UI.openAlertsModal) {
                    App.UI.openAlertsModal();
                } else {
                    console.warn('openAlertsModal not available yet');
                }
            });
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

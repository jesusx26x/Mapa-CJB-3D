const CONFIG = {
    paths: {
        lotes: '../Datos de CJB.csv',
        habitacional: 'data/Planilla%20Base%20Habitacionales.csv',
        comercial: 'data/Planilla%20general%20Comercial.csv',
        finanzas: 'data/finanzas_cjb.json',
        masterplans: 'data/master_plans_cjb.json',
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
        legalDocsMap: new Map(),
        financialMap: new Map(),
        masterPlansMap: new Map(),
        filters: {
            types: [],
            cuadrante: '',
            pilar: '',
            estado: '',
            etapa: '',
            desarrollador: '',
            selectedDevelopers: [],
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
            const countEl = document.getElementById('reportLotesCount');
            if (countEl) countEl.textContent = arr.length;
            const viewCountEl = document.getElementById('viewListLotesCount');
            if (viewCountEl) viewCountEl.textContent = arr.length;
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

                // Load legal documents index
                try {
                    const legalDocsResp = await fetch('data/legal_docs_index.json');
                    if (legalDocsResp.ok) {
                        const legalDocsData = await legalDocsResp.json();
                        Object.entries(legalDocsData).forEach(([k, v]) => {
                            App.State.legalDocsMap.set(k, v);
                        });
                        console.log(`✅ Legal documents indexed: ${App.State.legalDocsMap.size} lots.`);
                    }
                } catch (e) {
                    console.warn('⚠️ Could not fetch legal_docs_index.json:', e);
                }

                // Load financial data index
                try {
                    const finResp = await fetch(CONFIG.paths.finanzas);
                    if (finResp.ok) {
                        const finData = await finResp.json();
                        Object.entries(finData).forEach(([k, v]) => {
                            App.State.financialMap.set(k, v);
                        });
                        console.log(`✅ Financial data indexed: ${App.State.financialMap.size} lots.`);
                    }
                } catch (e) {
                    console.warn('⚠️ Could not fetch finanzas_cjb.json:', e);
                }

                // Load Master Plans technical data index (Dirección Técnica)
                try {
                    const mpResp = await fetch(CONFIG.paths.masterplans);
                    if (mpResp.ok) {
                        const mpData = await mpResp.json();
                        Object.entries(mpData).forEach(([k, v]) => {
                            App.State.masterPlansMap.set(k, v);
                        });
                        console.log(`✅ Master Plans data indexed: ${App.State.masterPlansMap.size} lots.`);
                    }
                } catch (e) {
                    console.warn('⚠️ Could not fetch master_plans_cjb.json:', e);
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
                        
                        // 🔄 Fix del Live Sync: Data Binding a la UI
                        if (App.UI && App.UI.renderTable) App.UI.renderTable(Array.from(App.State.filtered));
                        if (App.State && App.State.selectedId && App.UI && App.UI.renderDetails) {
                            App.UI.renderDetails(App.State.lotesMap.get(App.State.selectedId) || null);
                        }

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

        normalizeId(rawId) {
            if (!rawId) return '';
            let val = String(rawId).trim().replace(/^poly-/i, '');
            // Si ya es XX-YY-ZZ estándar
            if (/^\d{2}-\d{2}-\d{2}$/.test(val)) return val;
            // Si es infraestructura C-XX
            if (/^[Cc]-\d{1,2}$/.test(val)) return val.toUpperCase();
            
            // Si es fecha de Excel M/D/YYYY o D/M/YYYY (ej: 1/1/2001 -> 01-01-01, 4/11/2007 -> 04-11-07)
            const matchDate = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (matchDate) {
                const c = parseInt(matchDate[1], 10);
                const mz = parseInt(matchDate[2], 10);
                const yr = parseInt(matchDate[3], 10);
                const lote = yr >= 2000 ? yr - 2000 : yr;
                return `${String(c).padStart(2, '0')}-${String(mz).padStart(2, '0')}-${String(lote).padStart(2, '0')}`;
            }

            // Si es fecha corta M/D/YY (ej: 1/1/01 -> 01-01-01)
            const matchShortDate = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,2})$/);
            if (matchShortDate) {
                const c = parseInt(matchShortDate[1], 10);
                const mz = parseInt(matchShortDate[2], 10);
                const lote = parseInt(matchShortDate[3], 10);
                return `${String(c).padStart(2, '0')}-${String(mz).padStart(2, '0')}-${String(lote).padStart(2, '0')}`;
            }

            // Si es guiones sin ceros a la izquierda (ej: 1-1-1 -> 01-01-01)
            const matchHyphen = val.match(/^(\d{1,2})-(\d{1,2})-(\d{1,2})$/);
            if (matchHyphen) {
                const c = parseInt(matchHyphen[1], 10);
                const mz = parseInt(matchHyphen[2], 10);
                const lote = parseInt(matchHyphen[3], 10);
                return `${String(c).padStart(2, '0')}-${String(mz).padStart(2, '0')}-${String(lote).padStart(2, '0')}`;
            }

            return val;
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
                const rawId = cleanRow.id || cleanRow['Lote'] || cleanRow['No. Lote'] || cleanRow['No. Lote '] || cleanRow['Lote '] || '';
                if (rawId) {
                    cleanRow.id = this.normalizeId(rawId);
                    const parts = cleanRow.id.split('-');
                    if (parts.length >= 2) {
                        cleanRow._cuadrante = parts[0];
                        cleanRow._manzana = parts[1];
                        cleanRow._lote = parts[2] || '';
                    }
                }
                if (cleanRow.area_m2) {
                    cleanRow.area_m2 = cleanRow.area_m2.replace(/\s*m[²2]?\s*$/i, '').trim();
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

        normalizeEstado(raw) {
            if (!raw) return 'No Iniciado';
            const s = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (s.includes('terminado') || s.includes('concluido')) return 'Terminado';
            if (s.includes('terminacion')) return 'En Terminación';
            if (s.includes('construcc')) return 'En Construcción';
            if (s.includes('licita')) return 'En Licitación';
            if (s.includes('adjudicado')) return 'Adjudicado';
            if (s.includes('disponible')) return 'Disponible';
            if (s.includes('paraliz')) return 'Paralizado';
            return 'No Iniciado';
        },

        normalizeDeveloper(raw) {
            if (!raw || raw.trim() === '' || raw.trim() === 'nan') return '';
            const s = raw.trim();
            const map = {
                'CONSTRUCTORA BISONO S.A': 'Constructora Bisonó, S.A.',
                'Constructora Bisono, S.A': 'Constructora Bisonó, S.A.',
                'Constructora Bisonó, S.A': 'Constructora Bisonó, S.A.',
                'Constructora Bisonó, S.A.': 'Constructora Bisonó, S.A.',
                'RIZEK': 'Consorcio Rizek',
                'CONSORCIO RIZEK': 'Consorcio Rizek',
                'Consorcio Rizek': 'Consorcio Rizek',
                'Consorcio Ingasa-Risek': 'Consorcio Ingasa-Rizek',
                'CONSORCIO INGASA - RIZEK': 'Consorcio Ingasa-Rizek',
                'Consorcio Ingasa-Rizek': 'Consorcio Ingasa-Rizek',
                'Constructora del Pais CODELPA': 'Constructora del País CODELPA',
                'Constructora del País CODELPA': 'Constructora del País CODELPA',
                'SERVINSCO': 'SERVINSCO',
                'Servinsco': 'SERVINSCO',
                'Construcciones Planificadas': 'Construcciones Planificadas',
                'Estrella': 'Ingeniería Estrella',
                'Ingeniería Estrella': 'Ingeniería Estrella',
                'Patio Capital Partners': 'Patio Capital Partners',
                'Hermanos Maldonados': 'Hermanos Maldonado',
                'Hermanos Maldonado': 'Hermanos Maldonado',
                'Consorcio Rio Grande': 'Consorcio Río Grande',
                'Consorcio Río Grande': 'Consorcio Río Grande',
                'Consorcio Peque?o Burgues': 'Consorcio Pequeño Burgués',
                'Consorcio Pequeño Burgues': 'Consorcio Pequeño Burgués',
                'Consorcio Pequeño Burgués': 'Consorcio Pequeño Burgués',
                'Consorcio Dominico Espa?ol': 'Consorcio Domínico Español',
                'Consorcio Dominico Español': 'Consorcio Domínico Español',
                'Constructora NAGIR VENTURA SRL': 'Constructora Nagir Ventura, SRL',
                'Constructora Nagir Ventura Srl': 'Constructora Nagir Ventura, SRL',
                'Constructora Nagir Ventura, SRL': 'Constructora Nagir Ventura, SRL',
                'Ingenieros CP Arquitectos / Ecovial': 'Ingenieros CP Arquitectos',
                'Ingenieros CP Arquitectos': 'Ingenieros CP Arquitectos',
                'Adventistas 7mo. Día': 'Iglesia Adventista del Séptimo Día',
                'Adventistas 7mo. Da': 'Iglesia Adventista del Séptimo Día',
                'Iglesia Adventista': 'Iglesia Adventista del Séptimo Día',
                'Iglesia Adventista del Séptimo Día': 'Iglesia Adventista del Séptimo Día',
                'Grupo Inmobiliario Terrazas GIT': 'Grupo Inmobiliario Terrazas GIT',
                'Grupo Inmobiliario Terrazas (GIT)': 'Grupo Inmobiliario Terrazas GIT',
                'Tecnoamerica': 'Tecnoamérica',
                'Tecnoamérica': 'Tecnoamérica',
                'Crisfer Inmobiliaria S.A.': 'Crisfer Inmobiliaria, S.A.',
                'Crisfer Inmobiliaria, S.A.': 'Crisfer Inmobiliaria, S.A.',
                'GTME DOMINICANA S.A.S.': 'GTME Dominicana',
                'GTME Dominicana, S.A.S.': 'GTME Dominicana',
                'GTME Dominicana': 'GTME Dominicana',
                'Consorcio Conabesa Bello & Diaz': 'Consorcio CONABESA – Bello & Díaz',
                'Consorcio Conabesa Bello & Díaz': 'Consorcio CONABESA – Bello & Díaz',
                'Consorcio CONABESA – Bello & Díaz': 'Consorcio CONABESA – Bello & Díaz',
                'Inversiones Reyes Caceres, SRL.': 'Inversiones Reyes Cáceres, SRL',
                'Inversiones Reyes Cáceres, SRL': 'Inversiones Reyes Cáceres, SRL',
                'RJN-Proconstruccion': 'RJN-Proconstrucción',
                'RJN-Proconstrucción': 'RJN-Proconstrucción',
                'ARQGE ARQUITECTOS SRL': 'ARQGE Arquitectos, SRL',
                'ARQGE Arquitectos, SRL': 'ARQGE Arquitectos, SRL',
                'Hipermercados Olé': 'Hipermercados Olé',
                'Hipermercados Ol': 'Hipermercados Olé',
                'Testigos de Jehova': 'Testigos de Jehová',
                'Testigos de Jehová': 'Testigos de Jehová',
                'Promotora Pradera Verde': 'Promotora Pradera Verde',
                'San Remo Valores': 'San Remo Valores',
                'Constructora OV': 'Constructora OV',
                'Constructora IMATEC': 'Constructora IMATEC',
                'Constructora Quezbel': 'Constructora Quezbel',
                'Consorcio Dos Amigos': 'Consorcio Dos Amigos',
                'Consorcio Futuro-Amina': 'Consorcio Futuro-Amina',
                'Consorcio AGK-SI , SRL': 'Consorcio AGK-SI, SRL',
                'Consorcio AGK-SI, SRL': 'Consorcio AGK-SI, SRL',
                'Consorcio Antillano': 'Consorcio Antillano',
                'Consorcio CODEMSA': 'Consorcio CODEMSA',
                'CONSORCIO CODEMSA': 'Consorcio CODEMSA',
                'Consorcio Mota-Engil Dominicana': 'Consorcio Mota-Engil Dominicana',
                'Grupo Velarbo': 'Grupo Velarbo',
                'GRUPO VELARBO': 'Grupo Velarbo',
                'Constructora Civil Art': 'Constructora Civil Art',
                'CONSTRUCTORA CIVIL ART': 'Constructora Civil Art',
                'En Licitación 2026': 'En Licitación 2026',
                'En Licitacin 2026': 'En Licitación 2026',
                'LICITACIÓN EN CURSO': 'En Licitación 2026',
                'Fideicomiso VBC RD': 'Fideicomiso VBC RD',
                'Fideicomiso VBC': 'Fideicomiso VBC RD'
            };
            return map[s] || s;
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
            } else if (upperTipo.includes('HABIT')) {
                normalizedTipo = 'Habitacional';
            } else if (upperTipo.includes('COMER')) {
                normalizedTipo = 'Comercial';
            } else if (upperTipo.includes('INSTIT') || upperTipo.includes('EQUIP')) {
                normalizedTipo = 'Institucional';
            } else if (upperTipo.includes('VERDE')) {
                normalizedTipo = 'Área Verde';
            } else if (upperTipo.includes('INFRA')) {
                normalizedTipo = 'Infraestructura';
            }

            const rawEstado = lote.estado || extra.estado || '';
            const normalizedEstado = this.normalizeEstado(rawEstado);
            const rawDev = lote.desarrollador || extra.desarrollador || '';
            const normalizedDev = this.normalizeDeveloper(rawDev);

            return {
                ...extra,
                ...lote,
                desarrollador: normalizedDev,
                estado: normalizedEstado,
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

                // 🛠️ 2D SVG ANTI-CLIPPING ENGINE
                // Rescata el SVG de recortes nativos de viewBox y máscaras de Illustrator
                const svgEl = document.querySelector('#mapContainer svg');
                if (svgEl) {
                    // PURGA DE ATRIBUTOS FIJOS
                    svgEl.removeAttribute('width');
                    svgEl.removeAttribute('height');

                    // 1. Destruir máscaras de recorte
                    svgEl.querySelectorAll('[clip-path]').forEach(el => el.removeAttribute('clip-path'));
                    svgEl.querySelectorAll('clipPath').forEach(el => el.remove());

                    // 2. Liberar el lienzo nativo (overflow)
                    svgEl.style.overflow = 'visible';
                    svgEl.setAttribute('overflow', 'visible');
                    svgEl.style.contain = 'none';
                }

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
            const isLightMode = document.body.classList.contains('light-mode');

            App.State.svgElementsMap.forEach(el => {
                // En light mode: fondo muy claro para inactivos | En dark mode: fondo oscuro
                el.style.fill = isLightMode ? '#e8ecf0' : '#1e293b';
                el.style.opacity = isBIModeActive ? '0.05' : (isLightMode ? '0.5' : '0.3');
                el.classList.remove('highlighted');
                el.style.filter = 'none';
                el.style.stroke = isLightMode ? 'rgba(0,0,0,0.06)' : 'none';
                el.style.strokeWidth = isLightMode ? '0.5px' : '0';
            });

            App.State.filtered.forEach(lote => {
                const el = App.State.svgElementsMap.get(lote.id);
                if (el) {
                    el.style.fill = this.getColor(lote);
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

        calculateContractualTerms(lote) {
            if (!lote) return { isFinished: true, color: '#64748b', criticidad: '-', fechaTermino: '-', hasAdenda: false, fechaAdenda: '-', fechaTerminoOrig: '-', fechaAdjudicacionOrig: '-', fechaTerminoAdenda: '-' };

            // Adendas y Readjudicaciones oficiales registradas con fechas históricas de licitación
            const adendas = {
                '04-39-01': { fecha: '2025-12-15', tipo: 'Readjudicado Diciembre 2025', adjOrig: '2016-03-11', devOrig: 'CONABESA' },
                '01-01-03': { fecha: '2025-10-01', tipo: 'Readjudicado Octubre 2025', adjOrig: '2016-03-11', devOrig: 'Constructora Bisonó' },
                '01-02-04': { fecha: '2025-12-29', tipo: 'Adenda Cesión Diciembre 2025', adjOrig: '2016-03-11', devOrig: 'Mota-Engil Dominicana' },
                '04-40-01': { fecha: '2024-09-05', tipo: 'Readjudicado Septiembre 2024', adjOrig: '2016-03-11', devOrig: 'RODECO' },
                '09-28-02': { fecha: '2025-11-03', tipo: 'Adenda 4 Noviembre 2025', adjOrig: '2015-04-14', devOrig: 'ICM / Consorcio Antillano' },
                '04-12-05': { fecha: '2026-01-28', tipo: 'Adenda 2 Enero 2026', adjOrig: '2016-03-11', devOrig: 'Constructora OV' },
                '01-01-07': { fecha: '2023-10-23', tipo: 'Adenda Octubre 2023', adjOrig: '2016-03-11', devOrig: 'Río Grande' },
                '04-15-01': { fecha: '2023-10-23', tipo: 'Adenda Octubre 2023', adjOrig: '2016-03-11', devOrig: 'Río Grande' },
                '04-40-02': { fecha: '2023-10-23', tipo: 'Readjudicado Octubre 2023', adjOrig: '2016-03-11', devOrig: 'Desarrollador Original' },
                '00-14-04': { fecha: '2023-10-23', tipo: 'Readjudicado Octubre 2023', adjOrig: '2016-03-11', devOrig: 'Subasta Comercial' },
                '00-14-05': { fecha: '2022-11-04', tipo: 'Readjudicado Noviembre 2022', adjOrig: '2016-03-11', devOrig: 'Subasta Comercial' },
                '05-17-04': { fecha: '2023-01-15', tipo: 'Readjudicado Enero 2023', adjOrig: '2016-03-11', devOrig: 'Subasta Comercial' },
                '06-25-03': { fecha: '2022-04-11', tipo: 'Readjudicado Abril 2022', adjOrig: '2016-03-11', devOrig: 'ECOVIAL' }
            };

            const id = (lote.id || '').trim();
            const estado = (lote.estado || '').toString().toLowerCase();
            const isFinished = estado.includes('terminado') || estado.includes('concluido');
            const adjStr = (lote.fecha_adjudicacion_orig || lote['Fecha adjudicacion'] || '').trim();
            
            // Prioridad a campos CSV de adenda si existen
            const tieneAdendaCsv = (lote.tiene_adenda || '').toUpperCase() === 'SI' || (lote.tiene_adenda || '').toUpperCase() === 'READJUDICADO';
            const fechaAdendaCsv = lote.fecha_adenda_formal && lote.fecha_adenda_formal !== '-' ? lote.fecha_adenda_formal : null;
            
            const infoAdenda = (tieneAdendaCsv && fechaAdendaCsv) 
                ? { fecha: fechaAdendaCsv, tipo: lote.tipo_adenda_detalle || 'Adenda / Readjudicación', adjOrig: lote.fecha_adjudicacion_orig || (adendas[id] ? adendas[id].adjOrig : null) }
                : (adendas[id] || null);

            const effectiveAdjOrig = (infoAdenda && infoAdenda.adjOrig) ? infoAdenda.adjOrig : adjStr;

            let fechaTerminoOrig = '-';
            if (effectiveAdjOrig && effectiveAdjOrig !== 'En Licitación 2026' && effectiveAdjOrig !== '-') {
                const d = new Date(effectiveAdjOrig);
                if (!isNaN(d.getTime())) {
                    d.setFullYear(d.getFullYear() + 2);
                    fechaTerminoOrig = d.toISOString().split('T')[0];
                }
            }

            if (isFinished) {
                return {
                    isFinished: true,
                    hasAdenda: !!infoAdenda,
                    tipoAdenda: infoAdenda ? infoAdenda.tipo : null,
                    fechaAdenda: infoAdenda ? infoAdenda.fecha : '-',
                    fechaTerminoOrig,
                    fechaAdjudicacionOrig: effectiveAdjOrig,
                    fechaTerminoAdenda: infoAdenda ? infoAdenda.fecha : '-',
                    fechaTermino: lote['Fecha entrega'] || 'Concluido',
                    mesesRetraso: 0,
                    criticidad: '✅ Concluido',
                    color: '#64748b'
                };
            }

            const effectiveDateStr = infoAdenda ? infoAdenda.fecha : adjStr;

            if (!effectiveDateStr || effectiveDateStr === 'En Licitación 2026' || effectiveDateStr === '-') {
                return {
                    isFinished: false,
                    hasAdenda: false,
                    tipoAdenda: null,
                    fechaAdenda: '-',
                    fechaTerminoOrig: '-',
                    fechaTerminoAdenda: '-',
                    fechaTermino: effectiveDateStr === 'En Licitación 2026' ? 'En Licitación 2026' : 'Por Definir',
                    mesesRetraso: 0,
                    criticidad: effectiveDateStr === 'En Licitación 2026' ? '⚪ En Licitación 2026' : '⚠️ Sin Fecha',
                    color: effectiveDateStr === 'En Licitación 2026' ? '#38bdf8' : '#94a3b8'
                };
            }

            const effDate = new Date(effectiveDateStr);
            if (isNaN(effDate.getTime())) {
                return {
                    isFinished: false,
                    hasAdenda: false,
                    tipoAdenda: null,
                    fechaAdenda: '-',
                    fechaTerminoOrig: '-',
                    fechaTerminoAdenda: '-',
                    fechaTermino: 'Por Definir',
                    mesesRetraso: 0,
                    criticidad: '⚠️ Sin Fecha Válida',
                    color: '#94a3b8'
                };
            }

            // Plazo contractual estándar = Fecha efectiva + 2 años (24 meses)
            const endDate = new Date(effDate);
            endDate.setFullYear(endDate.getFullYear() + 2);
            const fechaTerminoFormatted = endDate.toISOString().split('T')[0];

            // Fecha actual dinámica del sistema (en vivo)
            const today = new Date();
            const diffTime = today - endDate;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            const mesesRetraso = Math.round((diffDays / 30.4375) * 10) / 10;
            const anosRetraso = Math.round((diffDays / 365.25) * 10) / 10;

            let criticidad = '';
            let color = '';
            let isProximoVencer = false;
            let isEnVigilancia = false;

            if (diffDays > 0) {
                if (anosRetraso >= 3) {
                    criticidad = `🔴 Crítico (+${anosRetraso} años)`;
                    color = '#ef4444';
                } else if (anosRetraso >= 1) {
                    criticidad = `🟠 Alto (+${mesesRetraso} meses)`;
                    color = '#f97316';
                } else {
                    criticidad = `🟡 Moderado (+${mesesRetraso} meses)`;
                    color = '#eab308';
                }
            } else {
                const diasRestantes = Math.abs(diffDays);
                const mesesRestantes = Math.round((diasRestantes / 30.4375) * 10) / 10;
                
                if (diasRestantes <= 90) {
                    criticidad = `⚡ Próximo a Vencer (${diasRestantes} días / ${mesesRestantes}m)`;
                    color = '#38bdf8';
                    isProximoVencer = true;
                } else if (diasRestantes <= 180) {
                    criticidad = `🔍 En Vigilancia (${mesesRestantes} meses)`;
                    color = '#eab308';
                    isEnVigilancia = true;
                } else {
                    criticidad = `🟢 En Plazo (${mesesRestantes} meses vigentes)`;
                    color = '#10b981';
                }
            }

            return {
                isFinished: false,
                hasAdenda: !!infoAdenda,
                tipoAdenda: infoAdenda ? infoAdenda.tipo : null,
                fechaAdenda: infoAdenda ? infoAdenda.fecha : '-',
                fechaTerminoOrig,
                fechaAdjudicacionOrig: effectiveAdjOrig,
                fechaTerminoAdenda: infoAdenda ? fechaTerminoFormatted : '-',
                fechaTermino: fechaTerminoFormatted,
                mesesRetraso: diffDays > 0 ? mesesRetraso : 0,
                anosRetraso: diffDays > 0 ? anosRetraso : 0,
                diasRestantes: diffDays <= 0 ? Math.abs(diffDays) : 0,
                mesesRestantes: diffDays <= 0 ? Math.round((Math.abs(diffDays) / 30.4375) * 10) / 10 : 0,
                isProximoVencer,
                isEnVigilancia,
                criticidad,
                color
            };
        },
        calculateUnifiedRisk(lote) {
            if (!lote) return { score: 0, label: 'Sin Datos', color: '#64748b', factores: [] };

            const estado = (lote.estado || '').toString().toLowerCase();
            if (estado.includes('terminado') || estado.includes('concluido')) {
                return {
                    score: 0,
                    label: '🟢 Concluido (0 Fallas)',
                    color: '#10b981',
                    factores: [
                        { icon: '✅', titulo: 'Proyecto Concluido', detalle: 'Obra finalizada y viviendas/locales entregados en su totalidad.' }
                    ]
                };
            }

            const terms = this.calculateContractualTerms(lote);
            const isParalyzed = App.Filter.isLotParalyzed(lote);
            const tieneRescision = (lote.clausula_rescision || '').toUpperCase() === 'SI';
            const tienePenalidad = (lote.clausula_penalidad_5pct || '').toUpperCase() === 'SI';

            // 4 Fallas Ponderadas Objetivas (Operativas, de Plazo y Financieras):
            // 1. Atraso contractual grave (> 12 meses de vencimiento o criticidad Crítico/Alto)
            const f1_atraso = terms.mesesRetraso > 12 || (terms.criticidad && (terms.criticidad.includes('Crítico') || terms.criticidad.includes('Alto')));
            // 2. Obra paralizada constatada en terreno
            const f2_paralizado = isParalyzed;
            // 3. Proyecto no iniciado tras haberse vencido el plazo
            const f3_no_inicio = estado.includes('no iniciado') && terms.mesesRetraso > 0;
            
            // 4. Falla Financiera Real (Cobranza legal o deuda sin plan acordado)
            const finInfo = App.State.financialMap ? App.State.financialMap.get(lote.id) : null;
            const f4_fin_legal = finInfo && finInfo.semaforo === 'critico';
            const f4_fin_sin_plan = finInfo && finInfo.semaforo === 'pendiente_acuerdo';

            const factores = [];
            if (f1_atraso) {
                const tiempoTxt = terms.anosRetraso >= 1 
                    ? `+${terms.anosRetraso} años de atraso` 
                    : `+${terms.mesesRetraso} meses de atraso`;
                factores.push({
                    icon: '⏱️',
                    titulo: 'Atraso en Plazo Contractual',
                    detalle: `Fecha límite vencida (${terms.fechaTermino}). Acumula ${tiempoTxt} sin conclusión.`
                });
            }
            if (f2_paralizado) {
                factores.push({
                    icon: '🚧',
                    titulo: 'Obra Paralizada en Terreno',
                    detalle: 'Fiscalización física constató detención total de labores de construcción y ausencia de cuadrillas.'
                });
            }
            if (f3_no_inicio) {
                factores.push({
                    icon: '⏳',
                    titulo: 'Proyecto No Iniciado con Plazo Vencido',
                    detalle: 'Lote adjudicado sin arranque de obra física tras vencerse el plazo inicial.'
                });
            }

            // Factores de Falla Financiera Real (Matriz Dirección Financiera)
            if (f4_fin_legal) {
                const isIntimado = lote.id === '03-09-01' || (finInfo.estatus_financiero || '').toLowerCase().includes('intimad');
                factores.push({
                    icon: '🔴',
                    titulo: isIntimado ? 'Deuda en Cobranza Legal (Intimados desde 16-10-2023)' : 'Deuda en Cobranza Legal',
                    detalle: `Acumula capital adeudado en proceso judicial/cobranzas por RD$ ${finInfo.capital_adeudado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}${isIntimado ? ' (Intimados formalmente desde 16-10-2023)' : ''}.`
                });
            } else if (f4_fin_sin_plan) {
                factores.push({
                    icon: '🟠',
                    titulo: 'Deuda Pendiente sin Cronograma Acordado',
                    detalle: `Monto pendiente de RD$ ${finInfo.capital_adeudado.toLocaleString('es-DO', { minimumFractionDigits: 2 })} sin distribución mensual de cuotas acordada.`
                });
            }

            // Alertas Preventivas (No suman falla, pero orientan a la toma de decisiones)
            if (terms.isProximoVencer) {
                factores.push({
                    icon: '⚡',
                    titulo: 'Vencimiento Contractual Inminente',
                    detalle: `Restan solo ${terms.diasRestantes} días de vigencia contractual (${terms.fechaTermino}) con obra no concluida.`
                });
            } else if (terms.isEnVigilancia && (estado.includes('no iniciado') || isParalyzed)) {
                factores.push({
                    icon: '🔍',
                    titulo: 'En Vigilancia Preventiva',
                    detalle: `Restan ${terms.mesesRestantes} meses de plazo con obra sin inicio o detenida.`
                });
            }

            if (factores.length === 0) {
                factores.push({
                    icon: '✅',
                    titulo: 'Desempeño Conforme',
                    detalle: 'El proyecto se encuentra dentro del plazo de vigencia, sin deuda en mora y con ejecución física regular.'
                });
            }

            let score = 0;
            if (f1_atraso) score++;
            if (f2_paralizado) score++;
            if (f3_no_inicio) score++;
            if (f4_fin_legal || f4_fin_sin_plan) score++;

            let label = '';
            let color = '';

            if (score >= 3) {
                label = `🔴 Riesgo Crítico (${score}/4 Fallas)`;
                color = '#ef4444';
            } else if (score === 2) {
                label = '🟠 Riesgo Alto (2/4 Fallas)';
                color = '#f97316';
            } else if (score === 1) {
                label = '🟡 Riesgo Moderado (1/4 Falla)';
                color = '#eab308';
            } else if (terms.isProximoVencer) {
                label = '⚡ Alerta Preventiva (< 3 Meses)';
                color = '#38bdf8';
            } else {
                score = 0;
                label = '🟢 Desempeño Conforme (0/4 Fallas)';
                color = '#10b981';
            }

            return {
                score,
                label,
                color,
                factores
            };
        },

        getColor(lote) {
            if (!lote) return '#64748b'; // Default grey

            // Modo 7: Estatus Financiero (Capital Adeudado y Cobranzas)
            if (App.State.mapMode === 'finanzas') {
                const finInfo = App.State.financialMap ? App.State.financialMap.get(lote.id) : null;
                if (finInfo) {
                    return finInfo.color; // #ef4444 (Legal), #f97316 (Sin Cronograma), #10b981 (Al Día con Cronograma)
                }

                // Lotes disponibles o sin adjudicación
                const estado = (lote.estado || '').toString().toLowerCase();
                if (estado.includes('disponible') || estado.includes('licitaci') || !lote.desarrollador || lote.desarrollador === '-') {
                    return '#94a3b8'; // No adjudicado (N/A)
                }

                // Restantes lotes adjudicados sin deuda: 100% Pagados
                return '#10b981'; // Verde - Pagado al 100%
            }

            // Modo 6: Capa Unificada (Semáforo de Riesgo Integral)
            if (App.State.mapMode === 'unificada') {
                const risk = this.calculateUnifiedRisk(lote);
                return risk.color;
            }

            // Modo 5: Estatus Legal / Rescisión y Penalidades
            if (App.State.mapMode === 'legal') {
                const dict = (lote.dictamen_legal || '').toLowerCase();
                if (dict.includes('rescisi')) return '#ef4444'; // Rojo
                if (dict.includes('penalidad')) return '#f97316'; // Naranja
                if (dict.includes('plazo') || dict.includes('activa')) return '#10b981'; // Verde
                if (dict.includes('liquidado') || dict.includes('concluido')) return '#64748b'; // Gris
                return '#94a3b8';
            }

            // Modo 4: Adendas y Readjudicaciones
            if (App.State.mapMode === 'adendas') {
                const adenda = (lote.tiene_adenda || '').toUpperCase();
                if (adenda === 'SI') return '#10b981'; // Verde - Adenda firmada
                if (adenda === 'READJUDICADO') return '#38bdf8'; // Azul Cian - Readjudicado
                return '#64748b'; // Gris - Contrato original
            }

            // Modo 3: Coloración Exclusiva de Lotes en Atraso (Plan de Cierre CJB)
            if (App.State.mapMode === 'plazos') {
                const terms = this.calculateContractualTerms(lote);
                if (!terms.isFinished && terms.mesesRetraso > 0) {
                    return terms.color; // #ef4444 (Rojo), #f97316 (Naranja), #eab308 (Amarillo)
                }
                // En Plazo (con adenda o término futuro), Terminado, Disponible: Gris atenuado
                return '#334155';
            }

            // Modo 2: Coloración por Estado de Obra
            if (App.State.mapMode === 'estado') {
                const effEstado = App.Filter ? App.Filter.getEffectiveEstado(lote) : (lote.estado || '');
                if (effEstado === 'Paralizado') return '#ef4444';
                if (effEstado === 'Terminado') return '#10b981';
                if (effEstado === 'En Construcción') return '#f59e0b';
                if (effEstado === 'Disponible') return '#60a5fa';
                if (effEstado === 'En Licitación') return '#06b6d4';
                if (effEstado === 'No Iniciado') return '#94a3b8';
                return '#64748b';
            }

            // Modo 1: Coloración por Tipo de Suelo (Zonificación)
            const tipoRaw = typeof lote === 'string' ? lote : (lote.tipo || '');
            const tipo = tipoRaw.toString().trim().toLowerCase();

            if (tipo.includes('comercial')) return '#f59e0b';
            if (tipo.includes('institucional')) return '#a855f7';
            if (tipo.includes('equipamiento')) return '#10b981';
            if (tipo.includes('área verde') || tipo.includes('area verde')) return '#22c55e';
            if (tipo.includes('infraestructura')) return '#94a3b8';
            if (tipo.includes('habitacional')) return '#00a8ff';

            return '#64748b';
        },

        showTooltip(e, id) {
            const lote = App.State.lotesMap.get(id);
            const tooltip = document.getElementById('mapTooltip');
            if (!lote || !tooltip) return;

            if (App.State.mapMode === 'unificada') {
                const risk = this.calculateUnifiedRisk(lote);
                tooltip.innerHTML = `<strong>${id}</strong> - ${lote.nombre || lote.tipo}<br>Dev: ${lote.desarrollador || '-'}<br>Semáforo: <strong>${risk.label}</strong><br>Acción: <em>${risk.accion}</em>`;
            } else if (App.State.mapMode === 'adendas') {
                tooltip.innerHTML = `<strong>${id}</strong> - ${lote.nombre || lote.tipo}<br>Dev: ${lote.desarrollador || '-'}<br>Adenda: <strong>${lote.tiene_adenda || 'NO'}</strong><br>${lote.tipo_adenda_detalle || '-'}`;
            } else if (App.State.mapMode === 'legal') {
                tooltip.innerHTML = `<strong>${id}</strong> - ${lote.nombre || lote.tipo}<br>Dev: ${lote.desarrollador || '-'}<br>Dictamen: <strong>${lote.dictamen_legal || '-'}</strong><br>Rescisión: ${lote.clausula_rescision || '-'}`;
            } else if (App.State.mapMode === 'plazos') {
                const terms = this.calculateContractualTerms(lote);
                if (!terms.isFinished && terms.mesesRetraso > 0) {
                    tooltip.innerHTML = `<strong>${id}</strong> - ${lote.nombre || lote.tipo}<br>Dev: ${lote.desarrollador || '-'}<br>Término: <strong>${terms.fechaTermino}</strong><br>Atraso: <strong style="color:${terms.color};">${terms.criticidad}</strong>`;
                } else {
                    tooltip.innerHTML = `<strong>${id}</strong> - ${lote.nombre || lote.tipo}<br>Dev: ${lote.desarrollador || '-'}<br>Término: <strong>${terms.fechaTermino}</strong><br>Estatus: <span style="color:#94a3b8;">⚪ En Plazo / Sin Atraso</span>`;
                }
            } else if (App.State.mapMode === 'estado') {
                const effEstado = App.Filter ? App.Filter.getEffectiveEstado(lote) : (lote.estado || '-');
                tooltip.innerHTML = `<strong>${id}</strong> - ${lote.nombre || lote.tipo}<br>Estado: <strong>${effEstado}</strong><br>Área: ${lote._parsedArea.toLocaleString('es-DO')} m²`;
            } else {
                tooltip.innerHTML = `<strong>${id}</strong> - ${lote.nombre || lote.tipo}<br>Tipo: <strong>${lote.tipo}</strong><br>Área: ${lote._parsedArea.toLocaleString('es-DO')} m²`;
            }

            tooltip.style.display = 'block';
            this.updateTooltipPosition(e);
        },

        updateTooltipPosition(e) {
            const tooltip = document.getElementById('mapTooltip');
            if (!tooltip) return;
            const x = e.clientX + 15;
            const y = e.clientY + 15;
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        },

        hideTooltip() {
            const tooltip = document.getElementById('mapTooltip');
            if (tooltip) tooltip.style.display = 'none';
        },

        setupZoom() {
            this.transform = { scale: 0.85, x: 0, y: 0 };
            const container = document.getElementById('mapContainer');
            this.updateMapTransform(); // Aplicar el fit-to-screen inicial

            document.getElementById('zoomIn')?.addEventListener('click', () => this.zoom(1.2));
            document.getElementById('zoomOut')?.addEventListener('click', () => this.zoom(0.8));
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
                const factor = e.deltaY > 0 ? 0.9 : 1.1;
                this.zoom(factor);
            });
        },

        // Zoom máximo: 4000 %. Hasta 1000 % todo se ve igual que antes; más allá, mapa-ux.js mantiene
        // líneas y textos del plano a tamaño legible y el satélite se amplía desde su máximo detalle.
        ZOOM_MAX: 40,

        zoom(factor) {
            this.transform.scale = Math.min(Math.max(0.2, this.transform.scale * factor), this.ZOOM_MAX);
            this.updateMapTransform();
            const zoomEl = document.getElementById('zoomLevel');
            if (zoomEl) zoomEl.value = Math.round(this.transform.scale * 100) + '%';
        },

        resetMap() {
            this.transform = { scale: 0.85, x: 0, y: 0 };
            this.updateMapTransform();
            const zoomEl = document.getElementById('zoomLevel');
            if (zoomEl) zoomEl.value = '85%';
        },

        updateMapTransform() {
            const container = document.getElementById('mapContainer');
            if (container) {
                container.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
                container.style.transformOrigin = 'center center';
                container.style.transition = 'transform 0.1s ease-out';
            }
        }
    },

    Filter: {
        PARALYZED_LOTS: new Set(['01-01-03', '04-12-05', '07-31-01', '08-23-01', '09-28-02']),

        isLotParalyzed(lote) {
            if (!lote) return false;
            if (this.PARALYZED_LOTS.has(lote.id)) return true;
            const est = (lote.estado || '').toString().trim().toLowerCase();
            return est === 'paralizado';
        },

        getEffectiveEstado(lote) {
            if (!lote) return 'No Iniciado';
            if (this.isLotParalyzed(lote)) return 'Paralizado';
            const estLow = (lote.estado || '').toString().trim().toLowerCase();
            if (estLow.includes('terminad') || estLow.includes('concluid')) return 'Terminado';
            if (estLow.includes('construcc') || estLow.includes('terminaci')) return 'En Construcción';
            if (estLow.includes('no inic') || estLow.includes('adjudic')) return 'No Iniciado';
            if (estLow.includes('licita')) return 'En Licitación';
            if (estLow.includes('disponib')) return 'Disponible';
            return 'No Iniciado';
        },

        init() {
            this.populateSelects();
            this.initMultiSelects();
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

            populate('filterEtapa', getUnique('etapa'));
        },

        initMultiSelects() {
            this.multiSelectInstances = {};

            // 1. Estado de Obra (6 Categorías Canónicas)
            this.multiSelectInstances['estado'] = this.setupGenericMultiSelect({
                containerId: 'estadoMultiSelectContainer',
                triggerId: 'estadoMultiSelectTrigger',
                dropdownId: 'estadoMultiSelectDropdown',
                placeholderId: 'estadoMultiSelectPlaceholder',
                chipsId: 'estadoMultiSelectChips',
                optionsListId: 'estadoOptionsList',
                countLabelId: 'estadoSelectedCount',
                clearBtnId: 'btnClearEstados',
                defaultPlaceholder: 'Todos los Estados',
                getOptions: () => {
                    const counts = {
                        'Terminado': 0,
                        'No Iniciado': 0,
                        'En Construcción': 0,
                        'Disponible': 0,
                        'En Licitación': 0,
                        'Paralizado': 0
                    };
                    App.State.lotesMap.forEach(l => {
                        const effEst = App.Filter.getEffectiveEstado(l);
                        if (counts[effEst] !== undefined) {
                            counts[effEst]++;
                        } else {
                            counts['No Iniciado']++;
                        }
                    });
                    return Object.entries(counts).map(([k, v]) => ({ value: k, label: k, count: v }));
                },
                onSelectionChange: (selected) => {
                    App.State.filters.selectedEstados = selected;
                    this.apply();
                }
            });

            // 2. Estatus de Plazo / Retrasos
            this.multiSelectInstances['criticidad'] = this.setupGenericMultiSelect({
                containerId: 'criticidadMultiSelectContainer',
                triggerId: 'criticidadMultiSelectTrigger',
                dropdownId: 'criticidadMultiSelectDropdown',
                placeholderId: 'criticidadMultiSelectPlaceholder',
                chipsId: 'criticidadMultiSelectChips',
                optionsListId: 'criticidadOptionsList',
                countLabelId: 'criticidadSelectedCount',
                clearBtnId: 'btnClearCriticidad',
                defaultPlaceholder: 'Todos los Estatus de Plazo',
                getOptions: () => {
                    const counts = {
                        'CRITICO': { label: '🔴 Crítico (> 3 Años en Mora)', count: 0 },
                        'ALTO': { label: '🟠 Alto (1 a 3 Años en Mora)', count: 0 },
                        'MODERADO': { label: '🟡 Moderado (< 1 Año en Mora)', count: 0 },
                        'PROXIMO_A_VENCER': { label: '⚡ Próximo a Vencer (< 3 Meses)', count: 0 },
                        'EN_VIGILANCIA': { label: '🔍 En Vigilancia (3 a 6 Meses)', count: 0 },
                        'EN_PLAZO': { label: '🟢 En Plazo Vigente (> 6 Meses)', count: 0 }
                    };
                    App.State.lotesMap.forEach(l => {
                        const terms = App.Map.calculateContractualTerms(l);
                        const crit = terms.criticidad || '';
                        if (crit.includes('Crítico')) counts['CRITICO'].count++;
                        else if (crit.includes('Alto')) counts['ALTO'].count++;
                        else if (crit.includes('Moderado')) counts['MODERADO'].count++;
                        else if (terms.isProximoVencer || crit.includes('Próximo a Vencer')) counts['PROXIMO_A_VENCER'].count++;
                        else if (terms.isEnVigilancia || crit.includes('En Vigilancia')) counts['EN_VIGILANCIA'].count++;
                        else if (crit.includes('En Plazo')) counts['EN_PLAZO'].count++;
                    });
                    return Object.entries(counts).map(([k, v]) => ({ value: k, label: v.label, count: v.count }));
                },
                onSelectionChange: (selected) => {
                    App.State.filters.selectedCriticidad = selected;
                    this.apply();
                }
            });

            // 3. Estatus Financiero (Matriz Dirección Financiera)
            this.multiSelectInstances['finanzas'] = this.setupGenericMultiSelect({
                containerId: 'finanzasMultiSelectContainer',
                triggerId: 'finanzasMultiSelectTrigger',
                dropdownId: 'finanzasMultiSelectDropdown',
                placeholderId: 'finanzasMultiSelectPlaceholder',
                chipsId: 'finanzasMultiSelectChips',
                optionsListId: 'finanzasOptionsList',
                countLabelId: 'finanzasSelectedCount',
                clearBtnId: 'btnClearFinanzas',
                defaultPlaceholder: 'Todos los Estatus Financieros',
                getOptions: () => {
                    const counts = {
                        'LEGAL': { label: '🔴 En Legal', count: 0 },
                        'SIN_CRONOGRAMA': { label: '🟠 Sin Cronograma Acordado', count: 0 },
                        'CON_CRONOGRAMA': { label: '🟢 Al Día con Cronograma', count: 0 },
                        'PAGADO': { label: '🔵 100% Pagado / Saldado', count: 0 },
                        'NO_ADJUDICADO': { label: '⚪ No Adjudicado / N/A', count: 0 }
                    };
                    App.State.lotesMap.forEach(l => {
                        const finInfo = App.State.financialMap ? App.State.financialMap.get(l.id) : null;
                        const isDisp = (l.estado || '').toString().toLowerCase().includes('disponible') || 
                                       (l.estado || '').toString().toLowerCase().includes('licitaci') || 
                                       !l.desarrollador || l.desarrollador === '-';
                        if (finInfo) {
                            if (finInfo.semaforo === 'critico') counts['LEGAL'].count++;
                            else if (finInfo.semaforo === 'pendiente_acuerdo') counts['SIN_CRONOGRAMA'].count++;
                            else counts['CON_CRONOGRAMA'].count++;
                        } else if (isDisp) {
                            counts['NO_ADJUDICADO'].count++;
                        } else {
                            counts['PAGADO'].count++;
                        }
                    });
                    return Object.entries(counts).map(([k, v]) => ({ value: k, label: v.label, count: v.count }));
                },
                onSelectionChange: (selected) => {
                    App.State.filters.selectedFinanzas = selected;
                    this.apply();
                }
            });

            // 4. Desarrolladores
            this.multiSelectInstances['dev'] = this.setupGenericMultiSelect({
                containerId: 'devMultiSelectContainer',
                triggerId: 'devMultiSelectTrigger',
                dropdownId: 'devMultiSelectDropdown',
                placeholderId: 'devMultiSelectPlaceholder',
                chipsId: 'devMultiSelectChips',
                optionsListId: 'devOptionsList',
                countLabelId: 'devSelectedCount',
                clearBtnId: 'btnClearDevs',
                searchInputId: 'devSearchInput',
                defaultPlaceholder: 'Todos los Desarrolladores',
                getOptions: () => {
                    const devCounts = new Map();
                    App.State.lotesMap.forEach(l => {
                        const d = (l.desarrollador || '').trim();
                        if (d && d !== 'nan') {
                            devCounts.set(d, (devCounts.get(d) || 0) + 1);
                        }
                    });
                    return Array.from(devCounts.keys()).sort((a, b) => a.localeCompare(b, 'es')).map(dev => ({
                        value: dev,
                        label: dev,
                        count: devCounts.get(dev)
                    }));
                },
                onSelectionChange: (selected) => {
                    App.State.filters.selectedDevelopers = selected;
                    this.apply();
                }
            });

            // 4. Año de Titulación
            this.multiSelectInstances['titulacion'] = this.setupGenericMultiSelect({
                containerId: 'titulacionMultiSelectContainer',
                triggerId: 'titulacionMultiSelectTrigger',
                dropdownId: 'titulacionMultiSelectDropdown',
                placeholderId: 'titulacionMultiSelectPlaceholder',
                chipsId: 'titulacionMultiSelectChips',
                optionsListId: 'titulacionOptionsList',
                countLabelId: 'titulacionSelectedCount',
                clearBtnId: 'btnClearTitulacion',
                defaultPlaceholder: 'Todos los Años',
                getOptions: () => {
                    const yearCounts = new Map();
                    App.State.lotesMap.forEach(l => {
                        let y = (l.ano_titulacion || l['Año Titulacion'] || '').toString().trim();
                        if (!y || y === '0' || y === 'nan') y = 'Sin Titulación';
                        yearCounts.set(y, (yearCounts.get(y) || 0) + 1);
                    });
                    const sortedYears = Array.from(yearCounts.keys()).sort((a, b) => {
                        if (a === 'Sin Titulación') return 1;
                        if (b === 'Sin Titulación') return -1;
                        return a.localeCompare(b);
                    });
                    return sortedYears.map(y => ({ value: y, label: y, count: yearCounts.get(y) }));
                },
                onSelectionChange: (selected) => {
                    App.State.filters.selectedTitulaciones = selected;
                    this.apply();
                }
            });
        },

        setupGenericMultiSelect(cfg) {
            const container = document.getElementById(cfg.containerId);
            const trigger = document.getElementById(cfg.triggerId);
            const dropdown = document.getElementById(cfg.dropdownId);
            const placeholder = document.getElementById(cfg.placeholderId);
            const chips = document.getElementById(cfg.chipsId);
            const optionsList = document.getElementById(cfg.optionsListId);
            const countLabel = document.getElementById(cfg.countLabelId);
            const clearBtn = document.getElementById(cfg.clearBtnId);
            const searchInput = cfg.searchInputId ? document.getElementById(cfg.searchInputId) : null;

            if (!container || !trigger || !dropdown || !optionsList) return null;

            const options = cfg.getOptions();

            optionsList.innerHTML = '';
            options.forEach(opt => {
                const item = document.createElement('label');
                item.className = 'multi-select-option';
                item.dataset.val = opt.value;
                item.innerHTML = `
                    <input type="checkbox" value="${opt.value}">
                    <span class="opt-label">${opt.label}</span>
                    <span class="dev-count-badge">${opt.count}</span>
                `;
                optionsList.appendChild(item);
            });

            const updateSelection = () => {
                const selected = [];
                optionsList.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
                    selected.push(cb.value);
                });

                if (countLabel) countLabel.textContent = selected.length;
                if (clearBtn) clearBtn.style.display = selected.length > 0 ? 'inline-block' : 'none';

                if (selected.length === 0) {
                    if (placeholder) placeholder.textContent = cfg.defaultPlaceholder;
                    if (chips) {
                        chips.innerHTML = '';
                        chips.style.display = 'none';
                    }
                } else {
                    if (placeholder) placeholder.textContent = `${selected.length} seleccionados`;
                    if (chips) {
                        chips.style.display = 'flex';
                        chips.innerHTML = selected.map(val => {
                            const optMatch = options.find(o => o.value === val);
                            const displayTxt = optMatch ? optMatch.label : val;
                            return `
                                <div class="multi-chip" data-val="${val}">
                                    <span>${displayTxt}</span>
                                    <span class="chip-remove" title="Remover">✖</span>
                                </div>
                            `;
                        }).join('');

                        chips.querySelectorAll('.chip-remove').forEach(btn => {
                            btn.onclick = (e) => {
                                e.stopPropagation();
                                const valToRemove = e.target.closest('.multi-chip').dataset.val;
                                const cb = optionsList.querySelector(`input[type="checkbox"][value="${valToRemove}"]`);
                                if (cb) cb.checked = false;
                                updateSelection();
                            };
                        });
                    }
                }

                cfg.onSelectionChange(selected);
            };

            // Toggle Dropdown
            trigger.onclick = (e) => {
                e.stopPropagation();
                // Close other open multi-selects first
                document.querySelectorAll('.multi-select-container.open').forEach(c => {
                    if (c !== container) {
                        c.classList.remove('open');
                        const dd = c.querySelector('.multi-select-dropdown');
                        if (dd) dd.style.display = 'none';
                    }
                });

                const isOpen = dropdown.style.display === 'flex';
                dropdown.style.display = isOpen ? 'none' : 'flex';
                container.classList.toggle('open', !isOpen);
                if (!isOpen && searchInput) {
                    searchInput.value = '';
                    optionsList.querySelectorAll('.multi-select-option').forEach(opt => opt.style.display = 'flex');
                    setTimeout(() => searchInput.focus(), 50);
                }
            };

            // Search filter inside dropdown if present
            if (searchInput) {
                searchInput.oninput = (e) => {
                    const q = e.target.value.toLowerCase().trim();
                    optionsList.querySelectorAll('.multi-select-option').forEach(opt => {
                        const name = (opt.dataset.val || '').toLowerCase();
                        opt.style.display = name.includes(q) ? 'flex' : 'none';
                    });
                };
            }

            optionsList.onchange = (e) => {
                if (e.target.type === 'checkbox') {
                    updateSelection();
                }
            };

            if (clearBtn) {
                clearBtn.onclick = (e) => {
                    e.stopPropagation();
                    optionsList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                    updateSelection();
                };
            }

            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    dropdown.style.display = 'none';
                    container.classList.remove('open');
                }
            });

            return {
                clear: () => {
                    optionsList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
                    updateSelection();
                },
                setSelection: (vals) => {
                    optionsList.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                        cb.checked = vals.includes(cb.value);
                    });
                    updateSelection();
                }
            };
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
            const typeBtns = document.querySelectorAll('.filter-btn[data-tipo]');
            typeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    btn.classList.toggle('active');
                    this.apply();
                });
            });

            document.getElementById('filterEtapa')?.addEventListener('change', () => this.apply());

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

            document.querySelectorAll('.segment-btn[data-map-mode]').forEach(btn => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.segment-btn[data-map-mode]').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    App.State.mapMode = btn.dataset.mapMode;
                    if (App.UI && App.UI.updateColorModeLegend) {
                        App.UI.updateColorModeLegend(App.State.mapMode);
                    }
                    // Desplegar automáticamente Evaluación de Riesgo solo en Capa Unificada
                    const accRiesgo = document.getElementById('accRiesgo');
                    if (accRiesgo) {
                        if (App.State.mapMode === 'unificada') {
                            accRiesgo.classList.add('open');
                        } else {
                            accRiesgo.classList.remove('open');
                        }
                    }

                    // Desplegar automáticamente Información Financiera solo en Estatus Financiero
                    const accFinanzas = document.getElementById('accFinanzas');
                    if (accFinanzas) {
                        if (App.State.mapMode === 'finanzas') {
                            accFinanzas.classList.add('open');
                        } else {
                            accFinanzas.classList.remove('open');
                        }
                    }
                    this.apply();
                });
            });

            document.getElementById('btnReset')?.addEventListener('click', () => this.reset());
        },

        apply() {
            const activeTypes = [];
            document.querySelectorAll('.filter-btn.active[data-tipo]').forEach(btn => {
                activeTypes.push(btn.dataset.tipo);
            });

            const etapa = document.getElementById('filterEtapa')?.value || '';
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
                selectedEstados: App.State.filters.selectedEstados || [],
                selectedCriticidad: App.State.filters.selectedCriticidad || [],
                selectedFinanzas: App.State.filters.selectedFinanzas || [],
                selectedDevelopers: App.State.filters.selectedDevelopers || [],
                selectedTitulaciones: App.State.filters.selectedTitulaciones || [],
                etapa,
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

            // Filtro por Capa / Modo Especial seleccionado en el Segmented Control
            if (App.State.mapMode === 'adendas') {
                const terms = App.Map.calculateContractualTerms(lote);
                if (!terms.hasAdenda) return false;
            } else if (App.State.mapMode === 'plazos') {
                const terms = App.Map.calculateContractualTerms(lote);
                if (!(terms.mesesRetraso > 0) && !(terms.anosRetraso > 0)) return false;
            }

            if (f.multipleIds && f.multipleIds.length > 0) {
                if (!f.multipleIds.includes(lote.id?.toUpperCase())) return false;
            }

            if (f.types) {
                if (f.types.length === 0) return false;
                if (!f.types.includes(lote.tipo)) return false;
            }

            // Filtro Multi-Selección de Estado de Obra (including Paralizado)
            if (f.selectedEstados && f.selectedEstados.length > 0) {
                const effEstado = App.Filter.getEffectiveEstado(lote);
                const matchesAnyEstado = f.selectedEstados.some(targetEst => {
                    return effEstado === targetEst;
                });
                if (!matchesAnyEstado) return false;
            }

            // Filtro Multi-Selección de Estatus de Plazo / Retrasos
            if (f.selectedCriticidad && f.selectedCriticidad.length > 0) {
                const terms = App.Map.calculateContractualTerms(lote);
                const crit = terms.criticidad || '';
                const matchesAnyCrit = f.selectedCriticidad.some(c => {
                    if (c === 'CRITICO') return crit.includes('Crítico');
                    if (c === 'ALTO') return crit.includes('Alto');
                    if (c === 'MODERADO') return crit.includes('Moderado');
                    if (c === 'PROXIMO_A_VENCER') return terms.isProximoVencer || crit.includes('Próximo a Vencer');
                    if (c === 'EN_VIGILANCIA') return terms.isEnVigilancia || crit.includes('En Vigilancia');
                    if (c === 'EN_PLAZO') return crit.includes('En Plazo') || (!terms.isProximoVencer && !terms.isEnVigilancia && terms.mesesRestantes > 0);
                    return false;
                });
                if (!matchesAnyCrit) return false;
            }

            // Filtro Multi-Selección de Estatus Financiero (Matriz Dirección Financiera)
            if (f.selectedFinanzas && f.selectedFinanzas.length > 0) {
                const finInfo = App.State.financialMap ? App.State.financialMap.get(lote.id) : null;
                const isDisp = (lote.estado || '').toString().toLowerCase().includes('disponible') || 
                               (lote.estado || '').toString().toLowerCase().includes('licitaci') || 
                               !lote.desarrollador || lote.desarrollador === '-';
                let sem = 'PAGADO';
                if (finInfo) {
                    if (finInfo.semaforo === 'critico') sem = 'LEGAL';
                    else if (finInfo.semaforo === 'pendiente_acuerdo') sem = 'SIN_CRONOGRAMA';
                    else sem = 'CON_CRONOGRAMA';
                } else if (isDisp) {
                    sem = 'NO_ADJUDICADO';
                }

                if (!f.selectedFinanzas.includes(sem)) return false;
            }

            // Filtro Multi-Selección de Desarrolladores
            if (f.selectedDevelopers && f.selectedDevelopers.length > 0) {
                const loteDev = (lote.desarrollador || '').trim();
                if (!f.selectedDevelopers.includes(loteDev)) return false;
            }

            // Filtro Multi-Selección de Año de Titulación
            if (f.selectedTitulaciones && f.selectedTitulaciones.length > 0) {
                let y = (lote.ano_titulacion || lote['Año Titulacion'] || '').toString().trim();
                if (!y || y === '0' || y === 'nan') y = 'Sin Titulación';
                if (!f.selectedTitulaciones.includes(y)) return false;
            }

            if (f.etapa && lote.etapa !== f.etapa) return false;

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
                if (this.multiSelectInstances['estado']) {
                    this.multiSelectInstances['estado'].setSelection([filterValue]);
                }
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
                    btnClear.style.marginTop = '10px';
                    btnClear.onclick = () => this.reset();
                    panel.appendChild(btnClear);
                }
            }
        },

        reset() {
            document.body.dataset.biMode = 'false';
            const btnClear = document.getElementById('btnClearBI');
            if (btnClear) btnClear.remove();

            document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.add('active'));

            const etapaSel = document.getElementById('filterEtapa');
            if (etapaSel) etapaSel.value = '';

            const areaMin = document.getElementById('filterAreaMin');
            if (areaMin) areaMin.value = '';
            const areaMax = document.getElementById('filterAreaMax');
            if (areaMax) areaMax.value = '';
            const multipleIds = document.getElementById('filterMultipleIds');
            if (multipleIds) multipleIds.value = '';
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';

            if (this.multiSelectInstances) {
                Object.values(this.multiSelectInstances).forEach(inst => {
                    if (inst && typeof inst.clear === 'function') inst.clear();
                });
            }

            document.querySelectorAll('.segment-btn[data-map-mode]').forEach(b => b.classList.remove('active'));
            document.querySelector('.segment-btn[data-map-mode="tipo"]')?.classList.add('active');
            App.State.mapMode = 'tipo';
            if (App.UI && App.UI.updateColorModeLegend) {
                App.UI.updateColorModeLegend('tipo');
            }
            document.getElementById('accFinanzas')?.classList.remove('open');

            App.State.filters = {
                types: [],
                selectedEstados: [],
                selectedCriticidad: [],
                selectedFinanzas: [],
                selectedDevelopers: [],
                selectedTitulaciones: [],
                etapa: '',
                yearMax: 9999,
                areaMin: null,
                areaMax: null,
                multipleIds: []
            };

            this.apply();
            App.Map.resetMap();
        }
    },

    UI: {
        toggleAccordion(id) {
            const section = document.getElementById(id);
            if (!section) return;
            section.classList.toggle('open');
        },

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
            const effEstado = App.Filter.getEffectiveEstado(lote);
            statusEl.textContent = effEstado;
            statusEl.className = 'status-badge-large';

            if (effEstado === 'Paralizado') statusEl.classList.add('paralizado');
            else if (effEstado === 'Terminado') statusEl.classList.add('terminado');
            else if (effEstado === 'En Construcción') statusEl.classList.add('construccion');
            else if (effEstado === 'En Terminación') statusEl.classList.add('terminacion');
            else if (effEstado === 'No Iniciado') statusEl.classList.add('no-iniciado');
            else if (effEstado === 'Disponible') statusEl.classList.add('disponible');
            else if (effEstado === 'En Licitación') statusEl.classList.add('licitacion');
            else if (effEstado === 'Adjudicado') statusEl.classList.add('adjudicado');

            document.getElementById('detailAreaPrimary').textContent = lote._parsedArea.toLocaleString('es-DO') + ' m²';

            // Sección 1: General y Métricas (Unificada)
            document.getElementById('detailTipo').textContent = lote.tipo || '-';
            document.getElementById('detailSubtipo').textContent = lote.subtipo || '-';
            document.getElementById('detailNombre').textContent = lote.nombre || '-';
            document.getElementById('detailEtapa').textContent = lote.etapa || 'Etapa 1';

            // Diferenciación de Unidades: Viviendas vs. Locales Comerciales
            const tipoLot = (lote.tipo || '').toString().trim().toLowerCase();
            const isComercial = tipoLot.includes('comerc');
            const isHabitacional = tipoLot.includes('habita');

            const unidadesLabelEl = document.getElementById('detailUnidadesLabel');
            if (unidadesLabelEl) {
                if (isComercial) unidadesLabelEl.textContent = 'Locales Comerciales';
                else if (isHabitacional) unidadesLabelEl.textContent = 'Viviendas';
                else unidadesLabelEl.textContent = 'Unidades';
            }

            let unidText = '-';
            const unitSuffix = isComercial ? 'locales' : (isHabitacional ? 'viv.' : 'unids.');
            const termSuffix = isComercial ? 'concluidos' : (isHabitacional ? 'concluidas' : 'concluidos');

            if (lote.unidades && lote.unidades !== '0') {
                if (lote['Unidades terminadas'] !== undefined && lote['Unidades terminadas'] !== '') {
                    unidText = `${lote.unidades} ${unitSuffix} (${lote['Unidades terminadas']} ${termSuffix})`;
                } else {
                    unidText = `${lote.unidades} ${unitSuffix}`;
                }
            } else if (lote['Unidades terminadas'] && lote['Unidades terminadas'] !== '0') {
                unidText = `${lote['Unidades terminadas']} ${unitSuffix} (${termSuffix})`;
            }
            document.getElementById('detailUnidades').textContent = unidText;
            document.getElementById('detailEdificios').textContent = lote.edificios || '-';

            // Desarrollador y Plazos (Estructurado: Adjudicación, Adenda, Término Contractual, Estatus)
            document.getElementById('detailDesarrollador').textContent = lote.desarrollador || '-';
            
            const elFechaAdj = document.getElementById('detailFechaAdj');
            if (elFechaAdj) elFechaAdj.textContent = lote['Fecha adjudicacion'] || '-';

            const terms = App.Map.calculateContractualTerms(lote);

            const fAdendaPlazosEl = document.getElementById('detailFechaAdendaPlazos');
            if (fAdendaPlazosEl) {
                if (terms.hasAdenda && terms.fechaAdenda && terms.fechaAdenda !== '-') {
                    fAdendaPlazosEl.textContent = terms.fechaAdenda;
                    fAdendaPlazosEl.style.color = '#38bdf8';
                } else {
                    fAdendaPlazosEl.textContent = 'No aplica';
                    fAdendaPlazosEl.style.color = '#94a3b8';
                }
            }

            const fTerminoOrigEl = document.getElementById('detailFechaTerminoOrig');
            if (fTerminoOrigEl) fTerminoOrigEl.textContent = terms.fechaTermino || '-';

            const elRetraso = document.getElementById('detailRetraso');
            if (elRetraso) {
                elRetraso.textContent = terms.criticidad || '-';
                elRetraso.style.color = terms.color || '#ffffff';
                elRetraso.style.fontWeight = 'bold';
            }

            // Expediente Jurídico y Adendas
            const tieneAdendaEl = document.getElementById('detailTieneAdenda');
            if (tieneAdendaEl) {
                const ad = (lote.tiene_adenda || '').toUpperCase();
                if (ad === 'SI') {
                    tieneAdendaEl.innerHTML = `<span class="badge-adenda si">🟢 Sí (Adenda)</span>`;
                } else if (ad === 'READJUDICADO') {
                    tieneAdendaEl.innerHTML = `<span class="badge-adenda si" style="background:#0284c7; color:#ffffff;">🔵 Readjudicado</span>`;
                } else {
                    tieneAdendaEl.innerHTML = `<span class="badge-adenda no">⚪ Contrato Original</span>`;
                }
            }

            const procLegalEl = document.getElementById('detailProcesoLegal');
            if (procLegalEl) procLegalEl.textContent = lote.proceso_o_adenda_num || lote.tipo_adenda_detalle || '-';

            const docSoporteEl = document.getElementById('detailDocSoporteLegal');
            if (docSoporteEl) {
                const docInfo = App.State.legalDocsMap?.get(lote.id);
                let docFile = (docInfo && docInfo.primary_pdf) ? docInfo.primary_pdf.filename : (lote.documento_soporte_legal || lote.pdf_documento || '');
                if (docFile && docFile !== '-' && docFile !== 'No disponible') {
                    docSoporteEl.innerHTML = `
                        <a href="documentos_legales/${encodeURIComponent(docFile)}" target="_blank" class="btn-pdf-link" title="Haz clic para abrir el archivo PDF original digitalizado">
                            <span>📄</span> Abrir PDF: ${docFile}
                        </a>
                    `;
                } else {
                    docSoporteEl.textContent = 'No disponible';
                }
            }

            const fuenteLegalEl = document.getElementById('detailFuenteLegal');
            if (fuenteLegalEl) fuenteLegalEl.textContent = lote.fuente_informacion_legal || 'Dirección Legal Fiduciaria Reservas';

            const tipoAdendaEl = document.getElementById('detailTipoAdenda');
            if (tipoAdendaEl) tipoAdendaEl.textContent = lote.tipo_adenda_detalle || '-';

            const fAdendaEl = document.getElementById('detailFechaAdenda');
            if (fAdendaEl) fAdendaEl.textContent = lote.fecha_adenda_formal || '-';

            const clRescisionEl = document.getElementById('detailClausulaRescision');
            if (clRescisionEl) {
                const res = (lote.clausula_rescision || '').toUpperCase();
                clRescisionEl.innerHTML = res === 'SI' 
                    ? `<span style="color:#ef4444; font-weight:bold;">🔴 Sí (Abandono/Inejecución)</span>` 
                    : `<span style="color:#94a3b8;">⚪ No</span>`;
            }

            const clPenalidadEl = document.getElementById('detailClausulaPenalidad');
            if (clPenalidadEl) {
                const pen = (lote.clausula_penalidad_5pct || '').toUpperCase();
                clPenalidadEl.innerHTML = pen === 'SI' 
                    ? `<span style="color:#f97316; font-weight:bold;">🟠 Sí (5% Art. 23)</span>` 
                    : `<span style="color:#94a3b8;">⚪ No</span>`;
            }

            const dictamenEl = document.getElementById('detailDictamenLegal');
            if (dictamenEl) {
                dictamenEl.textContent = lote.dictamen_legal || '-';
                dictamenEl.style.fontWeight = '600';
            }

            // Sección 3.5: Acordeón - Master Plan Técnico (Dirección Técnica)
            const mpInfo = App.State.masterPlansMap ? App.State.masterPlansMap.get(lote.id) : null;
            const elMpPill = document.getElementById('detailMasterPlanPill');
            const elMpEstatus = document.getElementById('detailEstatusMP');
            const elMpRadicacion = document.getElementById('detailFechaRadicacionMP');
            const elMpLimite = document.getElementById('detailFechaLimiteMP');
            const elMpAprobacion = document.getElementById('detailAprobacionMP');
            const elMpObs = document.getElementById('detailMPObservaciones');

            if (mpInfo) {
                if (elMpPill) {
                    elMpPill.textContent = `${mpInfo.badge_icon} ${mpInfo.entrego_mp === 'SÍ' ? (mpInfo.estatus_mp.includes('Aprobado') ? 'Aprobado' : 'Entregado') : 'No Sometido'}`;
                    elMpPill.className = `masterplan-badge-pill ${mpInfo.badge_class}`;
                }
                if (elMpEstatus) {
                    let estColor = mpInfo.badge_class === 'aprobado' ? '#10b981' : (mpInfo.badge_class === 'observado' ? '#f59e0b' : (mpInfo.badge_class === 'evaluacion' ? '#0ea5e9' : '#ef4444'));
                    elMpEstatus.innerHTML = `<span style="color:${estColor}; font-weight:700;">${mpInfo.badge_icon} ${mpInfo.estatus_mp}</span>`;
                }
                if (elMpRadicacion) {
                    elMpRadicacion.innerHTML = mpInfo.es_fecha_estimada 
                        ? `<span title="Calculada con fórmula reglamentaria de 60-90 días tras adjudicación/adenda" style="color:#38bdf8;">${mpInfo.f_entrega_radicacion}</span>` 
                        : `<span style="color:#e2e8f0;">${mpInfo.f_entrega_radicacion}</span>`;
                }
                if (elMpLimite) elMpLimite.textContent = mpInfo.f_limite_reglamentaria;
                if (elMpAprobacion) elMpAprobacion.textContent = mpInfo.f_aprobacion_mp;
                if (elMpObs) elMpObs.textContent = mpInfo.observaciones;
            } else {
                if (elMpPill) {
                    elMpPill.textContent = '⚪ N/A';
                    elMpPill.className = 'masterplan-badge-pill';
                }
                if (elMpEstatus) elMpEstatus.textContent = 'Sin expediente de Master Plan';
                if (elMpRadicacion) elMpRadicacion.textContent = '-';
                if (elMpLimite) elMpLimite.textContent = '-';
                if (elMpAprobacion) elMpAprobacion.textContent = '-';
                if (elMpObs) elMpObs.textContent = '-';
            }

            // Sección 2: Acordeón - Evaluación Unificada de Riesgo (Condicional)
            const risk = App.Map.calculateUnifiedRisk(lote);
            const elScoreHeader = document.getElementById('detailScoreRiesgoHeader');
            if (elScoreHeader) {
                elScoreHeader.textContent = `${risk.score}/4`;
                elScoreHeader.className = 'risk-score-mini-pill';
                if (risk.score >= 3) elScoreHeader.classList.add('critico');
                else if (risk.score === 2) elScoreHeader.classList.add('alto');
                else if (risk.score === 1) elScoreHeader.classList.add('moderado');
                else elScoreHeader.classList.add('conforme');
            }

            const accRiesgo = document.getElementById('accRiesgo');
            if (accRiesgo) {
                if (App.State.mapMode === 'unificada') {
                    accRiesgo.classList.add('open');
                } else {
                    accRiesgo.classList.remove('open');
                }
            }

            const semBadge = document.getElementById('detailSemaforoBadge');
            if (semBadge) {
                semBadge.textContent = risk.label;
                semBadge.style.color = risk.color;
                semBadge.style.borderColor = risk.color;
                semBadge.style.backgroundColor = `${risk.color}18`;
            }

            const scoreEl = document.getElementById('detailScoreRiesgo');
            if (scoreEl) {
                scoreEl.textContent = `${risk.score}/4 fallas`;
                scoreEl.style.color = risk.score > 0 ? risk.color : '#94a3b8';
            }

            // Renderizar Lista Específica de Riesgos / Incumplimientos
            const listaRiesgosEl = document.getElementById('detailListaRiesgos');
            if (listaRiesgosEl) {
                listaRiesgosEl.innerHTML = '';
                if (risk.factores && risk.factores.length > 0) {
                    risk.factores.forEach(f => {
                        const li = document.createElement('li');
                        li.style.marginBottom = '3px';
                        li.innerHTML = `<strong>${f.icon} ${f.titulo}:</strong> <span style="color:#cbd5e1; font-weight:normal;">${f.detalle}</span>`;
                        listaRiesgosEl.appendChild(li);
                    });
                } else {
                    const li = document.createElement('li');
                    li.innerHTML = `<span style="color:#10b981;">✅ Desempeño Conforme.</span>`;
                    listaRiesgosEl.appendChild(li);
                }
            }

            // Sección 5: Acordeón - Información Financiera (Matriz Dirección Financiera)
            const finInfo = App.State.financialMap ? App.State.financialMap.get(lote.id) : null;
            const elFinPill = document.getElementById('detailFinanzasPill');
            const elCapital = document.getElementById('detailCapitalAdeudado');
            const elEstatusFin = document.getElementById('detailEstatusFinanciero');
            const elMesesAtraso = document.getElementById('detailMesesAtraso');
            const elFechaFin = document.getElementById('detailFechaFinPagos');
            const elCuotasList = document.getElementById('detailCuotasList');
            const elCronogramaWrap = document.getElementById('detailCronogramaWrapper');

            const isDisponible = (lote.estado || '').toString().toLowerCase().includes('disponible') || 
                                 (lote.estado || '').toString().toLowerCase().includes('licitaci') || 
                                 !lote.desarrollador || lote.desarrollador === '-';

            if (finInfo) {
                // Lote con deuda registrada en matriz financiera
                if (elFinPill) {
                    elFinPill.textContent = `RD$ ${(finInfo.capital_adeudado / 1000000).toFixed(1)}M`;
                    elFinPill.className = 'finance-badge-pill';
                    if (finInfo.semaforo === 'critico') elFinPill.classList.add('legal');
                    else if (finInfo.semaforo === 'pendiente_acuerdo') elFinPill.classList.add('sin-plan');
                    else elFinPill.classList.add('con-plan');
                }
                if (elCapital) elCapital.textContent = `RD$ ${finInfo.capital_adeudado.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                if (elEstatusFin) elEstatusFin.textContent = finInfo.estatus_financiero || 'Regular';
                if (elMesesAtraso) elMesesAtraso.textContent = finInfo.estado_label;
                if (elFechaFin) elFechaFin.textContent = finInfo.fecha_fin_pagos || 'Sin definir';

                if (elCronogramaWrap) elCronogramaWrap.style.display = finInfo.cuotas && finInfo.cuotas.length > 0 ? 'block' : 'none';
                if (elCuotasList) {
                    if (finInfo.cuotas && finInfo.cuotas.length > 0) {
                        let summaryHtml = '';
                        if (finInfo.total_programado > 0 && finInfo.total_pagado > 0) {
                            summaryHtml = `
                                <div class="cronograma-summary-card">
                                    <div class="cronograma-summary-row">
                                        <span style="color:#34d399; font-weight:700;">✅ Pagado: RD$ ${(finInfo.total_pagado / 1000000).toFixed(1)}M (${finInfo.progreso_pct}%)</span>
                                        <span style="color:#38bdf8; font-weight:700;">⏳ Pendiente: RD$ ${(finInfo.total_pendiente / 1000000).toFixed(1)}M</span>
                                    </div>
                                    <div class="finance-progress-track">
                                        <div class="finance-progress-fill" style="width: ${finInfo.progreso_pct}%;"></div>
                                    </div>
                                    <div style="display:flex; justify-content:space-between; margin-top:3px; font-size:0.6rem; color:#94a3b8;">
                                        <span>${finInfo.cuotas_pagadas_count} de ${finInfo.cuotas_count} cuotas aplicadas</span>
                                        <span>Total Pactado: RD$ ${(finInfo.total_programado / 1000000).toFixed(1)}M</span>
                                    </div>
                                </div>
                            `;
                        }

                        const cuotasRowsHtml = finInfo.cuotas.map(c => {
                            const isPaid = !!c.pagado;
                            const rowClass = isPaid ? 'pagado' : 'pendiente';
                            const badgeClass = isPaid ? 'pagado' : 'pendiente';
                            const statusPill = isPaid 
                                ? '<span class="cuota-status-pill pagado">✅ Pagado</span>' 
                                : '<span class="cuota-status-pill pendiente">⏳ Por Pagar</span>';

                            return `
                                <div class="cuota-row-item ${rowClass}">
                                    <div style="display:flex; align-items:center; gap:6px;">
                                        <span class="cuota-month-badge ${badgeClass}">${c.mes}</span>
                                        <span class="cuota-amount">RD$ ${c.monto.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    ${statusPill}
                                </div>
                            `;
                        }).join('');

                        elCuotasList.innerHTML = summaryHtml + cuotasRowsHtml;
                    } else {
                        elCuotasList.innerHTML = '<div style="color:#94a3b8; font-size:0.68rem; padding: 4px 0;">Sin cronograma mensual acordado</div>';
                    }
                }
            } else if (isDisponible) {
                // Lote disponible o no adjudicado
                if (elFinPill) {
                    elFinPill.textContent = 'N/A';
                    elFinPill.className = 'finance-badge-pill';
                }
                if (elCapital) elCapital.textContent = 'RD$ 0.00 (No Aplica)';
                if (elEstatusFin) elEstatusFin.textContent = 'No Adjudicado';
                if (elMesesAtraso) elMesesAtraso.textContent = 'Lote sin adjudicar';
                if (elFechaFin) elFechaFin.textContent = 'N/A';
                if (elCronogramaWrap) elCronogramaWrap.style.display = 'none';
            } else {
                // Lote adjudicado saldado al 100%
                if (elFinPill) {
                    elFinPill.textContent = '✅ Pagado';
                    elFinPill.className = 'finance-badge-pill pagado';
                }
                if (elCapital) elCapital.textContent = 'RD$ 0.00 (Saldado / 100% Pagado)';
                if (elEstatusFin) elEstatusFin.textContent = 'Al Día / Saldado';
                if (elMesesAtraso) elMesesAtraso.textContent = '🟢 0 meses (Al día)';
                if (elFechaFin) elFechaFin.textContent = 'Liquidado / Pagado';
                if (elCronogramaWrap) elCronogramaWrap.style.display = 'none';
            }

            // Gestión de apertura de acordeón financiero
            const accFinanzas = document.getElementById('accFinanzas');
            if (accFinanzas) {
                if (App.State.mapMode === 'finanzas') {
                    accFinanzas.classList.add('open');
                } else {
                    accFinanzas.classList.remove('open');
                }
            }

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

            // 👁️ Fix del Conflicto 3D: Separación de Capas
            document.body.classList.toggle('view-3d');

            if (document.body.classList.contains('view-3d')) {
                if (btn) {
                    btn.classList.add('active');
                    btn.innerHTML = '🪐 2D';
                    btn.title = "Volver a Vista Plana";
                }

                // Reset Paneo y Zoom 2D para que no interfieran con la órbita 3D
                if (App.Map && App.Map.transform) {
                    App.Map.transform.x = 0;
                    App.Map.transform.y = 0;
                    App.Map.transform.scale = 1;
                    App.Map.updateMapTransform();
                }

                if (App.Map.Orbit) App.Map.Orbit.apply();
            } else {
                if (btn) {
                    btn.classList.remove('active');
                    btn.innerHTML = '👁️ 3D';
                    btn.title = "Alternar Vista Isométrica 3D";
                }
                if (App.Map.Orbit) App.Map.Orbit.reset();
            }
        },

        exportExecutivePDF() {
            const elementosOcultar = document.querySelectorAll(
                '.map-controls, .panel-filters, header .header-actions, .btn-action'
            );
            elementosOcultar.forEach(el => el.style.display = 'none');

            const mapContainer = document.getElementById('mapContainer');
            const is3D = document.body.classList.contains('view-3d');
            if (is3D) document.body.classList.remove('view-3d');

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
                if (is3D) document.body.classList.add('view-3d');
            }).catch(err => {
                console.error("Error al exportar a PDF:", err);
                alert("Hubo un error al generar el PDF. Verifica la consola.");
                elementosOcultar.forEach(el => el.style.display = '');
                if (is3D) document.body.classList.add('view-3d');
            });
        },

        updateStats() {
            const total = App.State.lotesMap.size;
            const filtered = App.State.filtered.length;

            const unidadesSum = App.State.filtered
                .filter(l => l.tipo === 'Habitacional')
                .reduce((sum, l) => sum + (parseInt(String(l.unidades || 0).replace(/,/g, '')) || 0), 0);

            const areaSum = App.State.filtered.reduce((sum, l) => sum + (l._parsedArea || 0), 0);

            const statTotalEl = document.getElementById('statTotal');
            if (statTotalEl) statTotalEl.textContent = total;
            const statFilteredEl = document.getElementById('statFiltered');
            if (statFilteredEl) statFilteredEl.textContent = filtered;
            const statUnidadesEl = document.getElementById('statUnidades');
            if (statUnidadesEl) statUnidadesEl.textContent = unidadesSum.toLocaleString('es-DO');

            const areaEl = document.getElementById('statAreaTotal');
            if (areaEl) {
                areaEl.textContent = areaSum.toLocaleString('es-DO') + ' m²';
            }

            this.renderCharts();
        },

        renderCharts() {
            const canvas = document.getElementById('kpiChart');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            
            const counts = {};
            App.State.filtered.forEach(l => {
                const est = l.estado || "Desconocido";
                // Normalizar variantes de construcción
                const normalized = est.includes("Construcci") ? "En Construcción" : est;
                counts[normalized] = (counts[normalized] || 0) + 1;
            });

            const labels = [];
            const data = [];
            const bgColors = [];
            const colorMap = {
                "Concluido": "#059669",
                "Terminado": "#10b981",
                "En Construcción": "#f59e0b", 
                "Paralizado": "#ef4444", 
                "Disponible": "#3b82f6",
                "No Iniciado": "#8b5cf6",
                "Adjudicado": "#06b6d4",
                "En Proceso": "#f97316",
                "Pendiente": "#a855f7",
                "Desconocido": "#94a3b8"
            };

            for (let [est, total] of Object.entries(counts)) {
                if (total > 0) {
                    labels.push(est);
                    data.push(total);
                    bgColors.push(colorMap[est] || "#888");
                }
            }

            if (this.chartInstance) {
                this.chartInstance.data.labels = labels;
                this.chartInstance.data.datasets[0].data = data;
                this.chartInstance.data.datasets[0].backgroundColor = bgColors;
                this.chartInstance.update();
            } else {
                if (typeof Chart !== 'undefined') {
                    Chart.defaults.color = '#94a3b8';
                    this.chartInstance = new Chart(ctx, {
                        type: 'doughnut',
                        data: {
                            labels: labels,
                            datasets: [{
                                data: data,
                                backgroundColor: bgColors,
                                borderWidth: 0,
                                hoverOffset: 4
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '70%',
                            plugins: {
                                legend: {
                                    position: 'right',
                                    labels: { boxWidth: 12, font: { size: 10 } }
                                }
                            }
                        }
                    });
                }
            }
        },

        updateKPIs() {
            // === VIVIENDAS (50 Lotes) ===
            const allHabitacionales = App.State.getAll().filter(l => l.tipo === 'Habitacional');
            const filteredHabitacionales = App.State.filtered.filter(l => l.tipo === 'Habitacional');

            // Lotes
            const vivLotesTotal = allHabitacionales.length;
            const vivLotesFiltered = filteredHabitacionales.length;

            // Unidades Totales Proyectadas
            let vivUnitsTotal = 0;
            allHabitacionales.forEach(lote => {
                const u = typeof lote.unidades === 'string'
                    ? (parseInt(lote.unidades.replace(/,/g, '')) || 0)
                    : (lote.unidades || 0);
                vivUnitsTotal += u;
            });

            let vivUnitsFiltered = 0;
            filteredHabitacionales.forEach(lote => {
                const u = typeof lote.unidades === 'string'
                    ? (parseInt(lote.unidades.replace(/,/g, '')) || 0)
                    : (lote.unidades || 0);
                vivUnitsFiltered += u;
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

            // === EQUIPAMIENTOS (75 Lotes) ===
            const allEquip = App.State.getAll().filter(l => l.tipo === 'Equipamiento' || l.tipo === 'Institucional');
            const filteredEquip = App.State.filtered.filter(l => l.tipo === 'Equipamiento' || l.tipo === 'Institucional');

            const equipLotesTotal = allEquip.length;
            const equipLotesFiltered = filteredEquip.length;

            let equipUnitsTotal = 0;
            allEquip.forEach(lote => {
                const u = typeof lote.unidades === 'string' ? (parseInt(lote.unidades.replace(/,/g, '')) || 0) : (lote.unidades || 0);
                equipUnitsTotal += u;
            });

            let equipUnitsFiltered = 0;
            filteredEquip.forEach(lote => {
                const u = typeof lote.unidades === 'string' ? (parseInt(lote.unidades.replace(/,/g, '')) || 0) : (lote.unidades || 0);
                equipUnitsFiltered += u;
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

            // === COMERCIALES (52 Lotes) ===
            const allCom = App.State.getAll().filter(l => l.tipo === 'Comercial');
            const filteredCom = App.State.filtered.filter(l => l.tipo === 'Comercial');

            const comLotesTotal = allCom.length;
            const comLotesFiltered = filteredCom.length;

            let comUnitsTotal = 0;
            allCom.forEach(lote => {
                const u = typeof lote.unidades === 'string' ? (parseInt(lote.unidades.replace(/,/g, '')) || 0) : (lote.unidades || 0);
                comUnitsTotal += u;
            });

            let comUnitsFiltered = 0;
            filteredCom.forEach(lote => {
                const u = typeof lote.unidades === 'string' ? (parseInt(lote.unidades.replace(/,/g, '')) || 0) : (lote.unidades || 0);
                comUnitsFiltered += u;
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

            // === INFRAESTRUCTURA (37 Lotes) ===
            const allInfra = App.State.getAll().filter(l => l.tipo === 'Infraestructura');
            const filteredInfra = App.State.filtered.filter(l => l.tipo === 'Infraestructura');

            const infraLotesTotal = allInfra.length;
            const infraLotesFiltered = filteredInfra.length;

            const infraLotesTotalEl = document.getElementById('kpiInfraLotesTotal');
            const infraLotesFilteredEl = document.getElementById('kpiInfraLotesFiltered');
            const infraUnitsTotalEl = document.getElementById('kpiInfraUnitsTotal');
            const infraUnitsFilteredEl = document.getElementById('kpiInfraUnitsFiltered');

            if (infraLotesTotalEl) infraLotesTotalEl.textContent = infraLotesTotal.toLocaleString('es-DO');
            if (infraLotesFilteredEl) infraLotesFilteredEl.textContent = infraLotesFiltered.toLocaleString('es-DO');
            if (infraUnitsTotalEl) infraUnitsTotalEl.textContent = '100%';
            if (infraUnitsFilteredEl) {
                if (infraLotesFiltered === 0) {
                    infraUnitsFilteredEl.textContent = '0 km';
                } else if (infraLotesFiltered === infraLotesTotal) {
                    infraUnitsFilteredEl.textContent = '24.8 km';
                } else {
                    const kmVal = ((infraLotesFiltered / (infraLotesTotal || 1)) * 24.8).toFixed(1);
                    infraUnitsFilteredEl.textContent = kmVal + ' km';
                }
            }

            // === CRECIMIENTO ===
            const growthEl = document.querySelector('.growth-value');
            if (growthEl) {
                if (vivLotesFiltered === 0) {
                    growthEl.textContent = '0%';
                } else {
                    const growthPercent = Math.round(((vivUnitsFiltered - CONFIG.baseline.viviendas2020) / CONFIG.baseline.viviendas2020) * 100);
                    growthEl.textContent = (growthPercent >= 0 ? '+' : '') + growthPercent + '%';
                }
            }

            // === INFRAESTRUCTURA DETALLE BARRAS ===
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

        // ===========================================
        // LEYENDA DINÁMICA DE MODOS DE COLORACIÓN
        // ===========================================
        updateColorModeLegend(mode = App.State.mapMode) {
            const container = document.getElementById('colorModeLegendContainer');
            const titleEl = document.getElementById('legendBoxTitle');
            const itemsEl = document.getElementById('legendBoxItems');
            if (!container || !titleEl || !itemsEl) return;

            const LEGEND_DATA = {
                'tipo': {
                    title: '🎨 Zonificación por Tipo de Suelo',
                    items: [
                        { color: '#00a8ff', label: 'Habitacional', desc: 'Desarrollo de viviendas residenciales unifamiliares y multifamiliares' },
                        { color: '#f59e0b', label: 'Comercial', desc: 'Plazas comerciales, locales y servicios privados' },
                        { color: '#a855f7', label: 'Institucional / Equipamiento', desc: 'Escuelas, salud, estancias infantiles, parques y deportes' },
                        { color: '#94a3b8', label: 'Infraestructura', desc: 'Plantas de tratamiento, tanques de agua y red vial' }
                    ]
                },
                'estado': {
                    title: '🏗️ Estado de Obra (Ejecución Física)',
                    items: [
                        { color: '#10b981', label: 'Terminado', desc: 'Obra concluida al 100% y entregada' },
                        { color: '#f59e0b', label: 'En Construcción', desc: 'Obra activa en proceso de ejecución física' },
                        { color: '#ef4444', label: 'Paralizado', desc: 'Obra detenida / abandono constatado en fiscalización' },
                        { color: '#60a5fa', label: 'Disponible', desc: 'Lote disponible para licitación o desarrollo' },
                        { color: '#94a3b8', label: 'No Iniciado', desc: 'Adjudicado formalmente sin obras iniciadas' }
                    ]
                },
                'plazos': {
                    title: '⏱️ Lotes en Atraso (Plazo Contractual)',
                    items: [
                        { color: '#ef4444', label: 'Atraso Crítico (> 24 Meses)', desc: 'Fecha contractual vencida con más de 2 años de retraso' },
                        { color: '#f97316', label: 'Atraso Alto (12 a 24 Meses)', desc: 'Vencido entre 1 y 2 años sin concluir obra' },
                        { color: '#eab308', label: 'Atraso Moderado (< 12 Meses)', desc: 'Vencido con menos de 1 año de retraso' },
                        { color: '#334155', label: 'En Plazo / Vigente', desc: 'Con adenda a futuro, dentro de plazo o concluido' }
                    ]
                },
                'adendas': {
                    title: '📜 Adendas y Readjudicaciones',
                    items: [
                        { color: '#10b981', label: 'Con Adenda Firmada', desc: 'Contrato modificatorio o prórroga formal aprobada' },
                        { color: '#38bdf8', label: 'Readjudicado', desc: 'Lote cedido o adjudicado a un nuevo desarrollador' },
                        { color: '#64748b', label: 'Contrato Original', desc: 'Mantiene contrato base inicial sin modificaciones' }
                    ]
                },
                'legal': {
                    title: '⚖️ Estatus Legal & Dictamen Contractual',
                    items: [
                        { color: '#ef4444', label: 'Causal de Rescisión', desc: 'Rescisión aplicable por obra paralizada / abandono' },
                        { color: '#f97316', label: 'Penalidad Contractual 5%', desc: 'Aplica cláusula de penalidad por mora (Art. 23)' },
                        { color: '#10b981', label: 'En Plazo / Regular', desc: 'Cumplimiento normativo o prórroga regular' },
                        { color: '#64748b', label: 'Concluido / Liquidado', desc: 'Contrato concluido o finiquitado formalmente' }
                    ]
                },
                'unificada': {
                    title: '🎯 Capa Unificada (Semáforo de Riesgo)',
                    items: [
                        { color: '#ef4444', label: 'Riesgo Crítico (3-4 Fallas)', desc: 'Atraso grave + obra paralizada / no iniciado + mora financiera' },
                        { color: '#f97316', label: 'Riesgo Alto (2 Fallas)', desc: '2 fallas operativas o financieras concurrentes' },
                        { color: '#eab308', label: 'Riesgo Moderado (1 Falla)', desc: '1 falla operativa o financiera activa' },
                        { color: '#10b981', label: 'Desempeño Conforme (0 Fallas)', desc: 'En plazo, ejecución regular y al día en pagos' }
                    ]
                },
                'finanzas': {
                    title: '💰 Estatus Financiero (Capital Adeudado)',
                    items: [
                        { color: '#ef4444', label: 'En Legal', desc: 'Cobranzas o proceso legal por mora activa' },
                        { color: '#f97316', label: 'Sin Cronograma Acordado', desc: 'Deuda pendiente sin plan de distribución acordado' },
                        { color: '#eab308', label: 'Atraso Leve (1 Cuota)', desc: '1 cuota mensual pendiente de pago' },
                        { color: '#10b981', label: 'Al Día / 100% Pagado', desc: 'Al día con cronograma o lote saldado' },
                        { color: '#94a3b8', label: 'No Adjudicado / N/A', desc: 'Lote disponible o sin contrato de venta' }
                    ]
                }
            };

            const data = LEGEND_DATA[mode] || LEGEND_DATA['tipo'];
            titleEl.textContent = data.title;
            itemsEl.innerHTML = data.items.map(item => `
                <div class="legend-item-row">
                    <span class="legend-item-dot" style="background-color: ${item.color}; color: ${item.color};"></span>
                    <div class="legend-item-content">
                        <span class="legend-item-label">${item.label}</span>
                        <span class="legend-item-desc">${item.desc}</span>
                    </div>
                </div>
            `).join('');
        },

        // ===========================================
        // MODAL INTERACTIVO DE LISTADO (EXCEL TABLE)
        // ===========================================
        openFilteredListModal() {
            try {
                const overlay = document.getElementById('vbcListadoModalOverlay');
                if (!overlay) {
                    console.error('Modal overlay #vbcListadoModalOverlay not found in DOM.');
                    return;
                }

                const lotesToRender = (App.State.filtered && App.State.filtered.length > 0) 
                    ? App.State.filtered 
                    : (App.State.getAll() || []);

                // Determinar descripción de la capa/filtro activo
                let badgeText = '🎯 Capa Activa: Todos los Lotes';
                if (App.State.mapMode === 'adendas') {
                    badgeText = '📜 Capa Activa: Lotes con Adendas Formalizadas';
                } else if (App.State.mapMode === 'plazos') {
                    badgeText = '⏱️ Capa Activa: Lotes con Atraso Contractual';
                } else if (App.State.mapMode === 'legal') {
                    badgeText = '⚖️ Capa Activa: Estatus Legal & Cláusulas';
                } else if (App.State.mapMode === 'unificada') {
                    badgeText = '🎯 Capa Activa: Evaluación Unificada de Riesgo';
                } else if (App.State.mapMode === 'finanzas') {
                    badgeText = '💰 Capa Activa: Estatus Financiero & Capital Adeudado';
                } else if (App.State.filters.selectedDevelopers && App.State.filters.selectedDevelopers.length > 0) {
                    badgeText = `🏗️ Filtro Desarrollador: ${App.State.filters.selectedDevelopers.join(', ')}`;
                } else if (App.State.filters.selectedEstados && App.State.filters.selectedEstados.length > 0) {
                    badgeText = `🏗️ Filtro Estado: ${App.State.filters.selectedEstados.join(', ')}`;
                } else if (App.State.filters.types && App.State.filters.types.length > 0) {
                    badgeText = `🏷️ Tipo: ${App.State.filters.types.join(', ')}`;
                }

                const badgeEl = document.getElementById('modalActiveFilterBadge');
                if (badgeEl) badgeEl.textContent = `${badgeText} • ${lotesToRender.length} lotes`;

                // Reset search box inside modal
                const searchInput = document.getElementById('modalTableSearchInput');
                if (searchInput) searchInput.value = '';

                // Render KPI Ribbon
                this.updateModalKpiRibbon(lotesToRender);

                // Render Table Rows
                this.renderModalTable(lotesToRender);

                // Show Modal
                overlay.classList.add('active');
                document.body.style.overflow = 'hidden';
                if (searchInput) searchInput.focus();
            } catch (err) {
                console.error('Error opening filtered list modal:', err);
                this.showToast('⚠️ Error al abrir el listado: ' + err.message);
            }
        },

        closeFilteredListModal() {
            const overlay = document.getElementById('vbcListadoModalOverlay');
            if (!overlay) return;
            overlay.classList.remove('active');
            overlay.style.display = '';  // FIX: Remover inline style para que CSS display:none tome control
            document.body.style.overflow = '';
        },

        updateModalKpiRibbon(lotes) {
            const totalLotes = lotes.length;
            let vivSum = 0;
            let locSum = 0;
            let areaSum = 0;
            let adendasCount = 0;
            let atrasoCount = 0;

            lotes.forEach(l => {
                areaSum += (l._parsedArea || 0);
                const u = typeof l.unidades === 'string' ? (parseInt(l.unidades.replace(/,/g, '')) || 0) : (l.unidades || 0);
                if (l.tipo === 'Habitacional') vivSum += u;
                else if (l.tipo === 'Comercial') locSum += u;

                const terms = App.Map.calculateContractualTerms(l);
                if (terms.hasAdenda) adendasCount++;
                if (terms.mesesRetraso > 0 || terms.anosRetraso > 0) atrasoCount++;
            });

            const kpiTotalEl = document.getElementById('modalKpiTotalLotes');
            const kpiVivEl = document.getElementById('modalKpiViviendas');
            const kpiLocEl = document.getElementById('modalKpiLocales');
            const kpiAreaEl = document.getElementById('modalKpiArea');
            const kpiAdendasEl = document.getElementById('modalKpiAdendas');
            const kpiAtrasoEl = document.getElementById('modalKpiAtraso');

            if (kpiTotalEl) kpiTotalEl.textContent = totalLotes.toLocaleString('es-DO');
            if (kpiVivEl) kpiVivEl.textContent = vivSum.toLocaleString('es-DO');
            if (kpiLocEl) kpiLocEl.textContent = locSum.toLocaleString('es-DO');
            if (kpiAreaEl) kpiAreaEl.textContent = areaSum.toLocaleString('es-DO', { maximumFractionDigits: 1 }) + ' m²';
            if (kpiAdendasEl) kpiAdendasEl.textContent = adendasCount.toLocaleString('es-DO');
            if (kpiAtrasoEl) kpiAtrasoEl.textContent = atrasoCount.toLocaleString('es-DO');
        },

        renderModalTable(lotes) {
            const tbody = document.getElementById('vbcModalTableBody');
            const footerInfo = document.getElementById('modalTableFooterInfo');
            if (!tbody) return;

            if (footerInfo) {
                footerInfo.textContent = `Mostrando ${lotes.length} de ${App.State.filtered.length} lotes filtrados`;
            }

            if (lotes.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="16" style="text-align: center; padding: 40px; color: #94a3b8;">
                            🔍 No se encontraron lotes que coincidan con la búsqueda.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = lotes.map((l, idx) => {
                const terms = App.Map.calculateContractualTerms(l);
                const areaStr = (l._parsedArea || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                
                // Tipo badge
                const tipoClass = (l.tipo || '').toLowerCase();
                const tipoBadge = `<span class="table-badge ${tipoClass}">${l.tipo || '-'}</span>`;

                // Estatus de obra pill
                const estado = l.estado || '-';
                let estStyle = 'background: rgba(148,163,184,0.15); color: #94a3b8; border: 1px solid rgba(148,163,184,0.3);';
                if (estado.includes('Concluido') || estado.includes('Terminado')) estStyle = 'background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.35);';
                else if (estado.includes('Construcci')) estStyle = 'background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.35);';
                else if (estado.includes('Paralizado')) estStyle = 'background: rgba(239,68,68,0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.35);';
                else if (estado.includes('Disponible')) estStyle = 'background: rgba(59,130,246,0.15); color: #60a5fa; border: 1px solid rgba(59,130,246,0.35);';
                const estadoBadge = `<span class="table-status-pill" style="${estStyle}">${estado}</span>`;

                // Unidades / Locales
                let unitsText = '-';
                if (l.tipo === 'Habitacional') unitsText = `${(l.unidades || 0).toLocaleString('es-DO')} viv.`;
                else if (l.tipo === 'Comercial') unitsText = `${(l.unidades || 0).toLocaleString('es-DO')} loc.`;

                // Estatus de plazo badge
                let plazoStyle = 'background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3);';
                let plazoText = terms.criticidad || '🟢 En Plazo';
                if (terms.criticidad.includes('Crítico')) plazoStyle = 'background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.4);';
                else if (terms.criticidad.includes('Alto')) plazoStyle = 'background: rgba(249,115,22,0.2); color: #fb923c; border: 1px solid rgba(249,115,22,0.4);';
                else if (terms.criticidad.includes('Moderado')) plazoStyle = 'background: rgba(234,179,8,0.2); color: #facc15; border: 1px solid rgba(234,179,8,0.4);';
                else if (terms.criticidad.includes('Próximo a Vencer') || terms.isProximoVencer) plazoStyle = 'background: rgba(245,158,11,0.2); color: #fbbf24; border: 1px solid rgba(245,158,11,0.4);';
                const plazoBadge = `<span class="table-status-pill" style="${plazoStyle}">${plazoText}</span>`;

                // Expediente jurídico summary con botón interactivo de PDF
                let legalSummary = '<span style="color:#64748b;">No aplica</span>';
                const docInfo = App.State.legalDocsMap?.get(l.id);
                let docFile = (docInfo && docInfo.primary_pdf) ? docInfo.primary_pdf.filename : (l.pdf_documento && l.pdf_documento !== 'No disponible' ? l.pdf_documento : null);
                const hasPdf = docFile && docFile !== '-' && docFile !== 'No disponible';

                if (terms.hasAdenda) {
                    const adendaLabel = l.tipo_adenda_num || l.proceso_adenda || 'Adenda formal';
                    let btnPdfHtml = '';
                    if (hasPdf) {
                        btnPdfHtml = `<a href="documentos_legales/${encodeURIComponent(docFile)}" target="_blank" onclick="event.stopPropagation();" class="btn-table-pdf" title="Abrir documento PDF original (${docFile})"><span>📄</span> Ver Adenda</a>`;
                    }
                    legalSummary = `
                        <div class="table-legal-cell">
                            <span class="table-legal-title">📜 ${adendaLabel}</span>
                            ${btnPdfHtml}
                        </div>
                    `;
                } else if (l.clausula_rescision === 'SI' || l.clausula_penalidad_5pct === 'SI') {
                    let btnPdfHtml = '';
                    if (hasPdf) {
                        btnPdfHtml = `<a href="documentos_legales/${encodeURIComponent(docFile)}" target="_blank" onclick="event.stopPropagation();" class="btn-table-pdf contract" title="Abrir Contrato digitalizado (${docFile})"><span>📄</span> Ver Contrato</a>`;
                    }
                    legalSummary = `
                        <div class="table-legal-cell">
                            <span style="color:#f87171; font-weight:600; font-size:10.5px;">⚖️ Penalidad 5% / Rescisión</span>
                            ${btnPdfHtml}
                        </div>
                    `;
                } else if (hasPdf) {
                    legalSummary = `
                        <div class="table-legal-cell">
                            <span style="color:#94a3b8; font-size:10.5px;">Contrato Vigente</span>
                            <a href="documentos_legales/${encodeURIComponent(docFile)}" target="_blank" onclick="event.stopPropagation();" class="btn-table-pdf contract" title="Abrir Contrato digitalizado (${docFile})"><span>📄</span> Ver PDF</a>
                        </div>
                    `;
                }

                // Fechas Contractuales (Auditadas con fecha histórica de licitación)
                const fechaAdjOrig = terms.fechaAdjudicacionOrig || l.fecha_adjudicacion_orig || l['Fecha adjudicacion'] || '-';
                let fechaAdendaHtml = '<span style="color: #64748b;">No aplica</span>';
                if (terms.hasAdenda && terms.fechaAdenda && terms.fechaAdenda !== '-') {
                    fechaAdendaHtml = `<span style="color: #38bdf8; font-weight: 600;">${terms.fechaAdenda}</span>`;
                }

                let fechaTerminoHtml = `<span style="color: #cbd5e1;">${terms.fechaTermino || '-'}</span>`;
                if (terms.hasAdenda) {
                    fechaTerminoHtml = `<span style="color: #38bdf8; font-weight: 600;">${terms.fechaTermino}</span>`;
                } else if (terms.mesesRetraso > 0 || terms.anosRetraso > 0) {
                    fechaTerminoHtml = `<span style="color: #f87171; font-weight: 600;">${terms.fechaTermino}</span>`;
                }

                // Información Financiera
                const finInfo = App.State.financialMap ? App.State.financialMap.get(l.id) : null;
                const isDisp = (l.estado || '').toString().toLowerCase().includes('disponible') || 
                               (l.estado || '').toString().toLowerCase().includes('licitaci') || 
                               !l.desarrollador || l.desarrollador === '-';
                let capitalAdeudadoHtml = '<span style="color: #64748b; font-size: 11px;">RD$ 0.00</span>';
                let finPagosHtml = '<span style="color: #10b981; font-size: 11px;">100% Pagado</span>';

                if (finInfo) {
                    capitalAdeudadoHtml = `<span style="color: #38bdf8; font-weight: 700; font-family: monospace;">RD$ ${finInfo.capital_adeudado.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>`;
                    let finColor = finInfo.color || '#94a3b8';
                    finPagosHtml = `<span style="color: ${finColor}; font-weight: 600; font-size: 11px;">${finInfo.fecha_fin_pagos}</span>`;
                } else if (isDisp) {
                    capitalAdeudadoHtml = '<span style="color: #64748b; font-size: 11px;">-</span>';
                    finPagosHtml = '<span style="color: #64748b; font-size: 11px;">N/A</span>';
                }

                return `
                    <tr onclick="App.UI.locateLotFromTable('${l.id}')" title="Haz clic para ubicar ${l.id} en el mapa">
                        <td style="text-align: center; color: #64748b;">${idx + 1}</td>
                        <td><span class="table-lot-id">${l.id}</span></td>
                        <td style="font-weight: 600; color: #f8fafc;">${l.nombre || '-'}</td>
                        <td>${tipoBadge}</td>
                        <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis;">${l.desarrollador || '-'}</td>
                        <td>${estadoBadge}</td>
                        <td style="text-align: right; font-family: monospace;">${areaStr} m²</td>
                        <td style="text-align: right; font-weight: 600;">${unitsText}</td>
                        <td style="font-family: monospace; font-size: 10.5px; color: #94a3b8;">${fechaAdjOrig}</td>
                        <td style="font-family: monospace; font-size: 10.5px;">${fechaAdendaHtml}</td>
                        <td style="font-family: monospace; font-size: 10.5px;">${fechaTerminoHtml}</td>
                        <td>${plazoBadge}</td>
                        <td style="text-align: right;">${capitalAdeudadoHtml}</td>
                        <td style="font-family: monospace; font-size: 11px;">${finPagosHtml}</td>
                        <td style="min-width: 220px; max-width: 320px;">${legalSummary}</td>
                        <td style="text-align: center;">
                            <button class="table-btn-locate" onclick="event.stopPropagation(); App.UI.locateLotFromTable('${l.id}')">📍 Ver</button>
                        </td>
                    </tr>
                `;
            }).join('');
        },

        openLegalPDF(lotId) {
            const docInfo = App.State.legalDocsMap?.get(lotId);
            let docFile = (docInfo && docInfo.primary_pdf) ? docInfo.primary_pdf.filename : null;
            if (!docFile) {
                const lote = App.State.lotesMap.get(lotId);
                if (lote && lote.pdf_documento && lote.pdf_documento !== 'No disponible') {
                    docFile = lote.pdf_documento;
                }
            }

            if (docFile) {
                const url = `documentos_legales/${encodeURIComponent(docFile)}`;
                window.open(url, '_blank');
                this.showToast(`📄 Abriendo ${docFile}...`);
            } else {
                this.showToast('⚠️ No se encontró documento PDF digitalizado para este lote');
            }
        },

        filterModalTable(query) {
            const q = (query || '').toLowerCase().trim();
            if (!q) {
                this.renderModalTable(App.State.filtered);
                return;
            }

            const matched = App.State.filtered.filter(l => {
                const id = (l.id || '').toLowerCase();
                const nom = (l.nombre || '').toLowerCase();
                const dev = (l.desarrollador || '').toLowerCase();
                const tipo = (l.tipo || '').toLowerCase();
                const est = (l.estado || '').toLowerCase();
                const adenda = (l.tipo_adenda_num || l.proceso_adenda || l.tipo_adenda || '').toLowerCase();
                const pdf = (l.pdf_documento || '').toLowerCase();
                return id.includes(q) || nom.includes(q) || dev.includes(q) || tipo.includes(q) || est.includes(q) || adenda.includes(q) || pdf.includes(q);
            });

            this.renderModalTable(matched);
        },

        copyTableToClipboard() {
            const lotes = App.State.filtered;
            if (lotes.length === 0) {
                this.showToast('No hay lotes para copiar');
                return;
            }

            const headers = [
                'ID Lote', 'Proyecto / Nombre', 'Tipo', 'Desarrollador', 'Estado de Obra',
                'Superficie (m²)', 'Unidades/Locales', 'F. Adjudicación Orig.', 'F. Firma Adenda',
                'F. Término Vigente', 'Estatus Plazo', 'Expediente Jurídico / Adenda'
            ];

            const rows = lotes.map(l => {
                const terms = App.Map.calculateContractualTerms(l);
                const area = l._parsedArea || 0;
                let units = l.unidades || 0;
                let adendaInfo = terms.hasAdenda ? (l.tipo_adenda_num || l.proceso_adenda || 'Adenda formal') : 'No aplica';
                return [
                    l.id,
                    l.nombre || '',
                    l.tipo || '',
                    l.desarrollador || '',
                    l.estado || '',
                    area,
                    units,
                    l.fecha_adjudicacion_orig || l['Fecha adjudicacion'] || '',
                    terms.fechaAdenda || 'No aplica',
                    terms.fechaTermino || '',
                    terms.criticidad || 'En Plazo',
                    adendaInfo
                ].join('\t');
            });

            const tsvData = [headers.join('\t'), ...rows].join('\n');

            navigator.clipboard.writeText(tsvData).then(() => {
                this.showToast('📋 ¡Copiado al portapapeles! Listo para pegar en Excel');
            }).catch(err => {
                console.error('Error al copiar:', err);
                this.showToast('Error al copiar al portapapeles');
            });
        },

        downloadTableCSV() {
            const lotes = App.State.filtered;
            if (lotes.length === 0) {
                this.showToast('No hay datos para descargar');
                return;
            }

            const headers = [
                'ID Lote', 'Proyecto / Nombre', 'Tipo', 'Desarrollador', 'Estado Obra',
                'Superficie m2', 'Unidades', 'Fecha Adjudicacion Orig', 'Fecha Firma Adenda',
                'Fecha Termino Vigente', 'Estatus Plazo', 'Expediente Juridico'
            ];

            const rows = lotes.map(l => {
                const terms = App.Map.calculateContractualTerms(l);
                return [
                    `"${l.id}"`,
                    `"${(l.nombre || '').replace(/"/g, '""')}"`,
                    `"${l.tipo || ''}"`,
                    `"${(l.desarrollador || '').replace(/"/g, '""')}"`,
                    `"${l.estado || ''}"`,
                    l._parsedArea || 0,
                    l.unidades || 0,
                    `"${l.fecha_adjudicacion_orig || l['Fecha adjudicacion'] || ''}"`,
                    `"${terms.fechaAdenda || 'No aplica'}"`,
                    `"${terms.fechaTermino || ''}"`,
                    `"${terms.criticidad || 'En Plazo'}"`,
                    `"${(l.tipo_adenda_num || l.proceso_adenda || 'No aplica').replace(/"/g, '""')}"`
                ].join(',');
            });

            const csvContent = '\ufeff' + [headers.join(','), ...rows].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Listado_Lotes_Filtrados_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showToast('📥 Descargando archivo CSV...');
        },

        locateLotFromTable(id) {
            this.closeFilteredListModal();
            if (App.Map && App.Map.zoomToLot) {
                App.Map.zoomToLot(id);
            } else {
                this.selectLot(id);
            }
        },

        showToast(msg) {
            let toast = document.getElementById('vbcGlobalToast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'vbcGlobalToast';
                toast.className = 'vbc-toast';
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            toast.style.display = 'flex';
            clearTimeout(this._toastTimeout);
            this._toastTimeout = setTimeout(() => {
                if (toast) toast.style.display = 'none';
            }, 3000);
        },

        bindGlobalEvents() {
            document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());
            document.getElementById('highContrastToggle')?.addEventListener('click', () => this.toggleHighContrast());
            document.getElementById('btnFullscreen')?.addEventListener('click', () => this.toggleFullscreen());
            document.addEventListener('fullscreenchange', () => this.updateFullscreenUI());
            document.getElementById('btnExport')?.addEventListener('click', () => this.exportCSV());
            document.getElementById('btnPrint')?.addEventListener('click', () => this.exportExecutivePDF());
            document.getElementById('btnExportFilteredReport')?.addEventListener('click', () => this.exportExecutivePDF());

            // Modal Ver Listado
            document.getElementById('btnViewFilteredList')?.addEventListener('click', () => this.openFilteredListModal());
            document.getElementById('btnCloseListadoModal')?.addEventListener('click', () => this.closeFilteredListModal());
            document.getElementById('vbcListadoModalOverlay')?.addEventListener('click', (e) => {
                if (e.target.id === 'vbcListadoModalOverlay') this.closeFilteredListModal();
            });
            document.getElementById('modalTableSearchInput')?.addEventListener('input', (e) => {
                this.filterModalTable(e.target.value);
            });
            document.getElementById('btnCopyTableTSV')?.addEventListener('click', () => this.copyTableToClipboard());
            document.getElementById('btnDownloadTableCSV')?.addEventListener('click', () => this.downloadTableCSV());

            // ESC key to close modal
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const overlay = document.getElementById('vbcListadoModalOverlay');
                    if (overlay && overlay.classList.contains('active')) {
                        this.closeFilteredListModal();
                    }
                }
            });

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

            // Inicializar Leyenda de Modo de Coloración
            this.updateColorModeLegend('tipo');
        },

        toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    console.warn('Error al activar pantalla completa:', err);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                }
            }
        },

        updateFullscreenUI() {
            const isFs = !!document.fullscreenElement;
            const icon = document.getElementById('fsIcon');
            const text = document.getElementById('fsText');
            const btn = document.getElementById('btnFullscreen');
            if (icon) icon.textContent = isFs ? '🗗' : '⛶';
            if (text) text.textContent = isFs ? 'Salir de Pantalla Completa' : 'Pantalla Completa';
            if (btn) {
                btn.style.background = isFs 
                    ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' 
                    : 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)';
                btn.style.borderColor = isFs ? '#38bdf8' : 'rgba(56,189,248,0.4)';
                btn.style.color = '#ffffff';
            }
        },

        toggleTheme() {
            document.body.classList.toggle('light-mode');
            const btn = document.getElementById('themeToggle');
            if (btn) {
                btn.textContent = document.body.classList.contains('light-mode') ? '🌙' : '☀️';
            }
            if (App.Map && typeof App.Map.render === 'function') {
                App.Map.render();
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

            // 🔄 FIX: Ensure ALL filter buttons are active on boot so all lots are visible
            document.querySelectorAll('.filter-btn[data-tipo]').forEach(b => b.classList.add('active'));

            this.Filter.apply();

            // 🎨 Log color distribution for debugging
            const tipoCount = {};
            App.State.lotesMap.forEach(l => {
                tipoCount[l.tipo] = (tipoCount[l.tipo] || 0) + 1;
            });
            console.log('🎨 Distribución de tipos:', tipoCount);
            console.log('✅ Aplicación inicializada correctamente');
        } catch (error) {
            console.error('❌ Error fatal en inicialización:', error);
        }
    }
};

window.App = App;

document.addEventListener('DOMContentLoaded', () => App.init());

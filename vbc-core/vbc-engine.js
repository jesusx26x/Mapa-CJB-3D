/**
 * ====================================================================
 * VBC-CORE: Master GIS & Data Engine (vbc-engine.js)
 * Fideicomiso VBC - Sistema de Gestión Territorial
 * Versión 3.0 Enterprise
 * ====================================================================
 */

(function (window) {
    'use strict';

    window.VBC = window.VBC || {};

    const Engine = {
        config: null,
        state: {
            lotesMap: new Map(),
            svgElementsMap: new Map(),
            habitacionalMap: new Map(),
            comercialMap: new Map(),
            filtered: [],
            selectedId: null,
            activeLayer: 'type', // 'type', 'status', 'walkability'
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
                searchQuery: ''
            }
        },

        /**
         * Inicializar el motor con una configuración específica
         */
        async init(config) {
            this.config = Object.assign({
                id: 'cjb',
                name: 'Ciudad Juan Bosch',
                dataPath: '../Datos de CJB.csv',
                svgPath: 'assets/mapa.svg',
                containerId: 'mapContainer',
                secondaryData: {
                    habitacional: 'data/Planilla%20Base%20Habitacionales.csv',
                    comercial: 'data/Planilla%20general%20Comercial.csv'
                }
            }, config);

            console.log(`🚀 [VBC Engine] Inicializando plataforma para: ${this.config.name}`);

            try {
                // 1. Ingesta de datos
                await this.Data.init(this);
                // 2. Montaje interactivo de SVG
                await this.Map.init(this);
                // 3. Montaje de Tooltips HUD
                this.HUD.init(this);
                // 4. Montaje de Capas Smart City
                if (window.VBC.SmartCity) {
                    window.VBC.SmartCity.init(this);
                }
                // 5. Iniciar Live Sync en segundo plano
                this.Data.startLiveSync(this);

                VBC.EventBus.emit('engine:ready', this);
            } catch (err) {
                console.error("❌ [VBC Engine] Error crítico en inicialización:", err);
            }
        },

        /**
         * Módulo de Ingesta y Normalización de Datos
         */
        Data: {
            async init(engine) {
                // Cargar datos secundarios de forma segura (allSettled)
                if (engine.config.secondaryData) {
                    await Promise.allSettled([
                        this.fetchSecondary(engine.config.secondaryData.habitacional, engine.state.habitacionalMap),
                        this.fetchSecondary(engine.config.secondaryData.comercial, engine.state.comercialMap)
                    ]);
                }

                // Cargar dataset principal
                const response = await fetch(engine.config.dataPath + '?t=' + Date.now());
                if (!response.ok) throw new Error(`HTTP ${response.status} cargando ${engine.config.dataPath}`);
                const csvText = await response.text();
                this.loadMainCSV(csvText, engine);
            },

            async fetchSecondary(url, targetMap) {
                try {
                    const res = await fetch(url);
                    if (!res.ok) return;
                    const text = await res.text();
                    const rows = this.parseCSV(text);
                    rows.forEach(r => {
                        if (r.id) targetMap.set(r.id, r);
                    });
                } catch (e) {
                    console.warn(`[VBC Data] Dataset secundario no disponible: ${url}`);
                }
            },

            loadMainCSV(csvText, engine) {
                const rows = this.parseCSV(csvText);
                engine.state.lotesMap.clear();

                rows.forEach(row => {
                    if (row.id) {
                        const merged = this.mergeLote(row, engine);
                        engine.state.lotesMap.set(row.id, merged);
                    }
                });

                engine.state.filtered = Array.from(engine.state.lotesMap.values());
                console.log(`✅ [VBC Data] ${engine.state.lotesMap.size} lotes indexados correctamente.`);
                VBC.EventBus.emit('data:loaded', engine.state.filtered);
            },

            normalizeId(rawId) {
                if (!rawId) return '';
                let val = String(rawId).trim().replace(/^poly-/i, '');
                if (/^\d{2}-\d{2}-\d{2}$/.test(val)) return val;
                if (/^[Cc]-\d{1,2}$/.test(val)) return val.toUpperCase();

                // Detección y corrección de fechas de Excel (M/D/YYYY o D/M/YYYY)
                const matchDate = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (matchDate) {
                    const c = parseInt(matchDate[1], 10);
                    const mz = parseInt(matchDate[2], 10);
                    const yr = parseInt(matchDate[3], 10);
                    const lote = yr >= 2000 ? yr - 2000 : yr;
                    return `${String(c).padStart(2, '0')}-${String(mz).padStart(2, '0')}-${String(lote).padStart(2, '0')}`;
                }

                // Fechas cortas M/D/YY
                const matchShort = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{1,2})$/);
                if (matchShort) {
                    const c = parseInt(matchShort[1], 10);
                    const mz = parseInt(matchShort[2], 10);
                    const lote = parseInt(matchShort[3], 10);
                    return `${String(c).padStart(2, '0')}-${String(mz).padStart(2, '0')}-${String(lote).padStart(2, '0')}`;
                }

                // Guiones sin ceros (1-1-1)
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
                if (typeof Papa === 'undefined') {
                    console.error("❌ PapaParse no está cargado.");
                    return [];
                }
                const results = Papa.parse(text, { header: true, skipEmptyLines: true });
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

            mergeLote(lote, engine) {
                const hab = engine.state.habitacionalMap.get(lote.id) || {};
                const com = engine.state.comercialMap.get(lote.id) || {};
                const extra = Object.assign({}, hab, com);

                let rawTipo = lote.tipo || extra.tipo || 'Desconocido';
                let normTipo = this.normalizeTipo(rawTipo);

                const areaNum = parseFloat(String(lote.area_m2 || extra.area_m2 || '0').replace(/,/g, '')) || 0;

                return Object.assign({}, extra, lote, {
                    tipo: normTipo,
                    _parsedArea: areaNum,
                    _parsedYear: this.parseYear(lote['Fecha entrega'] || extra['Fecha entrega'] || lote['Fecha adjudicacion'])
                });
            },

            normalizeTipo(raw) {
                const u = String(raw).toUpperCase().trim();
                if (u.includes('HABIT')) return 'Habitacional';
                if (u.includes('COMER')) return 'Comercial';
                if (u.includes('INSTIT') || u.includes('EQUIP')) return 'Institucional';
                if (u.includes('VERDE')) return 'Área Verde';
                if (u.includes('INFRA')) return 'Infraestructura';
                return 'Desconocido';
            },

            parseYear(str) {
                if (!str) return null;
                if (/^\d{4}$/.test(str)) return parseInt(str, 10);
                const parts = str.split('/');
                if (parts.length === 3) return parseInt(parts[2], 10);
                return null;
            },

            startLiveSync(engine) {
                let lastText = '';
                setInterval(async () => {
                    try {
                        const res = await fetch(engine.config.dataPath + '?sync=' + Date.now(), { cache: 'no-store' });
                        if (!res.ok) return;
                        const text = await res.text();
                        if (lastText && text !== lastText) {
                            console.log("⚡ [VBC LiveSync] Cambio detectado en CSV, actualizando mapa...");
                            lastText = text;
                            this.loadMainCSV(text, engine);
                            engine.Map.render();
                            VBC.EventBus.emit('data:synced', engine.state.filtered);
                        } else if (!lastText) {
                            lastText = text;
                        }
                    } catch (e) {
                        // Silencioso ante bloqueos temporales de archivo en Excel
                    }
                }, 3000);
            }
        },

        /**
         * Módulo de Renderizado y Manipulación SVG
         */
        Map: {
            async init(engine) {
                const container = document.getElementById(engine.config.containerId);
                if (!container) return;

                const response = await fetch(engine.config.svgPath);
                const svgText = await response.text();
                container.innerHTML = svgText;

                const svg = container.querySelector('svg');
                if (!svg) return;

                // Anti-clipping y optimización viewBox
                svg.removeAttribute('width');
                svg.removeAttribute('height');
                svg.querySelectorAll('[clip-path]').forEach(el => el.removeAttribute('clip-path'));
                svg.querySelectorAll('clipPath').forEach(el => el.remove());
                svg.style.overflow = 'visible';

                // Indexar elementos interactivos
                engine.state.svgElementsMap.clear();
                const idPattern = /^(\d{2}-\d{2}-\d{2}|[Cc]-\d{1,2})$/;

                svg.querySelectorAll('path, polygon, rect, circle').forEach(el => {
                    const id = el.id;
                    if (id && idPattern.test(id)) {
                        engine.state.svgElementsMap.set(id, el);
                        el.classList.add('lote');

                        el.addEventListener('click', (e) => {
                            e.stopPropagation();
                            Engine.selectLot(id);
                        });

                        el.addEventListener('mouseenter', (e) => Engine.HUD.show(e, id));
                        el.addEventListener('mousemove', (e) => Engine.HUD.move(e));
                        el.addEventListener('mouseleave', () => Engine.HUD.hide());
                    }
                });

                this.render();
            },

            render() {
                const isLight = document.body.classList.contains('light-mode');
                const filteredIds = new Set(Engine.state.filtered.map(l => l.id));

                Engine.state.svgElementsMap.forEach((el, id) => {
                    const lote = Engine.state.lotesMap.get(id);

                    if (filteredIds.has(id) && lote) {
                        el.style.fill = Engine.getColor(lote);
                        el.style.opacity = '1';
                        el.style.stroke = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.4)';
                        el.style.strokeWidth = '0.5px';
                    } else {
                        // Atenuado para lotes filtrados o sin datos
                        el.style.fill = isLight ? '#e2e8f0' : '#1e293b';
                        el.style.opacity = isLight ? '0.45' : '0.25';
                        el.style.stroke = 'none';
                    }

                    if (Engine.state.selectedId === id) {
                        el.classList.add('highlighted');
                    } else {
                        el.classList.remove('highlighted');
                    }
                });
            }
        },

        /**
         * Asignación de Color por Capa Activa
         */
        getColor(lote) {
            if (!lote) return '#64748b';

            // 1. Capa por Estado de Obra
            if (this.state.activeLayer === 'status') {
                const est = (lote.estado || '').toLowerCase();
                if (est.includes('terminado') || est.includes('concluido')) return 'var(--vbc-status-terminado)';
                if (est.includes('construcc')) return 'var(--vbc-status-construccion)';
                if (est.includes('licita')) return 'var(--vbc-status-licitacion)';
                if (est.includes('adjudicado')) return 'var(--vbc-status-adjudicado)';
                if (est.includes('disponible')) return 'var(--vbc-status-disponible)';
                if (est.includes('paralizado')) return 'var(--vbc-status-paralizado)';
                return 'var(--vbc-status-no-iniciado)';
            }

            // 2. Capa por Tipo de Suelo (Default)
            const tipo = (lote.tipo || '').toLowerCase();
            if (tipo.includes('habitacional')) return 'var(--vbc-type-habitacional)';
            if (tipo.includes('comercial')) return 'var(--vbc-type-comercial)';
            if (tipo.includes('institucional')) return 'var(--vbc-type-institucional)';
            if (tipo.includes('verde')) return 'var(--vbc-type-area-verde)';
            if (tipo.includes('infraestructura')) return 'var(--vbc-type-infraestructura)';

            return 'var(--vbc-type-desconocido)';
        },

        selectLot(id) {
            this.state.selectedId = id;
            this.Map.render();
            const lote = this.state.lotesMap.get(id) || null;
            VBC.EventBus.emit('lot:selected', lote);
        },

        /**
         * HUD Tooltip Magnético Viewport-Bounded
         */
        HUD: {
            el: null,
            init(engine) {
                let tooltip = document.getElementById('vbcHudTooltip');
                if (!tooltip) {
                    tooltip = document.createElement('div');
                    tooltip.id = 'vbcHudTooltip';
                    tooltip.className = 'vbc-hud-tooltip';
                    document.body.appendChild(tooltip);
                }
                this.el = tooltip;
            },

            show(e, id) {
                if (!this.el) return;
                const lote = Engine.state.lotesMap.get(id);
                if (!lote) return;

                const estClass = (lote.estado || '').toLowerCase().replace(/\s+/g, '-');
                const areaFormat = (lote._parsedArea || 0).toLocaleString('es-DO');

                this.el.innerHTML = `
                    <div class="vbc-hud-header">
                        <span class="vbc-hud-id">${lote.id}</span>
                        <span class="vbc-badge ${estClass}">${lote.estado || 'Sin Estado'}</span>
                    </div>
                    <div class="vbc-hud-title">${lote.nombre || lote.subtipo || lote.tipo}</div>
                    <div class="vbc-hud-row"><span>Superficie:</span> <strong>${areaFormat} m²</strong></div>
                    ${lote.desarrollador ? `<div class="vbc-hud-row"><span>Desarrollador:</span> <strong>${lote.desarrollador}</strong></div>` : ''}
                    ${lote.unidades && lote.unidades !== '0' ? `<div class="vbc-hud-row"><span>Unidades:</span> <strong>${lote.unidades}</strong></div>` : ''}
                `;

                this.el.style.display = 'block';
                this.move(e);
            },

            move(e) {
                if (!this.el || this.el.style.display === 'none') return;
                const rect = this.el.getBoundingClientRect();
                let x = e.clientX + 16;
                let y = e.clientY + 16;

                if (x + rect.width > window.innerWidth - 12) {
                    x = e.clientX - rect.width - 16;
                }
                if (y + rect.height > window.innerHeight - 12) {
                    y = e.clientY - rect.height - 16;
                }

                this.el.style.left = `${x}px`;
                this.el.style.top = `${y}px`;
            },

            hide() {
                if (this.el) this.el.style.display = 'none';
            }
        }
    };

    window.VBC.Engine = Engine;

})(window);

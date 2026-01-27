/* ==================================================
   CIUDAD JUAN BOSCH - ELITE FEATURES EXTENSIONS
   Data Intelligence, Engineering Tools, BI Dashboard
   ================================================== */

// ============================================
// BLOQUE 2: CONSTANTES DE DATOS (Hardcoded from PDFs)
// ============================================

const AVAILABLE_LOTS = {
    comerciales: [
        '01-01-06', '01-01-08', '01-01-10', '01-03-03', '01-03-04',
        '02-05-03', '02-06-07', '02-06-08', '02-06-09',
        '03-08-04', '03-08-05', '03-09-09',
        '04-11-04', '04-11-06', '04-12-01', '04-39-02', '04-40-02',
        '05-18-05', '05-18-07', '05-19-05', '05-19-06',
        '06-25-03', '07-30-03', '07-30-04', '07-30-05', '07-35-02', '07-35-03',
        '08-22-02', '09-28-03', '09-32-02', '09-32-04', '09-32-05',
        '00-10-02', '00-10-04', '00-14-02', '00-14-04', '00-14-05', '00-14-07',
        '00-33-01', '00-33-03', '00-34-04', '00-34-05', '10-36-01'
    ],
    institucionales: [
        '01-01-02', '01-01-03', '02-05-02', '02-05-04', '02-06-05', '02-06-06',
        '04-11-01', '04-11-02', '04-11-03', '04-11-05', '04-12-02',
        '05-18-06', '06-25-04', '07-31-06', '07-35-06', '08-22-03', '08-23-03',
        '09-28-04', '09-32-07', '00-10-01', '00-14-06', '00-21-02'
    ]
};

const HISTORICAL_METAS = {
    2015: { terminadas: 280, habitadas: 0 },
    2016: { terminadas: 1364, habitadas: 0 },
    2017: { terminadas: 2448, habitadas: 0 },
    2018: { terminadas: 4000, habitadas: 0 },
    2019: { terminadas: 5912, habitadas: 0 },
    2020: { terminadas: 7416, habitadas: 4600 },
    2021: { terminadas: 9236, habitadas: 0 },
    2022: { terminadas: 9764, habitadas: 0 },
    2024: { terminadas: 12268, habitadas: 0 },
    2025: { terminadas: 14300, habitadas: 14000 }
};

const YEARLY_DELIVERIES = {
    2021: { nuevas: 1336, label: '2021' },
    2022: { nuevas: 1120, label: '2022' },
    2023: { nuevas: 2440, label: '2023' },
    2024: { nuevas: 632, label: '2024' },
    2025: { nuevas: 4072, label: '2025' },
    2026: { nuevas: 3500, label: '2026*' }
};

const TYPE_COLORS = {
    'Habitacional': '#00a8ff',
    'Comercial': '#f59e0b',
    'Institucional': '#a855f7',
    'Infraestructura': '#6b7280',
    'Equipamiento': '#10b981'
};

// ============================================
// BLOQUE 3: EXTENSIONES JS
// ============================================

// ------------------------------------
// DATA FUSION EXTENSIONS
// ------------------------------------
App.Data.loadStats = async function () {
    try {
        const text = await this.fetchCSV('data/datos_estadisticas.csv');
        const rows = this.parseCSV(text);

        this.statsData = {};
        rows.forEach(row => {
            const year = parseInt(row['Año']);
            if (!this.statsData[year]) this.statsData[year] = {};

            const cat = row['Categoría'];
            const subcat = row['Subcategoría'];
            const cantidad = parseInt(row['Cantidad']) || 0;

            if (!this.statsData[year][cat]) this.statsData[year][cat] = {};
            this.statsData[year][cat][subcat] = cantidad;
        });

        console.log('✅ Datos estadísticos cargados:', Object.keys(this.statsData).length, 'años');
        return this.statsData;
    } catch (e) {
        console.warn('⚠️ No se pudo cargar datos_estadisticas.csv, usando constantes:', e);
        this.statsData = HISTORICAL_METAS;
        return this.statsData;
    }
};

// ------------------------------------
// UI EXTENSIONS - TOAST
// ------------------------------------
App.UI.showToast = function (message, type = 'info') {
    let toast = document.getElementById('elite-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'elite-toast';
        toast.className = 'elite-info-toast';
        toast.style.display = 'none';
        document.body.appendChild(toast);
    }

    const icon = type === 'error' ? '❌' : (type === 'success' ? '✅' : 'ℹ️');

    toast.innerHTML = `
        <div class="elite-info-toast-header">
            <span class="elite-info-toast-title">${icon} Notificación</span>
            <button class="elite-info-toast-close" onclick="this.parentElement.parentElement.style.display='none'">✕</button>
        </div>
        <div class="elite-info-toast-body">${message}</div>
    `;

    toast.style.display = 'block';
    toast.style.animation = 'toastSlide 0.3s ease';

    setTimeout(() => {
        if (toast.style.display === 'block') {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.style.display = 'none';
                toast.style.opacity = '1';
            }, 300);
        }
    }, 4000);
};

App.Map.toggleOpportunityLayer = function () {
    // If turning ON, check logic
    if (!this.opportunityLayerActive) {
        // Respect filters
        const filteredIds = new Set(
            (App.State.filtered || App.State.getAll()).map(l => l.id)
        );

        const visibleAvailable = [
            ...AVAILABLE_LOTS.comerciales,
            ...AVAILABLE_LOTS.institucionales
        ].filter(id => filteredIds.has(id));

        if (visibleAvailable.length === 0) {
            App.UI.showToast('No hay oportunidades disponibles con los filtros actuales.', 'error');
            return;
        }

        console.log(`🔶 Activando Capa de Oportunidad para ${visibleAvailable.length} lotes visibles`);
    }

    this.opportunityLayerActive = !this.opportunityLayerActive;
    document.body.classList.toggle('opportunity-mode', this.opportunityLayerActive);

    const btn = document.getElementById('btnOpportunity');
    if (btn) btn.classList.toggle('active', this.opportunityLayerActive);

    const filteredIds = new Set(
        (App.State.filtered || App.State.getAll()).map(l => l.id)
    );

    const allAvailable = new Set([
        ...AVAILABLE_LOTS.comerciales,
        ...AVAILABLE_LOTS.institucionales
    ]);

    App.State.svgElementsMap.forEach((el, id) => {
        if (this.opportunityLayerActive) {
            if (allAvailable.has(id) && filteredIds.has(id)) {
                el.classList.add('gold-pulse');
            } else {
                el.classList.remove('gold-pulse');
            }
        } else {
            el.classList.remove('gold-pulse');
        }
    });

    console.log(`🔶 Capa de Oportunidad: ${this.opportunityLayerActive ? 'ACTIVA' : 'DESACTIVADA'}`);
};

// ------------------------------------
// MAP EXTENSIONS - DENSITY HEATMAP
// ------------------------------------
App.Map.heatmapActive = false;
App.Map.originalFills = new Map();

App.Map.renderDensityHeatmap = function () {
    this.heatmapActive = !this.heatmapActive;
    document.body.classList.toggle('heatmap-mode', this.heatmapActive);

    const btn = document.getElementById('btnHeatmap');
    if (btn) btn.classList.toggle('active', this.heatmapActive);

    if (!this.heatmapActive) {
        // Restore original rendering
        this.render();
        console.log('🌡️ Heatmap: DESACTIVADO');
        return;
    }

    // ✅ FIX: Respect active filters
    const filteredIds = new Set(
        (App.State.filtered || App.State.getAll()).map(l => l.id)
    );

    // Calculate max values ONLY from filtered habitacionales
    const habitacionales = App.State.getAll().filter(l =>
        l.tipo === 'Habitacional' && filteredIds.has(l.id)
    );
    const maxUnidades = Math.max(1, ...habitacionales.map(l =>
        parseInt(l['Unidades terminadas']) || parseInt(l.unidades) || 0
    ));

    // Apply heatmap colors
    App.State.svgElementsMap.forEach((el, id) => {
        const lote = App.State.lotesMap.get(id);

        // ✅ FIX: Dim non-filtered lots completely
        if (!filteredIds.has(id)) {
            el.style.opacity = '0.08';
            el.style.fill = '#1f2937';
            el.style.filter = 'grayscale(100%)';
            return;
        }

        if (!lote || lote.tipo !== 'Habitacional') {
            el.style.opacity = '0.2';
            el.style.fill = '#374151';
            el.style.filter = '';
            return;
        }

        const unidades = parseInt(lote['Unidades terminadas']) || parseInt(lote.unidades) || 0;
        const intensity = maxUnidades > 0 ? unidades / maxUnidades : 0;

        // HSL gradient: Blue (cold) -> Red (hot)
        const hue = Math.round(240 - (intensity * 240)); // 240=blue, 0=red
        const saturation = 70 + (intensity * 20);
        const lightness = 45 + (intensity * 10);

        el.style.fill = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        el.style.opacity = 0.5 + (intensity * 0.5);
        el.style.filter = '';
    });

    console.log(`🌡️ Heatmap: ACTIVO (${habitacionales.length} lotes, Max: ${maxUnidades})`);
};

// ------------------------------------
// MAP EXTENSIONS - SMART ZOOM
// ------------------------------------
App.Map.zoomToLot = function (id) {
    const el = App.State.svgElementsMap.get(id);
    if (!el) {
        console.warn('Lote no encontrado en SVG:', id);
        return;
    }

    const container = document.getElementById('mapContainer');
    const svg = container.querySelector('svg');
    if (!svg) return;

    // Get lot bounding box
    const bbox = el.getBBox();
    const centerX = bbox.x + bbox.width / 2;
    const centerY = bbox.y + bbox.height / 2;

    // Get SVG viewBox for proper scaling
    const viewBox = svg.viewBox.baseVal;
    const svgWidth = viewBox.width || svg.getBoundingClientRect().width;
    const svgHeight = viewBox.height || svg.getBoundingClientRect().height;

    // Container dimensions
    const containerRect = container.getBoundingClientRect();

    // Calculate scale (zoom to fit lot with padding)
    const targetScale = 3; // Zoom level

    // Calculate translation to center the lot
    const scaleRatio = containerRect.width / svgWidth;
    const offsetX = (containerRect.width / 2) - (centerX * scaleRatio * targetScale);
    const offsetY = (containerRect.height / 2) - (centerY * scaleRatio * targetScale);

    // Apply smooth transition
    svg.classList.add('zooming');

    this.transform.scale = targetScale;
    this.transform.x = offsetX;
    this.transform.y = offsetY;

    svg.style.transform = `translate(${this.transform.x}px, ${this.transform.y}px) scale(${this.transform.scale})`;
    svg.style.transformOrigin = '0 0';

    // Update zoom display
    const zoomEl = document.getElementById('zoomLevel');
    if (zoomEl) zoomEl.value = Math.round(targetScale * 100) + '%';

    // Remove transition class after animation
    setTimeout(() => {
        svg.classList.remove('zooming');
    }, 600);

    // Select the lot
    App.UI.selectLot(id);

    console.log(`🎯 Zoom to: ${id} (center: ${centerX.toFixed(0)}, ${centerY.toFixed(0)})`);
};

// ------------------------------------
// MAP EXTENSIONS - ADJACENCY
// ------------------------------------
App.Map.highlightedNeighbors = [];
App.Map.neighborsActive = false;

App.Map.highlightNeighbors = function (id) {
    // Clear previous highlights
    this.clearNeighborHighlights();

    if (!id) return [];

    // Parse ID: cuadrante-manzana-lote
    const parts = id.split('-');
    if (parts.length !== 3) return [];

    const [cuad, manz, lote] = parts.map(p => parseInt(p));
    const neighbors = [];

    // Same manzana, adjacent lotes (±1, ±2)
    for (let offset = -2; offset <= 2; offset++) {
        if (offset === 0) continue;
        const adjLote = lote + offset;
        if (adjLote < 1) continue;

        const adjId = `${String(cuad).padStart(2, '0')}-${String(manz).padStart(2, '0')}-${String(adjLote).padStart(2, '0')}`;
        if (App.State.lotesMap.has(adjId) && adjId !== id) {
            neighbors.push(adjId);
        }
    }

    // Adjacent manzanas (same cuadrante, ±1 manzana)
    for (let manzOffset = -1; manzOffset <= 1; manzOffset += 2) {
        const adjManz = manz + manzOffset;
        if (adjManz < 1) continue;

        // Check lotes 1-5 in adjacent manzana
        for (let l = 1; l <= 5; l++) {
            const adjId = `${String(cuad).padStart(2, '0')}-${String(adjManz).padStart(2, '0')}-${String(l).padStart(2, '0')}`;
            if (App.State.lotesMap.has(adjId)) {
                neighbors.push(adjId);
            }
        }
    }

    // Apply highlight class
    neighbors.forEach(nId => {
        const el = App.State.svgElementsMap.get(nId);
        if (el) {
            el.classList.add('adjacent-highlight');
            this.highlightedNeighbors.push(nId);
        }
    });

    console.log(`🏘️ Vecinos de ${id}:`, neighbors.length, 'encontrados');
    return neighbors;
};

App.Map.clearNeighborHighlights = function () {
    this.highlightedNeighbors.forEach(id => {
        const el = App.State.svgElementsMap.get(id);
        if (el) el.classList.remove('adjacent-highlight');
    });
    this.highlightedNeighbors = [];
};

// ------------------------------------
// SMART TOOLTIP
// ------------------------------------
App.Map.showSmartTooltip = function (e, id) {
    const lote = App.State.lotesMap.get(id);
    const tooltip = document.getElementById('mapTooltip');
    if (!lote || !tooltip) return;

    tooltip.classList.add('smart');

    const statusClass = this.getStatusClass(lote.estado);
    const unidades = lote['Unidades terminadas'] || lote.unidades;

    tooltip.innerHTML = `
        <div class="tooltip-header">
            <span class="tooltip-id">${id}</span>
            <span class="tooltip-status ${statusClass}">${lote.estado || 'N/A'}</span>
        </div>
        <div class="tooltip-name">${lote.nombre || lote.tipo}</div>
        <div class="tooltip-metrics">
            <span>📐 ${(lote._parsedArea || 0).toLocaleString('es-DO')} m²</span>
            ${unidades ? `<span>🏠 ${unidades} uds</span>` : ''}
        </div>
        ${lote.desarrollador ? `<div class="tooltip-dev">🏗️ ${lote.desarrollador}</div>` : ''}
    `;

    tooltip.style.display = 'block';
    this.updateTooltipPosition(e);
};

App.Map.getStatusClass = function (estado) {
    if (!estado) return '';
    const s = estado.toLowerCase();
    if (s.includes('terminado') || s.includes('concluido')) return 'terminado';
    if (s.includes('construcc')) return 'construccion';
    if (s.includes('disponible')) return 'disponible';
    if (s.includes('paralizado')) return 'paralizado';
    if (s.includes('adjudicado')) return 'adjudicado';
    return '';
};

App.Map.updateTooltipPosition = function (e) {
    const tooltip = document.getElementById('mapTooltip');
    if (!tooltip || tooltip.style.display === 'none') return;

    const rect = tooltip.getBoundingClientRect();
    let x = e.pageX + 15;
    let y = e.pageY + 15;

    // Keep within viewport
    if (x + rect.width > window.innerWidth - 10) {
        x = e.pageX - rect.width - 15;
    }
    if (y + rect.height > window.innerHeight - 10) {
        y = e.pageY - rect.height - 15;
    }

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
};

// Override original tooltip function
App.Map._originalShowTooltip = App.Map.showTooltip;
App.Map.showTooltip = function (e, id) {
    this.showSmartTooltip(e, id);
};

// Add mousemove tracking for tooltip with touch support
App.Map.setupSmartTooltip = function () {
    const container = document.getElementById('mapContainer');
    const tooltip = document.getElementById('mapTooltip');
    if (!container || !tooltip) return;

    // ✅ FIX: Detect touch device
    const isTouchDevice = ('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0);

    if (isTouchDevice) {
        // TOUCH MODE: Show on tap, auto-hide after 3s
        let touchTimeout = null;

        container.addEventListener('touchstart', (e) => {
            const target = e.target.closest('.lote');
            if (target && target.id) {
                const touch = e.touches[0];
                this.showSmartTooltip({ pageX: touch.pageX, pageY: touch.pageY }, target.id);

                // Clear previous timeout
                if (touchTimeout) clearTimeout(touchTimeout);

                // Auto-hide after 3 seconds
                touchTimeout = setTimeout(() => {
                    tooltip.style.display = 'none';
                }, 3000);
            } else {
                tooltip.style.display = 'none';
                if (touchTimeout) clearTimeout(touchTimeout);
            }
        }, { passive: true });

        console.log('📱 Tooltip: Touch mode enabled');
    } else {
        // MOUSE MODE: Throttled tracking
        let lastUpdate = 0;
        const THROTTLE_MS = 33; // ~30fps

        container.addEventListener('mousemove', (e) => {
            const now = Date.now();
            if (now - lastUpdate < THROTTLE_MS) return;
            lastUpdate = now;
            this.updateTooltipPosition(e);
        }, { passive: true });

        container.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });

        console.log('🖱️ Tooltip: Mouse mode enabled (throttled)');
    }
};

// ------------------------------------
// BI DASHBOARD
// ------------------------------------
App.UI.biPanelExpanded = false;

App.UI.renderBIDashboard = function () {
    // Create BI Modal if not exists
    if (!document.getElementById('biModalOverlay')) {
        this.createBIPanel();
    }
};

App.UI.createBIPanel = function () {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.id = 'biModalOverlay';
    overlay.className = 'bi-modal-overlay';

    overlay.innerHTML = `
        <div class="bi-modal">
            <div class="bi-modal-header">
                <div class="bi-modal-title">
                    <span>📊</span>
                    Dashboard Ejecutivo
                </div>
                <div class="bi-modal-actions">
                    <button class="bi-filter-reset" id="biResetFilters" title="Limpiar filtros del dashboard">🔄 Reset</button>
                    <button class="bi-modal-close" id="biModalClose">✕</button>
                </div>
            </div>
            <div class="bi-modal-content">
                <!-- KPI Row -->
                <div class="bi-kpi-row" id="biKpiRow">
                    <div class="bi-kpi-card">
                        <div class="bi-kpi-icon">🏠</div>
                        <div class="bi-kpi-info">
                            <div class="bi-kpi-value" id="biKpiTotalLotes">0</div>
                            <div class="bi-kpi-label">Total Lotes</div>
                        </div>
                    </div>
                    <div class="bi-kpi-card">
                        <div class="bi-kpi-icon">📐</div>
                        <div class="bi-kpi-info">
                            <div class="bi-kpi-value" id="biKpiTotalArea">0</div>
                            <div class="bi-kpi-label">Área Total (ha)</div>
                        </div>
                    </div>
                    <div class="bi-kpi-card">
                        <div class="bi-kpi-icon">🏢</div>
                        <div class="bi-kpi-info">
                            <div class="bi-kpi-value" id="biKpiTotalUnits">0</div>
                            <div class="bi-kpi-label">Unidades</div>
                        </div>
                    </div>
                    <div class="bi-kpi-card">
                        <div class="bi-kpi-icon">🚧</div>
                        <div class="bi-kpi-info">
                            <div class="bi-kpi-value" id="biKpiEnEjecucion">0</div>
                            <div class="bi-kpi-label">En Ejecución</div>
                        </div>
                    </div>
                </div>
                
                <!-- Delivery Chart -->
                <div class="bi-chart-container">
                    <h4 class="bi-chart-title">📈 Entregas de Viviendas por Año</h4>
                    <p class="bar-chart-subtitle">Unidades habitacionales terminadas anualmente</p>
                    <div class="bar-chart" id="deliveryChart"></div>
                </div>
                
                <!-- Donut Charts Row -->
                <div class="bi-charts-row">
                    <div class="bi-chart-container bi-chart-half">
                        <h4 class="bi-chart-title">🍩 Distribución por Lotes</h4>
                        <div class="donut-container">
                            <div class="donut-chart" id="usageDonut">
                                <div class="donut-center">
                                    <div class="donut-total" id="donutTotal">0</div>
                                    <div class="donut-label">lotes</div>
                                </div>
                            </div>
                            <div class="donut-legend" id="donutLegend"></div>
                        </div>
                    </div>
                    <div class="bi-chart-container bi-chart-half">
                        <h4 class="bi-chart-title">📐 Distribución por Área (m²)</h4>
                        <div class="donut-container">
                            <div class="donut-chart" id="areaDonut">
                                <div class="donut-center">
                                    <div class="donut-total" id="areaDonutTotal">0</div>
                                    <div class="donut-label">m²</div>
                                </div>
                            </div>
                            <div class="donut-legend" id="areaDonutLegend"></div>
                        </div>
                    </div>
                </div>
                
                <!-- Estado and Desarrolladores Row -->
                <div class="bi-charts-row">
                    <div class="bi-chart-container bi-chart-half">
                        <h4 class="bi-chart-title">🔄 Estado de Proyectos</h4>
                        <div class="horizontal-bar-chart" id="estadoChart"></div>
                    </div>
                    <div class="bi-chart-container bi-chart-half">
                        <h4 class="bi-chart-title">🏗️ Top 5 Desarrolladores</h4>
                        <div class="horizontal-bar-chart" id="desarrolladorChart"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Close on X button
    document.getElementById('biModalClose').addEventListener('click', () => {
        this.closeBIModal();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            this.closeBIModal();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            this.closeBIModal();
        }
    });
};

App.UI.openBIModal = function () {
    const overlay = document.getElementById('biModalOverlay');
    if (overlay) {
        overlay.classList.add('active');
        this.renderBIKpis();
        this.renderDeliveryChart();
        this.renderUsageDonut();
        this.renderAreaDonut();
        this.renderEstadoChart();
        this.renderDesarrolladorChart();
        this.bindBIInteractivity();
    }
};

App.UI.closeBIModal = function () {
    const overlay = document.getElementById('biModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
};

// ------------------------------------
// BI DASHBOARD RENDERING FUNCTIONS
// ------------------------------------

// Estado colors
const ESTADO_COLORS = {
    'Terminado': '#10b981',
    'En construcción': '#f59e0b',
    'Disponible': '#3b82f6',
    'Paralizado': '#ef4444',
    'Adjudicado': '#a855f7',
    'No Iniciado': '#64748b'
};

App.UI.renderBIKpis = function () {
    const lotes = App.State.filtered || App.State.getAll();

    // Total Lotes
    const totalLotes = lotes.length;
    document.getElementById('biKpiTotalLotes').textContent = totalLotes.toLocaleString('es-DO');

    // Total Area (en hectáreas)
    let totalArea = 0;
    lotes.forEach(l => totalArea += (l._parsedArea || 0));
    const areaHa = (totalArea / 10000).toFixed(1);
    document.getElementById('biKpiTotalArea').textContent = areaHa;

    // Total Unidades
    let totalUnits = 0;
    lotes.forEach(l => {
        const u = typeof l.unidades === 'string' ? parseInt(l.unidades.replace(/,/g, '')) : l.unidades;
        totalUnits += (u || 0);
    });
    document.getElementById('biKpiTotalUnits').textContent = totalUnits.toLocaleString('es-DO');

    // En Ejecución
    const enEjecucion = lotes.filter(l =>
        l.estado?.toLowerCase().includes('construcción') ||
        l.estado?.toLowerCase().includes('ejecución')
    ).length;
    document.getElementById('biKpiEnEjecucion').textContent = enEjecucion.toLocaleString('es-DO');
};

App.UI.renderEstadoChart = function () {
    const container = document.getElementById('estadoChart');
    if (!container) return;

    const lotes = App.State.filtered || App.State.getAll();

    // Count by estado
    const estados = {};
    lotes.forEach(l => {
        const estado = l.estado || 'Sin estado';
        estados[estado] = (estados[estado] || 0) + 1;
    });

    // Sort by count and render horizontal bars
    const sorted = Object.entries(estados).sort((a, b) => b[1] - a[1]);
    const maxCount = Math.max(...sorted.map(s => s[1]));

    container.innerHTML = sorted.slice(0, 6).map(([estado, count]) => {
        const width = (count / maxCount) * 100;
        const color = ESTADO_COLORS[estado] || '#64748b';
        const percent = Math.round((count / lotes.length) * 100);

        return `
            <div class="h-bar-item" data-filter-estado="${estado}">
                <div class="h-bar-label">${estado}</div>
                <div class="h-bar-track">
                    <div class="h-bar-fill" style="width: ${width}%; background: ${color}"></div>
                </div>
                <div class="h-bar-value">${count} <span class="h-bar-percent">(${percent}%)</span></div>
            </div>
        `;
    }).join('');
};

App.UI.renderDesarrolladorChart = function () {
    const container = document.getElementById('desarrolladorChart');
    if (!container) return;

    const lotes = App.State.filtered || App.State.getAll();

    // Count by desarrollador
    const desarrolladores = {};
    lotes.forEach(l => {
        const dev = l.desarrollador || 'Sin desarrollador';
        desarrolladores[dev] = (desarrolladores[dev] || 0) + 1;
    });

    // Sort by count and get top 5
    const sorted = Object.entries(desarrolladores).sort((a, b) => b[1] - a[1]);
    const maxCount = Math.max(...sorted.map(s => s[1]));

    container.innerHTML = sorted.slice(0, 5).map(([dev, count]) => {
        const width = (count / maxCount) * 100;
        const percent = Math.round((count / lotes.length) * 100);

        return `
            <div class="h-bar-item" data-filter-dev="${dev}">
                <div class="h-bar-label" title="${dev}">${dev.length > 20 ? dev.substring(0, 20) + '...' : dev}</div>
                <div class="h-bar-track">
                    <div class="h-bar-fill" style="width: ${width}%; background: var(--primary)"></div>
                </div>
                <div class="h-bar-value">${count} <span class="h-bar-percent">(${percent}%)</span></div>
            </div>
        `;
    }).join('');
};

App.UI.bindBIInteractivity = function () {
    // Bind reset button
    document.getElementById('biResetFilters')?.addEventListener('click', () => {
        App.Filter.reset();
        this.openBIModal(); // Refresh charts
    });

    // Bind legend items for cross-filtering (donut charts)
    document.querySelectorAll('.legend-item[data-filter-type]').forEach(item => {
        item.addEventListener('click', () => {
            const tipo = item.dataset.filterType;
            // Deactivate all type filters first
            document.querySelectorAll('.filter-btn[data-tipo]').forEach(b => b.classList.remove('active'));
            // Activate the clicked type
            const btn = document.querySelector(`.filter-btn[data-tipo="${tipo}"]`);
            if (btn) {
                btn.classList.add('active');
                App.Filter.apply();
                this.openBIModal(); // Refresh charts with new filter
            }
        });
    });

    // Bind estado bars for cross-filtering
    document.querySelectorAll('.h-bar-item[data-filter-estado]').forEach(item => {
        item.addEventListener('click', () => {
            const estado = item.dataset.filterEstado;
            const select = document.getElementById('filterEstado');
            if (select) {
                select.value = estado;
                App.Filter.apply();
                this.openBIModal(); // Refresh charts
            }
        });
    });

    // Bind desarrollador bars for cross-filtering
    document.querySelectorAll('.h-bar-item[data-filter-dev]').forEach(item => {
        item.addEventListener('click', () => {
            const dev = item.dataset.filterDev;
            const select = document.getElementById('filterDesarrollador');
            if (select) {
                select.value = dev;
                App.Filter.apply();
                this.openBIModal(); // Refresh charts
            }
        });
    });
};

// ------------------------------------
// INFO TOAST (Explanatory tooltips for elite buttons)
// ------------------------------------
App.UI.infoToastTimeout = null;

App.UI.showInfoToast = function (icon, title, message) {
    this.hideInfoToast(); // Remove existing

    const toast = document.createElement('div');
    toast.id = 'eliteInfoToast';
    toast.className = 'elite-info-toast';

    toast.innerHTML = `
        <div class="elite-info-toast-header">
            <span class="elite-info-toast-title">${icon} ${title}</span>
            <button class="elite-info-toast-close" onclick="App.UI.hideInfoToast()">✕</button>
        </div>
        <div class="elite-info-toast-body">${message}</div>
    `;

    document.body.appendChild(toast);

    // Auto-hide after 6 seconds
    this.infoToastTimeout = setTimeout(() => {
        this.hideInfoToast();
    }, 6000);
};

App.UI.hideInfoToast = function () {
    const toast = document.getElementById('eliteInfoToast');
    if (toast) {
        toast.remove();
    }
    if (this.infoToastTimeout) {
        clearTimeout(this.infoToastTimeout);
        this.infoToastTimeout = null;
    }
};

App.UI.renderDeliveryChart = function () {
    const container = document.getElementById('deliveryChart');
    if (!container) return;

    const lotes = App.State.filtered || App.State.getAll();

    // Calculate units by year from actual lot data
    const yearlyData = {};

    // Filter only habitacional lots with valid year
    lotes.filter(l => l.tipo === 'Habitacional' && l._parsedYear).forEach(l => {
        const year = l._parsedYear;
        const units = typeof l.unidades === 'string'
            ? parseInt(l.unidades.replace(/,/g, '')) || 0
            : (l.unidades || 0);

        if (!yearlyData[year]) {
            yearlyData[year] = { units: 0, count: 0 };
        }
        yearlyData[year].units += units;
        yearlyData[year].count++;
    });

    // Sort by year and get entries
    const sortedYears = Object.keys(yearlyData).sort((a, b) => parseInt(a) - parseInt(b));

    if (sortedYears.length === 0) {
        container.innerHTML = '<div class="no-data">Sin datos de entregas</div>';
        return;
    }

    const maxVal = Math.max(...sortedYears.map(y => yearlyData[y].units));
    const minVal = Math.min(...sortedYears.map(y => yearlyData[y].units));

    container.innerHTML = sortedYears.map(year => {
        const data = yearlyData[year];
        const height = maxVal > 0 ? Math.max(15, (data.units / maxVal) * 100) : 15;
        const isMax = data.units === maxVal;
        const isMin = data.units === minVal;
        const barColor = isMax ? 'linear-gradient(to top, #10b981, #34d399)' :
            isMin ? 'linear-gradient(to top, #ef4444, #f87171)' :
                'linear-gradient(to top, var(--primary), #60a5fa)';

        return `
            <div class="bar-item" data-filter-year="${year}" title="${data.count} proyectos">
                <div class="bar" style="height: ${height}%; background: ${barColor}">
                    <span class="bar-value">${data.units.toLocaleString('es-DO')}</span>
                </div>
                <span class="bar-label">${year}</span>
            </div>
        `;
    }).join('');
};

App.UI.renderUsageDonut = function () {
    const donut = document.getElementById('usageDonut');
    const legend = document.getElementById('donutLegend');
    const totalEl = document.getElementById('donutTotal');
    if (!donut || !legend) return;

    // Count by type
    const types = {};
    let total = 0;
    App.State.getAll().forEach(l => {
        const tipo = l.tipo || 'Otro';
        types[tipo] = (types[tipo] || 0) + 1;
        total++;
    });

    // Generate conic gradient
    let currentAngle = 0;
    const segments = [];
    const legendItems = [];

    Object.entries(types).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
        const angle = (count / total) * 360;
        const color = TYPE_COLORS[type] || '#64748b';
        segments.push(`${color} ${currentAngle}deg ${currentAngle + angle}deg`);

        legendItems.push(`
            <div class="legend-item">
                <span class="legend-dot" style="background: ${color}"></span>
                <span class="legend-label">${type}</span>
                <span class="legend-value">${count}</span>
            </div>
        `);

        currentAngle += angle;
    });

    donut.style.background = `conic-gradient(${segments.join(', ')})`;
    legend.innerHTML = legendItems.join('');
    if (totalEl) totalEl.textContent = total;
};

App.UI.renderAreaDonut = function () {
    const donut = document.getElementById('areaDonut');
    const legend = document.getElementById('areaDonutLegend');
    const totalEl = document.getElementById('areaDonutTotal');
    if (!donut || !legend) return;

    // Sum area by type
    const types = {};
    let totalArea = 0;
    App.State.getAll().forEach(l => {
        const tipo = l.tipo || 'Otro';
        const area = l._parsedArea || 0;
        types[tipo] = (types[tipo] || 0) + area;
        totalArea += area;
    });

    // Generate conic gradient
    let currentAngle = 0;
    const segments = [];
    const legendItems = [];

    Object.entries(types).sort((a, b) => b[1] - a[1]).forEach(([type, area]) => {
        const angle = totalArea > 0 ? (area / totalArea) * 360 : 0;
        const color = TYPE_COLORS[type] || '#64748b';
        segments.push(`${color} ${currentAngle}deg ${currentAngle + angle}deg`);

        // Format area for legend (convert to hectares if large)
        const areaFormatted = area >= 10000
            ? (area / 10000).toFixed(1) + ' ha'
            : Math.round(area).toLocaleString('es-DO') + ' m²';

        // Calculate percentage
        const percent = totalArea > 0 ? Math.round((area / totalArea) * 100) : 0;

        legendItems.push(`
            <div class="legend-item" data-filter-type="${type}" style="cursor: pointer;">
                <span class="legend-dot" style="background: ${color}"></span>
                <span class="legend-label">${type}</span>
                <span class="legend-value">${areaFormatted} <span class="legend-percent">(${percent}%)</span></span>
            </div>
        `);

        currentAngle += angle;
    });

    donut.style.background = `conic-gradient(${segments.join(', ')})`;
    legend.innerHTML = legendItems.join('');

    // Format total area
    if (totalEl) {
        if (totalArea >= 1000000) {
            totalEl.textContent = (totalArea / 1000000).toFixed(1) + 'M';
        } else if (totalArea >= 1000) {
            totalEl.textContent = (totalArea / 1000).toFixed(0) + 'K';
        } else {
            totalEl.textContent = Math.round(totalArea).toLocaleString('es-DO');
        }
    }
};

App.UI.renderAlerts = function () {
    const container = document.getElementById('alertsContainer');
    if (!container) return;

    const alerts = this.getAlerts();

    if (alerts.length === 0) {
        container.innerHTML = '<div class="alert-item"><span class="alert-icon">✅</span><div class="alert-content"><div class="alert-title">Sin alertas</div><div class="alert-desc">Todos los proyectos en curso normal</div></div></div>';
        return;
    }

    container.innerHTML = alerts.slice(0, 10).map(alert => `
        <div class="alert-item ${alert.type}" data-lot="${alert.loteId}">
            <span class="alert-icon">${alert.icon}</span>
            <div class="alert-content">
                <div class="alert-title">${alert.loteId}</div>
                <div class="alert-desc">${alert.message}</div>
            </div>
        </div>
    `).join('');

    // Add click handlers
    container.querySelectorAll('.alert-item[data-lot]').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.dataset.lot;
            App.Map.zoomToLot(id);
        });
    });
};

App.UI.getAlerts = function () {
    const alerts = [];
    const today = new Date();

    App.State.getAll().forEach(lote => {
        // Critical: Paralizado
        if (lote.estado?.toLowerCase().includes('paralizado')) {
            alerts.push({
                type: 'critical',
                icon: '🚨',
                message: lote.nombre || 'Proyecto paralizado',
                loteId: lote.id
            });
        }

        // Warning: Fecha vencida y no terminado
        if (lote['Fecha entrega'] &&
            !lote.estado?.toLowerCase().includes('terminado') &&
            !lote.estado?.toLowerCase().includes('concluido')) {

            const parts = lote['Fecha entrega'].split('/');
            if (parts.length === 3) {
                const entrega = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
                if (entrega < today) {
                    alerts.push({
                        type: 'warning',
                        icon: '⚠️',
                        message: `Vencido: ${lote['Fecha entrega']}`,
                        loteId: lote.id
                    });
                }
            }
        }
    });

    return alerts.sort((a, b) => {
        if (a.type === 'critical' && b.type !== 'critical') return -1;
        if (a.type !== 'critical' && b.type === 'critical') return 1;
        return 0;
    });
};

// ------------------------------------
// ALERTS MODAL (Separated from BI Dashboard)
// ------------------------------------
App.UI.createAlertsModal = function () {
    if (document.getElementById('alertsModalOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'alertsModalOverlay';
    overlay.className = 'bi-modal-overlay';

    overlay.innerHTML = `
        <div class="bi-modal alerts-modal">
            <div class="bi-modal-header">
                <div class="bi-modal-title">
                    <span>⚠️</span>
                    Alertas del Proyecto
                </div>
                <button class="bi-modal-close" id="alertsModalClose">✕</button>
            </div>
            <div class="bi-modal-content">
                <div class="bi-chart-container">
                    <div class="alerts-summary" id="alertsSummary"></div>
                    <div class="alerts-container" id="alertsModalContainer"></div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Close on X button
    document.getElementById('alertsModalClose').addEventListener('click', () => {
        this.closeAlertsModal();
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            this.closeAlertsModal();
        }
    });

    // Close on Escape key  
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            this.closeAlertsModal();
        }
    });
};

App.UI.openAlertsModal = function () {
    const overlay = document.getElementById('alertsModalOverlay');
    if (!overlay) return;

    overlay.classList.add('active');

    const alerts = this.getAlerts();
    const container = document.getElementById('alertsModalContainer');
    const summary = document.getElementById('alertsSummary');

    // Render summary
    const criticalCount = alerts.filter(a => a.type === 'critical').length;
    const warningCount = alerts.filter(a => a.type === 'warning').length;

    if (summary) {
        summary.innerHTML = `
            <div class="alert-summary-item critical">
                <span class="alert-summary-count">${criticalCount}</span>
                <span class="alert-summary-label">Críticas</span>
            </div>
            <div class="alert-summary-item warning">
                <span class="alert-summary-count">${warningCount}</span>
                <span class="alert-summary-label">Advertencias</span>
            </div>
            <div class="alert-summary-item total">
                <span class="alert-summary-count">${alerts.length}</span>
                <span class="alert-summary-label">Total</span>
            </div>
        `;
    }

    // Render alerts
    if (container) {
        if (alerts.length === 0) {
            container.innerHTML = '<div class="alert-item"><span class="alert-icon">✅</span><div class="alert-content"><div class="alert-title">Sin alertas</div><div class="alert-desc">Todos los proyectos en curso normal</div></div></div>';
        } else {
            container.innerHTML = alerts.map(alert => `
                <div class="alert-item ${alert.type}" data-lot="${alert.loteId}">
                    <span class="alert-icon">${alert.icon}</span>
                    <div class="alert-content">
                        <div class="alert-title">${alert.loteId}</div>
                        <div class="alert-desc">${alert.message}</div>
                    </div>
                </div>
            `).join('');

            // Add click handlers to zoom to lot
            container.querySelectorAll('.alert-item[data-lot]').forEach(item => {
                item.addEventListener('click', () => {
                    const id = item.dataset.lot;
                    this.closeAlertsModal();
                    App.Map.zoomToLot(id);
                });
            });
        }
    }
};

App.UI.closeAlertsModal = function () {
    const overlay = document.getElementById('alertsModalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
};

// ------------------------------------
// ELITE TOOLBAR CREATION
// ------------------------------------
App.UI.createEliteToolbar = function () {
    const mapPanel = document.querySelector('.panel-map');
    if (!mapPanel || document.getElementById('eliteToolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'eliteToolbar';
    toolbar.className = 'elite-toolbar';

    toolbar.innerHTML = `
        <button class="elite-btn" id="btnOpportunity" title="Capa de Oportunidad">💰</button>
        <button class="elite-btn" id="btnHeatmap" title="Mapa de Calor">🌡️</button>
        <button class="elite-btn" id="btnNeighbors" title="Ver Vecinos">🏘️</button>
        <button class="elite-btn" id="btnDashboard" title="Dashboard BI">📊</button>
    `;

    mapPanel.appendChild(toolbar);

    // Bind events
    document.getElementById('btnOpportunity').addEventListener('click', () => {
        App.Map.toggleOpportunityLayer();
        if (App.Map.opportunityLayerActive) {
            App.UI.showInfoToast('💰', 'Capa de Oportunidad', 'Resalta en dorado los lotes comerciales e institucionales disponibles para venta o adjudicación según los listados oficiales.');
        } else {
            App.UI.hideInfoToast();
        }
    });

    document.getElementById('btnHeatmap').addEventListener('click', () => {
        App.Map.renderDensityHeatmap();
        if (App.Map.heatmapActive) {
            App.UI.showInfoToast('🌡️', 'Mapa de Calor', 'Visualiza la densidad poblacional basada en unidades habitacionales terminadas. Azul = baja densidad, Rojo = alta densidad.');
        } else {
            App.UI.hideInfoToast();
        }
    });

    document.getElementById('btnNeighbors').addEventListener('click', () => {
        const btn = document.getElementById('btnNeighbors');

        // Toggle off if already active
        if (App.Map.neighborsActive) {
            App.Map.clearNeighborHighlights();
            App.Map.neighborsActive = false;
            btn.classList.remove('active');
            App.UI.hideInfoToast();
            return;
        }

        // Toggle on
        if (App.State.selectedId) {
            App.Map.highlightNeighbors(App.State.selectedId);
            App.Map.neighborsActive = true;
            btn.classList.add('active');
            App.UI.showInfoToast('🏘️', 'Lotes Vecinos', `Muestra los lotes adyacentes al lote ${App.State.selectedId}. Haz clic de nuevo para desactivar.`);
        } else {
            App.UI.showInfoToast('🏘️', 'Lotes Vecinos', 'Primero selecciona un lote en el mapa para ver sus vecinos colindantes.');
        }
    });

    document.getElementById('btnDashboard').addEventListener('click', () => {
        App.UI.hideInfoToast();
        App.UI.openBIModal();
    });
};

// ------------------------------------
// HEATMAP LEGEND
// ------------------------------------
App.UI.createHeatmapLegend = function () {
    const mapPanel = document.querySelector('.panel-map');
    if (!mapPanel || document.getElementById('heatmapLegend')) return;

    const legend = document.createElement('div');
    legend.id = 'heatmapLegend';
    legend.className = 'heatmap-legend';

    legend.innerHTML = `
        <div class="heatmap-legend-title">Densidad Poblacional</div>
        <div class="heatmap-gradient"></div>
        <div class="heatmap-labels">
            <span>Baja</span>
            <span>Alta</span>
        </div>
    `;

    mapPanel.appendChild(legend);
};

// ------------------------------------
// INITIALIZATION
// ------------------------------------
App.Elite = {
    async init() {
        console.log('🚀 Inicializando Elite Features...');

        // Load historical stats
        await App.Data.loadStats();

        // Create UI elements
        App.UI.createEliteToolbar();
        App.UI.createHeatmapLegend();
        App.UI.renderBIDashboard();
        App.UI.createAlertsModal();

        // Setup smart tooltip
        App.Map.setupSmartTooltip();

        // Override search to use zoomToLot
        this.enhanceSearch();

        // Enable manual zoom input
        this.enhanceZoomInput();

        // Bind alerts button
        this.bindAlertsButton();

        console.log('✅ Elite Features activados');
    },

    bindAlertsButton() {
        const btn = document.getElementById('btnAlerts');
        console.log('🔔 Binding Alerts button:', btn ? 'found' : 'NOT FOUND');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('🔔 Alerts button clicked');
                App.UI.openAlertsModal();
            });
        } else {
            // Fallback: Try with event delegation on document
            document.addEventListener('click', (e) => {
                if (e.target.closest('#btnAlerts')) {
                    console.log('🔔 Alerts button clicked (delegated)');
                    App.UI.openAlertsModal();
                }
            });
        }
    },

    enhanceZoomInput() {
        const zoomInput = document.getElementById('zoomLevel');
        if (!zoomInput) return;

        // Handle Enter key to apply zoom
        zoomInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.applyManualZoom(zoomInput.value);
                zoomInput.blur();
            }
        });

        // Handle blur to apply zoom
        zoomInput.addEventListener('blur', () => {
            this.applyManualZoom(zoomInput.value);
        });

        // Select all on focus for easy editing
        zoomInput.addEventListener('focus', () => {
            zoomInput.select();
        });
    },

    applyManualZoom(value) {
        // Parse the zoom value (accept formats like "95", "95%", "1.5", etc)
        let zoom = parseFloat(value.replace('%', '').trim());

        if (isNaN(zoom)) {
            // Reset to current value
            document.getElementById('zoomLevel').value = Math.round(App.Map.transform.scale * 100) + '%';
            return;
        }

        // If value > 10, assume percentage (e.g., 95 = 95%)
        // If value <= 10, assume multiplier (e.g., 1.5 = 150%)
        const scale = zoom > 10 ? zoom / 100 : zoom;

        // Clamp between 20% and 500%
        const clampedScale = Math.max(0.2, Math.min(5, scale));

        const container = document.getElementById('mapContainer');
        const svg = container.querySelector('svg');
        if (!svg) return;

        // Apply smooth transition
        svg.classList.add('zooming');

        App.Map.transform.scale = clampedScale;
        svg.style.transform = `translate(${App.Map.transform.x}px, ${App.Map.transform.y}px) scale(${App.Map.transform.scale})`;

        // Update display
        document.getElementById('zoomLevel').value = Math.round(clampedScale * 100) + '%';

        setTimeout(() => {
            svg.classList.remove('zooming');
        }, 600);

        console.log(`🔍 Zoom manual: ${Math.round(clampedScale * 100)}%`);
    },

    enhanceSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');

        if (!searchInput || !searchResults) return;

        // Add keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const firstMatch = App.State.filtered[0];
                if (firstMatch) {
                    App.Map.zoomToLot(firstMatch.id);
                    searchInput.blur();
                }
            }
        });

        // Show clickable results
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) {
                searchResults.classList.remove('active');
                return;
            }

            const matches = [];
            App.State.lotesMap.forEach((lote, id) => {
                if (id.toLowerCase().includes(query) ||
                    lote.nombre?.toLowerCase().includes(query) ||
                    lote.desarrollador?.toLowerCase().includes(query)) {
                    matches.push(lote);
                }
            });

            if (matches.length > 0) {
                searchResults.innerHTML = matches.slice(0, 8).map(l => `
                    <div class="search-result-item" data-id="${l.id}">
                        <strong>${l.id}</strong> - ${l.nombre || l.tipo}
                    </div>
                `).join('');
                searchResults.classList.add('active');

                searchResults.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        App.Map.zoomToLot(item.dataset.id);
                        searchResults.classList.remove('active');
                        searchInput.value = item.dataset.id;
                    });
                });
            } else {
                searchResults.classList.remove('active');
            }
        });
    }
};

// Auto-initialize after main app loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for main App to initialize
    setTimeout(() => {
        if (typeof App !== 'undefined' && App.State.lotesMap.size > 0) {
            App.Elite.init();
        } else {
            // Retry after data loads
            const checkInterval = setInterval(() => {
                if (App.State.lotesMap.size > 0) {
                    clearInterval(checkInterval);
                    App.Elite.init();
                }
            }, 500);
        }
    }, 1000);
});

// ==============================================================
// BLOQUE 3: NUEVOS MÓDULOS - Persistence & Screenshot
// ==============================================================

// ------------------------------------
// PERSISTENCE MODULE - localStorage
// ------------------------------------
App.Persistence = {
    STORAGE_KEY: 'CJB_MAP_STATE_V1',

    // Debounce helper
    debounce(fn, delay) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    // Save current state
    save() {
        try {
            const state = {
                version: 1,
                timestamp: Date.now(),

                // Filters
                filters: {
                    search: document.getElementById('searchInput')?.value || '',
                    etapa: document.getElementById('etapaFilter')?.value || '',
                    estado: document.getElementById('estadoFilter')?.value || '',
                    subtipo: document.getElementById('subtipoFilter')?.value || '',
                    pilar: document.getElementById('pilarFilter')?.value || '',
                    desarrollador: document.getElementById('desarrolladorFilter')?.value || '',
                    cuadrante: document.getElementById('cuadranteFilter')?.value || '',
                    yearStart: document.getElementById('yearStart')?.value || '',
                    yearEnd: document.getElementById('yearEnd')?.value || '',
                },

                // Active type buttons
                activeTypes: Array.from(
                    document.querySelectorAll('.filter-btn.active')
                ).map(btn => btn.dataset.tipo).filter(Boolean),

                // View state
                view: {
                    zoom: App.Map.transform?.scale || 1,
                    panX: App.Map.transform?.x || 0,
                    panY: App.Map.transform?.y || 0
                },

                // Elite features state
                elite: {
                    heatmapActive: App.Map.heatmapActive || false,
                    opportunityActive: App.Map.opportunityLayerActive || false,
                },

                // Theme
                theme: document.body.classList.contains('light-mode') ? 'light' : 'dark',

                // Selected lot
                selectedLotId: App.State.selectedId || null
            };

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
            console.log('💾 Estado guardado');
        } catch (e) {
            console.warn('Error guardando estado:', e);
        }
    },

    // Load saved state
    load() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            if (!saved) return null;

            const state = JSON.parse(saved);

            // Check version compatibility
            if (state.version !== 1) return null;

            // Check if saved within last 7 days
            const weekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
            if (state.timestamp < weekAgo) {
                this.clear();
                return null;
            }

            return state;
        } catch (e) {
            console.warn('Error cargando estado guardado:', e);
            return null;
        }
    },

    // Apply saved state
    apply(state) {
        if (!state) return;

        try {
            // Apply filters
            if (state.filters) {
                const filterMap = {
                    'search': 'searchInput',
                    'etapa': 'etapaFilter',
                    'estado': 'estadoFilter',
                    'subtipo': 'subtipoFilter',
                    'pilar': 'pilarFilter',
                    'desarrollador': 'desarrolladorFilter',
                    'cuadrante': 'cuadranteFilter',
                    'yearStart': 'yearStart',
                    'yearEnd': 'yearEnd'
                };

                Object.entries(state.filters).forEach(([key, value]) => {
                    const elementId = filterMap[key];
                    const el = document.getElementById(elementId);
                    if (el && value) el.value = value;
                });
            }

            // Apply active types
            if (state.activeTypes && state.activeTypes.length > 0) {
                document.querySelectorAll('.filter-btn').forEach(btn => {
                    const tipo = btn.dataset.tipo;
                    if (state.activeTypes.includes(tipo)) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });
            }

            // Apply view (zoom/pan)
            if (state.view && App.Map.transform) {
                App.Map.transform.scale = state.view.zoom;
                App.Map.transform.x = state.view.panX;
                App.Map.transform.y = state.view.panY;

                const svg = document.querySelector('#svgContainer svg, #mapContainer svg');
                if (svg) {
                    svg.style.transform = `translate(${state.view.panX}px, ${state.view.panY}px) scale(${state.view.zoom})`;
                }
            }

            // Apply theme
            if (state.theme === 'light') {
                document.body.classList.add('light-mode');
            } else {
                document.body.classList.remove('light-mode');
            }

            // Apply elite features after delay (data must load first)
            setTimeout(() => {
                if (state.elite?.heatmapActive && !App.Map.heatmapActive) {
                    App.Map.renderDensityHeatmap();
                }
                if (state.elite?.opportunityActive && !App.Map.opportunityLayerActive) {
                    App.Map.toggleOpportunityLayer();
                }
                if (state.selectedLotId) {
                    App.UI.selectLot(state.selectedLotId);
                }
            }, 1500);

            // Trigger filter application
            if (typeof applyFilters === 'function') {
                applyFilters();
            }

            console.log('📂 Estado restaurado exitosamente');
        } catch (e) {
            console.warn('Error aplicando estado:', e);
        }
    },

    // Clear saved state
    clear() {
        localStorage.removeItem(this.STORAGE_KEY);
        console.log('🗑️ Estado limpiado');
    },

    // Initialize auto-save
    init() {
        // Debounced save function
        const saveDebounced = this.debounce(() => this.save(), 2000);

        // Listen to filter changes
        document.querySelectorAll('select, input').forEach(el => {
            el.addEventListener('change', saveDebounced);
        });

        // Listen to zoom/pan
        document.getElementById('mapContainer')?.addEventListener('wheel', saveDebounced);

        // Save before leaving page
        window.addEventListener('beforeunload', () => this.save());

        // Check for saved state
        const saved = this.load();
        if (saved) {
            // Auto-restore without prompting for better UX
            this.apply(saved);
        }

        console.log('💾 Persistence module initialized');
    }
};

// ------------------------------------
// SCREENSHOT MODULE - html2canvas
// ------------------------------------
App.UI.captureScreenshot = async function () {
    const mapContainer = document.getElementById('mapContainer');
    if (!mapContainer) {
        console.error('Map container not found');
        return;
    }

    // Elements to hide during capture
    const elementsToHide = [
        '.zoom-controls',
        '.elite-toolbar',
        '.heatmap-legend',
        '.map-legend',
        '#mapTooltip',
        '.elite-info-toast'
    ];

    // Store original display values
    const originalStyles = new Map();

    try {
        // Show loading indicator
        const loadingToast = document.createElement('div');
        loadingToast.id = 'screenshotLoading';
        loadingToast.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 20px 40px;
            border-radius: 12px;
            z-index: 10000;
            font-family: 'Outfit', sans-serif;
            font-size: 16px;
        `;
        loadingToast.textContent = '📷 Capturando imagen...';
        document.body.appendChild(loadingToast);

        // Hide UI elements
        elementsToHide.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                originalStyles.set(el, el.style.display);
                el.style.display = 'none';
            });
        });

        // Wait for DOM update
        await new Promise(r => setTimeout(r, 100));

        // Check if html2canvas is available
        if (typeof html2canvas === 'undefined') {
            // Load dynamically
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            document.head.appendChild(script);
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
        }

        // Capture
        const canvas = await html2canvas(mapContainer, {
            backgroundColor: '#0a1628',
            scale: 2, // High resolution
            useCORS: true,
            logging: false,
            allowTaint: true
        });

        // Generate filename with date
        const date = new Date().toISOString().split('T')[0];
        const filename = `CJB_Mapa_${date}.png`;

        // Download
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();

        console.log('📸 Screenshot saved:', filename);

        // Show success toast
        loadingToast.textContent = '✅ Imagen guardada';
        setTimeout(() => loadingToast.remove(), 1500);

    } catch (error) {
        console.error('Error capturing screenshot:', error);
        alert('Error al capturar la imagen. Intente de nuevo.');
        document.getElementById('screenshotLoading')?.remove();
    } finally {
        // Restore UI elements
        originalStyles.forEach((display, el) => {
            el.style.display = display || '';
        });
    }
};

// ------------------------------------
// RESET ALL ELITE FEATURES
// ------------------------------------
App.Elite.resetAll = function () {
    // Turn off Heatmap
    if (App.Map.heatmapActive) {
        App.Map.renderDensityHeatmap(); // Toggle off
    }

    // Turn off Opportunity Layer
    if (App.Map.opportunityLayerActive) {
        App.Map.toggleOpportunityLayer(); // Toggle off
    }

    // Clear neighbor highlights
    App.Map.clearNeighborHighlights();
    App.Map.neighborsActive = false;
    document.getElementById('btnNeighbors')?.classList.remove('active');

    // Hide info toast
    App.UI.hideInfoToast();

    // Close BI Modal if open
    App.UI.closeBIModal();

    console.log('🧹 Elite features reset');
};

// ------------------------------------
// ENHANCED TOOLBAR WITH SCREENSHOT BUTTON
// ------------------------------------
const _originalCreateEliteToolbar = App.UI.createEliteToolbar;
App.UI.createEliteToolbar = function () {
    const mapPanel = document.querySelector('.panel-map, .map-container, #mapContainer');
    if (!mapPanel || document.getElementById('eliteToolbar')) return;

    const toolbar = document.createElement('div');
    toolbar.id = 'eliteToolbar';
    toolbar.className = 'elite-toolbar';

    toolbar.innerHTML = `
        <button class="elite-btn" id="btnOpportunity" title="Capa de Oportunidad">💰</button>
        <button class="elite-btn" id="btnHeatmap" title="Mapa de Calor">🌡️</button>
        <button class="elite-btn" id="btnNeighbors" title="Ver Vecinos">🏘️</button>
        <button class="elite-btn" id="btnDashboard" title="Dashboard BI">📊</button>
        <button class="elite-btn" id="btnScreenshot" title="Captura de Pantalla">📷</button>
    `;

    mapPanel.appendChild(toolbar);

    // Bind events
    document.getElementById('btnOpportunity').addEventListener('click', () => {
        App.Map.toggleOpportunityLayer();
        if (App.Map.opportunityLayerActive) {
            App.UI.showInfoToast('💰', 'Capa de Oportunidad', 'Resalta en dorado los lotes comerciales e institucionales disponibles.');
        } else {
            App.UI.hideInfoToast();
        }
    });

    document.getElementById('btnHeatmap').addEventListener('click', () => {
        App.Map.renderDensityHeatmap();
        if (App.Map.heatmapActive) {
            App.UI.showInfoToast('🌡️', 'Mapa de Calor', 'Visualiza la densidad basada en unidades habitacionales. Azul=baja, Rojo=alta.');
        } else {
            App.UI.hideInfoToast();
        }
    });

    document.getElementById('btnNeighbors').addEventListener('click', () => {
        const btn = document.getElementById('btnNeighbors');
        if (App.Map.neighborsActive) {
            App.Map.clearNeighborHighlights();
            App.Map.neighborsActive = false;
            btn.classList.remove('active');
            App.UI.hideInfoToast();
            return;
        }
        if (App.State.selectedId) {
            App.Map.highlightNeighbors(App.State.selectedId);
            App.Map.neighborsActive = true;
            btn.classList.add('active');
            App.UI.showInfoToast('🏘️', 'Lotes Vecinos', `Muestra los lotes adyacentes a ${App.State.selectedId}.`);
        } else {
            App.UI.showInfoToast('🏘️', 'Lotes Vecinos', 'Primero selecciona un lote en el mapa.');
        }
    });

    document.getElementById('btnDashboard').addEventListener('click', () => {
        App.UI.hideInfoToast();
        App.UI.openBIModal();
    });

    // ✅ NEW: Screenshot button
    document.getElementById('btnScreenshot').addEventListener('click', () => {
        App.UI.captureScreenshot();
    });
};

// ------------------------------------
// ENHANCED INIT - Include Persistence
// ------------------------------------
const _originalEliteInit = App.Elite.init;
App.Elite.init = async function () {
    console.log('🚀 Inicializando Elite Features v2.0...');

    // Load historical stats
    await App.Data.loadStats();

    // Create UI elements
    App.UI.createEliteToolbar();
    App.UI.createHeatmapLegend();
    App.UI.renderBIDashboard();

    // Setup smart tooltip
    App.Map.setupSmartTooltip();

    // Enhance search
    this.enhanceSearch();

    // Enable manual zoom input
    this.enhanceZoomInput();

    // ✅ NEW: Initialize persistence
    App.Persistence.init();

    console.log('✅ Elite Features v2.0 activados');
};

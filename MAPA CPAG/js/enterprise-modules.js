/**
 * ============================================================================
 * ENTERPRISE MODULES - Ciudad Juan Bosch Platform
 * Version: 1.0.0
 * 
 * Este archivo contiene los 4 pilares enterprise:
 * 1. App.Financial - Capa Financiera (ROI Intelligence)
 * 2. App.Export - Interoperabilidad GIS (GeoJSON)
 * 3. App.Showroom - Modo Presentación + Anotaciones
 * 4. PWA Bootstrap - Service Worker Registration
 * ============================================================================
 */

// Ensure App namespace exists
window.App = window.App || {};

// ============================================================================
// BLOQUE 1: 💼 MÓDULO FINANCIERO (App.Financial)
// ============================================================================

App.Financial = {
    priceLayerActive: false,
    absorptionLayerActive: false,

    /**
     * Render Price Layer - Colorea lotes por precio/m² usando cuartiles
     * @param {string} mode - 'perM2' o 'total'
     */
    renderPriceLayer(mode = 'perM2') {
        if (this.priceLayerActive) {
            this.clearPriceLayer();
            return;
        }

        const prices = [];

        // Collect all prices from lots
        App.State.lotesMap.forEach((lote, id) => {
            // Simulate price data if not present (based on area and type)
            const basePrice = this.getSimulatedPrice(lote);
            const price = mode === 'perM2'
                ? basePrice / (lote._parsedArea || 1)
                : basePrice;

            if (price > 0) {
                prices.push({ id, price, lote });
            }
        });

        if (prices.length === 0) {
            App.UI.showInfoToast('⚠️', 'Sin Datos', 'No hay datos de precio disponibles');
            return;
        }

        // Calculate quartiles
        prices.sort((a, b) => a.price - b.price);
        const q1 = prices[Math.floor(prices.length * 0.25)]?.price || 0;
        const q2 = prices[Math.floor(prices.length * 0.50)]?.price || 0;
        const q3 = prices[Math.floor(prices.length * 0.75)]?.price || 0;

        // Apply colors based on quartiles
        prices.forEach(({ id, price }) => {
            const el = document.getElementById(id);
            if (!el) return;

            // Store original styles for restoration
            el.dataset.originalFill = el.style.fill || el.getAttribute('fill') || '';
            el.dataset.originalOpacity = el.style.opacity || '';

            let color;
            if (price <= q1) color = '#3b82f6'; // Blue - Económico
            else if (price <= q2) color = '#10b981'; // Green - Medio
            else if (price <= q3) color = '#f59e0b'; // Orange - Alto
            else color = '#ef4444'; // Red - Premium

            el.style.fill = color;
            el.style.opacity = '0.85';
            el.style.transition = 'fill 0.3s ease, opacity 0.3s ease';
        });

        this.priceLayerActive = true;
        this.showPriceLegend(q1, q2, q3, mode);
        App.UI.showInfoToast('💰', 'Capa de Precios', `Mostrando ${mode === 'perM2' ? 'Precio/m²' : 'Valor Total'}`);
    },

    /**
     * Simulate price based on lot characteristics
     */
    getSimulatedPrice(lote) {
        // Base prices by type (in DOP)
        const basePrices = {
            'Habitacional': 3500,
            'Comercial': 5500,
            'Institucional': 2800,
            'Infraestructura': 1500
        };

        const basePerM2 = basePrices[lote.tipo] || 2500;
        const area = lote._parsedArea || 1000;

        // Modifiers based on estado
        const estadoModifiers = {
            'Terminado': 1.3,
            'En construcción': 1.0,
            'Disponible': 0.8,
            'Paralizado': 0.6
        };
        const modifier = estadoModifiers[lote.estado] || 1.0;

        return area * basePerM2 * modifier;
    },

    /**
     * Show price legend overlay
     */
    showPriceLegend(q1, q2, q3, mode) {
        // Remove existing legend
        document.getElementById('priceLegend')?.remove();

        const formatPrice = (val) => {
            if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
            if (val >= 1000) return (val / 1000).toFixed(0) + 'K';
            return val.toFixed(0);
        };

        const legend = document.createElement('div');
        legend.id = 'priceLegend';
        legend.className = 'enterprise-legend';
        legend.innerHTML = `
            <div class="legend-header">
                <span>💰 ${mode === 'perM2' ? 'Precio/m² (DOP)' : 'Valor Total'}</span>
                <button class="legend-close" onclick="App.Financial.clearPriceLayer()">✕</button>
            </div>
            <div class="legend-items">
                <div class="legend-row">
                    <span class="legend-color" style="background: #3b82f6"></span>
                    <span>Económico: ≤ ${formatPrice(q1)}</span>
                </div>
                <div class="legend-row">
                    <span class="legend-color" style="background: #10b981"></span>
                    <span>Medio: ${formatPrice(q1)} - ${formatPrice(q2)}</span>
                </div>
                <div class="legend-row">
                    <span class="legend-color" style="background: #f59e0b"></span>
                    <span>Alto: ${formatPrice(q2)} - ${formatPrice(q3)}</span>
                </div>
                <div class="legend-row">
                    <span class="legend-color" style="background: #ef4444"></span>
                    <span>Premium: > ${formatPrice(q3)}</span>
                </div>
            </div>
        `;

        document.body.appendChild(legend);
    },

    /**
     * Clear price layer and restore original styles
     */
    clearPriceLayer() {
        App.State.lotesMap.forEach((lote, id) => {
            const el = document.getElementById(id);
            if (!el) return;

            if (el.dataset.originalFill !== undefined) {
                el.style.fill = el.dataset.originalFill;
                el.style.opacity = el.dataset.originalOpacity || '';
            }
        });

        document.getElementById('priceLegend')?.remove();
        this.priceLayerActive = false;

        // Re-apply current filters
        App.Map.render();
    }
};

// ============================================================================
// COMPARADOR LADO A LADO
// ============================================================================

App.Compare = {
    selectedLots: [],

    /**
     * Toggle lot selection for comparison
     */
    toggleSelection(loteId) {
        const el = document.getElementById(loteId);
        if (!el) return;

        const idx = this.selectedLots.indexOf(loteId);

        if (idx > -1) {
            // Deselect
            this.selectedLots.splice(idx, 1);
            el.classList.remove('compare-selected');
        } else if (this.selectedLots.length < 2) {
            // Select (max 2)
            this.selectedLots.push(loteId);
            el.classList.add('compare-selected');
        } else {
            App.UI.showInfoToast('⚠️', 'Límite', 'Solo puedes comparar 2 lotes. Deselecciona uno primero.');
            return;
        }

        // Show comparison if 2 selected
        if (this.selectedLots.length === 2) {
            this.showComparisonModal();
        }

        this.updateSelectionBadge();
    },

    /**
     * Update floating badge showing selection count
     */
    updateSelectionBadge() {
        let badge = document.getElementById('compareBadge');

        if (this.selectedLots.length === 0) {
            badge?.remove();
            return;
        }

        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'compareBadge';
            badge.className = 'compare-badge';
            document.body.appendChild(badge);
        }

        badge.innerHTML = `
            <span>⚖️ ${this.selectedLots.length}/2 seleccionados</span>
            ${this.selectedLots.length === 2
                ? '<button onclick="App.Compare.showComparisonModal()">Comparar</button>'
                : ''}
            <button class="badge-clear" onclick="App.Compare.clearSelection()">✕</button>
        `;
    },

    /**
     * Show comparison modal
     */
    showComparisonModal() {
        if (this.selectedLots.length !== 2) return;

        const [lotA, lotB] = this.selectedLots.map(id => App.State.lotesMap.get(id));
        if (!lotA || !lotB) return;

        // Close existing modal
        document.getElementById('compareModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'compareModal';
        modal.className = 'compare-modal-overlay';

        modal.innerHTML = `
            <div class="compare-modal">
                <div class="compare-header">
                    <h3>⚖️ Comparación de Lotes</h3>
                    <button class="compare-close" onclick="App.Compare.closeModal()">✕</button>
                </div>
                <div class="compare-content">
                    <table class="compare-table">
                        <thead>
                            <tr>
                                <th>Métrica</th>
                                <th class="lot-a">${lotA.id}</th>
                                <th class="lot-b">${lotB.id}</th>
                                <th>Diferencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.generateRow('Tipo', lotA.tipo, lotB.tipo, 'text')}
                            ${this.generateRow('Área (m²)', lotA._parsedArea, lotB._parsedArea, 'number')}
                            ${this.generateRow('Unidades', lotA.unidades, lotB.unidades, 'number')}
                            ${this.generateRow('Estado', lotA.estado, lotB.estado, 'text')}
                            ${this.generateRow('Desarrollador', lotA.desarrollador, lotB.desarrollador, 'text')}
                            ${this.generateRow('Pilar', lotA.Pilar, lotB.Pilar, 'text')}
                            ${this.generateRow('Precio Est. (DOP)',
            App.Financial.getSimulatedPrice(lotA),
            App.Financial.getSimulatedPrice(lotB), 'currency')}
                            ${this.generateRow('Precio/m² Est.',
                App.Financial.getSimulatedPrice(lotA) / (lotA._parsedArea || 1),
                App.Financial.getSimulatedPrice(lotB) / (lotB._parsedArea || 1), 'currency')}
                        </tbody>
                    </table>
                    <div class="compare-verdict">
                        ${this.generateVerdict(lotA, lotB)}
                    </div>
                </div>
                <div class="compare-actions">
                    <button class="btn-secondary" onclick="App.Compare.exportComparison()">📄 Exportar PDF</button>
                    <button class="btn-primary" onclick="App.Compare.closeModal()">Cerrar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });
    },

    /**
     * Generate table row with comparison
     */
    generateRow(label, valA, valB, type = 'text') {
        const a = type === 'number' || type === 'currency' ? parseFloat(valA) || 0 : valA || '-';
        const b = type === 'number' || type === 'currency' ? parseFloat(valB) || 0 : valB || '-';

        let diff = '';
        let diffClass = '';

        if (type === 'number' || type === 'currency') {
            const delta = a - b;
            diffClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
            diff = delta !== 0 ? `${delta > 0 ? '+' : ''}${this.formatValue(delta, type)}` : '=';
        } else {
            diff = a === b ? '=' : '≠';
            diffClass = a === b ? 'neutral' : 'different';
        }

        return `
            <tr>
                <td class="row-label">${label}</td>
                <td class="lot-a">${this.formatValue(a, type)}</td>
                <td class="lot-b">${this.formatValue(b, type)}</td>
                <td class="diff ${diffClass}">${diff}</td>
            </tr>
        `;
    },

    /**
     * Format value based on type
     */
    formatValue(val, type) {
        if (type === 'currency') {
            if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(2) + 'M';
            if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1) + 'K';
            return val.toLocaleString('es-DO');
        }
        if (type === 'number') {
            return typeof val === 'number' ? val.toLocaleString('es-DO') : val;
        }
        return val;
    },

    /**
     * Generate verdict/recommendation
     */
    generateVerdict(lotA, lotB) {
        const priceA = App.Financial.getSimulatedPrice(lotA);
        const priceB = App.Financial.getSimulatedPrice(lotB);
        const efficiencyA = (lotA.unidades || 0) / (lotA._parsedArea || 1);
        const efficiencyB = (lotB.unidades || 0) / (lotB._parsedArea || 1);

        let winner, reason;

        if (efficiencyA > efficiencyB && priceA <= priceB) {
            winner = lotA.id;
            reason = 'Mayor densidad habitacional con menor inversión';
        } else if (efficiencyB > efficiencyA && priceB <= priceA) {
            winner = lotB.id;
            reason = 'Mayor densidad habitacional con menor inversión';
        } else if (priceA / (lotA._parsedArea || 1) < priceB / (lotB._parsedArea || 1)) {
            winner = lotA.id;
            reason = 'Mejor precio por metro cuadrado';
        } else {
            winner = lotB.id;
            reason = 'Mejor precio por metro cuadrado';
        }

        return `
            <div class="verdict-icon">🏆</div>
            <div class="verdict-text">
                <strong>Recomendación:</strong> ${winner}<br>
                <small>${reason}</small>
            </div>
        `;
    },

    /**
     * Close modal and clear selection
     */
    closeModal() {
        document.getElementById('compareModal')?.remove();
    },

    /**
     * Clear all selections
     */
    clearSelection() {
        this.selectedLots.forEach(id => {
            document.getElementById(id)?.classList.remove('compare-selected');
        });
        this.selectedLots = [];
        document.getElementById('compareBadge')?.remove();
        this.closeModal();
    },

    /**
     * Export comparison as printable HTML
     */
    exportComparison() {
        const modal = document.querySelector('.compare-modal');
        if (!modal) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Comparación de Lotes - CJB</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
                    th { background: #1e293b; color: white; }
                    .positive { color: green; }
                    .negative { color: red; }
                    h1 { color: #1e293b; }
                </style>
            </head>
            <body>
                <h1>⚖️ Comparación de Lotes - Ciudad Juan Bosch</h1>
                ${modal.innerHTML}
                <p><small>Generado el ${new Date().toLocaleString('es-DO')}</small></p>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
    }
};

// ============================================================================
// BLOQUE 2: 🌍 MÓDULO GIS & EXPORTACIÓN (App.Export)
// ============================================================================

App.Export = {
    // Calibration constants for Santo Domingo / Ciudad Juan Bosch area
    CALIBRATION: {
        // Reference point: SVG origin mapped to real coordinates
        svgOrigin: { x: 0, y: 0 },
        // Ciudad Juan Bosch approximate coordinates
        geoOrigin: { lat: 18.4861, lng: -69.9312 },
        // Scale factors (SVG units to degrees)
        // Approximate: 1 SVG unit ≈ 0.5 meters
        scale: {
            lat: 0.0000045,  // degrees per SVG unit (latitude)
            lng: 0.0000048   // degrees per SVG unit (longitude) 
        },
        // SVG viewBox dimensions for reference
        svgWidth: 1000,
        svgHeight: 800
    },

    /**
     * Convert SVG coordinates to Lat/Long
     */
    svgToLatLng(svgX, svgY) {
        const { svgOrigin, geoOrigin, scale } = this.CALIBRATION;

        // Transform: SVG Y is inverted relative to latitude
        const lng = geoOrigin.lng + (svgX - svgOrigin.x) * scale.lng;
        const lat = geoOrigin.lat - (svgY - svgOrigin.y) * scale.lat;

        return [lng, lat]; // GeoJSON uses [lng, lat] order
    },

    /**
     * Parse SVG path data to coordinate array
     */
    parsePathToCoords(pathData) {
        if (!pathData) return [];

        const coords = [];

        // Handle polygon points attribute
        if (pathData.includes(',') && !pathData.includes('M')) {
            // Format: "x1,y1 x2,y2 x3,y3"
            const points = pathData.trim().split(/\s+/);
            points.forEach(point => {
                const [x, y] = point.split(',').map(Number);
                if (!isNaN(x) && !isNaN(y)) {
                    coords.push([x, y]);
                }
            });
            return coords;
        }

        // Handle SVG path d attribute
        // Simplified parser for M, L, Z commands
        const commands = pathData.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];
        let currentX = 0, currentY = 0;

        commands.forEach(cmd => {
            const type = cmd[0].toUpperCase();
            const numbers = cmd.slice(1).trim().split(/[\s,]+/).map(Number);

            switch (type) {
                case 'M': // MoveTo
                case 'L': // LineTo
                    for (let i = 0; i < numbers.length; i += 2) {
                        currentX = numbers[i];
                        currentY = numbers[i + 1];
                        coords.push([currentX, currentY]);
                    }
                    break;
                case 'H': // Horizontal line
                    currentX = numbers[0];
                    coords.push([currentX, currentY]);
                    break;
                case 'V': // Vertical line
                    currentY = numbers[0];
                    coords.push([currentX, currentY]);
                    break;
                case 'Z': // Close path
                    if (coords.length > 0) {
                        coords.push([...coords[0]]); // Close polygon
                    }
                    break;
            }
        });

        return coords;
    },

    /**
     * Get SVG element geometry
     */
    getElementGeometry(el) {
        if (!el) return null;

        const tagName = el.tagName.toLowerCase();
        let coords = [];

        if (tagName === 'polygon') {
            const points = el.getAttribute('points');
            coords = this.parsePathToCoords(points);
        } else if (tagName === 'path') {
            const d = el.getAttribute('d');
            coords = this.parsePathToCoords(d);
        } else if (tagName === 'rect') {
            const x = parseFloat(el.getAttribute('x')) || 0;
            const y = parseFloat(el.getAttribute('y')) || 0;
            const w = parseFloat(el.getAttribute('width')) || 0;
            const h = parseFloat(el.getAttribute('height')) || 0;
            coords = [
                [x, y],
                [x + w, y],
                [x + w, y + h],
                [x, y + h],
                [x, y]
            ];
        }

        // Convert to GeoJSON coordinates
        const geoCoords = coords.map(([x, y]) => this.svgToLatLng(x, y));

        // Ensure polygon is closed
        if (geoCoords.length > 2 &&
            (geoCoords[0][0] !== geoCoords[geoCoords.length - 1][0] ||
                geoCoords[0][1] !== geoCoords[geoCoords.length - 1][1])) {
            geoCoords.push([...geoCoords[0]]);
        }

        return {
            type: 'Polygon',
            coordinates: [geoCoords]
        };
    },

    /**
     * Convert filtered lots to GeoJSON FeatureCollection
     */
    toGeoJSON(lots = null) {
        const lotesToExport = lots || Array.from(App.State.filtered || App.State.lotesMap.values());

        const features = [];

        lotesToExport.forEach(lote => {
            const el = document.getElementById(lote.id);
            const geometry = this.getElementGeometry(el);

            if (!geometry || geometry.coordinates[0].length < 3) return;

            features.push({
                type: 'Feature',
                properties: {
                    id: lote.id,
                    nombre: lote.nombre || '',
                    tipo: lote.tipo,
                    subtipo: lote.subtipo || '',
                    estado: lote.estado,
                    area_m2: lote._parsedArea,
                    unidades: lote.unidades || 0,
                    desarrollador: lote.desarrollador || '',
                    pilar: lote.Pilar || '',
                    cuadrante: lote.Cuadrante || lote._cuadrante || ''
                },
                geometry
            });
        });

        return {
            type: 'FeatureCollection',
            name: 'Ciudad_Juan_Bosch_Lotes',
            crs: {
                type: 'name',
                properties: {
                    name: 'urn:ogc:def:crs:OGC:1.3:CRS84'
                }
            },
            features
        };
    },

    /**
     * Download GeoJSON file
     */
    downloadGeoJSON() {
        try {
            const geojson = this.toGeoJSON();

            if (geojson.features.length === 0) {
                App.UI.showInfoToast('⚠️', 'Sin Datos', 'No hay lotes para exportar');
                return;
            }

            const dataStr = JSON.stringify(geojson, null, 2);
            const blob = new Blob([dataStr], { type: 'application/geo+json' });
            const url = URL.createObjectURL(blob);

            const timestamp = new Date().toISOString().split('T')[0];
            const filename = `CJB_lotes_${timestamp}.geojson`;

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();

            URL.revokeObjectURL(url);

            App.UI.showInfoToast('✅', 'Exportación Exitosa',
                `${geojson.features.length} lotes exportados a ${filename}`);

        } catch (error) {
            console.error('GeoJSON export error:', error);
            App.UI.showInfoToast('❌', 'Error', 'No se pudo generar el archivo GeoJSON');
        }
    },

    /**
     * Open lot location in Google Maps
     */
    openInGoogleMaps(loteId) {
        const el = document.getElementById(loteId);
        if (!el) return;

        // Get center of element
        const bbox = el.getBBox();
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;

        const [lng, lat] = this.svgToLatLng(centerX, centerY);

        window.open(
            `https://www.google.com/maps?q=${lat},${lng}&z=18`,
            '_blank'
        );
    },

    /**
     * Open lot location in Waze
     */
    openInWaze(loteId) {
        const el = document.getElementById(loteId);
        if (!el) return;

        const bbox = el.getBBox();
        const centerX = bbox.x + bbox.width / 2;
        const centerY = bbox.y + bbox.height / 2;

        const [lng, lat] = this.svgToLatLng(centerX, centerY);

        window.open(
            `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
            '_blank'
        );
    }
};

// ============================================================================
// BLOQUE 3: 🤝 MÓDULO COLABORATIVO (App.Showroom & App.Annotations)
// ============================================================================

App.Showroom = {
    isActive: false,

    /**
     * Toggle Showroom/Kiosk mode
     */
    toggle() {
        this.isActive = !this.isActive;
        document.body.classList.toggle('showroom-mode', this.isActive);

        if (this.isActive) {
            this.enterShowroom();
        } else {
            this.exitShowroom();
        }
    },

    /**
     * Enter showroom mode
     */
    enterShowroom() {
        // Hide all technical panels
        document.querySelectorAll(`
            .panel-filters,
            .header,
            .elite-toolbar,
            .panel-details,
            .footer
        `).forEach(el => {
            el.dataset.showroomHidden = 'true';
            el.style.display = 'none';
        });

        // Expand map to full screen
        const mapPanel = document.querySelector('.panel-map');
        if (mapPanel) {
            mapPanel.dataset.originalStyle = mapPanel.getAttribute('style') || '';
            mapPanel.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                z-index: 1000;
            `;
        }

        // Add showroom controls
        this.addShowroomControls();

        // Enable touch gestures
        this.enableTouchGestures();

        App.UI.showInfoToast('🎪', 'Modo Showroom', 'Toca para interactuar. Presiona ESC para salir.');
    },

    /**
     * Exit showroom mode
     */
    exitShowroom() {
        // Restore hidden elements
        document.querySelectorAll('[data-showroom-hidden]').forEach(el => {
            el.style.display = '';
            delete el.dataset.showroomHidden;
        });

        // Restore map panel
        const mapPanel = document.querySelector('.panel-map');
        if (mapPanel && mapPanel.dataset.originalStyle !== undefined) {
            mapPanel.style.cssText = mapPanel.dataset.originalStyle;
            delete mapPanel.dataset.originalStyle;
        }

        // Remove showroom controls
        document.getElementById('showroomControls')?.remove();

        // Remove touch listeners (they will be cleaned up by mode toggle)
        this.disableTouchGestures();
    },

    /**
     * Add showroom floating controls
     */
    addShowroomControls() {
        const controls = document.createElement('div');
        controls.id = 'showroomControls';
        controls.className = 'showroom-controls';
        controls.innerHTML = `
            <button class="showroom-btn" onclick="App.Map.zoomIn()" title="Acercar">➕</button>
            <button class="showroom-btn" onclick="App.Map.zoomOut()" title="Alejar">➖</button>
            <button class="showroom-btn" onclick="App.Map.resetView()" title="Centrar">🎯</button>
            <button class="showroom-btn exit" onclick="App.Showroom.toggle()" title="Salir">✕</button>
        `;
        document.body.appendChild(controls);
    },

    /**
     * Enable touch gestures for tablets
     */
    enableTouchGestures() {
        const map = document.querySelector('.map-container');
        if (!map) return;

        let startDistance = 0;
        let startScale = 1;

        this._touchStartHandler = (e) => {
            if (e.touches.length === 2) {
                startDistance = this.getTouchDistance(e.touches);
                startScale = App.Map.scale || 1;
            }
        };

        this._touchMoveHandler = (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const newDistance = this.getTouchDistance(e.touches);
                const scaleDelta = (newDistance / startDistance - 1) * 0.5;
                const newScale = Math.max(0.5, Math.min(5, startScale + scaleDelta));
                App.Map.scale = newScale;
                App.Map.applyTransform?.();
            }
        };

        map.addEventListener('touchstart', this._touchStartHandler, { passive: false });
        map.addEventListener('touchmove', this._touchMoveHandler, { passive: false });
    },

    /**
     * Disable touch gestures
     */
    disableTouchGestures() {
        const map = document.querySelector('.map-container');
        if (!map) return;

        if (this._touchStartHandler) {
            map.removeEventListener('touchstart', this._touchStartHandler);
        }
        if (this._touchMoveHandler) {
            map.removeEventListener('touchmove', this._touchMoveHandler);
        }
    },

    /**
     * Calculate distance between two touch points
     */
    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
};

// ============================================================================
// ANOTACIONES DIGITALES
// ============================================================================

App.Annotations = {
    canvas: null,
    ctx: null,
    isDrawing: false,
    currentTool: 'arrow', // 'arrow', 'circle', 'text', 'freehand'
    color: '#ef4444', // Red
    lineWidth: 4,
    startPoint: null,
    drawings: [], // Store for undo

    /**
     * Initialize annotation canvas
     */
    init() {
        if (this.canvas) return; // Already initialized

        try {
            const mapContainer = document.querySelector('.map-container');
            if (!mapContainer) {
                console.warn('Annotations: Map container not found');
                return;
            }

            // Create canvas overlay
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'annotationCanvas';
            this.canvas.className = 'annotation-canvas';

            // Match container size
            this.resize();

            mapContainer.appendChild(this.canvas);
            this.ctx = this.canvas.getContext('2d');

            // Resize handler
            window.addEventListener('resize', () => this.resize());

            console.log('✅ Annotations canvas initialized');
        } catch (error) {
            console.error('Annotations init error:', error);
        }
    },

    /**
     * Resize canvas to match container
     */
    resize() {
        if (!this.canvas) return;

        const container = this.canvas.parentElement;
        if (!container) return;

        this.canvas.width = container.offsetWidth;
        this.canvas.height = container.offsetHeight;

        // Redraw stored drawings
        this.redraw();
    },

    /**
     * Enable drawing mode
     */
    enableDrawMode(tool = 'arrow') {
        this.init();
        if (!this.canvas) return;

        this.currentTool = tool;
        this.canvas.style.pointerEvents = 'auto';
        this.canvas.style.cursor = 'crosshair';

        this.canvas.onmousedown = (e) => this.startDraw(e);
        this.canvas.onmousemove = (e) => this.draw(e);
        this.canvas.onmouseup = (e) => this.endDraw(e);
        this.canvas.onmouseleave = (e) => this.endDraw(e);

        // Touch support
        this.canvas.ontouchstart = (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.startDraw({ clientX: touch.clientX, clientY: touch.clientY });
        };
        this.canvas.ontouchmove = (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.draw({ clientX: touch.clientX, clientY: touch.clientY });
        };
        this.canvas.ontouchend = () => this.endDraw({});

        this.showToolbar();
        App.UI.showInfoToast('✏️', 'Modo Anotación', `Herramienta: ${tool}. Dibuja sobre el mapa.`);
    },

    /**
     * Disable drawing mode
     */
    disableDrawMode() {
        if (!this.canvas) return;

        this.canvas.style.pointerEvents = 'none';
        this.canvas.style.cursor = 'default';
        this.canvas.onmousedown = null;
        this.canvas.onmousemove = null;
        this.canvas.onmouseup = null;

        document.getElementById('annotationToolbar')?.remove();
    },

    /**
     * Start drawing
     */
    startDraw(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        this.startPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    },

    /**
     * Continue drawing (preview)
     */
    draw(e) {
        if (!this.isDrawing || !this.startPoint) return;

        const rect = this.canvas.getBoundingClientRect();
        const currentPoint = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        // Clear and redraw for preview
        this.redraw();

        // Draw current shape preview
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.lineCap = 'round';

        switch (this.currentTool) {
            case 'arrow':
                this.drawArrow(this.startPoint, currentPoint);
                break;
            case 'circle':
                this.drawCircle(this.startPoint, currentPoint);
                break;
            case 'freehand':
                // For freehand, add point to current path
                if (!this.currentPath) this.currentPath = [this.startPoint];
                this.currentPath.push(currentPoint);
                this.drawFreehand(this.currentPath);
                break;
        }
    },

    /**
     * End drawing
     */
    endDraw(e) {
        if (!this.isDrawing) return;

        // Store the drawing
        if (this.startPoint) {
            const rect = this.canvas.getBoundingClientRect();
            const endPoint = e.clientX ? {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            } : this.startPoint;

            this.drawings.push({
                tool: this.currentTool,
                start: { ...this.startPoint },
                end: endPoint,
                path: this.currentPath ? [...this.currentPath] : null,
                color: this.color,
                lineWidth: this.lineWidth
            });
        }

        this.isDrawing = false;
        this.startPoint = null;
        this.currentPath = null;
    },

    /**
     * Draw arrow shape
     */
    drawArrow(from, to) {
        const headLen = 20;
        const angle = Math.atan2(to.y - from.y, to.x - from.x);

        this.ctx.beginPath();
        this.ctx.moveTo(from.x, from.y);
        this.ctx.lineTo(to.x, to.y);
        this.ctx.stroke();

        // Arrow head
        this.ctx.beginPath();
        this.ctx.moveTo(to.x, to.y);
        this.ctx.lineTo(
            to.x - headLen * Math.cos(angle - Math.PI / 6),
            to.y - headLen * Math.sin(angle - Math.PI / 6)
        );
        this.ctx.lineTo(
            to.x - headLen * Math.cos(angle + Math.PI / 6),
            to.y - headLen * Math.sin(angle + Math.PI / 6)
        );
        this.ctx.closePath();
        this.ctx.fillStyle = this.color;
        this.ctx.fill();
    },

    /**
     * Draw circle shape
     */
    drawCircle(center, edge) {
        const radius = Math.sqrt(
            Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
        );

        this.ctx.beginPath();
        this.ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
        this.ctx.stroke();
    },

    /**
     * Draw freehand path
     */
    drawFreehand(points) {
        if (points.length < 2) return;

        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.stroke();
    },

    /**
     * Redraw all stored drawings
     */
    redraw() {
        if (!this.ctx) return;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.drawings.forEach(drawing => {
            this.ctx.strokeStyle = drawing.color;
            this.ctx.lineWidth = drawing.lineWidth;
            this.ctx.lineCap = 'round';

            switch (drawing.tool) {
                case 'arrow':
                    this.drawArrow(drawing.start, drawing.end);
                    break;
                case 'circle':
                    this.drawCircle(drawing.start, drawing.end);
                    break;
                case 'freehand':
                    if (drawing.path) this.drawFreehand(drawing.path);
                    break;
            }
        });
    },

    /**
     * Clear all annotations
     */
    clear() {
        this.drawings = [];
        if (this.ctx) {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }
    },

    /**
     * Undo last drawing
     */
    undo() {
        this.drawings.pop();
        this.redraw();
    },

    /**
     * Show annotation toolbar
     */
    showToolbar() {
        document.getElementById('annotationToolbar')?.remove();

        const toolbar = document.createElement('div');
        toolbar.id = 'annotationToolbar';
        toolbar.className = 'annotation-toolbar';
        toolbar.innerHTML = `
            <button class="${this.currentTool === 'arrow' ? 'active' : ''}" 
                    onclick="App.Annotations.setTool('arrow')" title="Flecha">➡️</button>
            <button class="${this.currentTool === 'circle' ? 'active' : ''}" 
                    onclick="App.Annotations.setTool('circle')" title="Círculo">⭕</button>
            <button class="${this.currentTool === 'freehand' ? 'active' : ''}" 
                    onclick="App.Annotations.setTool('freehand')" title="Libre">✏️</button>
            <div class="toolbar-divider"></div>
            <input type="color" value="${this.color}" 
                   onchange="App.Annotations.color = this.value" title="Color">
            <div class="toolbar-divider"></div>
            <button onclick="App.Annotations.undo()" title="Deshacer">↩️</button>
            <button onclick="App.Annotations.clear()" title="Limpiar">🗑️</button>
            <button onclick="App.Annotations.exportAsImage()" title="Guardar">💾</button>
            <button onclick="App.Annotations.disableDrawMode()" title="Cerrar">✕</button>
        `;
        document.body.appendChild(toolbar);
    },

    /**
     * Set current tool
     */
    setTool(tool) {
        this.currentTool = tool;
        // Update toolbar active state
        document.querySelectorAll('#annotationToolbar button').forEach(btn => {
            btn.classList.remove('active');
        });
        event.target.classList.add('active');
    },

    /**
     * Export map with annotations as image
     */
    async exportAsImage() {
        try {
            const svg = document.querySelector('#mapSvg, .map-svg, svg');
            if (!svg) {
                App.UI.showInfoToast('❌', 'Error', 'No se encontró el mapa SVG');
                return;
            }

            // Create export canvas
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = this.canvas.width;
            exportCanvas.height = this.canvas.height;
            const ctx = exportCanvas.getContext('2d');

            // Draw white background
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

            // Convert SVG to image
            const svgData = new XMLSerializer().serializeToString(svg);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const svgUrl = URL.createObjectURL(svgBlob);

            const img = new Image();
            img.onload = () => {
                // Draw SVG
                ctx.drawImage(img, 0, 0, exportCanvas.width, exportCanvas.height);

                // Draw annotations
                ctx.drawImage(this.canvas, 0, 0);

                // Add watermark
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = '14px Arial';
                ctx.fillText(`Ciudad Juan Bosch - ${new Date().toLocaleDateString('es-DO')}`, 10, exportCanvas.height - 10);

                // Download
                const link = document.createElement('a');
                link.download = `mapa_anotado_${Date.now()}.png`;
                link.href = exportCanvas.toDataURL('image/png');
                link.click();

                URL.revokeObjectURL(svgUrl);
                App.UI.showInfoToast('✅', 'Imagen Guardada', 'El mapa con anotaciones fue descargado');
            };
            img.onerror = () => {
                App.UI.showInfoToast('❌', 'Error', 'No se pudo generar la imagen');
                URL.revokeObjectURL(svgUrl);
            };
            img.src = svgUrl;

        } catch (error) {
            console.error('Export error:', error);
            App.UI.showInfoToast('❌', 'Error', 'Error al exportar imagen');
        }
    }
};

// ============================================================================
// BLOQUE 4: 🚀 PWA BOOTSTRAP
// ============================================================================

App.PWA = {
    deferredPrompt: null,

    /**
     * Initialize PWA functionality
     */
    init() {
        // Check if service workers are supported
        if (!('serviceWorker' in navigator)) {
            console.log('⚠️ Service Workers not supported');
            return;
        }

        // Register service worker
        window.addEventListener('load', () => {
            this.registerServiceWorker();
        });

        // Capture install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButton();
        });

        // Track installation
        window.addEventListener('appinstalled', () => {
            console.log('✅ PWA installed');
            this.hideInstallButton();
        });
    },

    /**
     * Register service worker
     */
    async registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('✅ Service Worker registered:', registration.scope);

            // Check for updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        this.showUpdateNotification();
                    }
                });
            });

        } catch (error) {
            console.error('❌ Service Worker registration failed:', error);
        }
    },

    /**
     * Show install button
     */
    showInstallButton() {
        let btn = document.getElementById('pwaInstallBtn');
        if (btn) return;

        btn = document.createElement('button');
        btn.id = 'pwaInstallBtn';
        btn.className = 'pwa-install-btn';
        btn.innerHTML = '📲 Instalar App';
        btn.onclick = () => this.showInstallPrompt();

        document.body.appendChild(btn);
    },

    /**
     * Hide install button
     */
    hideInstallButton() {
        document.getElementById('pwaInstallBtn')?.remove();
    },

    /**
     * Show install prompt
     */
    async showInstallPrompt() {
        if (!this.deferredPrompt) return;

        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;

        console.log(`Install prompt outcome: ${outcome}`);
        this.deferredPrompt = null;
        this.hideInstallButton();
    },

    /**
     * Show update notification
     */
    showUpdateNotification() {
        const notification = document.createElement('div');
        notification.className = 'pwa-update-notification';
        notification.innerHTML = `
            <span>🔄 Nueva versión disponible</span>
            <button onclick="location.reload()">Actualizar</button>
        `;
        document.body.appendChild(notification);
    }
};

// ============================================================================
// ENTERPRISE TOOLBAR INTEGRATION
// ============================================================================

App.Enterprise = {
    /**
     * Initialize all enterprise modules
     */
    init() {
        console.log('🏢 Initializing Enterprise Modules...');

        // Initialize PWA
        App.PWA.init();

        // Add enterprise toolbar buttons (Wait for toolbar to exist)
        this.waitForToolbar();

        // Keyboard shortcuts
        this.bindKeyboardShortcuts();

        console.log('✅ Enterprise Modules ready');
    },

    /**
     * Add enterprise buttons to the toolbar as a collapsible menu
     */
    addToolbarButtons() {
        const toolbar = document.querySelector('.elite-toolbar');
        if (!toolbar) return;

        // Create collapsible enterprise menu
        const menuContainer = document.createElement('div');
        menuContainer.className = 'enterprise-menu';
        menuContainer.id = 'enterpriseMenu';
        menuContainer.innerHTML = `
            <button class="enterprise-toggle map-btn" id="btnEnterpriseToggle" title="Herramientas Enterprise">
                🏢
            </button>
            <div class="enterprise-dropdown" id="enterpriseDropdown">
                <button class="enterprise-item" id="btnPriceLayer" title="Capa de Precios">
                    <span class="item-icon">💰</span>
                    <span class="item-label">Precios</span>
                </button>
                <button class="enterprise-item" id="btnCompare" title="Modo Comparación">
                    <span class="item-icon">⚖️</span>
                    <span class="item-label">Comparar</span>
                </button>
                <button class="enterprise-item" id="btnExportGeo" title="Exportar GeoJSON">
                    <span class="item-icon">🌍</span>
                    <span class="item-label">Exportar</span>
                </button>
                <button class="enterprise-item" id="btnAnnotate" title="Anotaciones">
                    <span class="item-icon">✏️</span>
                    <span class="item-label">Anotar</span>
                </button>
                <button class="enterprise-item" id="btnShowroom" title="Modo Showroom">
                    <span class="item-icon">🎪</span>
                    <span class="item-label">Showroom</span>
                </button>
            </div>
        `;

        toolbar.appendChild(menuContainer);

        // Toggle dropdown
        const toggleBtn = document.getElementById('btnEnterpriseToggle');
        const dropdown = document.getElementById('enterpriseDropdown');

        toggleBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
            toggleBtn.classList.toggle('active');
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!menuContainer.contains(e.target)) {
                dropdown?.classList.remove('open');
                toggleBtn?.classList.remove('active');
            }
        });

        // Bind click handlers
        document.getElementById('btnPriceLayer')?.addEventListener('click', () => {
            App.Financial.renderPriceLayer('perM2');
            dropdown?.classList.remove('open');
        });

        document.getElementById('btnCompare')?.addEventListener('click', () => {
            App.UI.showInfoToast('⚖️', 'Modo Comparación',
                'Shift+Click en 2 lotes para compararlos.');
            App.Compare.compareMode = true;
            dropdown?.classList.remove('open');
        });

        document.getElementById('btnExportGeo')?.addEventListener('click', () => {
            App.Export.downloadGeoJSON();
            dropdown?.classList.remove('open');
        });

        document.getElementById('btnAnnotate')?.addEventListener('click', () => {
            App.Annotations.enableDrawMode('arrow');
            dropdown?.classList.remove('open');
        });

        document.getElementById('btnShowroom')?.addEventListener('click', () => {
            App.Showroom.toggle();
            dropdown?.classList.remove('open');
        });
    },

    /**
     * Bind keyboard shortcuts
     */
    bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // ESC to exit showroom
            if (e.key === 'Escape' && App.Showroom.isActive) {
                App.Showroom.toggle();
            }

            // Ctrl+E for export
            if (e.ctrlKey && e.key === 'e') {
                e.preventDefault();
                App.Export.downloadGeoJSON();
            }

            // Ctrl+Shift+C for compare
            if (e.ctrlKey && e.shiftKey && e.key === 'C') {
                e.preventDefault();
                App.Compare.compareMode = !App.Compare.compareMode;
            }
        });

        // Shift+Click for lot comparison selection
        document.addEventListener('click', (e) => {
            if (!e.shiftKey) return;

            const lote = e.target.closest('[id^="0"], [id^="1"], [id^="2"], [id^="3"], [id^="4"], [id^="5"], [id^="6"], [id^="7"], [id^="8"], [id^="9"]');
            if (lote && App.State.lotesMap.has(lote.id)) {
                e.preventDefault();
                e.stopPropagation();
                App.Compare.toggleSelection(lote.id);
            }
        }, true);
    },

    /**
     * Wait for toolbar to be ready
     */
    waitForToolbar(attempts = 0) {
        const toolbar = document.querySelector('.elite-toolbar');
        if (toolbar) {
            this.addToolbarButtons();
        } else {
            if (attempts < 20) {
                setTimeout(() => this.waitForToolbar(attempts + 1), 200);
            } else {
                console.warn('⚠️ Elite Toolbar not found after multiple attempts');
            }
        }
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.Enterprise.init());
} else {
    // DOMContentLoaded already fired
    setTimeout(() => App.Enterprise.init(), 100);
}

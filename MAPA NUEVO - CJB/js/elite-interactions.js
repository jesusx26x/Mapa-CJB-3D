/**
 * ============================================================================
 * ELITE INTERACTIONS v2.0 - The Feel
 * Ciudad Juan Bosch Platform
 * 
 * BLOQUE 2: MOTION DESIGN
 * - Tilt 3D Effect (translate3d para GPU)
 * - Tooltip con Inercia (Lerp + requestAnimationFrame)
 * - Ripple Effect en Botones
 * - Glow Hover
 * 
 * Performance: Optimizado para 60fps usando transform: translate3d
 * ============================================================================
 */

(function () {
    'use strict';

    // Ensure App namespace exists
    window.App = window.App || {};
    window.App.FX = window.App.FX || {};

    // ========================================================================
    // 🎭 TILT 3D EFFECT - Inclinación sutil con transform: translate3d
    // ========================================================================

    App.FX.Tilt = {
        enabled: true,
        maxTilt: 4,          // Grados máximos de inclinación
        perspective: 1000,    // Perspectiva 3D
        scale: 1.02,          // Escala al hover
        speed: 350,           // ms de transición
        elements: [],

        init() {
            if (!this.enabled) return;

            // Seleccionar paneles de vidrio
            const selectors = [
                '.panel-filters',
                '.panel-details',
                '.kpi-comparison-card',
                '.bi-chart-container'
            ];

            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    this.attach(el);
                });
            });

            console.log('✨ FX.Tilt initialized');
        },

        attach(element) {
            if (!element || this.elements.includes(element)) return;
            this.elements.push(element);

            // Configurar estilos iniciales
            element.style.transformStyle = 'preserve-3d';
            element.style.willChange = 'transform';
            element.style.transition = `transform ${this.speed}ms cubic-bezier(0.03, 0.98, 0.52, 0.99)`;

            // Eventos
            element.addEventListener('mouseenter', () => this.onEnter(element));
            element.addEventListener('mousemove', (e) => this.onMove(e, element));
            element.addEventListener('mouseleave', () => this.onLeave(element));
        },

        onEnter(element) {
            element.style.transition = `transform ${this.speed}ms cubic-bezier(0.03, 0.98, 0.52, 0.99)`;
        },

        onMove(e, element) {
            const rect = element.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const mouseX = e.clientX - centerX;
            const mouseY = e.clientY - centerY;

            // Calcular rotación normalizada
            const rotateX = (mouseY / (rect.height / 2)) * -this.maxTilt;
            const rotateY = (mouseX / (rect.width / 2)) * this.maxTilt;

            // Aplicar transform con translate3d para GPU acceleration
            element.style.transform = `
                perspective(${this.perspective}px)
                rotateX(${rotateX}deg)
                rotateY(${rotateY}deg)
                translate3d(0, 0, 0)
                scale3d(${this.scale}, ${this.scale}, ${this.scale})
            `;
        },

        onLeave(element) {
            element.style.transform = `
                perspective(${this.perspective}px)
                rotateX(0deg)
                rotateY(0deg)
                translate3d(0, 0, 0)
                scale3d(1, 1, 1)
            `;
        },

        destroy() {
            this.elements = [];
        }
    };

    // ========================================================================
    // 💬 TOOLTIP CON INERCIA - Lerp + requestAnimationFrame
    // ========================================================================

    App.FX.InertiaTooltip = {
        tooltip: null,
        currentX: 0,
        currentY: 0,
        targetX: 0,
        targetY: 0,
        ease: 0.12,           // Factor de interpolación (menor = más lag)
        offsetX: 18,
        offsetY: 18,
        isVisible: false,
        isRunning: false,

        init() {
            // Crear elemento tooltip
            this.tooltip = document.createElement('div');
            this.tooltip.id = 'eliteTooltip';
            this.tooltip.className = 'elite-inertia-tooltip';
            this.tooltip.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                background: rgba(15, 23, 42, 0.95);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 10px;
                padding: 10px 14px;
                font-family: 'Inter', sans-serif;
                font-size: 13px;
                line-height: 1.5;
                color: rgba(248, 250, 252, 0.95);
                box-shadow: 
                    0 8px 32px rgba(0, 0, 0, 0.4),
                    0 0 0 1px rgba(255, 255, 255, 0.03) inset;
                pointer-events: none;
                z-index: 10000;
                opacity: 0;
                transform: translate3d(0, 5px, 0);
                transition: opacity 0.2s ease, transform 0.2s ease;
                max-width: 300px;
                will-change: transform;
            `;
            document.body.appendChild(this.tooltip);

            // Iniciar loop de animación
            this.startLoop();

            console.log('✨ FX.InertiaTooltip initialized');
        },

        show(content, x, y) {
            if (!this.tooltip) return;

            this.tooltip.innerHTML = content;
            this.targetX = x + this.offsetX;
            this.targetY = y + this.offsetY;

            if (!this.isVisible) {
                // Primera aparición: posicionar instantáneamente
                this.currentX = this.targetX;
                this.currentY = this.targetY;
                this.tooltip.style.opacity = '1';
                this.tooltip.style.transform = 'translate3d(0, 0, 0)';
                this.isVisible = true;
            }
        },

        hide() {
            if (!this.tooltip) return;
            this.tooltip.style.opacity = '0';
            this.tooltip.style.transform = 'translate3d(0, 5px, 0)';
            this.isVisible = false;
        },

        updatePosition(x, y) {
            this.targetX = x + this.offsetX;
            this.targetY = y + this.offsetY;
        },

        startLoop() {
            if (this.isRunning) return;
            this.isRunning = true;
            this.animate();
        },

        animate() {
            if (!this.isRunning) return;

            if (this.isVisible && this.tooltip) {
                // Interpolación lineal (Lerp) para inercia
                this.currentX += (this.targetX - this.currentX) * this.ease;
                this.currentY += (this.targetY - this.currentY) * this.ease;

                // Mantener dentro del viewport
                const rect = this.tooltip.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width - 15;
                const maxY = window.innerHeight - rect.height - 15;

                const finalX = Math.min(Math.max(10, this.currentX), maxX);
                const finalY = Math.min(Math.max(10, this.currentY), maxY);

                // Aplicar posición con translate3d (GPU)
                this.tooltip.style.left = `${finalX}px`;
                this.tooltip.style.top = `${finalY}px`;
            }

            requestAnimationFrame(() => this.animate());
        },

        destroy() {
            this.isRunning = false;
            this.tooltip?.remove();
            this.tooltip = null;
        }
    };

    // ========================================================================
    // 🌊 RIPPLE EFFECT - Ondas al click
    // ========================================================================

    App.FX.Ripple = {
        init() {
            // Delegación de eventos para performance
            document.addEventListener('click', (e) => {
                const button = e.target.closest('button, .btn, .map-btn, .elite-btn, .filter-btn');
                if (button && !button.disabled) {
                    this.create(e, button);
                }
            });

            console.log('✨ FX.Ripple initialized');
        },

        create(event, element) {
            const rect = element.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height) * 1.5;
            const x = event.clientX - rect.left - size / 2;
            const y = event.clientY - rect.top - size / 2;

            // Crear elemento ripple
            const ripple = document.createElement('span');
            ripple.className = 'ripple-effect';
            ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                pointer-events: none;
            `;

            // Asegurar posicionamiento relativo
            const originalPosition = getComputedStyle(element).position;
            if (originalPosition === 'static') {
                element.style.position = 'relative';
            }
            element.style.overflow = 'hidden';

            element.appendChild(ripple);

            // Limpieza automática
            setTimeout(() => {
                ripple.remove();
                if (originalPosition === 'static') {
                    element.style.position = '';
                }
            }, 600);
        }
    };

    // ========================================================================
    // 🌟 GLOW HOVER - Brillo ambiental en hover
    // ========================================================================

    App.FX.Glow = {
        glowColor: 'rgba(0, 180, 216, 0.12)',

        init() {
            const elements = document.querySelectorAll(`
                .kpi-comparison-card,
                .bi-chart-container,
                .map-btn,
                .elite-btn,
                .stats-box
            `);

            elements.forEach(el => {
                el.addEventListener('mouseenter', () => this.addGlow(el));
                el.addEventListener('mouseleave', () => this.removeGlow(el));
            });

            console.log('✨ FX.Glow initialized');
        },

        addGlow(element) {
            element.style.boxShadow = `
                0 0 40px ${this.glowColor},
                0 8px 32px rgba(0, 0, 0, 0.25),
                0 0 0 1px rgba(255, 255, 255, 0.04) inset
            `;
        },

        removeGlow(element) {
            element.style.boxShadow = '';
        }
    };

    // ========================================================================
    // 🎯 LOT TOOLTIP INTEGRATION - Conectar con datos de lotes
    // ========================================================================

    App.FX.LotTooltips = {
        init() {
            const svg = document.querySelector('#mapSvg, .map-svg, svg');
            if (!svg) return;

            svg.addEventListener('mousemove', (e) => {
                const lot = e.target.closest('[id^="0"], [id^="1"], [id^="2"], [id^="3"], [id^="4"], [id^="5"], [id^="6"], [id^="7"], [id^="8"], [id^="9"]');

                if (lot && App.State?.lotesMap?.has(lot.id)) {
                    const data = App.State.lotesMap.get(lot.id);
                    const content = this.formatTooltip(data);
                    App.FX.InertiaTooltip.show(content, e.clientX, e.clientY);
                } else {
                    App.FX.InertiaTooltip.updatePosition(e.clientX, e.clientY);
                }
            });

            svg.addEventListener('mouseleave', () => {
                App.FX.InertiaTooltip.hide();
            });

            console.log('✨ FX.LotTooltips initialized');
        },

        formatTooltip(data) {
            const area = data._parsedArea ? data._parsedArea.toLocaleString('es-DO') : 'N/A';
            const estado = data.estado || 'Sin estado';
            const estadoColor = this.getEstadoColor(estado);

            return `
                <div style="font-weight: 600; color: #00b4d8; margin-bottom: 6px; font-size: 14px;">
                    ${data.id}
                </div>
                <div style="display: grid; gap: 3px; font-size: 12px; color: rgba(203, 213, 225, 0.9);">
                    <div><span style="color: rgba(148, 163, 184, 0.7);">Tipo:</span> ${data.tipo || 'N/A'}</div>
                    <div><span style="color: rgba(148, 163, 184, 0.7);">Área:</span> <span style="font-family: 'JetBrains Mono', monospace;">${area}</span> m²</div>
                    <div><span style="color: rgba(148, 163, 184, 0.7);">Estado:</span> <span style="color: ${estadoColor};">${estado}</span></div>
                </div>
            `;
        },

        getEstadoColor(estado) {
            const colors = {
                'Terminado': '#22c55e',
                'En construcción': '#3b82f6',
                'Disponible': '#a3e635',
                'Paralizado': '#f87171'
            };
            return colors[estado] || '#94a3b8';
        }
    };

    // ========================================================================
    // 🎬 ENTRANCE ANIMATIONS - Animaciones de entrada escalonadas
    // ========================================================================

    App.FX.Entrance = {
        init() {
            // Animar grupos con delay escalonado
            this.stagger('.filter-group', 60);
            this.stagger('.kpi-comparison-card', 100);
            this.stagger('.elite-toolbar button, .elite-toolbar .map-btn', 40);

            console.log('✨ FX.Entrance initialized');
        },

        stagger(selector, delay) {
            const elements = document.querySelectorAll(selector);

            elements.forEach((el, index) => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(15px)';
                el.style.transition = `opacity 0.45s cubic-bezier(0.16, 1, 0.3, 1), 
                                       transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)`;

                setTimeout(() => {
                    el.style.opacity = '1';
                    el.style.transform = 'translateY(0)';
                }, index * delay + 100);
            });
        }
    };

    // ========================================================================
    // 🚀 MASTER INITIALIZER
    // ========================================================================

    App.FX.init = function () {
        console.log('🎬 Initializing Elite FX Suite...');

        // Esperar a que el DOM esté completamente cargado
        const setup = () => {
            try {
                // Inicializar todos los efectos
                App.FX.InertiaTooltip.init();
                App.FX.Ripple.init();

                // Efectos que requieren el DOM completo
                setTimeout(() => {
                    App.FX.Tilt.init();
                    App.FX.Glow.init();
                    App.FX.LotTooltips.init();
                    App.FX.Entrance.init();
                }, 300);

                console.log('✅ Elite FX Suite Ready');
            } catch (error) {
                console.error('Elite FX Error:', error);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setup);
        } else {
            setup();
        }
    };

    // Auto-inicializar
    App.FX.init();

})();

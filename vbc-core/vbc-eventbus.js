/**
 * ====================================================================
 * VBC-CORE: EventBus Engine (Sistema de Eventos Desacoplado)
 * Fideicomiso VBC - Sistema de Gestión Territorial
 * Previene colisiones de listeners, double-binding y fugas de memoria.
 * ====================================================================
 */

(function (window) {
    'use strict';

    window.VBC = window.VBC || {};

    class EventBus {
        constructor() {
            this.events = new Map();
        }

        /**
         * Suscribir un listener a un evento
         * @param {string} event - Nombre del evento (ej: 'lot:selected')
         * @param {Function} callback - Función a ejecutar
         * @returns {Function} Función para cancelar la suscripción
         */
        on(event, callback) {
            if (!this.events.has(event)) {
                this.events.set(event, new Set());
            }
            this.events.get(event).add(callback);

            return () => this.off(event, callback);
        }

        /**
         * Suscribir un listener que se ejecuta solo una vez
         */
        once(event, callback) {
            const wrapper = (...args) => {
                this.off(event, wrapper);
                callback(...args);
            };
            return this.on(event, wrapper);
        }

        /**
         * Desuscribir un callback de un evento
         */
        off(event, callback) {
            if (this.events.has(event)) {
                this.events.get(event).delete(callback);
                if (this.events.get(event).size === 0) {
                    this.events.delete(event);
                }
            }
        }

        /**
         * Emitir un evento con datos asociados
         */
        emit(event, ...data) {
            if (this.events.has(event)) {
                this.events.get(event).forEach(cb => {
                    try {
                        cb(...data);
                    } catch (err) {
                        console.error(`❌ Error en listener de evento [${event}]:`, err);
                    }
                });
            }
        }

        /**
         * Limpiar todos los eventos registrados
         */
        clear() {
            this.events.clear();
        }
    }

    window.VBC.EventBus = new EventBus();

})(window);

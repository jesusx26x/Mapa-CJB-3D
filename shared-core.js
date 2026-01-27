/**
 * ============================================
 * SISTEMA VBC - SHARED CORE
 * Código compartido entre CPAG y CJB
 * ============================================
 * 
 * Este archivo contiene funcionalidades comunes:
 * - Parseo de CSV
 * - Normalización de datos
 * - Validación de datos
 * - Sistema de backup
 * - Utilidades compartidas
 */

const VBC = {
    version: '1.0.0',

    // ==========================================
    // CSV PARSING
    // ==========================================
    CSV: {
        /**
         * Parse CSV text into array of objects
         * Handles quoted fields and multiline values
         */
        parse(text) {
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
                return obj;
            });
        },

        /**
         * Convert array of objects back to CSV string
         */
        stringify(data) {
            if (!data || data.length === 0) return '';

            const headers = Object.keys(data[0]);
            const csvRows = [headers.join(',')];

            data.forEach(row => {
                const values = headers.map(h => {
                    const val = String(row[h] || '');
                    // Quote if contains comma, newline, or quotes
                    if (val.includes(',') || val.includes('\n') || val.includes('"')) {
                        return '"' + val.replace(/"/g, '""') + '"';
                    }
                    return val;
                });
                csvRows.push(values.join(','));
            });

            return csvRows.join('\n');
        }
    },

    // ==========================================
    // DATA NORMALIZATION
    // ==========================================
    Normalize: {
        /**
         * Normalize tipo field from uppercase CSV to expected format
         */
        tipo(rawTipo) {
            if (!rawTipo) return 'Desconocido';

            const tipoMap = {
                'HABITACIONAL': 'Habitacional',
                'COMERCIAL': 'Comercial',
                'INSTITUCIONAL': 'Institucional',
                'AREA VERDE': 'Área Verde',
                'INFRAESTRUCTURA': 'Infraestructura',
                'EQUIPAMIENTO': 'Equipamiento'
            };

            const upperTipo = rawTipo.toUpperCase().trim();
            return tipoMap[upperTipo] || rawTipo;
        },

        /**
         * Parse area string to number (handles comma separators)
         */
        area(str) {
            if (!str) return 0;
            // Remove m², commas, and other non-numeric chars except dot
            const cleaned = str.replace(/,/g, '').replace(/[^0-9.]/g, '');
            return parseFloat(cleaned) || 0;
        },

        /**
         * Parse year from various date formats
         */
        year(str) {
            if (!str) return null;
            // Format: YYYY
            if (str.match(/^\d{4}$/)) return parseInt(str);
            // Format: DD/MM/YYYY
            const parts = str.split('/');
            if (parts.length === 3) return parseInt(parts[2]);
            return null;
        },

        /**
         * Extract cuadrante/manzana/lote from ID
         */
        parseId(id) {
            if (!id) return { cuadrante: '', manzana: '', lote: '' };
            const parts = id.split('-');
            return {
                cuadrante: parts[0] || '',
                manzana: parts[1] || '',
                lote: parts[2] || ''
            };
        }
    },

    // ==========================================
    // DATA VALIDATION
    // ==========================================
    Validate: {
        /**
         * Validate a single lote record
         * Returns { valid: boolean, errors: string[], warnings: string[] }
         */
        lote(lote) {
            const errors = [];
            const warnings = [];

            // Required: ID
            if (!lote.id) {
                errors.push('ID es requerido');
            } else if (!lote.id.match(/^(\d{2}-\d{2}-\d{2}|[Cc]-\d{1,2})$/)) {
                warnings.push(`ID "${lote.id}" tiene formato no estándar`);
            }

            // Required: tipo
            if (!lote.tipo) {
                warnings.push('Tipo no especificado');
            }

            // Optional but recommended
            if (!lote.area_m2) {
                warnings.push('Área no especificada');
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings
            };
        },

        /**
         * Validate entire dataset
         * Returns summary with counts and issues
         */
        dataset(lotes) {
            const summary = {
                total: lotes.length,
                valid: 0,
                invalid: 0,
                withWarnings: 0,
                errors: [],
                warnings: []
            };

            lotes.forEach((lote, index) => {
                const result = this.lote(lote);

                if (result.valid) {
                    summary.valid++;
                } else {
                    summary.invalid++;
                    result.errors.forEach(e => {
                        summary.errors.push(`Fila ${index + 2}: ${e}`);
                    });
                }

                if (result.warnings.length > 0) {
                    summary.withWarnings++;
                    // Only log first 10 warnings to avoid spam
                    if (summary.warnings.length < 10) {
                        result.warnings.forEach(w => {
                            summary.warnings.push(`Fila ${index + 2} (${lote.id || 'sin ID'}): ${w}`);
                        });
                    }
                }
            });

            return summary;
        },

        /**
         * Log validation results to console
         */
        logResults(summary, mapName) {
            console.log(`\n📊 Validación de datos - ${mapName}`);
            console.log(`   Total: ${summary.total} registros`);
            console.log(`   ✅ Válidos: ${summary.valid}`);

            if (summary.invalid > 0) {
                console.warn(`   ❌ Inválidos: ${summary.invalid}`);
                summary.errors.forEach(e => console.error(`      ${e}`));
            }

            if (summary.withWarnings > 0) {
                console.warn(`   ⚠️ Con advertencias: ${summary.withWarnings}`);
                summary.warnings.forEach(w => console.warn(`      ${w}`));
                if (summary.withWarnings > 10) {
                    console.warn(`      ... y ${summary.withWarnings - 10} más`);
                }
            }
        }
    },

    // ==========================================
    // BACKUP SYSTEM
    // ==========================================
    Backup: {
        /**
         * Create backup of data in localStorage
         */
        save(key, data) {
            try {
                const backup = {
                    timestamp: new Date().toISOString(),
                    version: VBC.version,
                    data: data
                };
                localStorage.setItem(`vbc_backup_${key}`, JSON.stringify(backup));
                console.log(`💾 Backup guardado: ${key} (${data.length} registros)`);
                return true;
            } catch (e) {
                console.error('Error guardando backup:', e);
                return false;
            }
        },

        /**
         * Load backup from localStorage
         */
        load(key) {
            try {
                const stored = localStorage.getItem(`vbc_backup_${key}`);
                if (!stored) return null;

                const backup = JSON.parse(stored);
                console.log(`📂 Backup cargado: ${key} (${backup.timestamp})`);
                return backup;
            } catch (e) {
                console.error('Error cargando backup:', e);
                return null;
            }
        },

        /**
         * List all available backups
         */
        list() {
            const backups = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('vbc_backup_')) {
                    try {
                        const backup = JSON.parse(localStorage.getItem(key));
                        backups.push({
                            key: key.replace('vbc_backup_', ''),
                            timestamp: backup.timestamp,
                            records: backup.data?.length || 0
                        });
                    } catch (e) { }
                }
            }
            return backups;
        },

        /**
         * Delete a specific backup
         */
        delete(key) {
            localStorage.removeItem(`vbc_backup_${key}`);
            console.log(`🗑️ Backup eliminado: ${key}`);
        },

        /**
         * Export backup as downloadable file
         */
        export(key, filename) {
            const backup = this.load(key);
            if (!backup) {
                console.error('Backup no encontrado');
                return;
            }

            const csvContent = VBC.CSV.stringify(backup.data);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename || `backup_${key}_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
        }
    },

    // ==========================================
    // COLOR UTILITIES
    // ==========================================
    Colors: {
        byTipo: {
            'Habitacional': '#00a8ff',
            'Comercial': '#f59e0b',
            'Institucional': '#a855f7',
            'Equipamiento': '#10b981',
            'Área Verde': '#22c55e',
            'Infraestructura': '#64748b',
            'Desconocido': '#475569'
        },

        get(tipo) {
            return this.byTipo[tipo] || this.byTipo['Desconocido'];
        }
    },

    // ==========================================
    // FORMAT UTILITIES
    // ==========================================
    Format: {
        /**
         * Format number with locale separators
         */
        number(num, locale = 'es-DO') {
            return (num || 0).toLocaleString(locale);
        },

        /**
         * Format area with m² suffix
         */
        area(num, locale = 'es-DO') {
            return this.number(num, locale) + ' m²';
        },

        /**
         * Format date to locale string
         */
        date(str) {
            if (!str) return '-';
            const parts = str.split('/');
            if (parts.length === 3) {
                return `${parts[0]}/${parts[1]}/${parts[2]}`;
            }
            return str;
        }
    }
};

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VBC;
}

console.log(`✅ VBC Shared Core v${VBC.version} cargado`);

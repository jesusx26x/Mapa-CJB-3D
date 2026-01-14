/**
 * AVANCE LOTES COMPLETION BADGE
 * ==============================
 * This file contains the code for the completion percentage badge feature.
 * To re-implement, copy the relevant sections back into evolucion.html.
 */

/* ============================================
   CSS STYLES (Add to <style> section)
   ============================================ */

/*
.completion-badge {
    position: absolute;
    top: 10px;
    right: 20px;
    background: rgba(10, 22, 40, 0.9);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 15px 20px;
    text-align: center;
    z-index: 40;
    min-width: 120px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
    transition: all 0.3s ease;
}

body.comparison-active .completion-badge {
    opacity: 0;
    pointer-events: none;
}

.completion-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 5px;
}

.completion-value {
    font-size: 48px;
    font-weight: 800;
    background: linear-gradient(135deg, var(--secondary), var(--primary));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    line-height: 1;
}

.completion-sub {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 8px;
}

.completion-sub span {
    color: var(--primary);
    font-weight: 600;
}
*/


/* ============================================
   HTML MARKUP (Add inside .map-section)
   ============================================ */

/*
<!-- COMPLETION KPI BADGE -->
<div class="completion-badge">
    <div class="completion-label">Avance Lotes</div>
    <div class="completion-value" id="completionPct">0%</div>
    <div class="completion-sub"><span id="completedCount">0</span> de <span id="totalCount">0</span></div>
</div>
*/


/* ============================================
   JAVASCRIPT FUNCTIONS (Add to <script>)
   ============================================ */

/*
function getCompletionStats(year) {
    // Count total lots (excluding infrastructure/vial which are roads)
    let totalLots = 0;
    let completedLots = 0;

    lotesData.forEach(l => {
        const type = (l.tipo || '').toLowerCase();
        // Skip infrastructure/vial - they are roads, not 'lots'
        if (type.includes('infra')) return;
        
        totalLots++;
        
        const status = (l.estado || '').toLowerCase();
        const y = extractYear(l['Fecha entrega']);
        
        if ((status.includes('terminado') || status.includes('terminación')) && y && y <= year) {
            completedLots++;
        }
    });

    const pct = totalLots > 0 ? Math.round((completedLots / totalLots) * 100) : 0;
    return { completed: completedLots, total: totalLots, percentage: pct };
}
*/


/* ============================================
   UPDATE UI INTEGRATION
   ============================================
   
   Add this code at the end of updateUI() and updateManagementView():
   
   // Update Completion Badge
   const comp = getCompletionStats(year);
   document.getElementById('completionPct').innerText = comp.percentage + '%';
   document.getElementById('completedCount').innerText = comp.completed;
   document.getElementById('totalCount').innerText = comp.total;
   
*/

const API = '';
const POLL_MS = 8000;

let weeks = [];
let selectedWeekId = null;
let currentView = 'overview'; // 'week' | 'overview'
let firstLoad = true; // Las gráficas solo se animan en la primera carga completa
let breakdownChart = null;
let mixChart = null;
let trendChart = null;
let ovMixChart = null;
let attendanceChart = null;

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Number(n).toLocaleString('en-US');
const renderChart = (chart) => chart.update(firstLoad ? undefined : 'none');

const MIX_COLORS = ['#f5b942', '#38bdf8', '#a78bfa', '#fb7185', '#52525b'];
const MIX_LABELS = ['Popcorn', 'Snowcones', "Polly's Pop", 'Pioneer', 'Others'];

function initCharts() {
    const barCtx = document.getElementById('breakdownChart').getContext('2d');
    breakdownChart = new Chart(barCtx, {
        type: 'bar',
        data: { labels: [], datasets: [] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#18181b',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    titleColor: '#fafafa',
                    bodyColor: '#a1a1aa',
                    padding: 10,
                    callbacks: {
                        label: (ctx) => `$${fmt(ctx.parsed.y)}`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#71717a', font: { family: 'Inter' } } },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: {
                        color: '#71717a',
                        font: { family: 'Inter' },
                        callback: (val) => `$${fmtInt(val)}`
                    }
                }
            }
        }
    });

    const donutCtx = document.getElementById('mixChart').getContext('2d');
    mixChart = new Chart(donutCtx, {
        type: 'doughnut',
        data: { labels: MIX_LABELS, datasets: [{ data: [], backgroundColor: MIX_COLORS, borderWidth: 0 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '76%',
            plugins: { legend: { display: false } }
        }
    });

    const trendCtx = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(trendCtx, {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.05)', fill: true, tension: 0.3, borderWidth: 2, pointRadius: 4, pointBackgroundColor: '#34d399' }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#71717a', font: { family: 'Inter' } } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#71717a', font: { family: 'Inter' } } }
            }
        }
    });

    const ovDonutCtx = document.getElementById('ovMixChart').getContext('2d');
    ovMixChart = new Chart(ovDonutCtx, {
        type: 'doughnut',
        data: { labels: MIX_LABELS, datasets: [{ data: [], backgroundColor: MIX_COLORS, borderWidth: 0 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '76%',
            plugins: { legend: { display: false } }
        }
    });

    const attCtx = document.getElementById('attendanceChart').getContext('2d');
    attendanceChart = new Chart(attCtx, {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: '#60a5fa', borderRadius: 4, barThickness: 24 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: '#71717a', font: { family: 'Inter' } } },
                y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#71717a', font: { family: 'Inter' } } }
            }
        }
    });
}

async function fetchWeeks() {
    const res = await fetch(`${API}/api/weeks`);
    if (!res.ok) throw new Error('API server down');
    
    // CORRECCIÓN CRÍTICA: Mapeamos correctamente la propiedad .weeks del JSON del backend
    const data = await res.json();
    weeks = data.weeks || [];
    
    if (!weeks.length) {
        showEmpty();
        return;
    }

    renderSidebar();

    if (selectedWeekId === null && currentView === 'week') {
        selectedWeekId = weeks[0].id;
    }
    
    if (currentView === 'overview') {
        await loadOverview();
    } else {
        await loadWeek(selectedWeekId);
    }
}

async function backgroundRefresh() {
    try {
        const res = await fetch(`${API}/api/weeks`);
        if (res.ok) {
            const data = await res.json();
            weeks = data.weeks || [];
            if (weeks.length) {
                renderSidebar();
                if (currentView === 'overview') {
                    // Refresco silencioso de datos
                    const ovRes = await fetch(`${API}/api/overview`);
                    if (ovRes.ok) {
                        const ovData = await ovRes.json();
                        updateOverviewDataOnly(ovData);
                    }
                } else {
                    const wRes = await fetch(`${API}/api/weeks/${selectedWeekId}`);
                    if (wRes.ok) {
                        const wData = await wRes.json();
                        updateDashboardDataOnly(wData);
                    }
                }
            }
        }
    } catch (e) {
        console.log("Silent sync paused:", e.message);
    }
}

function renderSidebar() {
    const list = document.getElementById('week-list');
    list.innerHTML = weeks.map(w => {
        const activeClass = (currentView === 'week' && w.id === selectedWeekId) ? 'active' : '';
        return `
            <button class="week-item ${activeClass}" onclick="selectWeek('${w.id}')">
                <div class="week-item-top">
                    <span class="week-item-label">${w.label.split(' · ')[0]}</span>
                    <span class="week-tag">${w.category || '—'}</span>
                </div>
                <span class="week-item-date">${w.date}</span>
                <div class="week-item-meta">
                    <span class="week-item-revenue">$${fmt(w.revenue)}</span>
                    <span class="week-item-orders">${fmtInt(w.orders)} orders</span>
                </div>
            </button>
        `;
    }).join('');

    const ovBtn = document.getElementById('btn-overview');
    if (currentView === 'overview') {
        ovBtn.classList.add('active');
    } else {
        ovBtn.classList.remove('active');
    }
}

async function selectWeek(id) {
    currentView = 'week';
    selectedWeekId = id;
    renderSidebar();
    await loadWeek(id);
}

function selectOverview() {
    currentView = 'overview';
    selectedWeekId = null;
    renderSidebar();
    loadOverview();
}

async function loadOverview() {
    const res = await fetch(`${API}/api/overview`);
    if (!res.ok) return;
    const overview = await res.json();
    
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('overview-dashboard').classList.remove('hidden');
    
    updateOverviewDataOnly(overview);
}

function updateOverviewDataOnly(ov) {
    document.getElementById('week-eyebrow').textContent = `${ov.weeks_count} week${ov.weeks_count !== 1 ? 's' : ''} tracked`;
    document.getElementById('week-badge').textContent = 'All Weeks';
    document.getElementById('temp-badge').classList.add('hidden');

    const m = ov.metrics;
    const pct = ov.breakdown_pct;

    document.getElementById('ov-kpi-revenue').textContent = `$${fmt(m.total_revenue)}`;
    document.getElementById('ov-kpi-avg').textContent = `$${fmt(m.avg_revenue_per_week)} avg / week`;
    document.getElementById('ov-kpi-orders').textContent = fmtInt(m.total_orders);
    document.getElementById('ov-kpi-customers').textContent = fmtInt(m.total_customers);
    document.getElementById('ov-kpi-weeks').textContent = fmtInt(ov.weeks_count);

    document.getElementById('ov-stat-orders').textContent = fmtInt(m.total_orders);
    document.getElementById('ov-stat-units').textContent = fmtInt(m.total_units);
    document.getElementById('ov-stat-customers').textContent = fmtInt(m.total_customers);
    document.getElementById('ov-stat-avg-spend').textContent = `$${fmt(m.avg_spend_per_attendee)}`;
    document.getElementById('ov-stat-best').textContent = `${ov.best_week.label.split(' · ')[0]} · $${fmt(ov.best_week.revenue)}`;
    document.getElementById('ov-stat-worst').textContent = `${ov.worst_week.label.split(' · ')[0]} · $${fmt(ov.worst_week.revenue)}`;

    trendChart.data.labels = ov.trend.map((t) => t.label);
    trendChart.data.datasets[0].data = ov.trend.map((t) => t.revenue);
    renderChart(trendChart);

    attendanceChart.data.labels = ov.trend.map((t) => t.label);
    attendanceChart.data.datasets[0].data = ov.trend.map((t) => t.customers);
    renderChart(attendanceChart);

    const mixValues = [ov.breakdown.popcorn, ov.breakdown.snowcones, ov.breakdown.polly, ov.breakdown.pioneer, ov.breakdown.others];
    ovMixChart.data.datasets[0].data = mixValues;
    renderChart(ovMixChart);

    document.getElementById('ov-mix-center').textContent = fmtInt(mixValues.reduce((a, b) => a + b, 0));

    document.getElementById('ov-mix-legend').innerHTML = MIX_LABELS.map((label, i) => {
        const keys = ['popcorn', 'snowcones', 'polly', 'pioneer', 'others'];
        return `<div class="legend-item"><span class="legend-dot" style="background:${MIX_COLORS[i]}"></span><span class="legend-pct">${pct[keys[i]]}%</span><span class="legend-name">${label}</span></div>`;
    }).join('');

    document.getElementById('ov-product-count').textContent = `${ov.top_products.length} items`;
    const list = document.getElementById('ov-products-list');
    list.innerHTML = ov.top_products.map((p, i) => `
        <div class="product-row">
            <span class="product-rank">${String(i + 1).padStart(2, '0')}</span>
            <div class="product-info"><h4>${p.name}</h4><p>$${fmt(p.price)} per unit</p></div>
            <div class="product-revenue"><div class="amount">$${fmt(p.revenue)}</div><div class="units">${fmtInt(p.units)} sold</div></div>
        </div>
    `).join('');
}

async function loadWeek(weekId) {
    const res = await fetch(`${API}/api/weeks/${weekId}`);
    if (!res.ok) return;
    const week = await res.json();
    
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('overview-dashboard').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    
    updateDashboardDataOnly(week);
}

function updateDashboardDataOnly(week) {
    const m = week.metrics;
    const pct = week.breakdown_pct;

    document.getElementById('week-eyebrow').textContent = week.label;
    document.getElementById('week-badge').textContent = week.category || 'Uncategorized';

    const tempEl = document.getElementById('temp-badge');
    if (week.temperature) {
        tempEl.textContent = week.temperature;
        tempEl.classList.remove('hidden');
    } else {
        tempEl.classList.add('hidden');
    }

    document.getElementById('dl-csv').href = `${API}/api/export/${week.id}/csv`;
    document.getElementById('dl-json').href = `${API}/api/export/${week.id}/json`;

    document.getElementById('kpi-revenue').textContent = `$${fmt(m.total_revenue)}`;

    const growthEl = document.querySelector('.delta-value');
    const sign = m.revenue_growth >= 0 ? '+' : '';
    growthEl.textContent = `${sign}${m.revenue_growth}%`;
    growthEl.className = `delta-value ${m.revenue_growth >= 0 ? 'positive' : 'negative'}`;
    document.querySelector('.delta-context').textContent = `vs $${fmt(m.previous_week_revenue)} prev. week`;

    document.getElementById('kpi-orders').textContent = fmtInt(m.total_orders);
    document.getElementById('kpi-customers').textContent = fmtInt(m.total_customers);
    document.getElementById('kpi-avg-spend').textContent = `$${fmt(m.avg_spend_per_attendee)}`;

    // NUEVO: Cálculos exactos de gastos individuales para la tabla del Frontend
    const rawGlobal = week.raw.global;
    const attendance = Number(rawGlobal["Attendance"]) || 1;
    const popcornUnits = Number(rawGlobal["Popcorn"]) || 0;
    const snowconeUnits = Number(rawGlobal["Snowcones"]) || 0;

    // Asignación de métricas de Order Report
    document.getElementById('stat-orders').textContent = fmtInt(m.total_orders);
    document.getElementById('stat-units').textContent = fmtInt(m.product_units);
    document.getElementById('stat-popcorn').textContent = fmtInt(m.total_popcorn);
    document.getElementById('stat-snowcones').textContent = fmtInt(m.total_snowcones);
    
    document.getElementById('stat-popcorn-spend').textContent = `$${fmt(popcornUnits / attendance)}`;
    document.getElementById('stat-snowcone-spend').textContent = `$${fmt(snowconeUnits / attendance)}`;

    breakdownChart.data.labels = week.charts.labels;
    breakdownChart.data.datasets = [{
        data: week.charts.revenue_values,
        backgroundColor: MIX_COLORS,
        borderRadius: 4,
        barThickness: 32,
    }];
    renderChart(breakdownChart);

    mixChart.data.datasets[0].data = week.charts.values;
    renderChart(mixChart);

    document.getElementById('mix-center').textContent = fmtInt(week.charts.values.reduce((a, b) => a + b, 0));

    document.getElementById('mix-legend').innerHTML = MIX_LABELS.map((label, i) => {
        const keys = ['popcorn', 'snowcones', 'polly', 'pioneer', 'others'];
        return `<div class="legend-item"><span class="legend-dot" style="background:${MIX_COLORS[i]}"></span><span class="legend-pct">${pct[keys[i]]}%</span><span class="legend-name">${label}</span></div>`;
    }).join('');

    document.getElementById('product-count').textContent = `${week.top_products.length} items`;
    const list = document.getElementById('products-list');
    list.innerHTML = week.top_products.map((p, i) => `
        <div class="product-row">
            <span class="product-rank">${String(i + 1).padStart(2, '0')}</span>
            <div class="product-info"><h4>${p.name}</h4><p>$${fmt(p.price)} per unit</p></div>
            <div class="product-revenue"><div class="amount">$${fmt(p.revenue)}</div><div class="units">${fmtInt(p.units)} sold</div></div>
        </div>
    `).join('');
}

function showEmpty() {
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('overview-dashboard').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
}

async function refresh() {
    try {
        await fetchWeeks();
        document.getElementById('sync-status').textContent = `Synced · ${weeks.length} week${weeks.length !== 1 ? 's' : ''}`;
    } catch {
        document.getElementById('sync-status').textContent = 'Backend offline';
    } finally {
        firstLoad = false;
    }
}

document.getElementById('btn-refresh').addEventListener('click', refresh);
document.getElementById('btn-overview').addEventListener('click', selectOverview);

initCharts();
refresh();

// Sondeo silencioso automatizado en segundo plano cada 8 segundos
setInterval(backgroundRefresh, POLL_MS);

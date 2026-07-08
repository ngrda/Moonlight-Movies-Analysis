const API = 'http://127.0.0.1:5050';
const POLL_MS = 8000;

let weeks = [];
let selectedWeekId = null;
let currentView = 'week'; // 'week' | 'overview'
let breakdownChart = null;
let mixChart = null;
let trendChart = null;
let ovMixChart = null;
let attendanceChart = null;

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n) => Number(n).toLocaleString('en-US');

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
                    padding: 12,
                    callbacks: { label: (c) => ` $${fmt(c.raw)}` },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#71717a', font: { size: 11, family: 'Inter' } },
                    border: { display: false },
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#71717a', font: { size: 11 }, callback: (v) => '$' + v },
                    border: { display: false },
                },
            },
        },
    });

    const donutCtx = document.getElementById('mixChart').getContext('2d');
    mixChart = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
            labels: MIX_LABELS,
            datasets: [{ data: [], backgroundColor: MIX_COLORS, borderWidth: 0, hoverOffset: 4 }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '76%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#18181b',
                    callbacks: {
                        label: (c) => {
                            const total = c.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? ((c.raw / total) * 100).toFixed(1) : 0;
                            return ` $${fmt(c.raw)} (${pct}%)`;
                        },
                    },
                },
            },
        },
    });

    const trendCtx = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#34d399',
                backgroundColor: 'rgba(52,211,153,0.12)',
                pointBackgroundColor: '#34d399',
                pointBorderColor: '#34d399',
                pointRadius: 4,
                pointHoverRadius: 5,
                tension: 0.35,
                fill: true,
                borderWidth: 2,
            }],
        },
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
                    padding: 12,
                    callbacks: { label: (c) => ` $${fmt(c.raw)}` },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#71717a', font: { size: 11, family: 'Inter' } },
                    border: { display: false },
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#71717a', font: { size: 11 }, callback: (v) => '$' + v },
                    border: { display: false },
                },
            },
        },
    });

    const ovDonutCtx = document.getElementById('ovMixChart').getContext('2d');
    ovMixChart = new Chart(ovDonutCtx, {
        type: 'doughnut',
        data: {
            labels: MIX_LABELS,
            datasets: [{ data: [], backgroundColor: MIX_COLORS, borderWidth: 0, hoverOffset: 4 }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '76%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#18181b',
                    callbacks: {
                        label: (c) => {
                            const total = c.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total ? ((c.raw / total) * 100).toFixed(1) : 0;
                            return ` $${fmt(c.raw)} (${pct}%)`;
                        },
                    },
                },
            },
        },
    });

    const attCtx = document.getElementById('attendanceChart').getContext('2d');
    attendanceChart = new Chart(attCtx, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: '#60a5fa',
                borderRadius: 4,
                barThickness: 32,
            }],
        },
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
                    padding: 12,
                    callbacks: { label: (c) => ` ${fmtInt(c.raw)} attendees` },
                },
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#71717a', font: { size: 11, family: 'Inter' } },
                    border: { display: false },
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.04)' },
                    ticks: { color: '#71717a', font: { size: 11 } },
                    border: { display: false },
                },
            },
        },
    });
}

function renderWeekList() {
    const list = document.getElementById('week-list');

    if (!weeks.length) {
        list.innerHTML = '<p class="text-muted text-sm" style="padding:12px">No weeks available</p>';
        return;
    }

    list.innerHTML = weeks.map((w) => `
        <button class="week-item ${w.id === selectedWeekId ? 'active' : ''}" data-id="${w.id}">
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
    `).join('');

    list.querySelectorAll('.week-item').forEach((btn) => {
        btn.addEventListener('click', () => selectWeek(btn.dataset.id));
    });
}

async function fetchWeeks() {
    const res = await fetch(`${API}/api/weeks`);
    if (!res.ok) throw new Error('Failed to load weeks');
    const data = await res.json();
    const prevCount = weeks.length;
    weeks = data.weeks;

    if (!selectedWeekId && weeks.length) {
        selectedWeekId = weeks[weeks.length - 1].id;
    }

    if (weeks.length > prevCount && prevCount > 0) {
        selectedWeekId = weeks[weeks.length - 1].id;
        document.getElementById('sync-status').textContent = `New week detected · ${weeks.length} total`;
    }

    renderWeekList();

    if (currentView === 'overview') {
        await loadOverview();
    } else if (selectedWeekId) {
        await loadWeek(selectedWeekId);
    } else {
        showEmpty();
    }
}

async function loadOverview() {
    const res = await fetch(`${API}/api/overview`);
    if (!res.ok) throw new Error('Failed to load overview');
    const overview = await res.json();
    renderOverview(overview);
}

function selectOverview() {
    currentView = 'overview';
    selectedWeekId = null;
    document.getElementById('btn-overview').classList.add('active');
    renderWeekList();
    loadOverview();
}

function renderOverview(ov) {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('overview-dashboard').classList.remove('hidden');

    document.getElementById('week-eyebrow').textContent = `${ov.weeks_count} week${ov.weeks_count !== 1 ? 's' : ''} tracked`;
    document.getElementById('week-badge').textContent = 'All Weeks';
    document.getElementById('temp-badge').classList.add('hidden');
    document.getElementById('dl-csv').href = `${API}/api/export/all/csv`;
    document.getElementById('dl-json').classList.add('hidden');

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
    trendChart.update();

    attendanceChart.data.labels = ov.trend.map((t) => t.label);
    attendanceChart.data.datasets[0].data = ov.trend.map((t) => t.customers);
    attendanceChart.update();

    const mixValues = [ov.breakdown.popcorn, ov.breakdown.snowcones, ov.breakdown.polly, ov.breakdown.pioneer, ov.breakdown.others];
    ovMixChart.data.datasets[0].data = mixValues;
    ovMixChart.update();

    document.getElementById('ov-mix-center').textContent = `$${fmt(m.total_revenue)}`;

    document.getElementById('ov-mix-legend').innerHTML = MIX_LABELS.slice(0, 3).map((label, i) => {
        const keys = ['popcorn', 'polly', 'pioneer'];
        return `<div class="legend-item"><span class="legend-dot" style="background:${MIX_COLORS[i]}"></span><span class="legend-pct">${pct[keys[i]]}%</span><span class="legend-name">${label}</span></div>`;
    }).join('');

    document.getElementById('ov-product-count').textContent = `${ov.top_products.length} items`;

    const list = document.getElementById('ov-products-list');
    if (!ov.top_products.length) {
        list.innerHTML = '<p class="text-muted text-sm">No product sales recorded</p>';
        return;
    }

    list.innerHTML = ov.top_products.map((p, i) => `
        <div class="product-row">
            <span class="product-rank">${String(i + 1).padStart(2, '0')}</span>
            <div class="product-info">
                <h4>${p.name}</h4>
                <p>$${fmt(p.price)} per unit</p>
            </div>
            <div class="product-revenue">
                <div class="amount">$${fmt(p.revenue)}</div>
                <div class="units">${fmtInt(p.units)} sold</div>
            </div>
        </div>
    `).join('');
}

async function loadWeek(weekId) {
    const res = await fetch(`${API}/api/weeks/${weekId}`);
    if (!res.ok) throw new Error('Week not found');
    const week = await res.json();
    renderDashboard(week);
    updateDownloads(weekId);
}

function selectWeek(weekId) {
    currentView = 'week';
    selectedWeekId = weekId;
    document.getElementById('btn-overview').classList.remove('active');
    renderWeekList();
    loadWeek(weekId);
}

function updateDownloads(weekId) {
    document.getElementById('dl-csv').href = `${API}/api/export/${weekId}/csv`;
    document.getElementById('dl-json').href = `${API}/api/export/${weekId}/json`;
    document.getElementById('dl-json').classList.remove('hidden');
}

function renderDashboard(week) {
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('overview-dashboard').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');

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

    document.getElementById('kpi-revenue').textContent = `$${fmt(m.total_revenue)}`;

    const growthEl = document.querySelector('.delta-value');
    const sign = m.revenue_growth >= 0 ? '+' : '';
    growthEl.textContent = `${sign}${m.revenue_growth}%`;
    growthEl.className = `delta-value ${m.revenue_growth >= 0 ? 'positive' : 'negative'}`;
    document.querySelector('.delta-context').textContent = `vs $${fmt(m.previous_week_revenue)} prev. week`;

    document.getElementById('kpi-orders').textContent = fmtInt(m.total_orders);
    document.getElementById('kpi-customers').textContent = fmtInt(m.total_customers);
    document.getElementById('kpi-avg-spend').textContent = `$${fmt(m.avg_spend_per_attendee)}`;

    document.getElementById('stat-orders').textContent = fmtInt(m.total_orders);
    document.getElementById('stat-units').textContent = fmtInt(m.product_units);
    document.getElementById('stat-customers').textContent = fmtInt(m.total_customers);
    document.getElementById('stat-popcorn').textContent = fmtInt(m.total_popcorn);
    document.getElementById('stat-snowcones').textContent = fmtInt(m.total_snowcones);
    document.getElementById('stat-deliveries').textContent = fmtInt(m.total_deliveries);

    breakdownChart.data.labels = week.charts.labels;
    breakdownChart.data.datasets = [{
        data: week.charts.values,
        backgroundColor: MIX_COLORS,
        borderRadius: 4,
        barThickness: 32,
    }];
    breakdownChart.update();

    mixChart.data.datasets[0].data = week.charts.values;
    mixChart.update();

    document.getElementById('mix-center').textContent = `$${fmt(m.total_revenue)}`;

    document.getElementById('mix-legend').innerHTML = MIX_LABELS.slice(0, 3).map((label, i) => {
        const keys = ['popcorn', 'polly', 'pioneer'];
        return `<div class="legend-item"><span class="legend-dot" style="background:${MIX_COLORS[i]}"></span><span class="legend-pct">${pct[keys[i]]}%</span><span class="legend-name">${label}</span></div>`;
    }).join('');

    document.getElementById('product-count').textContent = `${week.top_products.length} items`;

    const list = document.getElementById('products-list');
    if (!week.top_products.length) {
        list.innerHTML = '<p class="text-muted text-sm">No product sales this week</p>';
        return;
    }

    list.innerHTML = week.top_products.map((p, i) => `
        <div class="product-row">
            <span class="product-rank">${String(i + 1).padStart(2, '0')}</span>
            <div class="product-info">
                <h4>${p.name}</h4>
                <p>$${fmt(p.price)} per unit</p>
            </div>
            <div class="product-revenue">
                <div class="amount">$${fmt(p.revenue)}</div>
                <div class="units">${fmtInt(p.units)} sold</div>
            </div>
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
    }
}

document.getElementById('btn-refresh').addEventListener('click', refresh);
document.getElementById('btn-overview').addEventListener('click', selectOverview);

initCharts();
refresh();
setInterval(refresh, POLL_MS);

// Initialize Lucide icons
if (typeof lucide !== 'undefined') {
    lucide.createIcons();
}

// State
let rawGlobalData = [];
let globalData = [];
let currentView = 'dashboard';
let lockedComercial = null;

// IndexedDB Persistence
const DB_NAME = 'SalesDB_v4';
const STORE_NAME = 'salesStore';

function saveToDB(data) {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };
    request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({ id: 1, data: data });
    };
}

function updateMonthFilter() {
    let allMonthsSet = new Set(rawGlobalData.map(d => d.mes));
    const monthSelect = document.getElementById('monthFilter');
    if (!monthSelect) return;
    monthSelect.innerHTML = '<option value="ALL">Todos los Meses</option>';
    monthSelect.innerHTML += '<option value="LAST_2">Últimos 2 Meses</option>';
    monthSelect.innerHTML += '<option value="LAST_3">Últimos 3 Meses</option>';
    monthSelect.innerHTML += '<option value="LAST_6">Últimos 6 Meses</option>';
    Array.from(allMonthsSet).sort().forEach(m => {
        monthSelect.innerHTML += `<option value="${m}">${m}</option>`;
    });
    monthSelect.classList.remove('hidden');
}

function loadFromDB() {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
    };
    request.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) return;
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const getReq = store.get(1);
        getReq.onsuccess = () => {
            if (getReq.result && getReq.result.data && getReq.result.data.length > 0) {
                rawGlobalData = getReq.result.data;
                rawGlobalData.forEach(r => {
                    if (r.transporte && !r.comercial) r.comercial = r.transporte;
                });

                if (lockedComercial) {
                    rawGlobalData = rawGlobalData.filter(r => r.comercial && r.comercial.includes(`(${lockedComercial})`));
                }

                globalData = [...rawGlobalData];
                updateMonthFilter();
                
                const dataStatus = document.getElementById('data-status');
                if (dataStatus) {
                    dataStatus.textContent = `Datos Cargados (${globalData.length} filas)`;
                    dataStatus.className = 'status-badge loaded';
                }
                const btnClear = document.getElementById('btnClearData');
                const btnExport = document.getElementById('btnExportRemote');
                const uploadOverlay = document.getElementById('uploadOverlay');
                if (btnClear) btnClear.classList.remove('hidden');
                if (btnExport) btnExport.classList.remove('hidden');
                if (uploadOverlay) uploadOverlay.classList.add('hidden');
                if (views[currentView]) views[currentView].classList.remove('hidden');
                renderDashboard();
            }
        };
    };
}

document.addEventListener('DOMContentLoaded', () => {
    loadFromDB();
    checkRemoteData(); 
    
    const btnClear = document.getElementById('btnClearData');
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if(confirm('¿Estás seguro de que deseas borrar todos los datos cargados?')) {
                rawGlobalData = [];
                globalData = [];
                const request = indexedDB.open(DB_NAME, 1);
                request.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction(STORE_NAME, 'readwrite');
                    const store = tx.objectStore(STORE_NAME);
                    store.clear();
                };
                const monthFilter = document.getElementById('monthFilter');
                if (monthFilter) monthFilter.classList.add('hidden');
                btnClear.classList.add('hidden');
                
                const dataStatus = document.getElementById('data-status');
                if (dataStatus) {
                    dataStatus.textContent = 'Esperando datos...';
                    dataStatus.className = 'status-badge empty';
                }
                const uploadOverlay = document.getElementById('uploadOverlay');
                if (uploadOverlay) uploadOverlay.classList.remove('hidden');
                
                document.querySelectorAll('.sidebar nav a').forEach(l => l.classList.remove('active'));
                const dashNav = document.querySelector(`[data-view="dashboard"]`);
                if (dashNav) dashNav.classList.add('active');
                Object.values(views).forEach(v => {
                    if (v) v.classList.add('hidden');
                });
            }
        });
    }
    
    const btnExport = document.getElementById('btnExportRemote');
    if (btnExport) {
        btnExport.addEventListener('click', exportDataForMobile);
    }
});

const REMOTE_DATA_URL = './data.json';

async function checkRemoteData() {
    try {
        const response = await fetch(REMOTE_DATA_URL + '?t=' + new Date().getTime());
        if (response.ok) {
            const remoteData = await response.json();
            if (remoteData && remoteData.length > 0) {
                rawGlobalData = remoteData;
                if (lockedComercial) {
                    rawGlobalData = rawGlobalData.filter(r => r.comercial && r.comercial.includes(`(${lockedComercial})`));
                }
                globalData = [...rawGlobalData];
                updateMonthFilter();
                
                const dataStatus = document.getElementById('data-status');
                if (dataStatus) {
                    dataStatus.textContent = `Datos Sincronizados (${globalData.length} filas)`;
                    dataStatus.className = 'status-badge loaded';
                }
                const uploadOverlay = document.getElementById('uploadOverlay');
                if (uploadOverlay) uploadOverlay.classList.add('hidden');
                
                const btnClear = document.getElementById('btnClearData');
                const btnExport = document.getElementById('btnExportRemote');
                if (btnClear) btnClear.classList.remove('hidden');
                if (btnExport) btnExport.classList.remove('hidden');
                if (views[currentView]) views[currentView].classList.remove('hidden');
                renderDashboard();
                saveToDB(rawGlobalData);
            }
        }
    } catch (err) {
        console.log('No hay datos remotos o error al cargarlos:', err);
    }
}

function exportDataForMobile() {
    if (rawGlobalData.length === 0) return;
    
    const dataStr = JSON.stringify(rawGlobalData);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('Archivo data.json descargado. Súbelo a tu repositorio de GitHub para actualizar a los comerciales.');
}

// DOM Elements & Views
const views = {
    dashboard: document.getElementById('dashboardView'),
    'client-search': document.getElementById('clientSearchView'),
    comercial: document.getElementById('comercialView'),
    mix: document.getElementById('mixView')
};

// Nav links
document.querySelectorAll('.sidebar nav a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.getAttribute('data-view');
        switchView(view);
    });
});

function switchView(viewName) {
    currentView = viewName;
    document.querySelectorAll('.sidebar nav a').forEach(l => l.classList.remove('active'));
    const activeNav = document.querySelector(`[data-view="${viewName}"]`);
    if (activeNav) activeNav.classList.add('active');
    
    Object.values(views).forEach(v => {
        if (v) v.classList.add('hidden');
    });
    
    const uploadOverlay = document.getElementById('uploadOverlay');
    if (globalData.length > 0) {
        if (uploadOverlay) uploadOverlay.classList.add('hidden');
        if (views[viewName]) views[viewName].classList.remove('hidden');
    } else {
        if (uploadOverlay) uploadOverlay.classList.remove('hidden');
    }
}

// Drag & Drop Handlers
const uploadBox = document.querySelector('.upload-box');
const fileInput = document.getElementById('fileInput');

if (uploadBox) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadBox.addEventListener(eventName, preventDefaults, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadBox.addEventListener(eventName, () => uploadBox.classList.add('dragover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadBox.addEventListener(eventName, () => uploadBox.classList.remove('dragover'), false);
    });

    uploadBox.addEventListener('drop', (e) => {
        let dt = e.dataTransfer;
        let files = dt.files;
        handleFiles(files);
    });
}

if (fileInput) {
    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        const dataStatus = document.getElementById('data-status');
        if (dataStatus) {
            dataStatus.textContent = 'Procesando...';
            dataStatus.className = 'status-badge empty';
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            processExcel(data);
        };
        reader.readAsArrayBuffer(file);
    }
}

function normalizeHeader(header) {
    if (!header) return '';
    return header.toString().toLowerCase().trim()
        .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u')
        .replace(/\./g, '');
}

function findCol(headers, possibleNames) {
    for (let i = 0; i < headers.length; i++) {
        const h = normalizeHeader(headers[i]);
        for (let name of possibleNames) {
            if (h.includes(normalizeHeader(name))) return i;
        }
    }
    return -1;
}

// PROCESAMIENTO DINÁMICO CORREGIDO PARA EVITAR CEROS
function processExcel(data) {
    try {
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (jsonData.length < 2) throw new Error("El archivo está vacío o no tiene encabezados.");

        const headers = jsonData[0];
        
        const colFecha = findCol(headers, ['Fecha de emisión', 'Fecha', 'Emision']);
        const colFactura = findCol(headers, ['Nro. comprobante', 'Comprobante', 'Factura', 'Nro']);
        const colComercialCode = findCol(headers, ['Cód. vendedor', 'Codigo vendedor', 'Cod vendedor']);
        const colComercial = findCol(headers, ['Nombre Vendedor', 'Vendedor']);
        const colId = findCol(headers, ['Cód. cliente', 'Codigo cliente', 'Cod cliente']);
        const colCliente = findCol(headers, ['Razón social', 'Razon social', 'Cliente']);
        const colProd = findCol(headers, ['Descripción', 'Descripcion', 'Articulo', 'Producto']);
        const colCant = findCol(headers, ['Cantidad']);
        const colFact = findCol(headers, ['Total', 'Importe', 'Neto']);

        let validData = [];
        let monthsSet = new Set();
        
        for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i];
            if (!row || row.length === 0) continue;
            
            const fechaRaw = colFecha >= 0 ? row[colFecha] : null;
            const facturaVal = colFactura >= 0 ? row[colFactura] : null;

            if (!fechaRaw && !facturaVal) continue;
            
            const comercialRaw = colComercial >= 0 ? (row[colComercial] || '').toString().trim() : '';
            const comercialCode = colComercialCode >= 0 ? (row[colComercialCode] || '').toString().trim() : '';
            let nombreComercial = comercialRaw;
            
            if (comercialCode && !nombreComercial.includes(comercialCode)) {
                nombreComercial = `${comercialRaw} (${comercialCode})`;
            }
            
            if (!nombreComercial || nombreComercial.toLowerCase().includes('diego') || nombreComercial === '') {
                nombreComercial = 'Sin Asignar';
            }
            
            if (nombreComercial !== 'Sin Asignar') {
                let mes = 'Desconocido';
                if (fechaRaw) {
                    if (typeof fechaRaw === 'number') {
                        const d = new Date((fechaRaw - (25567 + 2)) * 86400 * 1000);
                        mes = d.toISOString().substring(0, 7);
                    } else {
                        mes = String(fechaRaw).substring(0, 7);
                    }
                }

                monthsSet.add(mes);

                validData.push({
                    comercial: nombreComercial,
                    id_cliente: colId >= 0 ? String(row[colId] || 'S/ID') : 'S/ID',
                    cliente: colCliente >= 0 ? String(row[colCliente] || 'Cliente Desconocido') : 'Cliente Desconocido',
                    localidad: 'Catamarca',
                    producto: colProd >= 0 ? String(row[colProd] || 'Producto Gral') : 'Producto Gral',
                    cantidad: colCant >= 0 ? parseFloat(row[colCant]) || 0 : 0,
                    facturacion: colFact >= 0 ? parseFloat(row[colFact]) || 0 : 0,
                    mes: mes,
                    factura: facturaVal ? String(facturaVal) : 'S/F',
                    fecha_raw: fechaRaw || 'S/F'
                });
            }
        }

        rawGlobalData = validData;
        globalData = [...rawGlobalData];
        
        saveToDB(rawGlobalData);
        
        const dataStatus = document.getElementById('data-status');
        if (globalData.length === 0) {
            alert("No se encontraron registros válidos. Verifica que las columnas del Excel coincidan.");
            if (dataStatus) dataStatus.textContent = 'Sin datos compatibles';
            return;
        }

        updateMonthFilter();

        if (dataStatus) {
            dataStatus.textContent = `Datos Cargados (${globalData.length} filas)`;
            dataStatus.className = 'status-badge loaded';
        }
        const btnClear = document.getElementById('btnClearData');
        const btnExport = document.getElementById('btnExportRemote');
        if (btnClear) btnClear.classList.remove('hidden');
        if (btnExport) btnExport.classList.remove('hidden');
        
        const uploadOverlay = document.getElementById('uploadOverlay');
        if (uploadOverlay) uploadOverlay.classList.add('hidden');
        if (views[currentView]) views[currentView].classList.remove('hidden');
        
        renderDashboard();
        
    } catch (e) {
        console.error(e);
        alert("Error al procesar el archivo Excel. Revisa el formato.");
        const dataStatus = document.getElementById('data-status');
        if (dataStatus) {
            dataStatus.textContent = 'Error';
            dataStatus.className = 'status-badge empty';
        }
    }
}

// Formatting helpers
const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
const formatNumber = (val) => new Intl.NumberFormat('es-AR').format(val);

let clientHistoryChartInst = null;
let monthlyRevenueChartInst = null;
let comercialRevenueChartInst = null;

if (typeof Chart !== 'undefined') {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = "'Inter', sans-serif";
}

function renderDashboard() {
    let totalRevenue = 0;
    let totalItems = 0;
    let clients = new Set();
    let comercialStats = {};
    let clientStats = {};
    let prodStats = {};

    globalData.forEach(row => {
        totalRevenue += row.facturacion;
        totalItems += row.cantidad;
        clients.add(row.id_cliente);

        let c = row.comercial;
        comercialStats[c] = (comercialStats[c] || 0) + row.facturacion;

        if (!clientStats[row.cliente]) clientStats[row.cliente] = 0;
        clientStats[row.cliente] += row.facturacion;

        if (!prodStats[row.producto]) prodStats[row.producto] = 0;
        prodStats[row.producto] += row.cantidad;
    });

    const elRev = document.getElementById('kpiTotalRevenue');
    const elCli = document.getElementById('kpiTotalClients');
    const elItm = document.getElementById('kpiTotalItems');
    if (elRev) elRev.textContent = formatCurrency(totalRevenue);
    if (elCli) elCli.textContent = clients.size;
    if (elItm) elItm.textContent = formatNumber(totalItems);
    
    let topComercial = Object.entries(comercialStats).sort((a,b) => b[1]-a[1])[0];
    const elTopCom = document.getElementById('kpiTopComercial');
    if (elTopCom) elTopCom.textContent = topComercial ? topComercial[0] : '-';

    let topClient = Object.entries(clientStats).sort((a,b) => b[1]-a[1])[0];
    const elTopCli = document.getElementById('kpiTopClient');
    if (elTopCli) elTopCli.textContent = topClient ? topClient[0] : '-';

    let topProduct = Object.entries(prodStats).sort((a,b) => b[1]-a[1])[0];
    const elTopProd = document.getElementById('kpiTopProduct');
    if (elTopProd) elTopProd.textContent = topProduct ? topProduct[0] : '-';

    const tb = document.querySelector('#mainDetailTable tbody');
    if (tb) {
        tb.innerHTML = '';
        let groupedData = {};
        globalData.forEach(row => {
            let key = row.id_cliente + '|' + row.producto;
            if (!groupedData[key]) {
                groupedData[key] = {
                    id: row.id_cliente,
                    cliente: row.cliente,
                    comercial: row.comercial,
                    producto: row.producto,
                    cantidad: 0,
                    total: 0
                };
            }
            groupedData[key].cantidad += row.cantidad;
            groupedData[key].total += row.facturacion;
        });

        let tableRows = Object.values(groupedData).sort((a, b) => b.total - a.total);
        tableRows.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="badge" style="background:rgba(59, 130, 246, 0.1); color:var(--primary)">${item.id}</span></td>
                <td style="font-weight:500;">${item.cliente}</td>
                <td>${item.comercial}</td>
                <td>${item.producto}</td>
                <td>${formatNumber(item.cantidad)}</td>
                <td style="font-weight:600; color:var(--success)">${formatCurrency(item.total)}</td>
            `;
            tb.appendChild(tr);
        });
    }

    renderCharts(comercialStats);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderCharts(comercialStats) {
    let revByMonth = {};
    rawGlobalData.forEach(r => {
        revByMonth[r.mes] = (revByMonth[r.mes] || 0) + r.facturacion;
    });
    
    let months = Object.keys(revByMonth).sort();
    let revData = months.map(m => revByMonth[m]);

    const ctxMonth = document.getElementById('monthlyRevenueChart');
    if (ctxMonth && typeof Chart !== 'undefined') {
        if (monthlyRevenueChartInst) monthlyRevenueChartInst.destroy();
        monthlyRevenueChartInst = new Chart(ctxMonth, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Facturación ($)',
                    data: revData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    pointBackgroundColor: '#10b981',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    let comercialLabels = Object.keys(comercialStats);
    let comercialData = Object.values(comercialStats);

    const ctxCom = document.getElementById('comercialRevenueChart');
    if (ctxCom && typeof Chart !== 'undefined') {
        if (comercialRevenueChartInst) comercialRevenueChartInst.destroy();
        comercialRevenueChartInst = new Chart(ctxCom, {
            type: 'doughnut',
            data: {
                labels: comercialLabels,
                datasets: [{
                    data: comercialData,
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#10b981'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { 
                    legend: { 
                        position: 'bottom',
                        labels: { color: '#f8fafc' }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) label += ': ';
                                if (context.parsed !== null) {
                                    let total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    let percentage = ((context.parsed * 100) / total).toFixed(1) + '%';
                                    label += formatCurrency(context.parsed) + ' (' + percentage + ')';
                                }
                                return label;
                            }
                        }
                    }
                },
                cutout: '70%'
            }
        });
    }
}

// BÚSQUEDA DE CLIENTES CORREGIDA Y ROBUSTA
const searchSuggestions = document.getElementById('searchSuggestions');
const clientSearchInput = document.getElementById('clientSearchInput');

function normalizeText(str) {
    if (!str) return '';
    return str.toString().toLowerCase().trim()
        .replace(/á/g,'a').replace(/é/g,'e').replace(/í/g,'i').replace(/ó/g,'o').replace(/ú/g,'u');
}

if (clientSearchInput) {
    clientSearchInput.addEventListener('input', (e) => {
        const term = normalizeText(e.target.value);
        
        if (term.length < 2) {
            if (searchSuggestions) {
                searchSuggestions.innerHTML = '';
                searchSuggestions.classList.add('hidden');
            }
            return;
        }

        const clientsMap = new Map();
        const dataSource = globalData.length > 0 ? globalData : rawGlobalData;

        dataSource.forEach(r => {
            const clienteNorm = normalizeText(r.cliente);
            const idNorm = normalizeText(r.id_cliente);
            if (clienteNorm.includes(term) || idNorm.includes(term)) {
                if (!clientsMap.has(r.id_cliente)) {
                    clientsMap.set(r.id_cliente, r.cliente);
                }
            }
        });

        const suggestions = Array.from(clientsMap.entries()).slice(0, 10);

        if (suggestions.length === 0) {
            if (searchSuggestions) {
                searchSuggestions.innerHTML = '';
                searchSuggestions.classList.add('hidden');
            }
            return;
        }

        if (searchSuggestions) {
            searchSuggestions.innerHTML = '';
            suggestions.forEach(([id, name]) => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.style.padding = '10px 15px';
                div.style.cursor = 'pointer';
                div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                div.style.color = '#fff';
                div.innerHTML = `<span style="opacity: 0.7; margin-right: 10px;">[${id}]</span> <b>${name}</b>`;
                
                div.addEventListener('click', () => {
                    clientSearchInput.value = name;
                    searchSuggestions.classList.add('hidden');
                    searchClient();
                });
                searchSuggestions.appendChild(div);
            });
            searchSuggestions.classList.remove('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (searchSuggestions && !clientSearchInput.contains(e.target) && !searchSuggestions.contains(e.target)) {
            searchSuggestions.classList.add('hidden');
        }
    });

    clientSearchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            if (searchSuggestions) searchSuggestions.classList.add('hidden');
            searchClient();
        }
    });
}

const btnSearchClient = document.getElementById('btnSearchClient');
if (btnSearchClient) {
    btnSearchClient.addEventListener('click', () => {
        if (searchSuggestions) searchSuggestions.classList.add('hidden');
        searchClient();
    });
}

function searchClient() {
    if (!clientSearchInput) return;
    const term = normalizeText(clientSearchInput.value);
    if (!term) return;

    const dataSource = globalData.length > 0 ? globalData : rawGlobalData;
    const clientRows = dataSource.filter(r => normalizeText(r.id_cliente).includes(term) || normalizeText(r.cliente).includes(term));
    
    const emptyState = document.getElementById('clientEmptyState');
    const details = document.getElementById('clientDetails');

    if (clientRows.length === 0) {
        if (emptyState) {
            emptyState.classList.remove('hidden');
            emptyState.innerHTML = `<i data-lucide="search-x"></i><p>No se encontraron compras para el cliente: <b>${clientSearchInput.value}</b></p>`;
        }
        if (details) details.classList.add('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (details) details.classList.remove('hidden');

    const info = clientRows[0];
    const elName = document.getElementById('cdName');
    const elId = document.getElementById('cdId');
    const elCom = document.getElementById('cdComercial');
    if (elName) elName.textContent = info.cliente;
    if (elId) elId.textContent = info.id_cliente;
    if (elCom) elCom.innerHTML = `<i data-lucide="briefcase"></i> ${info.comercial}`;

    let totalRev = 0;
    let monthStats = {};
    let prodStats = {};
    let invoices = new Set();

    clientRows.forEach(r => {
        totalRev += r.facturacion;
        monthStats[r.mes] = (monthStats[r.mes] || 0) + r.facturacion;
        
        let invoiceKey = r.factura && r.factura !== 'S/F' ? r.factura : (r.fecha_raw || 'row_' + Math.random());
        invoices.add(invoiceKey);
        
        if (!prodStats[r.producto]) prodStats[r.producto] = { qty: 0, byMonth: {}, lastMonth: '' };
        prodStats[r.producto].qty += r.cantidad;
        if (!prodStats[r.producto].byMonth[r.mes]) prodStats[r.producto].byMonth[r.mes] = 0;
        prodStats[r.producto].byMonth[r.mes] += r.cantidad;
        
        if (r.mes > prodStats[r.producto].lastMonth) prodStats[r.producto].lastMonth = r.mes;
    });

    const elTot = document.getElementById('cdTotal');
    const elAvg = document.getElementById('cdAverageTicket');
    const elMix = document.getElementById('cdMixProductos');
    if (elTot) elTot.textContent = formatCurrency(totalRev);
    let avgTicket = invoices.size > 0 ? totalRev / invoices.size : 0;
    if (elAvg) elAvg.textContent = formatCurrency(avgTicket);
    if (elMix) elMix.textContent = Object.keys(prodStats).length;

    const months = Object.keys(monthStats).sort();
    const revData = months.map(m => monthStats[m]);

    const ctxHist = document.getElementById('clientHistoryChart');
    if (ctxHist && typeof Chart !== 'undefined') {
        if (clientHistoryChartInst) clientHistoryChartInst.destroy();
        clientHistoryChartInst = new Chart(ctxHist, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [{
                    label: 'Compras',
                    data: revData,
                    backgroundColor: '#35A29F',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

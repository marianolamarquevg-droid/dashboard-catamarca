// Initialize Lucide icons
lucide.createIcons();

// State
let rawGlobalData = [];
let globalData = [];
let currentView = 'dashboard';
let lockedComercial = null; // Variable para bloquear vista por vendedor

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
                // Migración de datos viejos: si tiene transporte pero no comercial
                rawGlobalData.forEach(r => {
                    if (r.transporte && !r.comercial) r.comercial = r.transporte;
                });

                if (lockedComercial) {
                    rawGlobalData = rawGlobalData.filter(r => r.comercial && r.comercial.includes(`(${lockedComercial})`));
                }

                globalData = [...rawGlobalData];
                updateMonthFilter();
                dataStatus.textContent = `Datos Cargados (${globalData.length} filas)`;
                dataStatus.className = 'status-badge loaded';
                document.getElementById('btnClearData').classList.remove('hidden');
                document.getElementById('btnExportRemote').classList.remove('hidden');
                uploadOverlay.classList.add('hidden');
                views[currentView].classList.remove('hidden');
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
                document.getElementById('monthFilter').classList.add('hidden');
                btnClear.classList.add('hidden');
                dataStatus.textContent = 'Esperando datos...';
                dataStatus.className = 'status-badge empty';
                uploadOverlay.classList.remove('hidden');
                document.querySelectorAll('.sidebar nav a').forEach(l => l.classList.remove('active'));
                document.querySelector(`[data-view="dashboard"]`).classList.add('active');
                Object.values(views).forEach(v => v.classList.add('hidden'));
            }
        });
    }
    
    const btnExport = document.getElementById('btnExportRemote');
    if (btnExport) {
        btnExport.addEventListener('click', exportDataForMobile);
    }

    const btnExportMix = document.getElementById('btnExportMix');
    if (btnExportMix) btnExportMix.addEventListener('click', exportMixToExcel);
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
                dataStatus.textContent = `Datos Sincronizados (${globalData.length} filas)`;
                dataStatus.className = 'status-badge loaded';
                uploadOverlay.classList.add('hidden');
                document.getElementById('btnClearData').classList.remove('hidden');
                document.getElementById('btnExportRemote').classList.remove('hidden');
                views[currentView].classList.remove('hidden');
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

// DOM Elements
const fileInput = document.getElementById('fileInput');
const uploadOverlay = document.getElementById('uploadOverlay');
const uploadBox = document.querySelector('.upload-box');
const dataStatus = document.getElementById('data-status');
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
    document.querySelector(`[data-view="${viewName}"]`).classList.add('active');
    
    Object.values(views).forEach(v => v.classList.add('hidden'));
    
    if (globalData.length > 0) {
        uploadOverlay.classList.add('hidden');
        views[viewName].classList.remove('hidden');
    } else {
        uploadOverlay.classList.remove('hidden');
    }
}

// Drag & Drop Handlers
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    uploadBox.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

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

fileInput.addEventListener('change', function() {
    handleFiles(this.files);
});

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        dataStatus.textContent = 'Procesando...';
        dataStatus.className = 'status-badge empty';
        
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
        
        // Búsqueda robusta por nombre de columna
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

            // Excluir filas de totales o vacías
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
        
        if (globalData.length === 0) {
            alert("No se encontraron registros válidos. Verifica que las columnas del Excel coincidan.");
            dataStatus.textContent = 'Sin datos compatibles';
            return;
        }

        updateMonthFilter();

        dataStatus.textContent = `Datos Cargados (${globalData.length} filas)`;
        dataStatus.className = 'status-badge loaded';
        document.getElementById('btnClearData').classList.remove('hidden');
        document.getElementById('btnExportRemote').classList.remove('hidden');
        
        uploadOverlay.classList.add('hidden');
        views[currentView].classList.remove('hidden');
        
        renderDashboard();
        
    } catch (e) {
        console.error(e);
        alert("Error al procesar el archivo Excel. Revisa el formato.");
        dataStatus.textContent = 'Error';
        dataStatus.className = 'status-badge empty';
    }
}

// Formatting helpers
const formatCurrency = (val) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
const formatNumber = (val) => new Intl.NumberFormat('es-AR').format(val);

// Chart Instances
let clientHistoryChartInst = null;
let monthlyRevenueChartInst = null;
let comercialRevenueChartInst = null;

Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Inter', sans-serif";

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

    document.getElementById('kpiTotalRevenue').textContent = formatCurrency(totalRevenue);
    document.getElementById('kpiTotalClients').textContent = clients.size;
    document.getElementById('kpiTotalItems').textContent = formatNumber(totalItems);
    
    let topComercial = Object.entries(comercialStats).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('kpiTopComercial').textContent = topComercial ? topComercial[0] : '-';

    let topClient = Object.entries(clientStats).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('kpiTopClient').textContent = topClient ? topClient[0] : '-';

    let topProduct = Object.entries(prodStats).sort((a,b) => b[1]-a[1])[0];
    document.getElementById('kpiTopProduct').textContent = topProduct ? topProduct[0] : '-';

    const tb = document.querySelector('#mainDetailTable tbody');
    tb.innerHTML = '';
    
    let groupedData = {};
    let comercialClientStats = {};
    let allProdStats = {};
    
    let allGlobalMonths = [...new Set(rawGlobalData.map(r => r.mes))].sort();
    const globalMonthFilter = document.getElementById('monthFilter').value;
    let currentMonth = globalMonthFilter !== 'ALL' ? globalMonthFilter : allGlobalMonths[allGlobalMonths.length - 1];
    let prevMonth = '';
    const currentIndex = allGlobalMonths.indexOf(currentMonth);
    if (currentIndex > 0) prevMonth = allGlobalMonths[currentIndex - 1];

    rawGlobalData.forEach(row => {
        if (!allProdStats[row.producto]) allProdStats[row.producto] = { current: 0, prev: 0, clients: {} };
        
        let clientKey = row.cliente;
        if (!allProdStats[row.producto].clients[clientKey]) {
            allProdStats[row.producto].clients[clientKey] = { current: 0, prev: 0 };
        }
        
        if (row.mes === currentMonth) {
            allProdStats[row.producto].current += row.cantidad;
            allProdStats[row.producto].clients[clientKey].current += row.cantidad;
        }
        if (row.mes === prevMonth) {
            allProdStats[row.producto].prev += row.cantidad;
            allProdStats[row.producto].clients[clientKey].prev += row.cantidad;
        }
    });

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

        let comercialKey = row.comercial;
        if (!comercialClientStats[comercialKey]) comercialClientStats[comercialKey] = {};
        if (!comercialClientStats[comercialKey][row.cliente]) comercialClientStats[comercialKey][row.cliente] = 0;
        comercialClientStats[comercialKey][row.cliente] += row.facturacion;
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

    const tbComercialClients = document.querySelector('#topClientsComercialTable tbody');
    tbComercialClients.innerHTML = '';
    
    let comercialClientList = [];
    for (let comercial in comercialClientStats) {
        let clientsInComercial = Object.entries(comercialClientStats[comercial]).sort((a,b) => b[1]-a[1]);
        clientsInComercial.forEach(clientArr => {
             comercialClientList.push({ comercial: comercial, client: clientArr[0], val: clientArr[1] });
        });
    }
    comercialClientList.sort((a,b) => a.comercial.localeCompare(b.comercial) || b.val - a.val).forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 500;">${item.comercial}</td>
            <td>${item.client}</td>
            <td style="font-weight: 600; color:var(--primary)">${formatCurrency(item.val)}</td>
        `;
        tbComercialClients.appendChild(tr);
    });

    const tbProd = document.querySelector('#productsTrendTable tbody');
    tbProd.innerHTML = '';
    
    let prodList = Object.entries(allProdStats).map(([p, data]) => {
        return { name: p, current: data.current, prev: data.prev, clients: data.clients };
    }).sort((a,b) => b.current - a.current);

    window.productDropData = {};

    prodList.forEach(item => {
        const tr = document.createElement('tr');
        let trendHtml = '-';
        if (item.prev > 0) {
            let trend = ((item.current - item.prev) / item.prev) * 100;
            if (trend > 0) trendHtml = `<span style="color:var(--success)">+${trend.toFixed(1)}% <i data-lucide="arrow-up" style="width:14px;height:14px;display:inline;vertical-align:middle"></i></span>`;
            else if (trend < 0) trendHtml = `<span style="color:var(--danger)">${trend.toFixed(1)}% <i data-lucide="arrow-down" style="width:14px;height:14px;display:inline;vertical-align:middle"></i></span>`;
        } else if (item.current > 0 && item.prev === 0) {
            trendHtml = `<span style="color:var(--success)">Nuevo <i data-lucide="arrow-up" style="width:14px;height:14px;display:inline;vertical-align:middle"></i></span>`;
        } else if (item.current === 0 && item.prev > 0) {
            trendHtml = `<span style="color:var(--danger)">Sin ventas <i data-lucide="arrow-down" style="width:14px;height:14px;display:inline;vertical-align:middle"></i></span>`;
        }

        let droppingClients = [];
        for (let c in item.clients) {
            let cData = item.clients[c];
            if (cData.prev > 0 && cData.current < cData.prev) {
                droppingClients.push({ client: c, prev: cData.prev, current: cData.current, diff: cData.current - cData.prev });
            }
        }
        droppingClients.sort((a,b) => a.diff - b.diff);
        
        let actionHtml = '';
        if (droppingClients.length > 0) {
            window.productDropData[item.name] = droppingClients;
            actionHtml = `<button onclick="showProductDropModal('${item.name.replace(/'/g, "\\'")}')" class="btn-icon" style="background:none; border:none; color:var(--warning); cursor:pointer; display:flex; align-items:center; justify-content:center;" title="Ver clientes que dejaron de comprar"><i data-lucide="users" style="width:16px;height:16px;"></i></button>`;
        }

        tr.innerHTML = `
            <td>${actionHtml}</td>
            <td style="font-weight: 500;">${item.name}</td>
            <td>${formatNumber(item.current)}</td>
            <td>${trendHtml}</td>
        `;
        tbProd.appendChild(tr);
    });

    renderCharts(comercialStats);
    lucide.createIcons();
}

function renderCharts(comercialStats) {
    let revByMonth = {};
    rawGlobalData.forEach(r => {
        revByMonth[r.mes] = (revByMonth[r.mes] || 0) + r.facturacion;
    });
    
    let months = Object.keys(revByMonth).sort();
    let revData = months.map(m => revByMonth[m]);

    if (monthlyRevenueChartInst) monthlyRevenueChartInst.destroy();
    monthlyRevenueChartInst = new Chart(document.getElementById('monthlyRevenueChart'), {
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

    let comercialLabels = Object.keys(comercialStats);
    let comercialData = Object.values(comercialStats);

    if (comercialRevenueChartInst) comercialRevenueChartInst.destroy();
    comercialRevenueChartInst = new Chart(document.getElementById('comercialRevenueChart'), {
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

// ==========================================
// CONFIGURATION, STATE & NAVIGATION MANAGEMENT
// ==========================================
const getTodayDateString = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0]; // Menghasilkan format murni YYYY-MM-DD sesuai HP Driver
};

let selectedDate = getTodayDateString();
let appData = [];
let customColumns = JSON.parse(localStorage.getItem('jotrans_columns')) || [];

// DOM Elements Navigasi Sidebar
const navYardBtn = document.getElementById('nav-yard');
const navWarehouseBtn = document.getElementById('nav-warehouse');
const viewYardMonitoring = document.getElementById('view-yard-monitoring');
const viewTimeWarehouse = document.getElementById('view-time-warehouse');
const pageTitle = document.getElementById('page-title');
const pageDesc = document.getElementById('page-desc');

function switchPage(target) {
    if (target === 'yard') {
        navYardBtn.className = "w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-blue-600 text-white font-medium text-xs transition text-left";
        navWarehouseBtn.className = "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 font-medium text-xs transition text-left";
        viewYardMonitoring.classList.remove('hidden');
        viewTimeWarehouse.classList.add('hidden');
        pageTitle.innerText = "Yard Monitoring";
    } else if (target === 'warehouse') {
        navYardBtn.className = "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 font-medium text-xs transition text-left";
        navWarehouseBtn.className = "w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-blue-600 text-white font-medium text-xs transition text-left";
        viewYardMonitoring.classList.add('hidden');
        viewTimeWarehouse.classList.remove('hidden');
        pageTitle.innerText = "Time in Warehouse";
    }
}

navYardBtn.addEventListener('click', () => switchPage('yard'));
navWarehouseBtn.addEventListener('click', () => switchPage('warehouse'));

// CORE DOM ELEMENTS SELECTION
const fileInput = document.getElementById('csv-file');
const customFileInput = document.getElementById('custom-csv-file');
const tableHeader = document.getElementById('table-header');
const tableBody = document.getElementById('table-body');
const btnAddColumn = document.getElementById('btn-add-column');
const btnResetAll = document.getElementById('btn-reset-all');
const btnUploadCustom = document.getElementById('btn-upload-custom');
const datePicker = document.getElementById('archive-date-picker');

const scanOrderId = document.getElementById('scan-order-id');
const scanCheckpoint = document.getElementById('scan-checkpoint');
const btnScan = document.getElementById('btn-scan');

// DOM MODAL ELEMENTS
const barcodeModal = document.getElementById('barcode-modal');
const btnOpenBarcode = document.getElementById('btn-open-barcode');
const btnCloseBarcode = document.getElementById('btn-close-barcode');

document.addEventListener('DOMContentLoaded', () => {
    if (datePicker) {
        datePicker.value = selectedDate;
    }
    loadDataByDate(selectedDate);
});

function loadDataByDate(dateStr) {
    const key = `jotrans_data_${dateStr}`;
    appData = JSON.parse(localStorage.getItem(key)) || [];
    renderDashboard();
}

if (datePicker) {
    datePicker.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        loadDataByDate(selectedDate);
    });
}

// RAW MASTER CSV UPLOAD WORKFLOW
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) { processRawData(results.data); }
    });
});

function processRawData(rawRows) {
    let currentTransporter = '';
    let currentStage = '';
    let parsedData = [];
    const uploadTime = new Date(`${selectedDate}T06:00:00`).toISOString();

    rawRows.forEach((row) => {
        let cleanRow = {};
        Object.keys(row).forEach(key => {
            if (key.trim() !== '') cleanRow[key.trim()] = row[key] ? row[key].trim() : '';
        });

        if (cleanRow['Transporter']) currentTransporter = cleanRow['Transporter'];
        if (cleanRow['Stage']) currentStage = cleanRow['Stage'];

        let orderId = cleanRow['Customer Order'];
        if (orderId) {
            let item = {
                id: orderId,
                transporter: currentTransporter || 'UNKNOWN',
                stage: currentStage || '-',
                customerName: cleanRow['Customer Name'] || '-',
                shipTo: cleanRow['Ship To'] || '-',
                volume: cleanRow['Volume'] || '0',
                truckType: cleanRow['Truck Type'] || cleanRow['truckType'] || cleanRow['Tipe Truk'] || '-', 
                status: 'OTW Muat',
                last_scan_time: '',
                time_otw: uploadTime,
                time_gatein: '', time_prosesmuat: '', time_selesaimuat: '', time_gateout: ''
            };
            customColumns.forEach(col => { item[col.toLowerCase()] = ''; });
            parsedData.push(item);
        }
    });

    appData = parsedData; 
    saveToStorage(); 
    renderDashboard();
    fileInput.value = "";
    alert(`Berhasil mengimpor ${appData.length} data ke arsip tanggal: ${selectedDate}!`);
}

// BACKUP SCANNER EMULATOR MANUAL
btnScan.addEventListener('click', () => {
    const inputId = scanOrderId.value.trim().toUpperCase();
    const selectedCheckpoint = scanCheckpoint.value;
    if (!inputId) return;
    
    const targetIndex = appData.findIndex(item => item.id.toUpperCase() === inputId);
    if (targetIndex === -1) { 
        alert(`Order ID [${inputId}] tidak ditemukan pada rekaman tanggal ${selectedDate}.`); 
        return; 
    }
    
    const now = new Date();
    const isoString = now.toISOString();
    
    appData[targetIndex].status = selectedCheckpoint;
    appData[targetIndex].last_scan_time = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

    if (selectedCheckpoint === 'Gate In') appData[targetIndex].time_gatein = isoString;
    if (selectedCheckpoint === 'Proses Muat') appData[targetIndex].time_prosesmuat = isoString;
    if (selectedCheckpoint === 'Selesai Muat') appData[targetIndex].time_selesaimuat = isoString;
    if (selectedCheckpoint === 'Gate Out') appData[targetIndex].time_gateout = isoString;

    saveToStorage(); renderDashboard(); 
    scanOrderId.value = ''; scanOrderId.focus();
});

window.addEventListener('storage', (e) => {
    if (e.key === `jotrans_data_${selectedDate}`) {
        appData = JSON.parse(e.newValue) || [];
        renderDashboard();
    }
});

// CALCULATION LOGICS
function calculateDuration(startTimeStr, endTimeStr) {
    if (!startTimeStr || !endTimeStr) return '-';
    const start = new Date(startTimeStr); const end = new Date(endTimeStr);
    const diffMs = end - start; if (diffMs < 0) return '-';
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `${diffMins} mnt`;
    return `${Math.floor(diffMins / 60)} jam ${diffMins % 60} mnt`;
}

function getDurationInMinutes(startTimeStr, endTimeStr) {
    if (!startTimeStr || !endTimeStr) return null;
    const start = new Date(startTimeStr); const end = new Date(endTimeStr);
    const diffMs = end - start; return diffMs >= 0 ? Math.floor(diffMs / 60000) : null;
}

function formatMinutesToText(totalMins) {
    if (totalMins === null || isNaN(totalMins)) return '-';
    if (totalMins < 60) return `${Math.round(totalMins)} mnt`;
    return `${Math.floor(totalMins / 60)} jam ${Math.round(totalMins % 60)} mnt`;
}

function calculateTransporterPerformance() {
    const perfGrid = document.getElementById('transporter-perf-grid');
    if (!perfGrid) return;
    if (appData.length === 0) {
        perfGrid.innerHTML = `<div class="col-span-full text-center py-8 text-xs text-gray-400 italic">Belum ada data untuk kalkulasi KPI.</div>`;
        return;
    }
    let groups = {};
    appData.forEach(item => {
        const trans = item.transporter;
        if (!groups[trans]) groups[trans] = { name: trans, totalOrders: 0, antriMins: [], muatMins: [], adminOutMins: [] };
        groups[trans].totalOrders++;
        const mAntri = getDurationInMinutes(item.time_otw, item.time_gatein);
        const mMuat = getDurationInMinutes(item.time_gatein, item.time_selesaimuat);
        const mAdmin = getDurationInMinutes(item.time_selesaimuat, item.time_gateout);
        if (mAntri !== null) groups[trans].antriMins.push(mAntri);
        if (mMuat !== null) groups[trans].muatMins.push(mMuat);
        if (mAdmin !== null) groups[trans].adminOutMins.push(mAdmin);
    });

    perfGrid.innerHTML = Object.values(groups).map(g => {
        const avgAntri = g.antriMins.length ? (g.antriMins.reduce((a,b)=>a+b,0)/g.antriMins.length) : null;
        const avgMuat = g.muatMins.length ? (g.muatMins.reduce((a,b)=>a+b,0)/g.muatMins.length) : null;
        const avgAdmin = g.adminOutMins.length ? (g.adminOutMins.reduce((a,b)=>a+b,0)/g.adminOutMins.length) : null;
        return `<div class="bg-gray-50 border p-4 rounded-xl text-xs">
            <div class="font-bold border-b pb-1 mb-2">🚚 ${g.name} (${g.totalOrders} Loads)</div>
            <div class="justify-between flex text-gray-500"><span>Otw ➡️ In:</span><span class="font-bold">${formatMinutesToText(avgAntri)}</span></div>
            <div class="justify-between flex text-gray-500"><span>Loading:</span><span class="font-bold text-orange-600">${formatMinutesToText(avgMuat)}</span></div>
            <div class="justify-between flex text-gray-500"><span>Out:</span><span class="font-bold text-purple-600">${formatMinutesToText(avgAdmin)}</span></div>
        </div>`;
    }).join('');
}

// INJECT CUSTOM COLUMNS ENGINE
btnUploadCustom.addEventListener('click', () => {
    if (appData.length === 0) { alert("Upload Master Data Pengiriman terlebih dahulu!"); return; }
    customFileInput.click();
});
customFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: function(results) { processCustomColumnCSV(results.data); } });
});
function processCustomColumnCSV(csvRows) {
    if (csvRows.length === 0) return;
    const headers = Object.keys(csvRows[0]).map(h => h.trim());
    const orderKey = headers.find(h => h.toLowerCase() === 'customer order' || h.toLowerCase() === 'order id');
    const customDataKey = headers.find(h => h.toLowerCase() !== 'customer order' && h.toLowerCase() !== 'order id' && h !== '');
    if (!orderKey || !customDataKey) return;
    const lowerCustomKey = customDataKey.toLowerCase();
    if (!customColumns.includes(customDataKey)) { customColumns.push(customDataKey); localStorage.setItem('jotrans_columns', JSON.stringify(customColumns)); }
    csvRows.forEach(row => {
        const targetOrderId = row[orderKey] ? row[orderKey].trim().toUpperCase() : '';
        const index = appData.findIndex(item => item.id.toUpperCase() === targetOrderId);
        if (index !== -1) appData[index][lowerCustomKey] = row[customDataKey] ? row[customDataKey].trim() : '';
    });
    saveToStorage(); renderDashboard(); customFileInput.value = "";
}
btnAddColumn.addEventListener('click', () => {
    const columnName = prompt("Nama kolom manual:"); if (!columnName) return;
    customColumns.push(columnName.trim()); localStorage.setItem('jotrans_columns', JSON.stringify(customColumns));
    appData = appData.map(item => ({ ...item, [columnName.trim().toLowerCase()]: '' }));
    saveToStorage(); renderDashboard();
});
function updateCustomValue(index, key, val) { appData[index][key] = val; saveToStorage(); updateCounters(); }

// CORE RENDER UI DASHBOARD
function renderDashboard() { updateCounters(); calculateTransporterPerformance(); renderTableHeader(); renderTableBody(); }

function updateCounters() {
    const truckCapacities = { 'CDE': 2000, 'CDD': 4000, 'CDDL': 5100, 'FUSO': 8000, 'WING BOX': 11000 };
    let stageGroups = {};
    appData.forEach(item => {
        const stageNum = (item.stage || '').trim(); const status = item.status;
        const truckType = (item.truckType || '').trim().toUpperCase();
        let volume = item.volume ? parseFloat(String(item.volume).replace(/,/g, '')) || 0 : 0;
        if (stageNum && status) {
            const groupKey = `${stageNum}_${status}_${truckType}`;
            if (!stageGroups[groupKey]) stageGroups[groupKey] = { status: status, truckType: truckType, totalVolume: 0 };
            stageGroups[groupKey].totalVolume += volume;
        }
    });
    let finalCounts = { 'OTW Muat': 0, 'Gate In': 0, 'Proses Muat': 0, 'Selesai Muat': 0, 'Gate Out': 0 };
    Object.values(stageGroups).forEach(group => {
        const capacity = truckCapacities[group.truckType];
        let calculatedTrucks = capacity && group.totalVolume > 0 ? Math.ceil(group.totalVolume / capacity) : 1;
        if (finalCounts[group.status] !== undefined) finalCounts[group.status] += calculatedTrucks;
    });
    document.getElementById('count-otw').innerText = finalCounts['OTW Muat'] + " Mobil";
    document.getElementById('count-gatein').innerText = finalCounts['Gate In'] + " Mobil";
    document.getElementById('count-loading').innerText = finalCounts['Proses Muat'] + " Mobil";
    document.getElementById('count-loaded').innerText = finalCounts['Selesai Muat'] + " Mobil";
    document.getElementById('count-gateout').innerText = finalCounts['Gate Out'] + " Mobil";
}

function renderTableHeader() {
    let headers = ['Transporter', 'Stage', 'Order ID', 'Customer Name', 'Volume', 'Tipe Truk', 'Status Workflow', '⏳ Antri (OTW-In)', '🏗️ Proses Muat', '📄 Admin Out', '⏱️ Total Yard Time'];
    customColumns.forEach(col => headers.push(col)); headers.push('Aksi');
    tableHeader.innerHTML = headers.map(h => `<th class="px-3 py-2 font-semibold">${h}</th>`).join('');
}

function renderTableBody() {
    if (appData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="100%" class="text-center p-8 text-gray-400 italic">Belum ada data aktif pada tanggal ini.</td></tr>`; return;
    }
    tableBody.innerHTML = appData.map((item, index) => {
        let badgeColor = 'bg-yellow-100 text-yellow-800';
        if (item.status === 'Gate In') badgeColor = 'bg-blue-100 text-blue-800';
        if (item.status === 'Proses Muat') badgeColor = 'bg-orange-100 text-orange-800';
        if (item.status === 'Selesai Muat') badgeColor = 'bg-purple-100 text-purple-800';
        if (item.status === 'Gate Out') badgeColor = 'bg-green-100 text-green-800';

        let targetIso = item.status === 'Gate In' ? item.time_gatein : item.status === 'Proses Muat' ? item.time_prosesmuat : item.status === 'Selesai Muat' ? item.time_selesaimuat : item.status === 'Gate Out' ? item.time_gateout : item.time_otw;
        let jamScanTerakhir = targetIso ? new Date(targetIso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
        let timeLog = jamScanTerakhir ? `<br><span class="text-[9px] text-gray-400 font-semibold font-mono">⏱️ ${jamScanTerakhir}</span>` : '';

        let customCellsHtml = customColumns.map(col => {
            let key = col.toLowerCase();
            return `<td class="px-2"><input type="text" value="${item[key] || ''}" onchange="updateCustomValue(${index}, '${key}', this.value)" class="border p-1 rounded w-20 bg-gray-50 text-[10px]"></td>`;
        }).join('');

        return `<tr class="hover:bg-gray-50 border-b divide-x divide-gray-100">
            <td class="px-3 py-1.5">${item.transporter}</td>
            <td class="px-3 py-1.5 font-bold text-blue-600">${item.stage}</td>
            <td class="px-3 py-1.5 font-mono font-semibold">${item.id}</td>
            <td class="px-3 py-1.5 max-w-[120px] truncate">${item.customerName}</td>
            <td class="px-3 py-1.5">${item.volume}</td>
            <td class="px-3 py-1.5">${item.truckType || '-'}</td>
            <td class="px-3 py-1.5 text-center"><span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${badgeColor}">${item.status}</span>${timeLog}</td>
            <td class="px-3 py-1.5 font-mono">${calculateDuration(item.time_otw, item.time_gatein)}</td>
            <td class="px-3 py-1.5 font-mono text-orange-600">${calculateDuration(item.time_gatein, item.time_selesaimuat)}</td>
            <td class="px-3 py-1.5 font-mono text-purple-600">${calculateDuration(item.time_selesaimuat, item.time_gateout)}</td>
            <td class="px-3 py-1.5 font-mono font-bold text-emerald-600">${calculateDuration(item.time_gatein, item.time_gateout)}</td>
            ${customCellsHtml}
            <td class="px-3 py-1.5"><button onclick="deleteRow(${index})" class="text-red-500 hover:underline">Hapus</button></td>
        </tr>`;
    }).join('');
}

btnResetAll.addEventListener('click', () => {
    if (confirm("Hapus seluruh data tracking aktif khusus tanggal ini?")) { localStorage.removeItem(`jotrans_data_${selectedDate}`); appData = []; renderDashboard(); }
});
function deleteRow(index) { if (confirm("Hapus order ini?")) { appData.splice(index, 1); saveToStorage(); renderDashboard(); } }
function saveToStorage() { localStorage.setItem(`jotrans_data_${selectedDate}`, JSON.stringify(appData)); }

// ===================================================
// CLOSE UP POPUP DIALOUGE INTERACTION & GENERATOR QR
// ===================================================
let qrGateIn = null, qrProsesMuat = null, qrSelesaiMuat = null, qrGateOut = null;

function renderModalBarcodes() {
    document.getElementById("qr-gatein").innerHTML = "";
    document.getElementById("qr-prosesmuat").innerHTML = "";
    document.getElementById("qr-selesaimuat").innerHTML = "";
    document.getElementById("qr-gateout").innerHTML = "";

    qrGateIn = new QRCode(document.getElementById("qr-gatein"), { text: "Gate In", width: 140, height: 140, colorDark: "#000000", colorLight: "#ffffff" });
    qrProsesMuat = new QRCode(document.getElementById("qr-prosesmuat"), { text: "Proses Muat", width: 140, height: 140, colorDark: "#000000", colorLight: "#ffffff" });
    qrSelesaiMuat = new QRCode(document.getElementById("qr-selesaimuat"), { text: "Selesai Muat", width: 140, height: 140, colorDark: "#000000", colorLight: "#ffffff" });
    qrGateOut = new QRCode(document.getElementById("qr-gateout"), { text: "Gate Out", width: 140, height: 140, colorDark: "#000000", colorLight: "#ffffff" });
}

// Handler trigger modal klik
btnOpenBarcode.addEventListener('click', () => {
    barcodeModal.classList.remove('hidden');
    renderModalBarcodes(); // Membuat QR code bersih saat modal terbuka close-up
});

btnCloseBarcode.addEventListener('click', () => {
    barcodeModal.classList.add('hidden');
});

// ==========================================
// FIREBASE INITIALIZATION (MODULAR SDK v10)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCvdAfDBlciiSqsnAjW8PXx-pxv64ztdhU",
    authDomain: "jtn-pr-control.firebaseapp.com",
    projectId: "jtn-pr-control",
    storageBucket: "jtn-pr-control.firebasestorage.app",
    messagingSenderId: "921630437726",
    appId: "1:921630437726:web:811585e1c987d7fea79fcf",
    measurementId: "G-N6FT0VX8LN"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// CONFIGURATION, STATE & NAVIGATION MANAGEMENT
// ==========================================
const getTodayDateString = () => {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    const localDate = new Date(d.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
};

let selectedDate = getTodayDateString();
let appData = [];
let customColumns = JSON.parse(localStorage.getItem('jotrans_columns')) || [];
let unsubscribeFirestore = null; 

// DOM Elements Navigation Menu
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
        pageDesc.innerText = "Monitoring real-time aktivitas truk logistik PT Jotun Indonesia.";
    } else if (target === 'warehouse') {
        navYardBtn.className = "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 font-medium text-xs transition text-left";
        navWarehouseBtn.className = "w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-blue-600 text-white font-medium text-xs transition text-left";
        viewYardMonitoring.classList.add('hidden');
        viewTimeWarehouse.classList.remove('hidden');
        pageTitle.innerText = "Time in Warehouse";
        pageDesc.innerText = "Analisis rata-rata durasi kinerja tunggu dan proses inap kontainer ekspedisi.";
    }
}

if(navYardBtn) navYardBtn.addEventListener('click', () => switchPage('yard'));
if(navWarehouseBtn) navWarehouseBtn.addEventListener('click', () => switchPage('warehouse'));

// CORE ELEMENT DEFIINITIONS
const fileInput = document.getElementById('csv-file');
const tableHeader = document.getElementById('table-header');
const tableBody = document.getElementById('table-body');
const btnAddColumn = document.getElementById('btn-add-column');
const btnResetAll = document.getElementById('btn-reset-all');
const datePicker = document.getElementById('archive-date-picker');

const scanOrderId = document.getElementById('scan-order-id');
const scanCheckpoint = document.getElementById('scan-checkpoint');
const btnScan = document.getElementById('btn-scan');

document.addEventListener('DOMContentLoaded', () => {
    if (datePicker) {
        datePicker.value = selectedDate;
    }
    listenToFirestore(selectedDate);
});

// REAL-TIME FIRESTORE LISTENER ENGINE
function listenToFirestore(dateStr) {
    if (unsubscribeFirestore) {
        unsubscribeFirestore(); 
    }

    // Mengarah ke dokumen sub-tanggal, misal: monitoring_dt/status_2026-06-22
    const docRef = doc(db, "monitoring_dt", `status_${dateStr}`);
    
    unsubscribeFirestore = onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().items) {
            appData = docSnap.data().items;
        } else {
            appData = [];
        }
        renderDashboard();
    }, (error) => {
        console.error("Error Fetching dari Firestore Live: ", error);
    });
}

async function saveToFirestore() {
    const docRef = doc(db, "monitoring_dt", `status_${selectedDate}`);
    try {
        await setDoc(docRef, { items: appData }, { merge: true });
    } catch (error) {
        console.error("Gagal sinkronisasi data ke Cloud Firestore: ", error);
        alert("Koneksi gagal! Gagal menyimpan perubahan data ke server.");
    }
}

if (datePicker) {
    datePicker.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        listenToFirestore(selectedDate);
    });
}

// ==========================================
// WORKFLOW: CSV UPLOAD PARSER
// ==========================================
if(fileInput) {
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) { processRawData(results.data); }
        });
    });
}

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
                time_gatein: '',
                time_prosesmuat: '',
                time_selesaimuat: '',
                time_gateout: ''
            };
            customColumns.forEach(col => { item[col.toLowerCase()] = ''; });
            parsedData.push(item);
        }
    });

    appData = parsedData; 
    saveToFirestore(); 
    if(fileInput) fileInput.value = "";
    alert(`Berhasil impor ${appData.length} item data ke Firestore untuk tanggal: ${selectedDate}!`);
}

// Handler Scan Emulator Admin
if(btnScan) {
    btnScan.addEventListener('click', () => {
        const inputId = scanOrderId.value.trim().toUpperCase();
        const selectedCheckpoint = scanCheckpoint.value;
        if (!inputId) return;
        
        const targetIndex = appData.findIndex(item => item.id.toUpperCase() === inputId);
        if (targetIndex === -1) { 
            alert(`Order ID [${inputId}] tidak ditemukan.`); 
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

        saveToFirestore(); 
        scanOrderId.value = ''; 
        scanOrderId.focus();
    });
}

// ==========================================
// DURATION & KPI ENGINE
// ==========================================
function calculateDuration(startTimeStr, endTimeStr) {
    if (!startTimeStr || !endTimeStr) return '-';
    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);
    const diffMs = end - start;
    if (diffMs < 0) return '-';
    const diffMins = Math.floor(diffMs / 60000);
    return diffMins < 60 ? `${diffMins} mnt` : `${Math.floor(diffMins / 60)} jam ${diffMins % 60} mnt`;
}

function getDurationInMinutes(startTimeStr, endTimeStr) {
    if (!startTimeStr || !endTimeStr) return null;
    const start = new Date(startTimeStr);
    const end = new Date(endTimeStr);
    return (end - start) >= 0 ? Math.floor((end - start) / 60000) : null;
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
        if (!groups[trans]) {
            groups[trans] = { name: trans, totalOrders: 0, antriMins: [], muatMins: [], adminOutMins: [] };
        }
        groups[trans].totalOrders++;
        const mAntri = getDurationInMinutes(item.time_otw, item.time_gatein);
        const mMuat = getDurationInMinutes(item.time_gatein, item.time_selesaimuat);
        const mAdmin = getDurationInMinutes(item.time_selesaimuat, item.time_gateout);

        if (mAntri !== null) groups[trans].antriMins.push(mAntri);
        if (mMuat !== null) groups[trans].muatMins.push(mMuat);
        if (mAdmin !== null) groups[trans].adminOutMins.push(mAdmin);
    });

    perfGrid.innerHTML = Object.values(groups).map(g => {
        const avgAntri = g.antriMins.length ? (g.antriMins.reduce((a, b) => a + b, 0) / g.antriMins.length) : null;
        const avgMuat = g.muatMins.length ? (g.muatMins.reduce((a, b) => a + b, 0) / g.muatMins.length) : null;
        const avgAdmin = g.adminOutMins.length ? (g.adminOutMins.reduce((a, b) => a + b, 0) / g.adminOutMins.length) : null;
        return `
            <div class="bg-gray-50 border border-gray-200 p-5 rounded-xl flex flex-col justify-between hover:shadow-sm transition">
                <div>
                    <div class="flex justify-between items-start border-b border-gray-200/60 pb-2 mb-3">
                        <h4 class="text-xs font-bold text-slate-800 truncate uppercase tracking-wide">🚚 ${g.name}</h4>
                        <span class="text-[10px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">${g.totalOrders} Loads</span>
                    </div>
                    <div class="space-y-2 text-[11px]">
                        <div class="flex justify-between text-gray-500"><span>⏳ Rata-rata OTW ➡️ Gate In:</span><span class="font-mono font-bold text-gray-700">${formatMinutesToText(avgAntri)}</span></div>
                        <div class="flex justify-between text-gray-500"><span>🏗️ Rata-rata Proses Muat:</span><span class="font-mono font-bold text-orange-600">${formatMinutesToText(avgMuat)}</span></div>
                        <div class="flex justify-between text-gray-500"><span>📄 Rata-rata Selesai ➡️ Gate Out:</span><span class="font-mono font-bold text-purple-600">${formatMinutesToText(avgAdmin)}</span></div>
                    </div>
                </div>
            </div>`;
    }).join('');
}

// ==========================================
// RENDERING DASHBOARD & COUNTERS
// ==========================================
function renderDashboard() { 
    updateCounters(); 
    calculateTransporterPerformance(); 
    renderTableHeader(); 
    renderTableBody(); 
}

function updateCounters() {
    const truckCapacities = { 'CDE': 2000, 'CDD': 4000, 'CDDL': 5100, 'FUSO': 8000, 'WING BOX': 11000 };
    let stageGroups = {};

    appData.forEach(item => {
        const stageNum = (item.stage || '').trim();
        const status = item.status;
        const truckType = (item.truckType || '').trim().toUpperCase(); 
        let volume = item.volume ? parseFloat(String(item.volume).replace(/,/g, '')) || 0 : 0;

        if (stageNum && status) {
            const groupKey = `${stageNum}_${status}_${truckType}`;
            if (!stageGroups[groupKey]) {
                stageGroups[groupKey] = { status: status, truckType: truckType, totalVolume: 0 };
            }
            stageGroups[groupKey].totalVolume += volume;
        }
    });

    let finalCounts = { 'OTW Muat': 0, 'Gate In': 0, 'Proses Muat': 0, 'Selesai Muat': 0, 'Gate Out': 0 };
    Object.values(stageGroups).forEach(group => {
        const capacity = truckCapacities[group.truckType];
        let calculatedTrucks = (capacity && group.totalVolume > 0) ? Math.ceil(group.totalVolume / capacity) : 1;
        if (finalCounts[group.status] !== undefined) finalCounts[group.status] += calculatedTrucks;
    });

    document.getElementById('count-otw').innerText = finalCounts['OTW Muat'] + " Mobil";
    document.getElementById('count-gatein').innerText = finalCounts['Gate In'] + " Mobil";
    document.getElementById('count-loading').innerText = finalCounts['Proses Muat'] + " Mobil";
    document.getElementById('count-loaded').innerText = finalCounts['Selesai Muat'] + " Mobil";
    document.getElementById('count-gateout').innerText = finalCounts['Gate Out'] + " Mobil";
}

function renderTableHeader() {
    if(!tableHeader) return;
    let headers = ['Transporter', 'Stage', 'Order ID', 'Customer Name', 'Volume', 'Tipe Truk', 'Status Workflow', '⏳ Antri', '🏗️ Muat', '📄 Admin Out', '⏱️ Total Yard'];
    customColumns.forEach(col => headers.push(col));
    headers.push('Aksi');
    tableHeader.innerHTML = headers.map(h => `<th class="px-3 py-3 font-semibold">${h}</th>`).join('');
}

function renderTableBody() {
    if(!tableBody) return;
    if (appData.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="100%" class="text-center p-12 text-gray-400 italic font-medium">Belum ada data aktif pada tanggal ${selectedDate} di Firestore.</td></tr>`;
        return;
    }

    tableBody.innerHTML = appData.map((item, index) => {
        let badgeColor = 'bg-yellow-100 text-yellow-800';
        if (item.status === 'Gate In') badgeColor = 'bg-blue-100 text-blue-800';
        if (item.status === 'Proses Muat') badgeColor = 'bg-orange-100 text-orange-800';
        if (item.status === 'Selesai Muat') badgeColor = 'bg-purple-100 text-purple-800';
        if (item.status === 'Gate Out') badgeColor = 'bg-green-100 text-green-800';

        const getLastScanTimeOnly = (dataItem) => {
            let targetIso = dataItem.status === 'Gate In' ? dataItem.time_gatein : dataItem.status === 'Proses Muat' ? dataItem.time_prosesmuat : dataItem.status === 'Selesai Muat' ? dataItem.time_selesaimuat : dataItem.status === 'Gate Out' ? dataItem.time_gateout : dataItem.time_otw;
            if (!targetIso) return '';
            return new Date(targetIso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        };

        let timeLog = getLastScanTimeOnly(item) ? `<br><span class="text-[10px] text-gray-500 font-mono font-semibold">⏱️ ${getLastScanTimeOnly(item)}</span>` : '';
        let customCellsHtml = customColumns.map(col => `<td><input type="text" value="${item[col.toLowerCase()] || ''}" data-idx="${index}" data-key="${col.toLowerCase()}" class="custom-in border p-1 rounded w-24 text-xs bg-gray-50"></td>`).join('');

        return `
            <tr class="hover:bg-gray-50 transition border-b text-xs">
                <td class="px-3 py-2">${item.transporter}</td>
                <td class="px-3 py-2 font-semibold text-blue-600">${item.stage}</td>
                <td class="px-3 py-2 font-bold">${item.id}</td>
                <td class="px-3 py-2 truncate max-w-[120px]">${item.customerName}</td>
                <td class="px-3 py-2">${item.volume}</td>
                <td class="px-3 py-2">${item.truckType || '-'}</td>
                <td class="px-3 py-2 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeColor}">${item.status}</span>${timeLog}</td>
                <td class="px-3 py-2 font-mono">${calculateDuration(item.time_otw, item.time_gatein)}</td>
                <td class="px-3 py-2 font-mono text-orange-600">${calculateDuration(item.time_gatein, item.time_selesaimuat)}</td>
                <td class="px-3 py-2 font-mono text-purple-600">${calculateDuration(item.time_selesaimuat, item.time_gateout)}</td>
                <td class="px-3 py-2 font-mono font-bold text-emerald-600">${calculateDuration(item.time_gatein, item.time_gateout)}</td>
                ${customCellsHtml}
                <td class="px-3 py-2"><button data-del="${index}" class="text-red-500 hover:text-red-700 font-bold btn-del">Hapus</button></td>
            </tr>`;
    }).join('');

    // Event Delegation
    document.querySelectorAll('.custom-in').forEach(el => el.addEventListener('change', (e) => {
        const idx = e.target.getAttribute('data-idx');
        const key = e.target.getAttribute('data-key');
        appData[idx][key] = e.target.value;
        saveToFirestore();
    }));
    document.querySelectorAll('.btn-del').forEach(el => el.addEventListener('click', (e) => {
        const idx = el.getAttribute('data-del');
        if (confirm("Hapus order ini?")) { appData.splice(idx, 1); saveToFirestore(); }
    }));
}

// MANAJEMEN RESET & DATA KOLOM MANUAL
if(btnResetAll) {
    btnResetAll.addEventListener('click', async () => {
        if (confirm(`Hapus seluruh data tracking di Firestore untuk tanggal ${selectedDate}?`)) {
            appData = [];
            await saveToFirestore();
        }
    });
}
if(btnAddColumn) {
    btnAddColumn.addEventListener('click', () => {
        const columnName = prompt("Masukkan nama kolom manual baru:");
        if (!columnName) return;
        const cleanKey = columnName.trim();
        if (customColumns.includes(cleanKey)) return;
        customColumns.push(cleanKey);
        localStorage.setItem('jotrans_columns', JSON.stringify(customColumns));
        appData = appData.map(item => ({ ...item, [cleanKey.toLowerCase()]: '' }));
        saveToFirestore();
    });
}

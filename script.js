// อ่านพารามิเตอร์ ?dept= จาก URL
const urlParams = new URLSearchParams(window.location.search);
const deptKey = urlParams.get('dept') || 'traffic';

// ตารางแมปชื่อหน่วยงาน
const DEPT_MAP = {
    'traffic': 'งานจราจรและความปลอดภัย',
    'salaya': 'อาคารศาลายา กองกายภาพฯ',
    'mlc': 'ศูนย์การเรียนรู้มหิดล',
    'substation': 'สถานีไฟฟ้าย่อยมหิดล',
    'wastewater': 'อาคารบำบัดน้ำเสีย'
};

const DEPT_NAME = DEPT_MAP[deptKey] || "งานจราจรและความปลอดภัย";
const CACHE_KEY = "gasVehicleData_" + DEPT_NAME;
let fleetSnapshot = [], fleetExportBusy = false, vehicleLoadVersion = 0;

function updateFleetPdfButton() {
    document.getElementById('fleet-pdf').disabled = fleetExportBusy || !fleetSnapshot.length;
}

async function exportFleetPdf() {
    if (!fleetSnapshot.length || fleetExportBusy) return;
    const vehicles = fleetSnapshot.slice();
    const status = document.getElementById('fleet-pdf-status');
    const message = value => { status.hidden = false; status.textContent = value; };
    fleetExportBusy = true;
    updateFleetPdfButton();
    message('กำลังเตรียมรายงาน PDF ทุกคันในหน่วยงานนี้...');
    try {
        const result = await VehicleHistoryPdf.downloadFleet(vehicles, CONFIG.GAS_URL, (done, count) => {
            message(done < count ? 'เตรียมข้อมูล ' + done + ' จาก ' + count + ' คัน...' : 'กำลังสร้างไฟล์ PDF รวม...');
        });
        message('ดาวน์โหลด PDF รวม ' + result.count + ' คัน ปี พ.ศ. ' + (result.year + 543) + ' แล้ว' +
            (result.missingPhotos ? ' · ไม่มีรูปที่ใช้ได้ ' + result.missingPhotos + ' คัน' : ''));
    } catch (error) {
        message(error.message || 'สร้าง PDF รวมไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
        fleetExportBusy = false;
        updateFleetPdfButton();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const titleDisplay = document.getElementById('dept-title-display');
    if (titleDisplay) {
        titleDisplay.innerHTML = DEPT_NAME; 
    }

    document.getElementById("fleet-pdf").addEventListener("click", exportFleetPdf);
    loadVehicles();
    setupForm();
});

function goToAddDataPage() {
    window.location.href = `add_data.html?dept=${deptKey}`;
}

function showSection(sectionId) {
    document.getElementById('page-list').style.display = sectionId === 'page-list' ? 'block' : 'none';
    document.getElementById('page-form').style.display = sectionId === 'page-form' ? 'block' : 'none';
    window.scrollTo(0, 0);
}

function clearCacheAndReload() {
    sessionStorage.removeItem(CACHE_KEY);
    loadVehicles();
}

// แปลงลิงก์ Google Drive ให้เป็นภาพ thumbnail
function convertDriveLink(url) {
    if (!url || url.trim() === "" || url === "-") {
        return "images/default.jpg";
    }
    let fileId = "";
    let matchD = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    let matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    
    if (matchD && matchD[1]) {
        fileId = matchD[1];
    } else if (matchId && matchId[1]) {
        fileId = matchId[1];
    }
    
    if (fileId !== "") {
        return `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
    }
    return url; 
}

function openForm(assetCode, plate, model, type) {
    document.getElementById('vehicleAssetCode').value = assetCode;
    document.getElementById('vehiclePlate').value = plate !== '-' ? plate : assetCode;
    document.getElementById('vehicleModel').value = `${type} ${model}`;
    const dateField = document.getElementById('inspectionDate');
    dateField.max = InspectionDate.today();
    dateField.value = dateField.max;
    
    ['body', 'tires', 'brakes', 'lights', 'horn', 'fluids', 'battery', 'engine'].forEach(item => {
        const passRadio = document.getElementById(`${item}_pass`);
        if(passRadio) passRadio.checked = true;
        
        const reasonInput = document.getElementById(`${item}_reason`);
        if (reasonInput) {
            reasonInput.value = '';
            reasonInput.classList.add('d-none');
        }
    });
    document.getElementById('remark').value = '';
    showSection('page-form');
}

function toggleReason(item) {
    const isFail = document.getElementById(`${item}_fail`).checked;
    const reasonInput = document.getElementById(`${item}_reason`);
    if (reasonInput) {
        if (isFail) {
            reasonInput.classList.remove('d-none');
        } else {
            reasonInput.classList.add('d-none');
            reasonInput.value = '';
        }
    }
}

async function loadVehicles() {
    const version = ++vehicleLoadVersion;
    fleetSnapshot = [];
    updateFleetPdfButton();
    if (!fleetExportBusy) document.getElementById("fleet-pdf-status").hidden = true;
    const container = document.getElementById('vehicle-container');
    const countBadge = document.getElementById('vehicle-count');

    const cachedData = sessionStorage.getItem(CACHE_KEY);
    let hasCache = false;

    if (cachedData) {
        try {
            const parsed = JSON.parse(cachedData);
            renderList(parsed, container, countBadge);
            hasCache = true;
        } catch (e) {
            console.error("Cache parsing error:", e);
        }
    }

    if (!hasCache) {
        container.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status" style="width: 2.5rem; height: 2.5rem;"></div>
                <p class="text-muted mt-3 fw-normal" style="font-size: 12px;">กำลังดึงข้อมูลยานพาหนะล่าสุด...</p>
            </div>`;
        countBadge.innerText = '...';
    }

    const listController = new AbortController();
    const listTimeout = setTimeout(() => listController.abort(), 12000);
    try {
        const response = await fetch(CONFIG.GAS_URL, {signal: listController.signal});
        if (!response.ok) throw new Error('Vehicle list unavailable');
        const allData = await response.json();
        
        if (version !== vehicleLoadVersion) return;
        if (!Array.isArray(allData)) throw new Error(allData?.error || "Invalid vehicle list");

        const filtered = allData.filter(item => item['หน่วยงาน'] === DEPT_NAME);

        sessionStorage.setItem(CACHE_KEY, JSON.stringify(filtered));
        renderList(filtered, container, countBadge);
        fleetSnapshot = filtered.map(item => ({
            assetCode: item['หมายเลข'] || item['ทะเบียน'] || '-',
            plate: item['ทะเบียน'] || '-',
            type: item['ประเภท'] || '-',
            department: DEPT_NAME,
            assetLabel: item['หมายเลขครุภัณฑ์'] || item['หมายเลข'] || '-',
            photos: [item['รูปภาพ_1'], item['รูปภาพ_2']]
        }));
        updateFleetPdfButton();

    } catch (error) {
        if (version !== vehicleLoadVersion) return;
        console.error("Fetch Error:", error);
        if (!hasCache) {
            container.innerHTML = `
                <div class="text-center text-danger py-4 p-4 bg-white rounded-3 border border-danger shadow-sm">
                    <h6 class="fw-normal" style="font-size: 13px;">ไม่สามารถดึงข้อมูลได้</h6>
                    <p class="mb-0" style="font-size: 11px;">โปรดตรวจสอบการตั้งค่า GAS_URL หรืออินเทอร์เน็ต</p>
                    <button onclick="clearCacheAndReload()" class="btn btn-outline-danger btn-sm mt-3 fw-normal" style="font-size: 11px;">ลองใหม่อีกครั้ง</button>
                </div>`;
            countBadge.innerText = `Error`;
        }
    } finally {
        clearTimeout(listTimeout);
    }
}

function renderList(data, container, countBadge) {
    if (!data || data.length === 0) {
        container.innerHTML = `<div class="text-center text-muted py-5 bg-white rounded-3 border shadow-sm" style="font-size: 14px;">ยังไม่มีข้อมูลยานพาหนะในระบบ</div>`;
        countBadge.innerText = `0 คัน`;
        return;
    }

    let inspectedLog = JSON.parse(localStorage.getItem('inspectedVehicleLog_' + DEPT_NAME) || '{}');
    const now = new Date().getTime();

    data.sort((a, b) => {
        const aId = a['หมายเลข'] || a['ทะเบียน'];
        const bId = b['หมายเลข'] || b['ทะเบียน'];
        const aInspected = inspectedLog[aId] && (now - inspectedLog[aId].timestamp < 10 * 60 * 1000) ? 1 : 0;
        const bInspected = inspectedLog[bId] && (now - inspectedLog[bId].timestamp < 10 * 60 * 1000) ? 1 : 0;
        return aInspected - bInspected;
    });

    container.innerHTML = '';
    countBadge.innerText = `${data.length} คัน`;

    data.forEach(item => {
        const assetCode = item['หมายเลข'] || item['ทะเบียน'] || '-';
        const plate = item['ทะเบียน'] || '-';
        const type = item['ประเภท'] || '-';
        const model = item['ยี่ห้อ/รุ่น'] || '-';
        const color = item['สี'] || '-';

        let stateClass = "";
        let statusBadge = "";

        if (inspectedLog[assetCode]) {
            const timeDiff = now - inspectedLog[assetCode].timestamp;
            if (timeDiff < 10 * 60 * 1000) { 
                if (inspectedLog[assetCode].status === 'pass') {
                    stateClass = "vehicle-passed";
                    statusBadge = `<span class="badge bg-success shadow-sm px-2 py-1 fw-bold rounded" style="font-size: 12px;">ตรวจแล้ว</span>`;
                } else {
                    stateClass = "vehicle-damaged";
                    statusBadge = `<span class="badge shadow-sm px-2 py-1 fw-bold rounded" style="background-color: #dc3545; color: white; font-size: 12px;">ชำรุด</span>`;
                }
            } else {
                delete inspectedLog[assetCode];
            }
        }

        let img1Src = convertDriveLink(item['รูปภาพ_1']);
        let img2Src = convertDriveLink(item['รูปภาพ_2']);
        if (img2Src === "images/default.jpg") img2Src = img1Src;

        let carouselId = "slide-" + Math.random().toString(36).substr(2, 5);
        let imageBlockHTML = `
          <div id="${carouselId}" class="carousel slide vehicle-photo flex-shrink-0" data-bs-ride="carousel" data-bs-interval="2500">
            <div class="carousel-inner" style="height: 100%;">
              <div class="carousel-item active" style="height: 100%; transition: transform 0.8s ease-in-out;">
                <img src="${img1Src}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.onerror=null; this.src='images/default.jpg';">
              </div>
              <div class="carousel-item" style="height: 100%; transition: transform 0.8s ease-in-out;">
                <img src="${img2Src}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.onerror=null; this.src='images/default.jpg';">
              </div>
            </div>
          </div>
        `;

        container.insertAdjacentHTML('beforeend', `
            <article class="card eq-item vehicle-item cursor-pointer ${stateClass}">
                <div class="eq-item-label vehicle-label">
                    ${imageBlockHTML}
                    <div class="vehicle-details">
                        <h2>${type} ${model}</h2>
                        <p class="eq-description">ทะเบียน: ${plate} (สี${color})</p>
                        <p class="eq-description">หมายเลข: ${assetCode}</p>
                        ${statusBadge}
                    </div>
                </div>
                <div class="eq-item-actions vehicle-actions">
                    <button type="button" class="eq-button eq-primary" data-vehicle-inspect>ตรวจ</button>
                    <button type="button" class="eq-button" data-vehicle-maintenance>ซ่อมบำรุง</button>
                    <button type="button" class="eq-button" data-vehicle-history>ประวัติ</button>
                </div>
            </article>
        `);
        const card = container.lastElementChild;
        card.addEventListener('click', event => {
            if (!event.target.closest('button') || event.target.closest('[data-vehicle-inspect]')) {
                openForm(assetCode, plate, model, type);
            }
        });
        card.querySelector('[data-vehicle-maintenance]').addEventListener('click', event => {
            event.stopPropagation();
            const params = new URLSearchParams({dept: deptKey, assetCode, model});
            window.location.href = 'maintenance_form.html?' + params.toString();
        });
        const historyButton = container.lastElementChild.querySelector('[data-vehicle-history]');
        historyButton.addEventListener('click', event => {
            event.stopPropagation();
            VehicleHistoryPdf.open({
                assetCode, plate, type, department: DEPT_NAME,
                assetLabel: item['หมายเลขครุภัณฑ์'] || item['หมายเลข'] || '-',
                photos: [item['รูปภาพ_1'], item['รูปภาพ_2']]
            }, CONFIG.GAS_URL);
        });
    });

    localStorage.setItem('inspectedVehicleLog_' + DEPT_NAME, JSON.stringify(inspectedLog));

    const carousels = document.querySelectorAll('.carousel');
    carousels.forEach(carousel => {
        new bootstrap.Carousel(carousel, {
            interval: 2500,
            ride: 'carousel'
        });
    });
}

function filterVehicles() {
    const query = document.getElementById("searchInput").value.toLowerCase();
    const items = document.querySelectorAll("#vehicle-container .card"); 

    items.forEach(function(item) {
        const itemText = item.textContent.toLowerCase();
        if (itemText.includes(query)) {
            item.style.display = "";
        } else {
            item.style.display = "none";
        }
    });
}

function setupForm() {
    const form = document.getElementById('inspection-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inspectDateField = document.getElementById('inspectionDate');
        if (!inspectDateField.reportValidity()) return;
        const inspectDate = inspectDateField.value;
        if (inspectDate !== InspectionDate.today() && CONFIG.VEHICLE_INSPECTION_DATE_READY !== true) {
            alert('ยังไม่ได้ส่งข้อมูล: ระบบบันทึกผลตรวจยานพาหนะยังไม่รองรับวันที่อื่นนอกจากวันนี้');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span> กำลังบันทึกข้อมูล...`;

        const assetCode = document.getElementById('vehicleAssetCode').value;
        
        const getVal = (name) => {
            const el = document.querySelector(`input[name="${name}"]:checked`);
            return el ? el.value : 'pass';
        };
        const getReason = (name) => document.getElementById(`${name}_reason`) ? document.getElementById(`${name}_reason`).value : '';

        const body = getVal('body');
        const tires = getVal('tires');
        const brakes = getVal('brakes');
        const lights = getVal('lights');
        const horn = getVal('horn');
        const fluids = getVal('fluids');
        const battery = getVal('battery');
        const engine = getVal('engine');

        const isAllPass = (body === 'pass' && tires === 'pass' && brakes === 'pass' && lights === 'pass' && 
                           horn === 'pass' && fluids === 'pass' && battery === 'pass' && engine === 'pass');

        const formatCheck = (status, reason) => status === 'pass' ? 'ปกติ' : 'ชำรุด: ' + reason;

        const payload = {
            action: "inspection",
            vehicleAssetCode: assetCode,
            vehiclePlate: document.getElementById('vehiclePlate').value,
            inspectDate,
            inspectorName: document.getElementById('inspectorName').value,
            checkBody: formatCheck(body, getReason('body')),
            checkTires: formatCheck(tires, getReason('tires')),
            checkBrakes: formatCheck(brakes, getReason('brakes')),
            checkLights: formatCheck(lights, getReason('lights')),
            checkHorn: formatCheck(horn, getReason('horn')),
            checkFluids: formatCheck(fluids, getReason('fluids')),
            checkBattery: formatCheck(battery, getReason('battery')),
            checkEngine: formatCheck(engine, getReason('engine')),
            finalStatus: isAllPass ? 'ปกติ' : 'ชำรุด',
            note: document.getElementById('remark').value,
            department: DEPT_NAME
        };

        try {
            await fetch(CONFIG.GAS_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            let inspectedLog = JSON.parse(localStorage.getItem('inspectedVehicleLog_' + DEPT_NAME) || '{}');
            inspectedLog[assetCode] = {
                timestamp: new Date().getTime(),
                status: isAllPass ? 'pass' : 'fail'
            };
            localStorage.setItem('inspectedVehicleLog_' + DEPT_NAME, JSON.stringify(inspectedLog));

            sessionStorage.removeItem(CACHE_KEY);

            alert('ส่งข้อมูลการตรวจแล้ว แต่เว็บยังยืนยันการบันทึกไม่ได้ กรุณาตรวจในประวัติ');
            showSection('page-list');
            loadVehicles(); 

        } catch (err) {
            alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
            console.error(err);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `บันทึกข้อมูลการตรวจ`;
        }
    });
}


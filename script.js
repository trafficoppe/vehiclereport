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

document.addEventListener("DOMContentLoaded", () => {
    const titleDisplay = document.getElementById('dept-title-display');
    if (titleDisplay) {
        titleDisplay.innerHTML = DEPT_NAME; 
    }

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
    document.getElementById('inspectionDate').value = InspectionDate.today();
    
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

    try {
        const response = await fetch(CONFIG.GAS_URL);
        const allData = await response.json();
        
        if (allData.error) throw new Error(allData.error);

        const filtered = allData.filter(item => item['หน่วยงาน'] === DEPT_NAME);

        sessionStorage.setItem(CACHE_KEY, JSON.stringify(filtered));
        renderList(filtered, container, countBadge);

    } catch (error) {
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

        let borderClass = "border-start border-5"; 
        let cardStyle = "background-color: #ffffff; border-left-color: #2e5831 !important;"; 
        let statusBadge = "";

        if (inspectedLog[assetCode]) {
            const timeDiff = now - inspectedLog[assetCode].timestamp;
            if (timeDiff < 10 * 60 * 1000) { 
                if (inspectedLog[assetCode].status === 'pass') {
                    cardStyle = "background-color: #d1e7dd !important; border-left-color: #198754 !important;";
                    statusBadge = `<span class="badge bg-success shadow-sm px-2 py-1 fw-bold rounded" style="font-size: 12px;">ตรวจแล้ว</span>`;
                } else {
                    cardStyle = "background-color: #f8d7da !important; border-left-color: #dc3545 !important;";
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
          <div id="${carouselId}" class="carousel slide me-3 flex-shrink-0" data-bs-ride="carousel" data-bs-interval="2500" 
               style="width: 90px; height: 90px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.15);">
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
            <div class="card mb-3 shadow-sm border-0 ${borderClass} cursor-pointer" 
                 style="${cardStyle}"
                 onclick="openForm('${assetCode}', '${plate}', '${model}', '${type}')">
                
                <div class="card-body p-3 d-flex align-items-center">
                    
                    ${imageBlockHTML}
                    
                    <div class="flex-grow-1 d-flex flex-column justify-content-between" style="min-height: 90px;">
                        
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <div class="text-start mb-0" style="line-height: 1.4;">
                                <div style="font-size: 15px; color: #000; font-weight: bold;">${type} ${model}</div>
                                <div style="font-size: 14px; color: #000; font-weight: bold;">ทะเบียน: ${plate} (สี${color})</div>
                                <div style="font-size: 14px; color: #000; font-weight: normal;">หมายเลข: ${assetCode}</div>
                            </div>
                            <div class="flex-shrink-0 ms-2">
                                ${statusBadge}
                            </div>
                        </div>
                        
                        <div class="text-start d-flex flex-wrap gap-2 mt-auto pt-2">
                            <button class="btn btn-warning btn-sm rounded-pill fw-bold px-3 shadow-sm" style="color: #000;"
                                    onclick="event.stopPropagation(); window.location.href='maintenance_form.html?dept=${deptKey}&assetCode=${assetCode}&model=${encodeURIComponent(model)}';">
                                ซ่อมบำรุง
                            </button>
                            <button class="btn btn-dark btn-sm rounded-pill fw-bold px-3 shadow-sm" style="color: #fff;"
                                    data-vehicle-history>
                                ประวัติ
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        `);
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


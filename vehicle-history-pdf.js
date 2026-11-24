/* รายงาน PDF ใช้ข้อมูลประวัติเดิม ไม่เขียนผลตรวจหรือเรียกบริการสร้าง PDF ภายนอก */
(function (window) {
    'use strict';
    const checks = [
        ['checkBody', 'ตัวรถ'], ['checkTires', 'ยาง'], ['checkBrakes', 'เบรก'], ['checkLights', 'ไฟ'],
        ['checkHorn', 'แตร'], ['checkFluids', 'ของเหลว'], ['checkBattery', 'แบตเตอรี่'], ['checkEngine', 'เครื่องยนต์']
    ];
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    const shortMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const columns = ['เดือน', 'วันที่ตรวจ', ...checks.map(x => x[1]), 'สถานะรวม', 'ผู้ตรวจ'];
    const timeZone = 'Asia/Bangkok';
    const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    const dateParts = (y, m, d) => {
        if (y >= 2400) y -= 543;
        if (![y,m,d].every(Number.isInteger) || y < 1900 || y > 2300 || m < 1 || m > 12 || d < 1 || d > 31) return null;
        const check = new Date(Date.UTC(y,m-1,d));
        if (check.getUTCFullYear() !== y || check.getUTCMonth() + 1 !== m || check.getUTCDate() !== d) return null;
        return {year:y, month:m, day:d, key:[y, String(m).padStart(2,'0'), String(d).padStart(2,'0')].join('-')};
    };
    const dateInBangkok = d => {
        if (!Number.isFinite(d.valueOf())) return null;
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {year:'numeric', month:'2-digit', day:'2-digit', timeZone}).formatToParts(d).map(p => [p.type,p.value]));
        return dateParts(+parts.year,+parts.month,+parts.day);
    };
    function parseDate(raw, legacy = false) {
        const s = text(raw);
        const iso = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s);
        if (iso) return dateParts(+iso[1],+iso[2],+iso[3]);
        if (!legacy) return null;
        const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ ,T]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*[AP]M)?)?$/i.exec(s);
        if (slash) return dateParts(slash[3].length === 2 ? +slash[3]+2500 : +slash[3],+slash[2],+slash[1]);
        const stamp = /^(\d{4})-(\d\d)-(\d\d)[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(Z|[+-]\d\d:?\d\d)?$/i.exec(s);
        if (!stamp || !dateParts(+stamp[1],+stamp[2],+stamp[3])) return null;
        return stamp[4] ? dateInBangkok(new Date(s.replace(' ','T'))) : dateParts(+stamp[1],+stamp[2],+stamp[3]);
    }
    // Apps Script may return legacy D/M/YYYY text or a zoned ISO timestamp.
    // No native parsing of ambiguous slash dates and no assumed arbitrary clock.
    function parseRecordedTimestamp(raw) {
        const value=text(raw);
        const slash=/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:\s*([AP]M))?$/i.exec(value);
        const iso=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(value);
        const m=slash||iso;
        if(!m)return null;
        const y=slash?(m[3].length===2?+m[3]+2500:+m[3]):+m[1];
        const d=dateParts(y,+m[2],+(slash?m[1]:m[3]));
        let hh=+m[4],min=+m[5],sec=+(m[6]||0),ms=+(m[7]||'').padEnd(3,'0');
        if(slash&&m[8]){
            if(hh<1||hh>12)return null;
            hh=(hh%12)+(m[8].toUpperCase()==='PM'?12:0);
        }
        if(!d||hh>23||min>59||sec>59)return null;
        let offset=7*60;
        if(iso&&m[8]){
            if(m[8].toUpperCase()==='Z')offset=0;
            else{
                const n=m[8].slice(1).replace(':',''),oh=+n.slice(0,2),om=+n.slice(2);
                if(oh>23||om>59)return null;
                offset=(m[8][0]==='-'?-1:1)*(oh*60+om);
            }
        }
        return Date.UTC(d.year,d.month-1,d.day,hh,min,sec,ms)-offset*60000;
    }
    function mark(v, overall = false) {
        const s = text(v);
        if (/^(?:ปกติ|ใช้งานได้)$/.test(s)) return overall ? 'ใช้งานได้' : 'ปกติ';
        if (/^(?:ชำรุด|ไม่ปกติ|ผิดปกติ|พบข้อบกพร่อง|ใช้งานไม่ได้)(?:\s*[:：]|\s*$)/.test(s)) return overall ? 'พบข้อบกพร่อง' : 'ผิดปกติ';
        return '-';
    }
    function formatDate(d) {return d ? d.day + ' ' + shortMonths[d.month-1] + ' ' + (d.year+543) : '-';}
    function scopedLogs(raw, vehicle) {
        const assetCode = text(vehicle.assetCode), department = text(vehicle.department);
        if (!Array.isArray(raw) || !assetCode || assetCode === '-' || !department) throw Error('ไม่พบข้อมูลรถที่ใช้จัดทำรายงาน');
        return raw.flatMap(record => {
            if (!record || text(record.vehicleAssetCode) !== assetCode || text(record.department) !== department) return [];
            const chosen = text(record.inspectDate) || text(record.inspectionDate);
            const d = chosen ? parseDate(chosen) : parseDate(record.timestamp, true);
            return [{record, date:d, recordedAt:parseRecordedTimestamp(record.timestamp)}];
        });
    }
    function reportRows(logs, year) {
        const bins=Array.from({length:12},()=>[]);
        for(const row of logs){
            if(row.date?.year!==year)continue;
            const bin=bins[row.date.month-1];
            if(!bin.length||row.date.key>bin[0].date.key)bins[row.date.month-1]=[row];
            else if(row.date.key===bin[0].date.key)bin.push(row);
        }
        const project=({record,date},i)=>({
            labels:[months[i],formatDate(date),...checks.map(([key])=>mark(record[key])),mark(record.finalStatus,true),text(record.inspectorName)||'-'],
            details:[
                ...checks.flatMap(([key,name])=>mark(record[key])==='ผิดปกติ'?[name+': '+text(record[key])]:[]),
                ...(text(record.note)?['หมายเหตุ: '+text(record.note)]:[])
            ]
        });
        let ambiguous=0;
        const rows=bins.map((bin,i)=>{
            if(!bin.length)return {labels:[months[i],...Array(9).fill('-'),'ไม่มีข้อมูล','-'],details:[]};
            // Use source clock, never a status preference or unverified array order.
            const known=bin.filter(x=>x.recordedAt!==null);
            const last=known.reduce((v,r)=>Math.max(v,r.recordedAt),-Infinity);
            const candidates=bin.filter(x=>x.recordedAt===null||x.recordedAt===last);
            const display=candidates.map(x=>project(x,i));
            if(display.every(x=>JSON.stringify(x)===JSON.stringify(display[0])))return display[0];
            ambiguous++;
            return {labels:[months[i],formatDate(bin[0].date),...Array(8).fill('-'),'ต้องตรวจสอบ','-'],
                details:['มีหลายรายการในวันเดียวกันที่ยังยืนยันลำดับล่าสุดไม่ได้']};
        });
        const monthsWithData=bins.filter(x=>x.length).length;
        return {rows,months:monthsWithData,count:monthsWithData-ambiguous,ambiguous,undated:logs.filter(r=>!r.date).length};
    }
    function photoCandidates(source, base, bundled = new URL('assets/vehicle-pdf/', base)) {
        return Array.from(new Set(source.flatMap(raw => {
            const s = text(raw);
            if (!s || s === '-') return [];
            try {
                const u = new URL(s, base);
                if (!(u.protocol === 'https:' || (u.protocol === 'http:' && u.origin === new URL(base).origin)) || u.username || u.password || /(^|\/)images\/default\.jpg$/i.test(u.pathname)) return [];
                // The downloaded copies use only these exact public attachment IDs. Never fall back to another vehicle.
                const attachment = u.hostname === 'github.com' && /^\/user-attachments\/assets\/([a-f0-9-]{36})\/?$/i.exec(u.pathname);
                if (attachment) return [new URL('photos/'+attachment[1].toLowerCase()+'.jpg',bundled).href,u.href];
                if (u.hostname !== 'drive.google.com') return [u.href];
                const id = u.searchParams.get('id') || /\/d\/([\w-]+)/.exec(u.pathname)?.[1];
                if (!/^[\w-]{8,}$/.test(id || '')) return [u.href];
                return ['https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w750',
                    'https://lh3.googleusercontent.com/d/'+encodeURIComponent(id)+'=w750'];
            } catch (_) {return [];}
        })));
    }
    function loadImage(url) {
        return new Promise(resolve => {
            const image = new Image();
            const finish = result => {clearTimeout(timer); image.onload = image.onerror = null; if (!result) image.removeAttribute('src'); resolve(result);};
            const timer = setTimeout(()=>finish(null),2200);
            image.crossOrigin = 'anonymous'; image.referrerPolicy = 'no-referrer';
            image.onerror = () => finish(null);
            image.onload = () => {
                try {
                    if (image.naturalWidth < 32 || image.naturalHeight < 32) return finish(null);
                    const scale = Math.min(1,720 / Math.max(image.naturalWidth,image.naturalHeight));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1,Math.round(image.naturalWidth*scale));
                    canvas.height = Math.max(1,Math.round(image.naturalHeight*scale));
                    const ctx = canvas.getContext('2d',{willReadFrequently:true});
                    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height);
                    ctx.drawImage(image,0,0,canvas.width,canvas.height);
                    const frame = ctx.getImageData(0,0,canvas.width,canvas.height);
                    for (let i=0;i<frame.data.length;i+=4) {
                        frame.data[i] = frame.data[i+1] = frame.data[i+2] = Math.round(0.299*frame.data[i]+0.587*frame.data[i+1]+0.114*frame.data[i+2]);
                    }
                    ctx.putImageData(frame,0,0); finish(canvas.toDataURL('image/jpeg',0.86));
                } catch (_) {finish(null);}
            };
            image.src = url;
        });
    }
    async function selectedPhoto(vehicle) {
        for (const candidate of photoCandidates(vehicle.photos, window.location.href, assetBase)) {
            const image = await loadImage(candidate);
            if (image) return image;
        }
        return '';
    }
    function makeDocument(vehicle, year, report, photo, now = new Date()) {
        const title = 'รายงานประวัติการตรวจยานพาหนะ';
        const thin = {hLineWidth:()=>.55,vLineWidth:()=>.55,hLineColor:()=>'#000',vLineColor:()=>'#000',
            paddingTop:()=>0.95,paddingBottom:()=>0.95,paddingLeft:()=>4,paddingRight:()=>4};
        const row = r => r.labels.map((s,i)=>({text:s,alignment:i === 0 ? 'left' : 'center',bold:i === 0 || i === 10 || s==='ผิดปกติ'}));
        const details = report.rows.filter(r=>r.details.length).map(r=>({text:r.labels[1]+'  '+r.details.join('  |  '),margin:[0,1,0,2]}));
        const footDate = dateInBangkok(now);
        return {
            pageSize:'A4',pageOrientation:'landscape',pageMargins:[28,24,28,24],
            info:{title,subject:'ประวัติการตรวจยานพาหนะ'},
            defaultStyle:{font:'Sarabun',fontSize:13,color:'#000',lineHeight:1.0},
            footer:(page,pages)=>({text:page+' / '+pages,alignment:'right',fontSize:11,margin:[28,4]}),
            content:[
                {columns:[
                    {width:172,stack:[photo ? {image:photo,fit:[163,92]} :
                        {stack:[{canvas:[{type:'rect',x:0,y:0,w:163,h:90,lineWidth:.55}]},
                            {text:'ไม่สามารถแสดงรูปยานพาหนะ',width:163,alignment:'center',fontSize:12,margin:[0,-53,9,42]}]},
                        {text:photo?'ภาพยานพาหนะ':'ไม่มีรูปที่ใช้ได้ในรายงาน',fontSize:11,margin:[0,3,0,0]}]},
                    {width:'*',stack:[{text:title,fontSize:29,bold:true},{text:'ประจำปี พ.ศ. '+(year+543)+' | กองกายภาพและสิ่งแวดล้อม มหาวิทยาลัยมหิดล',fontSize:15,margin:[0,3,0,0]}],alignment:'center',margin:[0,25,0,0]},
                    {width:172,text:''}
                ],margin:[0,0,0,12]},
                {table:{widths:['*','*','*'],body:[[
                    {text:[{text:'ทะเบียน: ',bold:true},text(vehicle.plate)||'-']},
                    {text:[{text:'รหัสทรัพย์สิน: ',bold:true},text(vehicle.assetLabel ?? vehicle.assetCode)||'-']},
                    {text:[{text:'ประเภท: ',bold:true},text(vehicle.type)||'-']}
                ]]},layout:thin},
                {text:[{text:'สรุป: ',bold:true},'มีข้อมูล '+report.months+' เดือน · แสดงผลล่าสุดเดือนละ 1 รายการ  |  ข้อมูล ณ วันที่ '+formatDate(footDate)],margin:[0,7,0,4]},
                {table:{headerRows:1,dontBreakRows:true,widths:[67,78,47,43,44,43,42,55,56,61,90,'*'],body:[
                    columns.map((s,i)=>({text:s,bold:true,alignment:i===0?'left':'center'})),...report.rows.map(row)
                ]},layout:thin},
                {text:[{text:'คำอธิบาย: ',bold:true},'ปกติ = ผลตรวจปกติ   ·   ผิดปกติ = พบข้อบกพร่อง   ·   ขีด (-) = ไม่มีข้อมูล ไม่ได้หมายความว่าตรวจผ่าน'],margin:[0,7,0,3]},
                ...(report.undated ? [{text:'ไม่นำ '+report.undated+' รายการที่ระบุวันที่ตรวจไม่ได้มารวมในปีที่เลือก',margin:[0,0,0,3]}] : []),
                ...(details.length ? [{text:'รายละเอียดข้อบกพร่องและหมายเหตุ',bold:true,margin:[0,2,0,1]},...details] : [])
            ]
        };
    }
    const assetBase = typeof document === 'undefined' ? null : new URL('assets/vehicle-pdf/',document.currentScript.src);
    let fontPrep, generation = 0, authFetch;
    function toBase64(bytes) {
        let data = '';
        const array = new Uint8Array(bytes);
        for (let i=0;i<array.length;i+=8192) data += String.fromCharCode(...array.subarray(i,i+8192));
        return window.btoa(data);
    }
    async function prepareFonts() {
        if (!window.pdfMake) throw Error('ไม่พบโปรแกรมสร้าง PDF');
        if (!fontPrep) {
            const names = ['THSarabunNew.ttf','THSarabunNewBold.ttf'];
            fontPrep = Promise.all(names.map(async name => {
                const res = await fetch(new URL(name,assetBase),{redirect:'error'});
                if (!res.ok) throw Error('โหลดฟอนต์รายงานไม่สำเร็จ');
                return [name,toBase64(await res.arrayBuffer())];
            })).then(files=>{
                window.pdfMake.addVirtualFileSystem(Object.fromEntries(files));
                window.pdfMake.addFonts({Sarabun:{normal:names[0],bold:names[1],italics:names[0],bolditalics:names[1]}});
            }).catch(e=>{fontPrep=null;throw e;});
        }
        await fontPrep;
    }
    function filename(vehicle, year) {
        const id = text(vehicle.plate !== '-' ? vehicle.plate : vehicle.assetCode)
            .replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\s+/g,'-').slice(0,90) || 'ยานพาหนะ';
        return 'ประวัติการตรวจยานพาหนะ-'+id+'-'+(year+543)+'.pdf';
    }
    async function download(vehicle, year, report, stillCurrent) {
        const [,photo] = await Promise.all([prepareFonts(),selectedPhoto(vehicle)]);
        if (!stillCurrent()) return false;
        const pdf = window.pdfMake.createPdf(makeDocument(vehicle,year,report,photo));
        const blob = await new Promise((resolve,reject)=>{
            let result;
            try {result = pdf.getBlob(resolve);} catch (e) {reject(e);}
            if (result && typeof result.catch === 'function') result.catch(reject);
        });
        if (!blob || !stillCurrent()) return false;
        const href = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = href; link.download = filename(vehicle,year);
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(()=>URL.revokeObjectURL(href),30000);
        return Boolean(photo) ? 'with-photo' : 'without-photo';
    }
    function drawHistory(target, report) {
        const wrap = document.createElement('div'); wrap.className='table-responsive';
        const table = document.createElement('table'); table.className='table table-sm table-bordered align-middle text-center text-nowrap mb-0';
        const head=table.createTHead().insertRow(); columns.forEach(name=>{const cell=document.createElement('th');cell.scope='col';cell.textContent=name;head.append(cell);});
        const body=table.createTBody();
        report.rows.forEach(r=>{const tr=body.insertRow();r.labels.forEach(s=>{const cell=tr.insertCell();cell.textContent=s;});});
        wrap.append(table); target.replaceChildren(wrap);
    }
    async function open(vehicle, gasUrl) {
        const serial = ++generation;
        if (authFetch) authFetch.abort();
        const ctl = authFetch = new AbortController();
        const modal=document.getElementById('historyModal'), container=document.getElementById('historyListContainer');
        const year=document.getElementById('historyReportYear'), button=document.getElementById('historyPdfDownload'), status=document.getElementById('historyPdfStatus');
        const active=()=>serial===generation&&!ctl.signal.aborted;
        document.getElementById('historyAssetCode').textContent=vehicle.assetCode;
        document.getElementById('historyVehiclePlate').textContent=vehicle.plate && vehicle.plate!=='-' ? 'ทะเบียน '+vehicle.plate : '';
        button.disabled=true; year.disabled=true; status.textContent=''; year.replaceChildren();
        container.textContent='กำลังโหลดประวัติการตรวจ...';
        if (window.bootstrap.Modal.getOrCreateInstance) window.bootstrap.Modal.getOrCreateInstance(modal).show();
        else new window.bootstrap.Modal(modal).show();
        modal.addEventListener('hidden.bs.modal',()=>ctl.abort(),{once:true});
        try {
            const url=new URL(gasUrl); url.searchParams.set('action','get_vehicle_log'); url.searchParams.set('assetCode',vehicle.assetCode);
            const response=await fetch(url,{signal:ctl.signal,cache:'no-store'});
            if (!response.ok) throw Error('history unavailable');
            const raw=await response.json();
            if (!active()) return;
            const logs=scopedLogs(raw,vehicle), current=dateInBangkok(new Date()).year;
            if (raw.length && !logs.length) throw Error('unmatched history result');
            const years=[...new Set([current,...logs.flatMap(r=>r.date?[r.date.year]:[])])].sort((a,b)=>b-a);
            years.forEach(y=>{const opt=document.createElement('option');opt.value=y;opt.textContent='พ.ศ. '+(y+543);year.append(opt);});
            year.value=current; year.disabled=false; button.disabled=false;
            let busy=false, currentReport, selectedYear;
            const show=()=>{
                selectedYear=+year.value;
                currentReport=reportRows(logs,selectedYear);
                drawHistory(container,currentReport);
                status.textContent=[
                    currentReport.undated?'มี '+currentReport.undated+' รายการที่ระบุวันที่ไม่ได้ ไม่นำมารวมในรายงานรายปี':'',
                    currentReport.ambiguous?'มี '+currentReport.ambiguous+' เดือนที่ยังยืนยันลำดับรายการล่าสุดไม่ได้':''
                ].filter(Boolean).join(' · ');
            };
            year.onchange=show; show();
            button.onclick=async ()=>{
                if (!active() || busy) return;
                busy=true; button.disabled=true; year.disabled=true; status.textContent='กำลังจัดทำ PDF...';
                try {
                    const result=await download(vehicle,selectedYear,currentReport,active);
                    if (active() && result) status.textContent=result==='with-photo'?'ดาวน์โหลด PDF แล้ว':'ดาวน์โหลด PDF แล้ว (ไม่สามารถฝังรูปยานพาหนะได้)';
                } catch (_) {
                    if (active()) status.textContent='สร้างไฟล์ PDF ไม่สำเร็จ กรุณาลองอีกครั้ง';
                } finally {if(active()){busy=false;button.disabled=false;year.disabled=false;}}
            };
        } catch (_) {
            if (active()) container.textContent='โหลดประวัติคันนี้ไม่ได้ กรุณาเปิดใหม่แล้วลองอีกครั้ง';
        }
    }
    window.VehicleHistoryPdf={open};
    if (typeof module !== 'undefined') module.exports={scopedLogs,parseDate,parseRecordedTimestamp,reportRows,makeDocument,photoCandidates,filename,mark};
})(typeof window==='undefined' ? globalThis : window);

(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const items=formSections.flatMap(s=>s.items.filter(item=>item.active!==false)), inventory=$('equipment-inventory'), form=$('equipment-form'), dialog=$('repair-history');
 const list=$('equipment-items'), state=$('repair-state'), wrap=$('repair-table'), tbody=$('repair-rows'), pdf=$('repair-pdf');
 const dateFmt=new Intl.DateTimeFormat('th-TH-u-ca-buddhist-nu-latn',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
 const dateLabel=s=>dateFmt.format(new Date(s+'T00:00:00Z'));
 const term=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value??'';if(cls)n.className=cls;return n;};
 const message=(v,isError=false)=>{state.textContent=v;state.classList.toggle('text-danger',isError);};
 let inspectOpener=null;
 function setPanel(inspect,item,opener){
  inventory.hidden=inspect;form.hidden=!inspect;
  if(!inspect){(inspectOpener||$('equipment-start')).focus();inspectOpener=null;return;}
  inspectOpener=opener||$('equipment-start');
  $('equipment-review').checked=false;
  const target=item?document.querySelector('input[name="'+item.id+'"]:checked'):$('inspectDate');
  target?.focus();
 }
 $('equipment-start').addEventListener('click',()=>setPanel(true));$('equipment-return').addEventListener('click',()=>setPanel(false));
 let ticket=0,current=null,active=null,opener=null;
 function close(){
  ++ticket;active?.abort();active=null;current=null;
  if(dialog.open)dialog.close();
  opener?.focus();opener=null;
 }
 $('repair-close').addEventListener('click',close);
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 function normalize(id,data){
  if(data?.status!=='success'||data.itemId!==id||!Array.isArray(data.rows)||data.rows.length>1000)throw Error('ระบบส่งประวัติไม่ตรงกับรายการนี้');
  return data.rows.map(r=>{
   if(r?.itemId!==id||!iso(r.date)||typeof r.work!=='string'||!r.work.trim()||r.work.length>1500||typeof r.result!=='string'||r.result.length>500)throw Error('ข้อมูลประวัติซ่อมไม่ครบหรือไม่ตรงรายการ');
   return {date:r.date,work:r.work.trim(),result:r.result.trim()};
  }).sort((a,b)=>b.date.localeCompare(a.date));
 }
 async function getRepairs(item,endpoint,controller){
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const url=new URL(endpoint);
   if(url.protocol!=='https:'||url.username||url.password)throw Error('ตั้งค่าปลายทางไม่ถูกต้อง');
   url.searchParams.set('action','equipment_repair_history');
   url.searchParams.set('itemId',item.id);
   const response=await fetch(url,{credentials:'include',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('อ่านประวัติการซ่อมไม่ได้');
   return normalize(item.id,await response.json());
  }finally{clearTimeout(timeout);}
 }
 const missingSource='ยังไม่ได้เชื่อมแหล่งประวัติการซ่อม จึงยังยืนยันไม่ได้ว่ามีประวัติหรือไม่';
 async function open(item,from){
  const seq=++ticket;active?.abort();current=null;opener=from;tbody.replaceChildren();wrap.hidden=pdf.hidden=true;pdf.disabled=false;
  $('repair-title').textContent='ประวัติการซ่อม: '+item.name;
  if(!dialog.open)dialog.showModal();
  $('repair-close').focus();
  const endpoint=CONFIG.EQUIPMENT_REPAIR_HISTORY_URL;
  if(!endpoint){message(missingSource);return;}
  message('กำลังโหลดประวัติการซ่อม…');
  const controller=new AbortController();active=controller;
  try{
   const rows=await getRepairs(item,endpoint,controller);
   if(seq!==ticket)return;
   current={item,rows};pdf.hidden=false;
   for(const row of rows){const tr=term('tr');tr.append(term('td',dateLabel(row.date)),term('td',row.work),term('td',row.result||'—'));tbody.append(tr);}
   wrap.hidden=!rows.length;
   message(rows.length?'พบ '+rows.length+' รายการ':'ยังไม่มีประวัติการซ่อมที่บันทึกไว้');
  }catch(_){if(seq===ticket)message('โหลดประวัติการซ่อมไม่ได้ กรุณาตรวจการเชื่อมต่อหรือสิทธิ์ แล้วเปิดใหม่อีกครั้ง',true);}
  finally{if(seq===ticket)active=null;}
 }

 const checks=$('equipment-check-history'), checkState=$('check-history-state'), checkRows=$('check-history-rows'), checkTable=$('check-history-table');
 let checkOpener=null, checkRequest=null;
 function closeChecks(){
  checkRequest?.abort();checkRequest=null;
  if(checks.open)checks.close();
  checkOpener?.focus();checkOpener=null;
 }
 $('check-history-close').addEventListener('click',closeChecks);
 checks.addEventListener('cancel',e=>{e.preventDefault();closeChecks();});
 async function openChecks(item,from){
  checkRequest?.abort();
  const request=new AbortController();checkRequest=request;checkOpener=from;
  checkRows.replaceChildren();checkTable.hidden=true;
  $('check-history-title').textContent='ประวัติการตรวจ: '+item.name;
  checkState.textContent='กำลังโหลดประวัติการตรวจ…';
  if(!checks.open)checks.showModal();
  $('check-history-close').focus();
  const timeout=setTimeout(()=>request.abort(),12000);
  try{
   const url=new URL(CONFIG.GAS_URL);
   url.searchParams.set('action','equipment_inspection_history');
   url.searchParams.set('itemId',item.id);
   const res=await fetch(url,{cache:'no-store',credentials:'omit',signal:request.signal});
   if(!res.ok)throw Error('history');
   const data=await res.json();
   if(data?.status!=='success'||data.itemId!==item.id||!Array.isArray(data.rows)||data.rows.length>100||
    !data.rows.every(row=>iso(row?.date)&&['ready','defect'].includes(row.condition)&&typeof row.legacy==='boolean'))throw Error('history');
   if(checkRequest!==request)return;
   for(const row of data.rows){
    const tr=term('tr');
    tr.append(term('td',dateLabel(row.date)+(row.legacy?' (วันที่บันทึก)':'')),
     term('td',row.condition==='ready'?'พร้อมใช้งาน':'ชำรุด'));
    checkRows.append(tr);
   }
   checkTable.hidden=!data.rows.length;
   checkState.textContent=data.rows.length?'แสดง '+data.rows.length+' ผลตรวจล่าสุด':'ยังไม่มีผลตรวจของอุปกรณ์นี้';
  }catch(_){
   if(checkRequest===request)checkState.textContent='โหลดประวัติการตรวจไม่ได้ กรุณาลองใหม่อีกครั้ง';
  }finally{clearTimeout(timeout);if(checkRequest===request)checkRequest=null;}
 }
 for(const [i,item] of items.entries()){
  const card=term('article','','eq-item'), head=term('div','','eq-item-label');
  const description=term('div');description.append(term('h2',item.name),term('p',item.description,'eq-description'));
  head.append(term('span',String(i+1).padStart(2,'0'),'eq-order'),description);
  const action=term('button','ประวัติการซ่อม','eq-button eq-secondary');action.type='button';
  action.setAttribute('aria-label','ประวัติการซ่อม '+item.name);action.addEventListener('click',()=>open(item,action));
  const inspect=term('button','ตรวจ','eq-button eq-primary');inspect.type='button';inspect.setAttribute('aria-label','เริ่มตรวจทั้ง '+items.length+' รายการ ที่ '+item.name);inspect.setAttribute('aria-describedby','equipment-list-scope');
  inspect.addEventListener('click',()=>setPanel(true,item,inspect));
  const check=term('button','ประวัติการตรวจ','eq-button eq-secondary');check.type='button';
  check.setAttribute('aria-label','ประวัติการตรวจ '+item.name);check.addEventListener('click',()=>openChecks(item,check));
  const actions=term('div','','eq-item-actions eq-history-actions');actions.append(check,action,inspect);card.append(head,actions);list.append(card);
 }
 let fonts;
 async function fontFiles(){
  if(!fonts)fonts=Promise.all(['THSarabunNew.ttf','THSarabunNewBold.ttf'].map(async name=>{
   const r=await fetch('assets/vehicle-pdf/'+name);if(!r.ok)throw Error('font');
   const bytes=new Uint8Array(await r.arrayBuffer());let binary='';for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));return [name,btoa(binary)];
  })).then(Object.fromEntries).catch(e=>{fonts=null;throw e;});
  return fonts;
 }
 function pdfDefinition(entries, connected){
  const title=connected?'ประวัติการซ่อมอุปกรณ์ความปลอดภัย':'รายการอุปกรณ์ความปลอดภัย (ยังไม่เชื่อมประวัติซ่อม)';
  const content=[
   {text:title,alignment:'center',bold:true,fontSize:22},
   {text:'งานจราจรและความปลอดภัย',alignment:'center',fontSize:17,margin:[0,0,0,12]}
  ];
  if(entries.length>1)content.push({text:'อุปกรณ์ทั้งหมด '+entries.length+' รายการ',bold:true,margin:[0,0,0,8]});
  if(!connected){
   content.push({text:missingSource,margin:[0,0,0,8]});
   content.push({table:{headerRows:1,dontBreakRows:true,widths:[38,170,'*'],body:[
    ['ลำดับ','อุปกรณ์','สิ่งที่ตรวจ'].map(text=>({text,bold:true})),
    ...entries.map(({item},i)=>[String(i+1),item.name,item.description])
   ]}});
  }else{
   for(const [index,{item,rows}] of entries.entries()){
    content.push({text:(entries.length>1?(index+1)+'. ':'')+item.name,bold:true,fontSize:17,margin:[0,9,0,4],headlineLevel:1});
    if(rows.length)content.push({table:{headerRows:1,dontBreakRows:true,widths:[80,'*',115],body:[
     ['วันที่ซ่อม','รายการซ่อมบำรุง','ผล / สถานะ'].map(text=>({text,bold:true})),
     ...rows.map(row=>[dateLabel(row.date),row.work,row.result||'—'])
    ]}});
    else content.push({text:'ยังไม่มีประวัติการซ่อมที่บันทึกไว้',margin:[0,0,0,4]});
   }
  }
  return {pageSize:'A4',pageMargins:[34,36,34,45],info:{title},defaultStyle:{font:'Sarabun',fontSize:15},content,
   pageBreakBefore:(node,following)=>node.headlineLevel===1&&following.length===0,
   footer:(p,n)=>({text:'หน้า '+p+' / '+n,alignment:'right',margin:[0,8,34,0]})};
 }
 async function savePdf(entries,connected,name,canSave=()=>true){
  const vfs=await fontFiles();
  if(!canSave())return false;
  const builder=window.pdfMake.createPdf(pdfDefinition(entries,connected),undefined,
   {Sarabun:{normal:'THSarabunNew.ttf',bold:'THSarabunNewBold.ttf'}},vfs);
  const blob=await new Promise((resolve,reject)=>{
   const result=builder.getBlob(resolve);if(result?.catch)result.catch(reject);
  });
  if(!blob?.size)throw Error('PDF is empty');
  if(!canSave())return false;
  const href=URL.createObjectURL(blob), link=term('a');
  link.href=href;link.download=name;document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),30000);
  return true;
 }
 pdf.addEventListener('click',async()=>{
  if(!current||pdf.disabled)return;
  const target=current,generation=ticket;pdf.disabled=true;
  try{
   await savePdf([target],true,'ประวัติการซ่อม-'+target.item.id+'.pdf',()=>generation===ticket);
  }catch(_){if(generation===ticket)message('สร้าง PDF ไม่สำเร็จ กรุณาลองอีกครั้ง',true);}
  finally{if(generation===ticket)pdf.disabled=false;}
 });
 const allPdf=$('equipment-fleet-pdf'), allState=$('equipment-fleet-status');
 const setAllStatus=value=>{allState.hidden=false;allState.textContent=value;};
 allPdf.addEventListener('click',async()=>{
  if(allPdf.disabled)return;
  allPdf.disabled=true;setAllStatus('กำลังเตรียม PDF อุปกรณ์ทั้งหมด…');
  const endpoint=CONFIG.EQUIPMENT_REPAIR_HISTORY_URL, pending=new Set();
  let failure='';
  try{
   const entries=items.map(item=>({item,rows:[]}));
   if(endpoint){
    let next=0,done=0;
    const worker=async()=>{
     while(!failure&&next<entries.length){
      const entry=entries[next++], ctl=new AbortController();pending.add(ctl);
      try{
       entry.rows=await getRepairs(entry.item,endpoint,ctl);
       if(!failure)setAllStatus('โหลดประวัติซ่อม '+(++done)+' จาก '+entries.length+' รายการ…');
      }catch(_){
       if(!failure)failure='โหลดประวัติซ่อมของ '+entry.item.name+' ไม่ได้ จึงยังไม่ได้ดาวน์โหลด PDF รวม';
       throw Error('repair fetch failed');
      }finally{pending.delete(ctl);}
     }
    };
    await Promise.all(Array.from({length:Math.min(3,entries.length)},worker));
   }
   const filename=endpoint?'ประวัติการซ่อมอุปกรณ์ความปลอดภัย-ทั้งหมด.pdf':'รายการอุปกรณ์ความปลอดภัย-ทั้งหมด.pdf';
   await savePdf(entries,Boolean(endpoint),filename);
   setAllStatus('ดาวน์โหลด PDF '+entries.length+' รายการแล้ว'+(endpoint?'':' (เป็นรายการอุปกรณ์ ยังไม่มีข้อมูลการซ่อมในไฟล์)'));
  }catch(_){
   pending.forEach(ctl=>ctl.abort());
   setAllStatus(failure||'สร้าง PDF ไม่สำเร็จ กรุณาลองอีกครั้ง');
  }finally{allPdf.disabled=false;}
 });
})();

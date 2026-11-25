(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const items=formSections.flatMap(s=>s.items), inventory=$('equipment-inventory'), form=$('equipment-form'), dialog=$('repair-history');
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
 async function open(item,from){
  const seq=++ticket;active?.abort();current=null;opener=from;tbody.replaceChildren();wrap.hidden=pdf.hidden=true;pdf.disabled=false;
  $('repair-title').textContent='ประวัติการซ่อม: '+item.name;
  if(!dialog.open)dialog.showModal();
  $('repair-close').focus();
  const endpoint=CONFIG.EQUIPMENT_REPAIR_HISTORY_URL;
  if(!endpoint){message('ยังไม่ได้เชื่อมแหล่งประวัติซ่อมของอุปกรณ์รายการนี้ จึงยังบอกไม่ได้ว่ามีประวัติหรือไม่');return;}
  message('กำลังโหลดประวัติการซ่อม…');
  const controller=new AbortController();active=controller;
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
   const url=new URL(endpoint);
   if(url.protocol!=='https:'||url.username||url.password)throw Error('ตั้งค่าปลายทางไม่ถูกต้อง');
   url.searchParams.set('action','equipment_repair_history');
   url.searchParams.set('itemId',item.id);
   const response=await fetch(url,{credentials:'include',cache:'no-store',signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('อ่านประวัติการซ่อมไม่ได้');
   const rows=normalize(item.id,await response.json());
   if(seq!==ticket)return;
   current={item,rows};pdf.hidden=false;
   for(const row of rows){const tr=term('tr');tr.append(term('td',dateLabel(row.date)),term('td',row.work),term('td',row.result||'—'));tbody.append(tr);}
   wrap.hidden=!rows.length;
   message(rows.length?'พบ '+rows.length+' รายการ':'ยังไม่มีประวัติการซ่อมที่บันทึกไว้');
  }catch(_){if(seq===ticket)message('โหลดประวัติการซ่อมไม่ได้ กรุณาตรวจการเชื่อมต่อหรือสิทธิ์ แล้วเปิดใหม่อีกครั้ง',true);}
  finally{clearTimeout(timeout);if(seq===ticket)active=null;}
 }
 for(const [i,item] of items.entries()){
  const card=term('article','','eq-item'), head=term('div','','eq-item-label');
  const description=term('div');description.append(term('h2',item.name),term('p',item.description,'eq-description'));
  head.append(term('span',String(i+1).padStart(2,'0'),'eq-order'),description);
  const action=term('button','ประวัติการซ่อม','eq-button eq-secondary');action.type='button';
  action.setAttribute('aria-label','ประวัติการซ่อม '+item.name);action.addEventListener('click',()=>open(item,action));
  const inspect=term('button','ตรวจ','eq-button eq-primary');inspect.type='button';inspect.setAttribute('aria-label','เริ่มตรวจทั้ง 9 รายการ ที่ '+item.name);inspect.setAttribute('aria-describedby','equipment-list-scope');
  inspect.addEventListener('click',()=>setPanel(true,item,inspect));
  const actions=term('div','','eq-item-actions');actions.append(action,inspect);card.append(head,actions);list.append(card);
 }
 let fonts;
 async function fontFiles(){
  if(!fonts)fonts=Promise.all(['THSarabunNew.ttf','THSarabunNewBold.ttf'].map(async name=>{
   const r=await fetch('assets/vehicle-pdf/'+name);if(!r.ok)throw Error('font');
   const bytes=new Uint8Array(await r.arrayBuffer());let binary='';for(let start=0;start<bytes.length;start+=8192)binary+=String.fromCharCode(...bytes.subarray(start,start+8192));return [name,btoa(binary)];
  })).then(Object.fromEntries).catch(e=>{fonts=null;throw e;});
  return fonts;
 }
 pdf.addEventListener('click',async()=>{
  if(!current||pdf.disabled)return;
  const target=current,generation=ticket;pdf.disabled=true;
  try{
   const vfs=await fontFiles();
   if(generation!==ticket)return;
   const headers=['วันที่ซ่อม','รายการซ่อมบำรุง','ผล / สถานะ'].map(text=>({text,bold:true}));
   const body=[headers,...target.rows.map(r=>[dateLabel(r.date),r.work,r.result||'—'])];
   const content=[{text:'ประวัติการซ่อมอุปกรณ์ความปลอดภัย',alignment:'center',bold:true,fontSize:21},{text:'งานจราจรและความปลอดภัย',alignment:'center',fontSize:17,margin:[0,0,0,14]},{text:target.item.name+' ('+target.item.id+')',bold:true,margin:[0,0,0,8]}];
   if(target.rows.length)content.push({table:{headerRows:1,widths:[80,'*',120],body}});
   else content.push({text:'ยังไม่มีประวัติการซ่อมที่บันทึกไว้'});
   window.pdfMake.createPdf({pageSize:'A4',pageMargins:[34,36,34,45],defaultStyle:{font:'Sarabun',fontSize:15},content,footer:(p,n)=>({text:'หน้า '+p+' / '+n,alignment:'right',margin:[0,8,34,0]})},undefined,{Sarabun:{normal:'THSarabunNew.ttf',bold:'THSarabunNewBold.ttf'}},vfs).download('ประวัติการซ่อม-'+target.item.id+'.pdf');
  }catch(_){if(generation===ticket)message('สร้าง PDF ไม่สำเร็จ กรุณาลองอีกครั้ง',true);}
  finally{if(generation===ticket)pdf.disabled=false;}
 });
})();

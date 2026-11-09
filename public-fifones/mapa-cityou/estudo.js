const plan=JSON.parse(document.getElementById('plan-data').textContent)
const $=id=>document.getElementById(id), svg=$('city-map'), wrap=$('map-wrap')
const catalog=new Map(plan.buildings.map(i=>[i.id,i])), lots=new Map(plan.lots.map(i=>[i.id,i])), districtMap=new Map(plan.districts.map(i=>[i.id,i]))
const key='cityou-baia-do-amanha-draft-v1'
let phase=4, district=null, selected=null, rotation=0, placements={}, history=[], feedbackTimer
let view={x:0,y:0,w:1600,h:1100},drag=null,moved=false
function fit(lot,building,turn){const width=turn?building.d:building.w,depth=turn?building.w:building.d;return width<=lot.w*.5-2*lot.setback_m&&depth<=lot.h*.5-2*lot.setback_m}
try{const saved=JSON.parse(localStorage.getItem(key)||'{}');for(const[id,value]of Object.entries(saved)){const l=lots.get(id),b=catalog.get(value?.building);if(l&&b&&[0,1].includes(value.rotation)&&fit(l,b,value.rotation))placements[id]={building:b.id,rotation:value.rotation}}}catch{}
function message(text,error=false){clearTimeout(feedbackTimer);$('feedback').textContent=text;$('feedback').className='visible'+(error?' error':'');feedbackTimer=setTimeout(()=>$('feedback').className='',4500)}
function persist(){try{localStorage.setItem(key,JSON.stringify(placements));return true}catch{message('Seu navegador não permitiu salvar. Exporte o rascunho para guardar.',true);return false}}
function record(){history.push(structuredClone(placements));if(history.length>30)history.shift()}
function currentBuilding(){return catalog.get($('building').value)}
function drawBuilding(group,lot,choice,preview=false){const building=catalog.get(choice.building);if(!building)return;const w=(choice.rotation?building.d:building.w)*2,h=(choice.rotation?building.w:building.d)*2,x=lot.x+(lot.w-w)/2,y=lot.y+(lot.h-h)/2;const rise=Math.min(13,building.height*.4);const color=building.color
 group.innerHTML=`<rect x="${x+3}" y="${y+3}" width="${w}" height="${h}" rx="3" fill="#153f3d" opacity=".16"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${color}" stroke="#f0e2bd" stroke-width="1.5"/><path d="M${x+5} ${y+5}h${w-10}v${h-10}h-${w-10}Z" fill="none" stroke="#17443d" opacity=".35"/><path d="M${x+w/2-4} ${y+h}h8" stroke="#f9e8c1" stroke-width="4"/><text x="${x+w/2}" y="${y+h/2+3}" text-anchor="middle" font-size="${w<40?8:10}" fill="#1d4a42" font-weight="700">${building.id==='casa'?'⌂':building.id==='stunt'?'SS':building.id==='gpt'?'GPT':building.id==='claude'?'CL':building.id==='campus'?'E':'P'}</text>`
 if(preview)group.setAttribute('opacity','.75');else group.removeAttribute('opacity')
}
function render(){for(const el of svg.querySelectorAll('.lot')){const lot=lots.get(el.dataset.id);const locked=lot.phase>phase;const filtered=district&&lot.district!==district;const preview=selected===lot.id&&currentBuilding()&&!placements[lot.id];el.classList.toggle('selected',selected===lot.id);el.classList.toggle('locked',locked);el.classList.toggle('dimmed',Boolean(filtered));el.classList.toggle('occupied',Boolean(placements[lot.id]));el.classList.toggle('has-preview',Boolean(preview));el.classList.toggle('preview-valid',Boolean(preview&&!locked&&fit(lot,currentBuilding(),rotation)));el.classList.toggle('preview-invalid',Boolean(preview&&(locked||!fit(lot,currentBuilding(),rotation))));const g=el.querySelector('.placement');g.innerHTML='';if(placements[lot.id])drawBuilding(g,lot,placements[lot.id]);else if(preview)drawBuilding(g,lot,{building:currentBuilding().id,rotation},true)}
 for(const el of document.querySelectorAll('[data-phase]'))if(el.tagName==='BUTTON')el.classList.toggle('active',Number(el.dataset.phase)===phase)
 for(const el of document.querySelectorAll('.district-chip')){el.classList.toggle('active',el.dataset.district===district);el.classList.toggle('locked',districtMap.get(el.dataset.district).phase>phase)}
 const available=plan.lots.filter(l=>l.phase<=phase).length
 $('stats').textContent=`${available} / 64 lotes na etapa · ${Object.keys(placements).length} reservas no rascunho`
 $('undo').disabled=!history.length
 const lot=lots.get(selected),building=currentBuilding(),occupied=placements[selected]
 $('lot-title').textContent=lot?`${lot.id} · ${districtMap.get(lot.district).name}`:'Escolha um terreno'
 $('lot-info').textContent=lot?`${lot.w*.5} × ${lot.h*.5} m · ${lot.w*lot.h*.25} m² · fase ${lot.phase}. Recuo de 2 m. Terreno plano com acesso pela calçada sul.`:'Os contornos mostram lotes vazios. Nenhum prédio foi construído nesta planta.'
 $('lot-suggestion').textContent=lot?.suggestion||''
 $('place').disabled=!lot||!building||lot.phase>phase||Boolean(occupied)||!fit(lot,building,rotation)
 $('remove').disabled=!occupied
 $('rotate').disabled=!lot||!building||Boolean(occupied)
 if(!lot)$('fit-status').textContent='Clique num terreno para estudar sua ocupação.'
 else if(lot.phase>phase)$('fit-status').textContent='Este bairro pertence a uma etapa futura. Avance a etapa para experimentar.'
 else if(occupied)$('fit-status').textContent=`Reservado: ${catalog.get(occupied.building).name}. O rascunho pode ser desfeito.`
 else if(building)$('fit-status').textContent=fit(lot,building,rotation)?`Cabe: ${rotation?building.d:building.w} × ${rotation?building.w:building.d} m; altura ${building.height} m. Entrada voltada para a rua.`:'Esta construção não cabe com os recuos. Escolha um lote maior ou outra construção.'
 else $('fit-status').textContent='Escolha uma construção para verificar dimensões e recuos.'
 const phaseInfo=plan.phases.find(p=>p.id===phase);$('phase-title').textContent=phase===4?'Todos os bairros':phaseInfo.name;$('phase-info').textContent=phaseInfo.description
}
function select(id){selected=id;rotation=0;render()}
for(const d of plan.districts){const button=document.createElement('button');button.className='district-chip';button.dataset.district=d.id;button.innerHTML=`<i style="background:${d.color}"></i><span>${d.name}</span><b>${plan.lots.filter(l=>l.district===d.id).length}</b>`;button.addEventListener('click',()=>{district=district===d.id?null:d.id;render()});$('district-list').append(button)}
for(const b of plan.buildings){const option=document.createElement('option');option.value=b.id;option.textContent=`${b.name} · ${b.w} × ${b.d} m`;$('building').append(option)}
for(const el of document.querySelectorAll('.tabs button'))el.addEventListener('click',()=>{phase=Number(el.dataset.phase);render()})
$('building').addEventListener('change',()=>{rotation=0;render()})
$('rotate').addEventListener('click',()=>{rotation=rotation?0:1;render()})
$('place').addEventListener('click',()=>{const l=lots.get(selected),b=currentBuilding();if(!l||!b||l.phase>phase||placements[selected]||!fit(l,b,rotation)){message('Revise o terreno e o tamanho da construção.',true);return}record();placements[selected]={building:b.id,rotation};persist();render();message('Reserva salva somente neste rascunho de estudo.')})
$('remove').addEventListener('click',()=>{if(!placements[selected])return;record();delete placements[selected];persist();render();message('Reserva retirada. Você pode desfazer.')})
$('undo').addEventListener('click',()=>{if(!history.length)return;placements=history.pop();persist();render();message('Última alteração desfeita.')})
$('deselect').addEventListener('click',()=>{selected=null;render()})
$('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({format:'cityou-planning-draft-v1',plan:plan.version,createdAt:new Date().toISOString(),placements},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cityou-meu-rascunho.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})
function updateView(){view.x=Math.min(1600-view.w+240,Math.max(-240,view.x));view.y=Math.min(1100-view.h+160,Math.max(-160,view.y));svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`)}
function zoom(factor,point){const old={...view},next=Math.max(420,Math.min(1600,view.w*factor)),ratio=next/view.w;const anchor=point||{x:view.x+view.w/2,y:view.y+view.h/2};view.w=next;view.h=next*1100/1600;view.x=anchor.x-(anchor.x-old.x)*ratio;view.y=anchor.y-(anchor.y-old.y)*ratio;updateView()}
$('zoom-in').addEventListener('click',()=>zoom(.8));$('zoom-out').addEventListener('click',()=>zoom(1.25));$('reset-view').addEventListener('click',()=>{view={x:0,y:0,w:1600,h:1100};updateView()})
wrap.addEventListener('wheel',event=>{event.preventDefault();const pt=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());zoom(Math.exp(event.deltaY*.0015),pt)},{passive:false})
svg.addEventListener('pointerdown',event=>{if(event.button!==0)return;drag={x:event.clientX,y:event.clientY,view:{...view},id:event.target.closest('.lot')?.dataset.id};moved=false;svg.setPointerCapture(event.pointerId)})
svg.addEventListener('pointermove',event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;if(Math.hypot(dx,dy)>5)moved=true;if(moved){wrap.classList.add('dragging');const scale=svg.getScreenCTM().a;view.x=drag.view.x-dx/scale;view.y=drag.view.y-dy/scale;updateView()}})
svg.addEventListener('pointerup',event=>{if(!drag)return;const id=drag.id;if(!moved&&id)select(id);drag=null;wrap.classList.remove('dragging');svg.releasePointerCapture(event.pointerId)})
svg.addEventListener('pointercancel',()=>{drag=null;wrap.classList.remove('dragging')})
svg.addEventListener('keydown',event=>{const id=event.target.closest('.lot')?.dataset.id;if(id&&['Enter',' '].includes(event.key)){event.preventDefault();select(id)}})
render()

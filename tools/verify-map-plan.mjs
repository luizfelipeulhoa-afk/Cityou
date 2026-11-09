import fs from 'node:fs'
import assert from 'node:assert/strict'
const root='public-fifones/mapa-cityou/'
const plan=JSON.parse(fs.readFileSync(root+'planta.json','utf8'))
const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y
const touch=(a,b)=>a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y
const inside=(point,polygon)=>{let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const[xi,yi]=polygon[i],[xj,yj]=polygon[j];if(((yi>point[1])!==(yj>point[1]))&&(point[0]<(xj-xi)*(point[1]-yi)/(yj-yi)+xi))result=!result}return result}
assert.equal(plan.lots.length,64);assert.equal(new Set(plan.lots.map(l=>l.id)).size,64)
const expected={centro:12,orla:16,inovacao:12,vila:12,campus:8,marina:4}
for(const[district,count]of Object.entries(expected))assert.equal(plan.lots.filter(l=>l.district===district).length,count)
for(const l of plan.lots){
 for(const other of plan.lots)if(other.id!==l.id)assert.ok(!overlap(l,other),`${l.id} overlaps ${other.id}`)
 for(const road of plan.roads)assert.ok(!overlap(l,road),`${l.id} occupies ${road.id}`)
 const access=plan.roads.find(r=>r.id===l.access_road)
 assert.ok(access);assert.equal(l.y+l.h+8,access.y);assert.ok(l.x>=access.x&&l.x+l.w<=access.x+access.w)
 assert.equal(l.front,'south');assert.equal(l.terrain,'flat')
 for(const point of [[l.x,l.y],[l.x+l.w,l.y],[l.x,l.y+l.h],[l.x+l.w,l.y+l.h]]){
  assert.ok(inside(point,plan.land_polygon),`${l.id} outside land`)
  for(const area of plan.protected_geometry){if(area.polygon)assert.ok(!inside(point,area.polygon),`${l.id} in forest`);if(area.ellipse){const e=area.ellipse;assert.ok(((point[0]-e.cx)/e.rx)**2+((point[1]-e.cy)/e.ry)**2>1,`${l.id} in lagoon`)}}
 }
 for(const area of plan.protected_geometry)if(area.rect)assert.ok(!overlap(l,area.rect),`${l.id} in park`)
 assert.equal(l.w*.5%plan.scale.grid_m,0);assert.equal(l.h*.5%plan.scale.grid_m,0)
}
const visited=new Set([plan.roads[0].id]);let changed=true
while(changed){changed=false;for(const a of plan.roads)if(visited.has(a.id))for(const b of plan.roads)if(!visited.has(b.id)&&touch(a,b)){visited.add(b.id);changed=true}}
assert.equal(visited.size,plan.roads.length,'Road network must be connected')
const svg=fs.readFileSync(root+'planta.svg','utf8')
assert.equal((svg.match(/class="lot"/g)||[]).length,64)
for(const l of plan.lots)assert.ok(svg.includes(`data-id="${l.id}"`))
assert.equal(plan.buildings.find(b=>b.id==='stunt').height>plan.buildings.find(b=>b.id==='gpt').height,true)
assert.equal(plan.buildings.find(b=>b.id==='gpt').height>plan.buildings.find(b=>b.id==='claude').height,true)
const js=fs.readFileSync(root+'estudo.js','utf8');assert.ok(!/\/api\//.test(js),'Study must not write to live APIs')
console.log(JSON.stringify({lots:64,districts:expected,connectedRoadSegments:visited.size,checks:['unique IDs','no overlapping lots','no roads under lots','all frontages have sidewalks','road graph connected','all corners on land','no forest, water or park occupation','4m module respected','SVG matches JSON','height hierarchy','no live APIs']},null,2))

const html=fs.readFileSync(root+'index.html','utf8');const embedded=JSON.parse(html.match(/<script id="plan-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);assert.deepEqual(embedded,plan,'Offline planner must use the same canonical plan')

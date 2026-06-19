/* ============================================================
   PaintDrift — ein paper.io-artiges Mal-Spiel
   Fahre, umkreise Flächen, male ein riesiges Gemälde.
   Reines Vanilla-JS + Canvas, kein Build nötig.
   ============================================================ */
(() => {
'use strict';

/* ---------- Konstanten ---------- */
const GRID = 400;                 // Zellen pro Achse (riesiges Canvas)
const PAPER = [247, 244, 238];    // Grundfarbe des Mal-Untergrunds
const VOID  = '#080a11';          // Bereich außerhalb des Canvas
const SAVE_KEY = 'paintdrift.save.v1';

let ZMIN = 4, ZMAX = 64;          // px pro Zelle (Zoom-Grenzen)

/* ---------- Canvas / Kontext ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

// Offscreen: 1px pro Zelle = das persistente Gemälde
const world = document.createElement('canvas');
world.width = GRID; world.height = GRID;
const wctx = world.getContext('2d');
const worldImg = wctx.createImageData(GRID, GRID);
// Untergrund einfärben
for (let i = 0; i < GRID * GRID; i++) {
  worldImg.data[i*4]   = PAPER[0];
  worldImg.data[i*4+1] = PAPER[1];
  worldImg.data[i*4+2] = PAPER[2];
  worldImg.data[i*4+3] = 255;
}
wctx.putImageData(worldImg, 0, 0);

/* ---------- Spielzustand ---------- */
const owned = new Uint8Array(GRID * GRID);     // 1 = mein fixiertes Gebiet
const trailGenArr = new Int32Array(GRID * GRID); // Spur-Markierung per Generation
const floodGen = new Int32Array(GRID * GRID);  // Flood-Fill-Markierung
let trailGen = 1, floodG = 1;
let trailCells = [];                            // Reihenfolge der Spurzellen

const ownedBounds = { minX: GRID, minY: GRID, maxX: 0, maxY: 0 };

const cam = { x: GRID/2, y: GRID/2, zoom: 22, shake: 0 };

const player = {
  x: GRID/2, y: GRID/2, angle: 0, targetAngle: 0,
  alive: true, drawing: false
};

const stats = {
  drops: 0, level: 1, paintedCount: 0,
  speed: 7.0, turn: 5.5, inkMax: 220, ink: 220, inkRegen: 60,
};

const combo = { mult: 1, timer: 0 };

const progress = {
  brushesOwned: { solid: true },
  patternsOwned: {},
  upgrades: { speed: 0, ink: 0, turn: 0, magnet: 0, zoom: 0 },
  skinsOwned: { classic: true },
  skin: 'classic',
  opacityUnlocked: false,
};

const ui = {
  color: { h: 280, s: 0.85, v: 1.0 },
  opacity: 1.0,
  brush: 'solid',
  swatches: ['#ffffff','#7c5cff','#22d3ee','#34d399','#ff5f6d','#ffe259'],
};

let muted = false;
let started = false;

/* ---------- Hilfsfunktionen ---------- */
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const lerp = (a,b,t) => a + (b-a)*t;
const idx = (x,y) => y*GRID + x;
function angLerp(a,b,t){ let d=((b-a+Math.PI)%(2*Math.PI))-Math.PI; return a+d*t; }
function rand(a,b){ return a + Math.random()*(b-a); }

function hsvToRgb(h,s,v){
  h=((h%360)+360)%360; const c=v*s, x=c*(1-Math.abs((h/60)%2-1)), m=v-c;
  let r,g,b;
  if(h<60){r=c;g=x;b=0} else if(h<120){r=x;g=c;b=0} else if(h<180){r=0;g=c;b=x}
  else if(h<240){r=0;g=x;b=c} else if(h<300){r=x;g=0;b=c} else {r=c;g=0;b=x}
  return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
}
function rgbToHex(r,g,b){ return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join(''); }
function curRGB(){ return hsvToRgb(ui.color.h, ui.color.s, ui.color.v); }
function noise2(x,y){ const n=Math.sin(x*12.9898+y*78.233)*43758.5453; return n-Math.floor(n); }

/* ============================================================
   PINSEL — bestimmen die Farbe je Zelle beim Fangen
   p: {gx,gy, nx,ny, base:[r,g,b], second:[r,g,b]}
   ============================================================ */
const BRUSHES = {
  solid:   { name:'Solid',     icon:'🟪', cost:0,   desc:'Deine gewählte Farbe, satt und klar.',
             fn:p => p.base },
  gradient:{ name:'Verlauf',   icon:'🌈', cost:150, desc:'Weicher Verlauf von deiner Farbe zu ihrer Komplementärfarbe.',
             fn:p => [Math.round(lerp(p.base[0],p.second[0],p.nx)),
                      Math.round(lerp(p.base[1],p.second[1],p.ny)),
                      Math.round(lerp(p.base[2],p.second[2],(p.nx+p.ny)/2))] },
  rainbow: { name:'Regenbogen',icon:'🦄', cost:280, desc:'Jede Zelle leuchtet in einer anderen Farbe.',
             fn:p => hsvToRgb(p.nx*260 + p.ny*120, 0.9, 1) },
  neon:    { name:'Neon',      icon:'💡', cost:320, desc:'Überstrahlende, knallige Glühfarbe.',
             fn:p => hsvToRgb(ui.color.h, 1, 1) },
  pastel:  { name:'Pastell',   icon:'🍬', cost:200, desc:'Sanfte, milchige Töne.',
             fn:p => [Math.round(lerp(p.base[0],255,0.45)),
                      Math.round(lerp(p.base[1],255,0.45)),
                      Math.round(lerp(p.base[2],255,0.45))] },
  fire:    { name:'Feuer',     icon:'🔥', cost:340, desc:'Lodernder Verlauf von Rot zu Gold.',
             fn:p => hsvToRgb(lerp(0,48,1-p.ny) + noise2(p.gx,p.gy)*8, 1, lerp(0.85,1,1-p.ny)) },
  ocean:   { name:'Ozean',     icon:'🌊', cost:340, desc:'Tiefes Blau mit türkisem Schimmer.',
             fn:p => hsvToRgb(lerp(200,185,p.ny) + noise2(p.gx,p.gy)*10, lerp(0.9,0.6,p.ny), lerp(0.6,1,p.ny)) },
  galaxy:  { name:'Galaxie',   icon:'🌌', cost:520, desc:'Dunkler Kosmos mit funkelnden Sternen.',
             fn:p => { const sp=noise2(p.gx*1.7,p.gy*2.3); if(sp>0.93) return [255,255,255];
                       return hsvToRgb(lerp(250,300,noise2(p.gx,p.gy)), 0.8, lerp(0.12,0.5,noise2(p.gy,p.gx))); } },
  confetti:{ name:'Konfetti',  icon:'🎉', cost:300, desc:'Zufällige Knallfarben, pure Party.',
             fn:p => hsvToRgb(Math.floor(noise2(p.gx,p.gy)*8)*45, 0.9, 1) },
  gold:    { name:'Gold',      icon:'🏆', cost:600, desc:'Edles, schimmerndes Metallgold.',
             fn:p => { const sh=noise2(p.gx*0.6,p.gy*0.6); return hsvToRgb(45, lerp(0.9,0.5,sh), lerp(0.7,1,sh)); } },
};

/* ============================================================
   SHOP-DATEN
   ============================================================ */
const SHOP = {
  brushes: Object.keys(BRUSHES).filter(k=>k!=='solid').map(k=>({id:k,...BRUSHES[k]})),
  patterns: [
    { id:'opacity', name:'Deckkraft-Regler', icon:'🫧', cost:260, desc:'Schalte transparentes Malen frei – male zarte Schichten.' },
    { id:'magnetGlow', name:'Glüh-Spur', icon:'✨', cost:180, desc:'Deine Spur leuchtet schöner (kosmetisch).' },
  ],
  upgrades: [
    { id:'speed', name:'Tempo', icon:'⚡', base:120, step:90, max:6, desc:'Fahre schneller.' },
    { id:'ink',   name:'Tinten-Tank', icon:'🛢️', base:100, step:80, max:8, desc:'Längere Spuren möglich.' },
    { id:'turn',  name:'Wendigkeit', icon:'🌀', base:110, step:90, max:5, desc:'Schärfere Kurven.' },
    { id:'magnet',name:'Stern-Magnet', icon:'🧲', base:200, step:160, max:4, desc:'Zieht Sterne aus größerer Distanz an.' },
    { id:'zoom',  name:'Weitsicht', icon:'🔭', base:150, step:120, max:3, desc:'Erweitert deinen Zoom-Bereich.' },
  ],
  skins: [
    { id:'classic', name:'Klassiker', icon:'🔵', cost:0,   color:'#22d3ee' },
    { id:'ember',   name:'Glut',      icon:'🔴', cost:160, color:'#ff5f6d' },
    { id:'lime',    name:'Limette',   icon:'🟢', cost:160, color:'#a3e635' },
    { id:'royal',   name:'Royal',     icon:'🟣', cost:240, color:'#a855f7' },
    { id:'gold',    name:'Goldjunge', icon:'🟡', cost:400, color:'#ffd24a' },
    { id:'ghost',   name:'Geist',     icon:'⚪', cost:320, color:'#e5e7eb' },
  ],
};

/* ============================================================
   STERNE (Collectibles)
   ============================================================ */
let stars = [];
function spawnStar(){
  if(stars.length >= 14) return;
  stars.push({ x: rand(20,GRID-20), y: rand(20,GRID-20), t: Math.random()*6, life: rand(18,34) });
}
for(let i=0;i<10;i++) spawnStar();

/* ============================================================
   PARTIKEL
   ============================================================ */
let particles = [];
function burst(wx, wy, color, n=14){
  for(let i=0;i<n;i++){
    const a=rand(0,Math.PI*2), sp=rand(1,6);
    particles.push({ x:wx, y:wy, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:rand(.4,.9), max:.9,
      color, size:rand(1.5,4) });
  }
}

/* ============================================================
   AUDIO (synthetisch, Web Audio)
   ============================================================ */
let AC=null;
function audio(){ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return AC; }
function beep(freq, dur=0.12, type='sine', vol=0.18){
  if(muted) return; const ac=audio(); if(!ac) return;
  const o=ac.createOscillator(), g=ac.createGain();
  o.type=type; o.frequency.value=freq; o.connect(g); g.connect(ac.destination);
  const t=ac.currentTime; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  o.start(t); o.stop(t+dur);
}
function chord(base, steps, dur=0.16){ steps.forEach((s,i)=>setTimeout(()=>beep(base*Math.pow(2,s/12),dur,'triangle',0.14),i*45)); }
const sfx = {
  capture:(big)=>chord(big?330:262,[0,4,7,12], big?0.22:0.14),
  combo:(m)=>chord(392,[0,5,9].map(x=>x+(m*2)),0.13),
  star:()=>beep(880,0.1,'square',0.12),
  unlock:()=>chord(523,[0,4,7,12,16],0.18),
  fail:()=>beep(110,0.25,'sawtooth',0.16),
  click:()=>beep(660,0.05,'square',0.08),
};

/* ============================================================
   RESIZE
   ============================================================ */
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W*DPR; canvas.height = H*DPR;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize);
resize();

/* ============================================================
   KOORDINATEN
   ============================================================ */
function worldToScreen(wx,wy){ return [ (wx-cam.x)*cam.zoom + W/2, (wy-cam.y)*cam.zoom + H/2 ]; }
function screenToWorld(sx,sy){ return [ (sx-W/2)/cam.zoom + cam.x, (sy-H/2)/cam.zoom + cam.y ]; }

/* ============================================================
   STARTGEBIET
   ============================================================ */
function seedTerritory(cx,cy,r){
  for(let y=cy-r;y<=cy+r;y++) for(let x=cx-r;x<=cx+r;x++){
    if(x<0||y<0||x>=GRID||y>=GRID) continue;
    if((x-cx)**2+(y-cy)**2 <= r*r){ owned[idx(x,y)]=1; paintCell(x,y, curRGB(), 1); growBounds(x,y); }
  }
}
function growBounds(x,y){
  if(x<ownedBounds.minX)ownedBounds.minX=x; if(y<ownedBounds.minY)ownedBounds.minY=y;
  if(x>ownedBounds.maxX)ownedBounds.maxX=x; if(y>ownedBounds.maxY)ownedBounds.maxY=y;
}

/* Eine Zelle ins Gemälde malen (mit Alpha-Blend über Bestehendem) */
function paintCell(x,y, rgb, alpha){
  const i = idx(x,y)*4, d = worldImg.data, a = alpha;
  d[i]   = Math.round(rgb[0]*a + d[i]*(1-a));
  d[i+1] = Math.round(rgb[1]*a + d[i+1]*(1-a));
  d[i+2] = Math.round(rgb[2]*a + d[i+2]*(1-a));
  d[i+3] = 255;
}

/* ============================================================
   SPUR & FANGEN (Kern-Mechanik)
   ============================================================ */
function resetTrail(){ trailGen++; trailCells.length=0; player.drawing=false; }

function failTrail(){
  if(trailCells.length){
    const [sx,sy]=worldToScreen(player.x,player.y);
    burst(player.x,player.y,'255,90,90',18);
    cam.shake = 10; sfx.fail();
    showToast('💥 Spur zerstört!');
  }
  resetTrail();
  stats.ink = Math.max(stats.ink, stats.inkMax*0.4);
}

function tryStartOrExtendTrail(cx,cy){
  if(cx<0||cy<0||cx>=GRID||cy>=GRID) return;
  const i = idx(cx,cy);
  if(owned[i]){
    // zurück auf eigenem Gebiet -> Schleife schließen
    if(player.drawing && trailCells.length>3) captureArea();
    else if(player.drawing) resetTrail();
    return;
  }
  // außerhalb: zeichnen, Tinte kostet
  if(stats.ink <= 0){ failTrail(); return; }
  if(trailGenArr[i]===trailGen){ failTrail(); return; } // eigene Spur getroffen
  trailGenArr[i]=trailGen; trailCells.push(i);
  player.drawing = true;
  stats.ink = Math.max(0, stats.ink - 1);
}

function captureArea(){
  // 1) Spur fixieren
  let tMinX=GRID,tMinY=GRID,tMaxX=0,tMaxY=0;
  for(const i of trailCells){
    owned[i]=1; const x=i%GRID, y=(i/GRID)|0;
    if(x<tMinX)tMinX=x; if(y<tMinY)tMinY=y; if(x>tMaxX)tMaxX=x; if(y>tMaxY)tMaxY=y;
    growBounds(x,y);
  }
  // 2) Flood-Fill-Box
  const bx0=clamp(Math.min(ownedBounds.minX,tMinX)-1,0,GRID-1);
  const by0=clamp(Math.min(ownedBounds.minY,tMinY)-1,0,GRID-1);
  const bx1=clamp(Math.max(ownedBounds.maxX,tMaxX)+1,0,GRID-1);
  const by1=clamp(Math.max(ownedBounds.maxY,tMaxY)+1,0,GRID-1);
  floodG++;
  const stack=[];
  // Rand der Box als "außen" markieren
  for(let x=bx0;x<=bx1;x++){ seedFlood(x,by0,stack); seedFlood(x,by1,stack); }
  for(let y=by0;y<=by1;y++){ seedFlood(bx0,y,stack); seedFlood(bx1,y,stack); }
  while(stack.length){
    const i=stack.pop(); const x=i%GRID, y=(i/GRID)|0;
    if(x>bx0) tryFlood(i-1,stack);
    if(x<bx1) tryFlood(i+1,stack);
    if(y>by0) tryFlood(i-GRID,stack);
    if(y<by1) tryFlood(i+GRID,stack);
  }
  // 3) eingeschlossene Zellen einsammeln
  const captured=[];
  let cMinX=GRID,cMinY=GRID,cMaxX=0,cMaxY=0;
  for(let y=by0;y<=by1;y++) for(let x=bx0;x<=bx1;x++){
    const i=idx(x,y);
    if(owned[i]) continue;
    if(floodGen[i]===floodG) continue; // außen erreichbar
    owned[i]=1; captured.push(i); growBounds(x,y);
    if(x<cMinX)cMinX=x; if(y<cMinY)cMinY=y; if(x>cMaxX)cMaxX=x; if(y>cMaxY)cMaxY=y;
  }
  // Spurzellen mitfärben
  for(const i of trailCells){ const x=i%GRID,y=(i/GRID)|0;
    if(x<cMinX)cMinX=x; if(y<cMinY)cMinY=y; if(x>cMaxX)cMaxX=x; if(y>cMaxY)cMaxY=y; captured.push(i); }

  // 4) malen mit aktivem Pinsel
  const base=curRGB();
  const second=hsvToRgb(ui.color.h+150, ui.color.s, ui.color.v);
  const bfn=BRUSHES[ui.brush]?BRUSHES[ui.brush].fn:BRUSHES.solid.fn;
  const spanX=Math.max(1,cMaxX-cMinX), spanY=Math.max(1,cMaxY-cMinY);
  const alpha=progress.opacityUnlocked?ui.opacity:1;
  let newPixels=0;
  for(const i of captured){
    const x=i%GRID,y=(i/GRID)|0;
    const col=bfn({gx:x,gy:y,nx:(x-cMinX)/spanX,ny:(y-cMinY)/spanY,base,second});
    paintCell(x,y,col,alpha);
    newPixels++;
  }
  wctx.putImageData(worldImg,0,0, bx0,by0, bx1-bx0+1, by1-by0+1);
  stats.paintedCount += newPixels;

  // 5) Belohnung + Combo + Juice
  const gain = Math.round(newPixels * (0.5 + newPixels/600) * combo.mult);
  stats.drops += gain;
  const big = newPixels>400;
  if(combo.timer>0){ combo.mult=Math.min(8,combo.mult+1); sfx.combo(combo.mult); showCombo('COMBO x'+combo.mult+'!'); }
  else combo.mult=1;
  combo.timer = 3.2;
  if(big) showCombo('RIESEN-FLÄCHE! +'+gain);
  showToast('💧 +'+gain+(combo.mult>1?'  (x'+combo.mult+')':''));
  sfx.capture(big);
  cam.shake = Math.min(16, 4 + newPixels/120);
  const ccx=(cMinX+cMaxX)/2, ccy=(cMinY+cMaxY)/2;
  burst(ccx,ccy, base.join(','), Math.min(40, 10+newPixels/40));

  checkLevel(); checkMilestones();
  resetTrail();
  stats.ink = stats.inkMax; // Tank voll als Belohnung
  saveSoon();
}
function seedFlood(x,y,stack){ const i=idx(x,y); if(!owned[i] && floodGen[i]!==floodG){ floodGen[i]=floodG; stack.push(i); } }
function tryFlood(i,stack){ if(owned[i] || floodGen[i]===floodG) return; if(trailGenArr[i]===trailGen) return; floodGen[i]=floodG; stack.push(i); }

/* ============================================================
   LEVEL / MEILENSTEINE
   ============================================================ */
function levelForDrops(d){ return 1 + Math.floor(Math.sqrt(d/40)); }
function checkLevel(){
  const nl = levelForDrops(stats.drops);
  if(nl>stats.level){ stats.level=nl; sfx.unlock(); showToast('🆙 Level '+nl+'!'); cam.shake=8;
    burst(player.x,player.y,'255,226,89',30); }
}
const milestonesHit = new Set();
function checkMilestones(){
  const pct = stats.paintedCount/(GRID*GRID)*100;
  [1,5,10,25,50,75,100].forEach(m=>{
    if(pct>=m && !milestonesHit.has(m)){ milestonesHit.add(m);
      showToast('🏆 '+m+'% des Canvas bemalt!'); sfx.unlock(); }
  });
}

/* ============================================================
   INPUT
   ============================================================ */
let pointerActive=false, lastTouchDist=0;
const keys={};

function steerToScreen(sx,sy){
  const [wx,wy]=screenToWorld(sx,sy);
  player.targetAngle=Math.atan2(wy-player.y, wx-player.x);
}

canvas.addEventListener('mousemove', e=>{ if(started) steerToScreen(e.clientX,e.clientY); });
canvas.addEventListener('mousedown', ()=>{ pointerActive=true; audio(); });
window.addEventListener('mouseup', ()=>{ pointerActive=false; });

canvas.addEventListener('wheel', e=>{ e.preventDefault();
  zoomAt(e.clientX,e.clientY, e.deltaY<0 ? 1.12 : 1/1.12);
},{passive:false});

canvas.addEventListener('touchstart', e=>{ audio();
  if(e.touches.length===1){ pointerActive=true; steerToScreen(e.touches[0].clientX,e.touches[0].clientY); }
  else if(e.touches.length===2){ lastTouchDist=touchDist(e); }
},{passive:false});
canvas.addEventListener('touchmove', e=>{ e.preventDefault();
  if(e.touches.length===1 && started){ steerToScreen(e.touches[0].clientX,e.touches[0].clientY); }
  else if(e.touches.length===2){
    const d=touchDist(e); if(lastTouchDist>0){ const mx=(e.touches[0].clientX+e.touches[1].clientX)/2,
      my=(e.touches[0].clientY+e.touches[1].clientY)/2; zoomAt(mx,my, d/lastTouchDist); }
    lastTouchDist=d;
  }
},{passive:false});
canvas.addEventListener('touchend', e=>{ if(e.touches.length===0) pointerActive=false; lastTouchDist=0; });
function touchDist(e){ const a=e.touches[0],b=e.touches[1]; return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); }

function zoomAt(sx,sy,factor){
  const [wx,wy]=screenToWorld(sx,sy);
  cam.zoom=clamp(cam.zoom*factor, ZMIN, ZMAX);
  const [nsx,nsy]=worldToScreen(wx,wy);
  cam.x += (nsx-sx)/cam.zoom; cam.y += (nsy-sy)/cam.zoom;
}

window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()]=true; if(['arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) e.preventDefault(); });
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });
function keyboardSteer(){
  let dx=0,dy=0;
  if(keys['arrowleft']||keys['a'])dx-=1; if(keys['arrowright']||keys['d'])dx+=1;
  if(keys['arrowup']||keys['w'])dy-=1; if(keys['arrowdown']||keys['s'])dy+=1;
  if(dx||dy) player.targetAngle=Math.atan2(dy,dx);
}

/* ============================================================
   UPDATE
   ============================================================ */
let lastCellI=-1;
function update(dt){
  if(!started) return;
  keyboardSteer();
  player.angle = angLerp(player.angle, player.targetAngle, clamp(stats.turn*dt,0,1));

  const sp=stats.speed;
  player.x += Math.cos(player.angle)*sp*dt;
  player.y += Math.sin(player.angle)*sp*dt;

  // Wände: an Rand abprallen + Spur ggf. abbrechen
  let bounced=false;
  if(player.x<0.5){player.x=0.5; bounced=true;} if(player.x>GRID-0.5){player.x=GRID-0.5; bounced=true;}
  if(player.y<0.5){player.y=0.5; bounced=true;} if(player.y>GRID-0.5){player.y=GRID-0.5; bounced=true;}
  if(bounced){ player.targetAngle=player.angle+Math.PI; if(player.drawing) failTrail(); }

  const cx=clamp(player.x|0,0,GRID-1), cy=clamp(player.y|0,0,GRID-1);
  const ci=idx(cx,cy);
  if(ci!==lastCellI){ lastCellI=ci; tryStartOrExtendTrail(cx,cy); }

  // Tinte regenerieren auf eigenem Gebiet / langsam überall
  const onOwn = owned[ci]===1;
  if(onOwn && !player.drawing) stats.ink=Math.min(stats.inkMax, stats.ink + stats.inkRegen*dt);
  else stats.ink=Math.min(stats.inkMax, stats.ink + stats.inkRegen*0.12*dt);

  // Combo-Timer
  if(combo.timer>0){ combo.timer-=dt; if(combo.timer<=0) combo.mult=1; }

  // Kamera folgt
  cam.x = lerp(cam.x, player.x, clamp(8*dt,0,1));
  cam.y = lerp(cam.y, player.y, clamp(8*dt,0,1));
  if(cam.shake>0) cam.shake=Math.max(0, cam.shake-30*dt);

  // Sterne
  const magnetR = 2.2 + progress.upgrades.magnet*2.5;
  for(let s=stars.length-1;s>=0;s--){
    const st=stars[s]; st.t+=dt; st.life-=dt;
    const d=Math.hypot(st.x-player.x, st.y-player.y);
    if(d<magnetR){ st.x=lerp(st.x,player.x,clamp(6*dt,0,1)); st.y=lerp(st.y,player.y,clamp(6*dt,0,1)); }
    if(d<1.2){ collectStar(st); stars.splice(s,1); continue; }
    if(st.life<=0){ stars.splice(s,1); }
  }
  starTimer-=dt; if(starTimer<=0){ starTimer=rand(3,7); spawnStar(); }

  // Partikel
  for(let p=particles.length-1;p>=0;p--){
    const q=particles[p]; q.x+=q.vx*dt*8; q.y+=q.vy*dt*8; q.vx*=0.92; q.vy*=0.92; q.life-=dt;
    if(q.life<=0) particles.splice(p,1);
  }

  updateHUD();
}
let starTimer=4;
function collectStar(st){
  const bonus=Math.round(20+stats.level*6);
  stats.drops+=bonus; sfx.star(); burst(st.x,st.y,'255,226,89',16);
  showToast('✨ +'+bonus); combo.timer=Math.max(combo.timer,2); checkLevel();
}

/* ============================================================
   RENDER
   ============================================================ */
function render(){
  ctx.save();
  // Void
  ctx.fillStyle=VOID; ctx.fillRect(0,0,W,H);

  // Shake
  let shx=0,shy=0; if(cam.shake>0){ shx=rand(-cam.shake,cam.shake); shy=rand(-cam.shake,cam.shake); }
  ctx.translate(shx,shy);

  // Canvas-Bereich
  const [ox,oy]=worldToScreen(0,0);
  const wpx=GRID*cam.zoom;
  // weicher Schatten/Rahmen
  ctx.shadowColor='rgba(0,0,0,.6)'; ctx.shadowBlur=30;
  ctx.fillStyle='#000'; ctx.fillRect(ox,oy,wpx,wpx); ctx.shadowBlur=0;

  ctx.imageSmoothingEnabled = cam.zoom<6; // bei starkem Rauszoomen glätten
  ctx.drawImage(world, ox,oy, wpx,wpx);

  // Gitter dezent bei nahem Zoom
  if(cam.zoom>14){
    ctx.strokeStyle='rgba(0,0,0,.05)'; ctx.lineWidth=1;
    const startX=Math.max(0,Math.floor((cam.x-W/2/cam.zoom)));
    const endX=Math.min(GRID,Math.ceil((cam.x+W/2/cam.zoom)));
    const startY=Math.max(0,Math.floor((cam.y-H/2/cam.zoom)));
    const endY=Math.min(GRID,Math.ceil((cam.y+H/2/cam.zoom)));
    ctx.beginPath();
    for(let x=startX;x<=endX;x++){ const [sx]=worldToScreen(x,0); ctx.moveTo(sx,Math.max(oy,0)); ctx.lineTo(sx,Math.min(oy+wpx,H)); }
    for(let y=startY;y<=endY;y++){ const [,sy]=worldToScreen(0,y); ctx.moveTo(Math.max(ox,0),sy); ctx.lineTo(Math.min(ox+wpx,W),sy); }
    ctx.stroke();
  }

  // Live-Spur (Vorschau)
  if(trailCells.length){
    const rgb=curRGB(); const glow=progress.patternsOwned.magnetGlow;
    ctx.fillStyle='rgba('+rgb.join(',')+',0.55)';
    if(glow){ ctx.shadowColor='rgba('+rgb.join(',')+',0.9)'; ctx.shadowBlur=12; }
    for(const i of trailCells){ const x=i%GRID,y=(i/GRID)|0; const [sx,sy]=worldToScreen(x,y);
      ctx.fillRect(sx,sy,cam.zoom+1,cam.zoom+1); }
    ctx.shadowBlur=0;
  }

  // Sterne
  for(const st of stars){
    const [sx,sy]=worldToScreen(st.x,st.y);
    const tw=0.6+0.4*Math.sin(st.t*4);
    ctx.save(); ctx.translate(sx,sy); ctx.rotate(st.t);
    ctx.fillStyle='rgba(255,226,89,'+tw+')'; ctx.shadowColor='#ffe259'; ctx.shadowBlur=16;
    drawStar(ctx,0,0,5, cam.zoom*0.7, cam.zoom*0.3); ctx.fill(); ctx.restore();
  }

  // Partikel
  for(const q of particles){ const [sx,sy]=worldToScreen(q.x,q.y);
    ctx.globalAlpha=clamp(q.life/q.max,0,1); ctx.fillStyle='rgba('+q.color+',1)';
    ctx.beginPath(); ctx.arc(sx,sy,q.size,0,7); ctx.fill(); }
  ctx.globalAlpha=1;

  // Spieler-Figur
  drawPlayer();

  ctx.restore();
}

function drawStar(c,cx,cy,spikes,outer,inner){
  let rot=Math.PI/2*3, x=cx,y=cy; const step=Math.PI/spikes;
  c.beginPath(); c.moveTo(cx,cy-outer);
  for(let i=0;i<spikes;i++){
    x=cx+Math.cos(rot)*outer; y=cy+Math.sin(rot)*outer; c.lineTo(x,y); rot+=step;
    x=cx+Math.cos(rot)*inner; y=cy+Math.sin(rot)*inner; c.lineTo(x,y); rot+=step;
  }
  c.lineTo(cx,cy-outer); c.closePath();
}

function drawPlayer(){
  const [sx,sy]=worldToScreen(player.x,player.y);
  const r=Math.max(7, cam.zoom*0.7);
  const skin=SHOP.skins.find(s=>s.id===progress.skin)||SHOP.skins[0];
  ctx.save(); ctx.translate(sx,sy); ctx.rotate(player.angle);
  // Körper
  ctx.shadowColor=skin.color; ctx.shadowBlur=18;
  ctx.fillStyle=skin.color;
  roundRect(ctx,-r,-r,r*2,r*2,r*0.45); ctx.fill();
  ctx.shadowBlur=0;
  // Pinsel-Spitze (zeigt aktuelle Malfarbe) vorne
  ctx.fillStyle=rgbToHex(...curRGB());
  ctx.beginPath(); ctx.moveTo(r,0); ctx.lineTo(r*0.4,-r*0.5); ctx.lineTo(r*0.4,r*0.5); ctx.closePath(); ctx.fill();
  // Augen
  ctx.fillStyle='#0b0d14';
  ctx.beginPath(); ctx.arc(r*0.15,-r*0.35,r*0.18,0,7); ctx.arc(r*0.15,r*0.35,r*0.18,0,7); ctx.fill();
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.arc(r*0.22,-r*0.35,r*0.07,0,7); ctx.arc(r*0.22,r*0.35,r*0.07,0,7); ctx.fill();
  ctx.restore();
}
function roundRect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r);
  c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }

/* ============================================================
   GAME LOOP
   ============================================================ */
let lastT=performance.now();
function loop(now){
  const dt=Math.min(0.05,(now-lastT)/1000); lastT=now;
  update(dt); render();
  requestAnimationFrame(loop);
}

/* ============================================================
   HUD
   ============================================================ */
const el = id => document.getElementById(id);
function updateHUD(){
  el('drops').textContent=Math.floor(stats.drops);
  el('level').textContent=stats.level;
  el('inkFill').style.width=(stats.ink/stats.inkMax*100)+'%';
  el('painted').textContent=(stats.paintedCount/(GRID*GRID)*100).toFixed(1)+'%';
  const cp=el('comboPill');
  if(combo.mult>1 && combo.timer>0){ cp.classList.remove('hidden'); el('comboVal').textContent='x'+combo.mult; }
  else cp.classList.add('hidden');
}
let toastT=null;
function showToast(msg){ const t=el('toast'); t.textContent=msg; t.classList.remove('hidden');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.add('hidden'),1700); }
let comboT=null;
function showCombo(msg){ const c=el('comboPop'); c.textContent=msg; c.classList.remove('hidden');
  c.style.animation='none'; void c.offsetWidth; c.style.animation='';
  clearTimeout(comboT); comboT=setTimeout(()=>c.classList.add('hidden'),700); }

/* ============================================================
   UI: Overlays öffnen/schließen
   ============================================================ */
function openOverlay(id){ el(id).classList.remove('hidden'); }
function closeOverlay(id){ el(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click', e=>{
  sfx.click(); e.target.closest('.overlay').classList.add('hidden'); }));

el('btnStart').addEventListener('click', ()=>{ sfx.click(); startGame(); });
el('btnShop').addEventListener('click', ()=>{ sfx.click(); renderShop('brushes'); openOverlay('shopScreen'); });
el('btnPalette').addEventListener('click', ()=>{ sfx.click(); renderPalette(); openOverlay('paletteScreen'); });
el('btnHelp').addEventListener('click', ()=>{ sfx.click(); openOverlay('helpScreen'); });
el('btnShot').addEventListener('click', ()=>{ sfx.click(); exportPainting(); });
el('btnMute').addEventListener('click', e=>{ muted=!muted; e.target.textContent=muted?'🔇':'🔊'; if(!muted) sfx.click(); });
el('btnZoomIn').addEventListener('click', ()=>zoomAt(W/2,H/2,1.25));
el('btnZoomOut').addEventListener('click', ()=>zoomAt(W/2,H/2,1/1.25));

/* ============================================================
   SHOP-RENDER
   ============================================================ */
let curTab='brushes';
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click', ()=>{
  sfx.click(); document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active'); renderShop(t.dataset.tab); }));

function renderShop(tab){
  curTab=tab; el('shopDrops').textContent=Math.floor(stats.drops);
  const body=el('shopBody'); body.innerHTML='';
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));

  if(tab==='brushes'){
    SHOP.brushes.forEach(b=>{
      const owned=!!progress.brushesOwned[b.id], equipped=ui.brush===b.id;
      body.appendChild(makeCard({
        icon:b.icon, name:b.name, desc:b.desc, gradient:brushPreview(b.id),
        state: equipped?'equipped':owned?'owned':'buy', cost:b.cost,
        action:()=>{
          if(equipped) return;
          if(owned){ ui.brush=b.id; sfx.click(); renderShop(tab); saveSoon(); return; }
          if(buy(b.cost)){ progress.brushesOwned[b.id]=true; ui.brush=b.id; sfx.unlock(); showToast('🖌️ '+b.name+' freigeschaltet!'); renderShop(tab); saveSoon(); }
        }
      }));
    });
  } else if(tab==='patterns'){
    SHOP.patterns.forEach(p=>{
      const owned=p.id==='opacity'?progress.opacityUnlocked:!!progress.patternsOwned[p.id];
      body.appendChild(makeCard({ icon:p.icon, name:p.name, desc:p.desc, gradient:'linear-gradient(135deg,#7c5cff,#22d3ee)',
        state: owned?'owned':'buy', cost:p.cost,
        action:()=>{ if(owned) return; if(buy(p.cost)){ if(p.id==='opacity') progress.opacityUnlocked=true; else progress.patternsOwned[p.id]=true;
          sfx.unlock(); showToast('✨ '+p.name+'!'); renderShop(tab); saveSoon(); } } }));
    });
  } else if(tab==='upgrades'){
    SHOP.upgrades.forEach(u=>{
      const lvl=progress.upgrades[u.id], maxed=lvl>=u.max, cost=u.base+u.step*lvl;
      body.appendChild(makeCard({ icon:u.icon, name:u.name+' '+'★'.repeat(lvl)+'☆'.repeat(u.max-lvl),
        desc:u.desc, gradient:'linear-gradient(135deg,#34d399,#22d3ee)',
        state: maxed?'owned':'buy', cost:maxed?'MAX':cost,
        action:()=>{ if(maxed) return; if(buy(cost)){ progress.upgrades[u.id]++; applyUpgrades(); sfx.unlock();
          showToast(u.icon+' '+u.name+' verbessert!'); renderShop(tab); saveSoon(); } } }));
    });
  } else if(tab==='skins'){
    SHOP.skins.forEach(s=>{
      const owned=!!progress.skinsOwned[s.id], equipped=progress.skin===s.id;
      body.appendChild(makeCard({ icon:s.icon, name:s.name, desc:'Figur-Skin',
        gradient:'radial-gradient(circle at 50% 40%,'+s.color+',#0b0d14)',
        state: equipped?'equipped':owned?'owned':'buy', cost:s.cost,
        action:()=>{ if(equipped) return; if(owned){ progress.skin=s.id; sfx.click(); renderShop(tab); saveSoon(); return; }
          if(buy(s.cost)){ progress.skinsOwned[s.id]=true; progress.skin=s.id; sfx.unlock(); showToast('🎭 '+s.name+'!'); renderShop(tab); saveSoon(); } } }));
    });
  }
}
function makeCard({icon,name,desc,gradient,state,cost,action}){
  const c=document.createElement('div'); c.className='card';
  const btnLabel = state==='equipped'?'✔ Aktiv': state==='owned'?'Auswählen': (cost==='MAX'?'MAX':'💧 '+cost);
  const canAfford = state!=='buy' || cost==='MAX' || stats.drops>=cost;
  const btnClass = state==='equipped'?'equipped': state==='owned'?'owned': (canAfford?'':'cant');
  c.innerHTML=`<div class="preview" style="background:${gradient}"></div>
    <h4>${icon} ${name}</h4><p>${desc}</p>
    <button class="buy ${btnClass}">${btnLabel}</button>`;
  c.querySelector('.buy').addEventListener('click', ()=>{ if(state==='buy'&&!canAfford){ sfx.fail(); showToast('Nicht genug 💧'); return;} action(); });
  return c;
}
function brushPreview(id){
  const map={ gradient:'linear-gradient(90deg,#7c5cff,#22d3ee)', rainbow:'linear-gradient(90deg,red,orange,yellow,green,blue,violet)',
    neon:'linear-gradient(135deg,#39ff14,#00fff2)', pastel:'linear-gradient(135deg,#ffd1dc,#cdb4ff)',
    fire:'linear-gradient(0deg,#ff0,#f30)', ocean:'linear-gradient(0deg,#06b6d4,#1e3a8a)',
    galaxy:'radial-gradient(circle,#fff 1%,#6d28d9 30%,#0b0d14)', confetti:'conic-gradient(red,orange,yellow,green,blue,violet,red)',
    gold:'linear-gradient(135deg,#fff6c0,#d4af37)' };
  return map[id]||'#7c5cff';
}
function buy(cost){ if(stats.drops<cost){ sfx.fail(); showToast('Nicht genug 💧'); return false; }
  stats.drops-=cost; el('shopDrops').textContent=Math.floor(stats.drops); updateHUD(); return true; }

function applyUpgrades(){
  stats.speed = 7.0 + progress.upgrades.speed*1.4;
  stats.inkMax = 220 + progress.upgrades.ink*120;
  stats.turn = 5.5 + progress.upgrades.turn*1.4;
  ZMIN = 4 - progress.upgrades.zoom*1; ZMAX = 64 + progress.upgrades.zoom*40;
}

/* ============================================================
   PALETTE-UI
   ============================================================ */
const svC=el('svCanvas'), svCtx=svC.getContext('2d');
function drawSV(){
  const h=ui.color.h;
  for(let y=0;y<svC.height;y++){
    for(let x=0;x<svC.width;x++){
      const s=x/svC.width, v=1-y/svC.height; const [r,g,b]=hsvToRgb(h,s,v);
      svCtx.fillStyle='rgb('+r+','+g+','+b+')'; svCtx.fillRect(x,y,1,1);
    }
  }
  // Marker
  const mx=ui.color.s*svC.width, my=(1-ui.color.v)*svC.height;
  svCtx.strokeStyle='#fff'; svCtx.lineWidth=2; svCtx.beginPath(); svCtx.arc(mx,my,6,0,7); svCtx.stroke();
  svCtx.strokeStyle='#000'; svCtx.lineWidth=1; svCtx.beginPath(); svCtx.arc(mx,my,6,0,7); svCtx.stroke();
}
function pickSV(e){
  const r=svC.getBoundingClientRect();
  const cx=(e.touches?e.touches[0].clientX:e.clientX)-r.left;
  const cy=(e.touches?e.touches[0].clientY:e.clientY)-r.top;
  ui.color.s=clamp(cx/r.width,0,1); ui.color.v=clamp(1-cy/r.height,0,1);
  drawSV(); refreshCur();
}
let svDown=false;
svC.addEventListener('mousedown',e=>{svDown=true;pickSV(e);});
window.addEventListener('mousemove',e=>{if(svDown)pickSV(e);});
window.addEventListener('mouseup',()=>svDown=false);
svC.addEventListener('touchstart',e=>{e.preventDefault();pickSV(e);},{passive:false});
svC.addEventListener('touchmove',e=>{e.preventDefault();pickSV(e);},{passive:false});

el('hueRange').addEventListener('input',e=>{ ui.color.h=+e.target.value; drawSV(); refreshCur(); });
el('opacityRange').addEventListener('input',e=>{ ui.opacity=+e.target.value/100; });
el('btnSaveSwatch').addEventListener('click',()=>{ const hex=rgbToHex(...curRGB());
  if(!ui.swatches.includes(hex)){ ui.swatches.unshift(hex); ui.swatches=ui.swatches.slice(0,12); renderSwatches(); saveSoon(); } });

function refreshCur(){ const rgb=curRGB(); const hex=rgbToHex(...rgb);
  el('curSwatch').style.background=hex; el('curHex').textContent=hex; saveSoon(); }
function renderSwatches(){ const box=el('savedSwatches'); box.innerHTML='';
  ui.swatches.forEach(hex=>{ const d=document.createElement('div'); d.className='swatch'; d.style.background=hex;
    d.addEventListener('click',()=>{ const [h,s,v]=hexToHsv(hex); ui.color={h,s,v}; el('hueRange').value=h; drawSV(); refreshCur(); });
    box.appendChild(d); }); }
function hexToHsv(hex){ const r=parseInt(hex.slice(1,3),16)/255,g=parseInt(hex.slice(3,5),16)/255,b=parseInt(hex.slice(5,7),16)/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn; let h=0;
  if(d){ if(mx===r)h=((g-b)/d)%6; else if(mx===g)h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0)h+=360; }
  return [h, mx?d/mx:0, mx]; }

function renderPalette(){
  drawSV(); refreshCur(); renderSwatches();
  el('hueRange').value=ui.color.h;
  const opLock=el('opacityLock'), opR=el('opacityRange');
  if(progress.opacityUnlocked){ opLock.textContent=''; opR.disabled=false; opR.value=ui.opacity*100; }
  else { opLock.textContent='🔒'; opR.disabled=true; }
  // Pinselauswahl
  const bl=el('brushList'); bl.innerHTML='';
  Object.keys(BRUSHES).forEach(id=>{ const b=BRUSHES[id]; const owned=id==='solid'||progress.brushesOwned[id];
    const chip=document.createElement('div'); chip.className='brush-chip'+(ui.brush===id?' active':'')+(owned?'':' locked');
    chip.innerHTML=b.icon+' '+b.name;
    chip.addEventListener('click',()=>{ if(!owned){ sfx.fail(); showToast('In der Werkstatt freischalten 🛠️'); return; }
      ui.brush=id; sfx.click(); renderPalette(); saveSoon(); });
    bl.appendChild(chip); });
}

/* ============================================================
   EXPORT (Teilen)
   ============================================================ */
function exportPainting(){
  // Auf hübsche Auflösung skalieren + Rahmen
  const scale=2, pad=20;
  const out=document.createElement('canvas'); out.width=GRID*scale+pad*2; out.height=GRID*scale+pad*2;
  const o=out.getContext('2d');
  o.fillStyle=VOID; o.fillRect(0,0,out.width,out.height);
  o.imageSmoothingEnabled=false; o.drawImage(world,pad,pad,GRID*scale,GRID*scale);
  out.toBlob(blob=>{ const url=URL.createObjectURL(blob); const a=document.createElement('a');
    a.href=url; a.download='paintdrift-gemaelde.png'; a.click(); URL.revokeObjectURL(url);
    showToast('📸 Gemälde gespeichert!'); }, 'image/png');
}

/* ============================================================
   SPEICHERN / LADEN
   ============================================================ */
let saveT=null;
function saveSoon(){ clearTimeout(saveT); saveT=setTimeout(saveGame, 800); }
function packOwned(){ const bytes=new Uint8Array(Math.ceil(GRID*GRID/8));
  for(let i=0;i<GRID*GRID;i++) if(owned[i]) bytes[i>>3]|=(1<<(i&7));
  let s=''; for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return btoa(s); }
function unpackOwned(b64){ const s=atob(b64);
  for(let i=0;i<GRID*GRID;i++){ const byte=s.charCodeAt(i>>3); owned[i]=(byte>>(i&7))&1; } }
function saveGame(){
  try{
    const data={ v:1, stats, progress, ui, milestones:[...milestonesHit],
      player:{x:player.x,y:player.y}, bounds:ownedBounds,
      ownedB64:packOwned(), worldPng:world.toDataURL('image/png') };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }catch(e){ /* Speicher voll o.ä. – ignorieren */ }
}
function loadGame(){
  let raw; try{ raw=localStorage.getItem(SAVE_KEY); }catch(e){ return false; }
  if(!raw) return false;
  try{
    const d=JSON.parse(raw);
    Object.assign(stats,d.stats); Object.assign(progress,d.progress);
    Object.assign(ui,d.ui); (d.milestones||[]).forEach(m=>milestonesHit.add(m));
    if(d.bounds) Object.assign(ownedBounds,d.bounds);
    unpackOwned(d.ownedB64);
    stats.paintedCount=0; for(let i=0;i<GRID*GRID;i++) if(owned[i]) stats.paintedCount++;
    if(d.player){ player.x=d.player.x; player.y=d.player.y; cam.x=player.x; cam.y=player.y; }
    applyUpgrades(); stats.ink=stats.inkMax;
    // Bild laden
    const img=new Image();
    img.onload=()=>{ wctx.drawImage(img,0,0); worldImg.data.set(wctx.getImageData(0,0,GRID,GRID).data); };
    img.src=d.worldPng;
    return true;
  }catch(e){ return false; }
}

/* ============================================================
   START
   ============================================================ */
function startGame(){
  closeOverlay('startScreen');
  el('hud').classList.remove('hidden');
  if(!loaded){ seedTerritory(GRID/2|0, GRID/2|0, 5); wctx.putImageData(worldImg,0,0); }
  started=true; player.targetAngle=0; player.angle=0;
  saveGame();
}

let loaded=false;
applyUpgrades();
loaded=loadGame();
updateHUD();
requestAnimationFrame(loop);

// automatisch speichern beim Verlassen
window.addEventListener('beforeunload', saveGame);
setInterval(()=>{ if(started) saveGame(); }, 15000);

})();

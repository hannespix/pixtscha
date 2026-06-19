/* ============================================================
   PaintDrift — ein Mal-Spiel im paper.io-Stil
   Fahre, umkreise Flächen, male ein endloses Kunstwerk.
   Vanilla JS + Canvas, kein Build.
   ============================================================ */
(() => {
'use strict';

/* ---------- Konstanten ---------- */
const GRID = 480;                 // Logik-Zellen pro Achse
const SS = 2;                     // Supersampling fürs Gemälde (glatter Look)
const WPX = GRID * SS;            // Auflösung des Gemälde-Canvas
const CANVAS_BG = [15, 17, 25];   // dunkle Leinwand, damit Farben leuchten
const VOID  = '#05060a';
const SAVE_KEY = 'paintdrift.save.v2';

let ZMIN = 4, ZMAX = 70;          // px pro Zelle (Zoom-Grenzen)

/* ---------- SVG-Icons (eigene Grafiken statt Emojis) ---------- */
const I = (b,fill) => `<svg viewBox="0 0 24 24" fill="${fill?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${b}</svg>`;
const ICONS = {
  drop:   I('<path d="M12 3c3.5 4.5 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 2.5-6.5 6-11z"/>'),
  star:   I('<path d="M12 3.5l2.6 5.5 6 .7-4.4 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9L3.4 9.7l6-.7z"/>'),
  flame:  I('<path d="M12 3c.8 3-1.8 4.2-1.8 6.8 0 1.2 1 2 2 1.6 0-1.6 1.3-2 1.3-2 .4 1.4 2.3 2.6 2.3 5.1A5 5 0 1 1 7 13.5C7 9 12 8 12 3z"/>'),
  frame:  I('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 15.5l-4.5-4.2L6 20"/>'),
  tools:  I('<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="9" cy="7" r="2.4" fill="var(--panel)"/><circle cx="15" cy="17" r="2.4" fill="var(--panel)"/>'),
  palette:I('<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 2-2 0-1.4-1-1.6-1-2.6 0-.8.7-1.4 1.6-1.4H17a4 4 0 0 0 4-4c0-4.2-4-8-9-8z"/><circle cx="8" cy="11" r="1.1" fill="currentColor"/><circle cx="12" cy="8" r="1.1" fill="currentColor"/><circle cx="16" cy="11" r="1.1" fill="currentColor"/>'),
  share:  I('<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 16V3"/><path d="M8 7l4-4 4 4"/>'),
  sound:  I('<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>'),
  mute:   I('<path d="M4 9.5v5h3.5L13 19V5L7.5 9.5z"/><line x1="16.5" y1="9.5" x2="21" y2="14.5"/><line x1="21" y1="9.5" x2="16.5" y2="14.5"/>'),
  help:   I('<circle cx="12" cy="12" r="9"/><path d="M9.4 9.2a2.6 2.6 0 1 1 3.6 2.4c-.8.4-1 .9-1 1.7"/><circle cx="12" cy="16.6" r=".6" fill="currentColor"/>'),
  plus:   I('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
  minus:  I('<line x1="5" y1="12" x2="19" y2="12"/>'),
  close:  I('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>'),
  lock:   I('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  bolt:   I('<path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l1-8z"/>', true),
  rotate: I('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>'),
  magnet: I('<path d="M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4z"/><line x1="6" y1="6.5" x2="10" y2="6.5"/><line x1="14" y1="6.5" x2="18" y2="6.5"/>'),
  search: I('<circle cx="10.5" cy="10.5" r="6.5"/><line x1="15.5" y1="15.5" x2="21" y2="21"/>'),
  layers: I('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'),
  sparkle:I('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
};
const ic = n => `<span class="ico">${ICONS[n]||''}</span>`;

/* ---------- Canvas / Kontext ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

// Offscreen-Gemälde
const world = document.createElement('canvas');
world.width = WPX; world.height = WPX;
const wctx = world.getContext('2d');
const worldImg = wctx.createImageData(WPX, WPX);
for (let i = 0; i < WPX * WPX; i++) {
  worldImg.data[i*4]   = CANVAS_BG[0];
  worldImg.data[i*4+1] = CANVAS_BG[1];
  worldImg.data[i*4+2] = CANVAS_BG[2];
  worldImg.data[i*4+3] = 255;
}
wctx.putImageData(worldImg, 0, 0);

/* ---------- Spielzustand ---------- */
const owned = new Uint8Array(GRID * GRID);
const trailGenArr = new Int32Array(GRID * GRID);
const floodGen = new Int32Array(GRID * GRID);
let trailGen = 1, floodG = 1;
let trailCells = [];

const ownedBounds = { minX: GRID, minY: GRID, maxX: 0, maxY: 0 };
const cam = { x: GRID/2, y: GRID/2, zoom: 24, shake: 0 };
const player = { x: GRID/2, y: GRID/2, angle: 0, targetAngle: 0, alive: true, drawing: false };

const stats = {
  drops: 0, level: 1, paintedCount: 0,
  speed: 7.4, turn: 5.8, inkMax: 240, ink: 240, inkRegen: 64,
};
const combo = { mult: 1, timer: 0 };

const progress = {
  brushesOwned: { solid: true },
  patternsOwned: {},
  upgrades: { speed: 0, ink: 0, turn: 0, magnet: 0, zoom: 0 },
  skinsOwned: { aqua: true },
  skin: 'aqua',
  opacityUnlocked: false,
};
const ui = {
  color: { h: 280, s: 0.82, v: 1.0 },
  opacity: 1.0,
  brush: 'solid',
  swatches: ['#ffffff','#7c5cff','#22d3ee','#34d399','#ff5f6d','#ffe259'],
};
let muted = false, started = false;

/* ---------- Hilfsfunktionen ---------- */
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const lerp = (a,b,t) => a + (b-a)*t;
const idx = (x,y) => y*GRID + x;
function angLerp(a,b,t){ let d=((b-a+Math.PI)%(2*Math.PI))-Math.PI; return a+d*t; }
function rand(a,b){ return a + Math.random()*(b-a); }
function hsvToRgb(h,s,v){
  h=((h%360)+360)%360; const c=v*s, x=c*(1-Math.abs((h/60)%2-1)), m=v-c; let r,g,b;
  if(h<60){r=c;g=x;b=0} else if(h<120){r=x;g=c;b=0} else if(h<180){r=0;g=c;b=x}
  else if(h<240){r=0;g=x;b=c} else if(h<300){r=x;g=0;b=c} else {r=c;g=0;b=x}
  return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
}
const rgbToHex = (r,g,b) => '#'+[r,g,b].map(v=>clamp(v|0,0,255).toString(16).padStart(2,'0')).join('');
function hexToRgb(h){ return [parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)]; }
const mix = (a,b,t) => [lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
const rgba = (c,a) => `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const curRGB = () => hsvToRgb(ui.color.h, ui.color.s, ui.color.v);
function noise2(x,y){ const n=Math.sin(x*12.9898+y*78.233)*43758.5453; return n-Math.floor(n); }

/* ============================================================
   PINSEL
   ============================================================ */
const BRUSHES = {
  solid:   { name:'Solid',     cost:0,   desc:'Deine gewählte Farbe, satt und klar.',
             fn:p => p.base },
  gradient:{ name:'Verlauf',   cost:150, desc:'Weicher Verlauf zur Komplementärfarbe.',
             fn:p => [lerp(p.base[0],p.second[0],p.nx), lerp(p.base[1],p.second[1],p.ny), lerp(p.base[2],p.second[2],(p.nx+p.ny)/2)] },
  rainbow: { name:'Regenbogen',cost:280, desc:'Jede Zelle leuchtet in einer anderen Farbe.',
             fn:p => hsvToRgb(p.nx*260 + p.ny*120, 0.9, 1) },
  neon:    { name:'Neon',      cost:320, desc:'Überstrahlende Glühfarbe.',
             fn:p => hsvToRgb(ui.color.h, 1, 1) },
  pastel:  { name:'Pastell',   cost:200, desc:'Sanfte, milchige Töne.',
             fn:p => mix(p.base,[255,255,255],0.45) },
  fire:    { name:'Feuer',     cost:340, desc:'Lodernder Verlauf von Rot zu Gold.',
             fn:p => hsvToRgb(lerp(0,48,1-p.ny)+noise2(p.gx,p.gy)*8, 1, lerp(0.85,1,1-p.ny)) },
  ocean:   { name:'Ozean',     cost:340, desc:'Tiefes Blau mit türkisem Schimmer.',
             fn:p => hsvToRgb(lerp(200,185,p.ny)+noise2(p.gx,p.gy)*10, lerp(0.9,0.6,p.ny), lerp(0.6,1,p.ny)) },
  galaxy:  { name:'Galaxie',   cost:520, desc:'Dunkler Kosmos mit funkelnden Sternen.',
             fn:p => { if(noise2(p.gx*1.7,p.gy*2.3)>0.93) return [255,255,255];
                       return hsvToRgb(lerp(250,300,noise2(p.gx,p.gy)),0.8,lerp(0.12,0.5,noise2(p.gy,p.gx))); } },
  confetti:{ name:'Konfetti',  cost:300, desc:'Zufällige Knallfarben.',
             fn:p => hsvToRgb(Math.floor(noise2(p.gx,p.gy)*8)*45, 0.9, 1) },
  gold:    { name:'Gold',      cost:600, desc:'Edles, schimmerndes Metallgold.',
             fn:p => { const sh=noise2(p.gx*0.6,p.gy*0.6); return hsvToRgb(45,lerp(0.9,0.5,sh),lerp(0.7,1,sh)); } },
};
function brushPreview(id){
  const m={ solid:'linear-gradient(135deg,#7c5cff,#a78bfa)', gradient:'linear-gradient(90deg,#7c5cff,#22d3ee)',
    rainbow:'linear-gradient(90deg,#ff5f6d,#ffb347,#ffe259,#34d399,#22d3ee,#7c5cff)',
    neon:'linear-gradient(135deg,#39ff14,#00fff2)', pastel:'linear-gradient(135deg,#ffd1dc,#cdb4ff)',
    fire:'linear-gradient(0deg,#ffe259,#ff3b30)', ocean:'linear-gradient(0deg,#06b6d4,#1e3a8a)',
    galaxy:'radial-gradient(circle at 60% 35%,#fff 1px,#a855f7 28%,#140a2e 75%)',
    confetti:'conic-gradient(#ff5f6d,#ffb347,#ffe259,#34d399,#22d3ee,#7c5cff,#ff5f6d)',
    gold:'linear-gradient(135deg,#fff6c0,#d4af37 60%,#8a6d1f)' };
  return m[id]||'#7c5cff';
}

/* ============================================================
   SHOP-DATEN
   ============================================================ */
const SHOP = {
  brushes: Object.keys(BRUSHES).filter(k=>k!=='solid').map(k=>({id:k,...BRUSHES[k]})),
  patterns: [
    { id:'opacity', icon:'layers', name:'Deckkraft', cost:260, desc:'Schalte transparentes Malen frei – zarte Schichten.' },
    { id:'magnetGlow', icon:'sparkle', name:'Glüh-Spur', cost:180, desc:'Deine Spur leuchtet intensiver (kosmetisch).' },
  ],
  upgrades: [
    { id:'speed', icon:'bolt',   name:'Tempo',       base:120, step:90,  max:6, desc:'Fahre schneller.' },
    { id:'ink',   icon:'drop',   name:'Tinten-Tank', base:100, step:80,  max:8, desc:'Längere Spuren möglich.' },
    { id:'turn',  icon:'rotate', name:'Wendigkeit',  base:110, step:90,  max:5, desc:'Schärfere Kurven.' },
    { id:'magnet',icon:'magnet', name:'Stern-Magnet',base:200, step:160, max:4, desc:'Zieht Sterne aus mehr Distanz.' },
    { id:'zoom',  icon:'search', name:'Weitsicht',   base:150, step:120, max:3, desc:'Erweitert den Zoom-Bereich.' },
  ],
  skins: [
    { id:'aqua',  name:'Aqua',   cost:0,   color:'#22d3ee' },
    { id:'ember', name:'Glut',   cost:160, color:'#ff5f6d' },
    { id:'lime',  name:'Limette',cost:160, color:'#a3e635' },
    { id:'royal', name:'Royal',  cost:240, color:'#a855f7' },
    { id:'gold',  name:'Gold',   cost:400, color:'#ffd24a' },
    { id:'ghost', name:'Geist',  cost:320, color:'#e5e7eb' },
  ],
};

/* ============================================================
   STERNE
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
   AUDIO
   ============================================================ */
let AC=null;
function audio(){ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return AC; }
function beep(freq, dur=0.12, type='sine', vol=0.18){
  if(muted) return; const ac=audio(); if(!ac) return;
  const o=ac.createOscillator(), g=ac.createGain();
  o.type=type; o.frequency.value=freq; o.connect(g); g.connect(ac.destination);
  const t=ac.currentTime; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001,t+dur); o.start(t); o.stop(t+dur);
}
function chord(base, steps, dur=0.16){ steps.forEach((s,i)=>setTimeout(()=>beep(base*Math.pow(2,s/12),dur,'triangle',0.13),i*42)); }
const sfx = {
  capture:b=>chord(b?330:262,[0,4,7,12], b?0.22:0.14),
  combo:m=>chord(392,[0,5,9].map(x=>x+m*2),0.12),
  star:()=>beep(880,0.1,'square',0.11),
  unlock:()=>chord(523,[0,4,7,12,16],0.18),
  fail:()=>beep(110,0.25,'sawtooth',0.15),
  click:()=>beep(660,0.05,'square',0.07),
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

/* ---------- Koordinaten ---------- */
const worldToScreen = (wx,wy) => [ (wx-cam.x)*cam.zoom + W/2, (wy-cam.y)*cam.zoom + H/2 ];
const screenToWorld = (sx,sy) => [ (sx-W/2)/cam.zoom + cam.x, (sy-H/2)/cam.zoom + cam.y ];

/* ============================================================
   STARTGEBIET / MALEN
   ============================================================ */
function growBounds(x,y){
  if(x<ownedBounds.minX)ownedBounds.minX=x; if(y<ownedBounds.minY)ownedBounds.minY=y;
  if(x>ownedBounds.maxX)ownedBounds.maxX=x; if(y>ownedBounds.maxY)ownedBounds.maxY=y;
}
function paintCell(x,y, rgb, alpha){
  const a=alpha, d=worldImg.data, r=rgb[0],g=rgb[1],b=rgb[2];
  for(let dy=0;dy<SS;dy++){
    let row=((y*SS+dy)*WPX + x*SS)*4;
    for(let dx=0;dx<SS;dx++){
      const i=row+dx*4;
      d[i]=r*a+d[i]*(1-a); d[i+1]=g*a+d[i+1]*(1-a); d[i+2]=b*a+d[i+2]*(1-a); d[i+3]=255;
    }
  }
}
function seedTerritory(cx,cy,r){
  for(let y=cy-r;y<=cy+r;y++) for(let x=cx-r;x<=cx+r;x++){
    if(x<0||y<0||x>=GRID||y>=GRID) continue;
    if((x-cx)**2+(y-cy)**2 <= r*r){ owned[idx(x,y)]=1; paintCell(x,y, curRGB(), 1); growBounds(x,y); }
  }
}

/* ============================================================
   SPUR & FANGEN
   ============================================================ */
function resetTrail(){ trailGen++; trailCells.length=0; player.drawing=false; }
function failTrail(){
  if(trailCells.length){ burst(player.x,player.y,'255,90,90',18); cam.shake=10; sfx.fail(); showToast('Spur verloren'); }
  resetTrail(); stats.ink=Math.max(stats.ink, stats.inkMax*0.4);
}
function tryStartOrExtendTrail(cx,cy){
  if(cx<0||cy<0||cx>=GRID||cy>=GRID) return;
  const i=idx(cx,cy);
  if(owned[i]){
    if(player.drawing && trailCells.length>3) captureArea();
    else if(player.drawing) resetTrail();
    return;
  }
  if(stats.ink<=0){ failTrail(); return; }
  if(trailGenArr[i]===trailGen){ failTrail(); return; }
  trailGenArr[i]=trailGen; trailCells.push(i); player.drawing=true; stats.ink=Math.max(0,stats.ink-1);
}
function seedFlood(x,y,stack){ const i=idx(x,y); if(!owned[i] && floodGen[i]!==floodG){ floodGen[i]=floodG; stack.push(i); } }
function tryFlood(i,stack){ if(owned[i]||floodGen[i]===floodG||trailGenArr[i]===trailGen) return; floodGen[i]=floodG; stack.push(i); }

function captureArea(){
  let tMinX=GRID,tMinY=GRID,tMaxX=0,tMaxY=0;
  for(const i of trailCells){ owned[i]=1; const x=i%GRID,y=(i/GRID)|0;
    if(x<tMinX)tMinX=x; if(y<tMinY)tMinY=y; if(x>tMaxX)tMaxX=x; if(y>tMaxY)tMaxY=y; growBounds(x,y); }
  const bx0=clamp(Math.min(ownedBounds.minX,tMinX)-1,0,GRID-1);
  const by0=clamp(Math.min(ownedBounds.minY,tMinY)-1,0,GRID-1);
  const bx1=clamp(Math.max(ownedBounds.maxX,tMaxX)+1,0,GRID-1);
  const by1=clamp(Math.max(ownedBounds.maxY,tMaxY)+1,0,GRID-1);
  floodG++;
  const stack=[];
  for(let x=bx0;x<=bx1;x++){ seedFlood(x,by0,stack); seedFlood(x,by1,stack); }
  for(let y=by0;y<=by1;y++){ seedFlood(bx0,y,stack); seedFlood(bx1,y,stack); }
  while(stack.length){
    const i=stack.pop(); const x=i%GRID, y=(i/GRID)|0;
    if(x>bx0) tryFlood(i-1,stack); if(x<bx1) tryFlood(i+1,stack);
    if(y>by0) tryFlood(i-GRID,stack); if(y<by1) tryFlood(i+GRID,stack);
  }
  const captured=[];
  let cMinX=GRID,cMinY=GRID,cMaxX=0,cMaxY=0;
  for(let y=by0;y<=by1;y++) for(let x=bx0;x<=bx1;x++){
    const i=idx(x,y);
    if(owned[i] || floodGen[i]===floodG) continue;
    owned[i]=1; captured.push(i); growBounds(x,y);
    if(x<cMinX)cMinX=x; if(y<cMinY)cMinY=y; if(x>cMaxX)cMaxX=x; if(y>cMaxY)cMaxY=y;
  }
  for(const i of trailCells){ const x=i%GRID,y=(i/GRID)|0;
    if(x<cMinX)cMinX=x; if(y<cMinY)cMinY=y; if(x>cMaxX)cMaxX=x; if(y>cMaxY)cMaxY=y; captured.push(i); }

  const base=curRGB(), second=hsvToRgb(ui.color.h+150, ui.color.s, ui.color.v);
  const bfn=(BRUSHES[ui.brush]||BRUSHES.solid).fn;
  const spanX=Math.max(1,cMaxX-cMinX), spanY=Math.max(1,cMaxY-cMinY);
  const alpha=progress.opacityUnlocked?ui.opacity:1;
  let newPixels=0;
  for(const i of captured){ const x=i%GRID,y=(i/GRID)|0;
    paintCell(x,y, bfn({gx:x,gy:y,nx:(x-cMinX)/spanX,ny:(y-cMinY)/spanY,base,second}), alpha); newPixels++; }
  wctx.putImageData(worldImg,0,0, bx0*SS,by0*SS, (bx1-bx0+1)*SS, (by1-by0+1)*SS);
  stats.paintedCount += newPixels;

  const gain=Math.round(newPixels*(0.5+newPixels/600)*combo.mult);
  stats.drops+=gain;
  const big=newPixels>400;
  if(combo.timer>0){ combo.mult=Math.min(8,combo.mult+1); sfx.combo(combo.mult); showCombo('COMBO x'+combo.mult); }
  else combo.mult=1;
  combo.timer=3.2;
  if(big) showCombo('Riesenfläche  +'+gain);
  showToast('+'+gain+' Tropfen'+(combo.mult>1?'  ·  x'+combo.mult:''));
  sfx.capture(big);
  cam.shake=Math.min(16, 4+newPixels/120);
  burst((cMinX+cMaxX)/2,(cMinY+cMaxY)/2, base.join(','), Math.min(40,10+newPixels/40));

  buildTerritoryPath();
  checkLevel(); checkMilestones(); resetTrail(); stats.ink=stats.inkMax; saveSoon();
}

/* ============================================================
   LEVEL / MEILENSTEINE
   ============================================================ */
const levelForDrops = d => 1 + Math.floor(Math.sqrt(d/40));
function checkLevel(){
  const nl=levelForDrops(stats.drops);
  if(nl>stats.level){ stats.level=nl; sfx.unlock(); showToast('Level '+nl); cam.shake=8; burst(player.x,player.y,'255,226,89',30); }
}
const milestonesHit=new Set();
function checkMilestones(){
  const pct=stats.paintedCount/(GRID*GRID)*100;
  [1,5,10,25,50,75,100].forEach(m=>{ if(pct>=m && !milestonesHit.has(m)){ milestonesHit.add(m); showToast(m+'% der Leinwand bemalt'); sfx.unlock(); } });
}

/* ============================================================
   INPUT
   ============================================================ */
let pointerActive=false, lastTouchDist=0;
const keys={};
function steerToScreen(sx,sy){ const [wx,wy]=screenToWorld(sx,sy); player.targetAngle=Math.atan2(wy-player.y, wx-player.x); }
canvas.addEventListener('mousemove', e=>{ if(started) steerToScreen(e.clientX,e.clientY); });
canvas.addEventListener('mousedown', ()=>{ pointerActive=true; audio(); });
window.addEventListener('mouseup', ()=>{ pointerActive=false; });
canvas.addEventListener('wheel', e=>{ e.preventDefault(); zoomAt(e.clientX,e.clientY, e.deltaY<0?1.12:1/1.12); },{passive:false});
canvas.addEventListener('touchstart', e=>{ audio();
  if(e.touches.length===1){ pointerActive=true; steerToScreen(e.touches[0].clientX,e.touches[0].clientY); }
  else if(e.touches.length===2){ lastTouchDist=touchDist(e); } },{passive:false});
canvas.addEventListener('touchmove', e=>{ e.preventDefault();
  if(e.touches.length===1 && started){ steerToScreen(e.touches[0].clientX,e.touches[0].clientY); }
  else if(e.touches.length===2){ const d=touchDist(e); if(lastTouchDist>0){
    const mx=(e.touches[0].clientX+e.touches[1].clientX)/2, my=(e.touches[0].clientY+e.touches[1].clientY)/2; zoomAt(mx,my,d/lastTouchDist); }
    lastTouchDist=d; } },{passive:false});
canvas.addEventListener('touchend', e=>{ if(e.touches.length===0) pointerActive=false; lastTouchDist=0; });
function touchDist(e){ const a=e.touches[0],b=e.touches[1]; return Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY); }
function zoomAt(sx,sy,f){ const [wx,wy]=screenToWorld(sx,sy); cam.zoom=clamp(cam.zoom*f,ZMIN,ZMAX);
  const [nsx,nsy]=worldToScreen(wx,wy); cam.x+=(nsx-sx)/cam.zoom; cam.y+=(nsy-sy)/cam.zoom; }
window.addEventListener('keydown', e=>{ keys[e.key.toLowerCase()]=true;
  if(['arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase())) e.preventDefault(); });
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; });
function keyboardSteer(){ let dx=0,dy=0;
  if(keys['arrowleft']||keys['a'])dx-=1; if(keys['arrowright']||keys['d'])dx+=1;
  if(keys['arrowup']||keys['w'])dy-=1; if(keys['arrowdown']||keys['s'])dy+=1;
  if(dx||dy) player.targetAngle=Math.atan2(dy,dx); }

/* ============================================================
   UPDATE
   ============================================================ */
let lastCellI=-1, starTimer=4;
function update(dt){
  if(!started) return;
  keyboardSteer();
  player.angle=angLerp(player.angle, player.targetAngle, clamp(stats.turn*dt,0,1));
  const sp=stats.speed;
  player.x+=Math.cos(player.angle)*sp*dt; player.y+=Math.sin(player.angle)*sp*dt;

  let bounced=false;
  if(player.x<0.5){player.x=0.5;bounced=true;} if(player.x>GRID-0.5){player.x=GRID-0.5;bounced=true;}
  if(player.y<0.5){player.y=0.5;bounced=true;} if(player.y>GRID-0.5){player.y=GRID-0.5;bounced=true;}
  if(bounced){ player.targetAngle=player.angle+Math.PI; if(player.drawing) failTrail(); }

  const cx=clamp(player.x|0,0,GRID-1), cy=clamp(player.y|0,0,GRID-1), ci=idx(cx,cy);
  if(ci!==lastCellI){ lastCellI=ci; tryStartOrExtendTrail(cx,cy); }

  const onOwn=owned[ci]===1;
  if(onOwn && !player.drawing) stats.ink=Math.min(stats.inkMax, stats.ink+stats.inkRegen*dt);
  else stats.ink=Math.min(stats.inkMax, stats.ink+stats.inkRegen*0.12*dt);

  if(combo.timer>0){ combo.timer-=dt; if(combo.timer<=0) combo.mult=1; }

  cam.x=lerp(cam.x,player.x,clamp(8*dt,0,1)); cam.y=lerp(cam.y,player.y,clamp(8*dt,0,1));
  if(cam.shake>0) cam.shake=Math.max(0,cam.shake-30*dt);

  const magnetR=2.4+progress.upgrades.magnet*2.6;
  for(let s=stars.length-1;s>=0;s--){ const st=stars[s]; st.t+=dt; st.life-=dt;
    const d=Math.hypot(st.x-player.x, st.y-player.y);
    if(d<magnetR){ st.x=lerp(st.x,player.x,clamp(6*dt,0,1)); st.y=lerp(st.y,player.y,clamp(6*dt,0,1)); }
    if(d<1.2){ collectStar(st); stars.splice(s,1); continue; }
    if(st.life<=0) stars.splice(s,1); }
  starTimer-=dt; if(starTimer<=0){ starTimer=rand(3,7); spawnStar(); }

  for(let p=particles.length-1;p>=0;p--){ const q=particles[p];
    q.x+=q.vx*dt*8; q.y+=q.vy*dt*8; q.vx*=0.92; q.vy*=0.92; q.life-=dt; if(q.life<=0) particles.splice(p,1); }

  updateHUD();
}
function collectStar(st){ const bonus=Math.round(20+stats.level*6); stats.drops+=bonus; sfx.star();
  burst(st.x,st.y,'255,226,89',16); showToast('+'+bonus+' Tropfen'); combo.timer=Math.max(combo.timer,2); checkLevel(); }

/* ============================================================
   RENDER
   ============================================================ */
function render(){
  ctx.save();
  ctx.fillStyle=VOID; ctx.fillRect(0,0,W,H);
  // dezenter Lichtschein in der Mitte
  const vg=ctx.createRadialGradient(W/2,H/2,0, W/2,H/2,Math.max(W,H)*0.7);
  vg.addColorStop(0,'rgba(124,92,255,0.07)'); vg.addColorStop(1,'rgba(0,0,0,0)');
  ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);

  let shx=0,shy=0; if(cam.shake>0){ shx=rand(-cam.shake,cam.shake); shy=rand(-cam.shake,cam.shake); }
  ctx.translate(shx,shy);

  const [ox,oy]=worldToScreen(0,0); const wpx=GRID*cam.zoom, rr=Math.min(18,wpx*0.02);
  // Leinwand (leerer Untergrund) + Schatten
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,.55)'; ctx.shadowBlur=40; ctx.shadowOffsetY=10;
  roundRect(ctx,ox,oy,wpx,wpx,rr); ctx.fillStyle='#0c0e16'; ctx.fill();
  ctx.restore();

  // Dezentes Punkteraster (Sketchpad-Gefühl, Bewegung wird lesbar)
  if(cam.zoom>6){
    ctx.save(); roundRect(ctx,ox,oy,wpx,wpx,rr); ctx.clip();
    const step=8;
    const sx0=Math.max(0,Math.floor((cam.x-W/2/cam.zoom)/step)*step);
    const sy0=Math.max(0,Math.floor((cam.y-H/2/cam.zoom)/step)*step);
    const sx1=Math.min(GRID,cam.x+W/2/cam.zoom), sy1=Math.min(GRID,cam.y+H/2/cam.zoom);
    ctx.fillStyle='rgba(255,255,255,.06)';
    for(let gy=sy0;gy<=sy1;gy+=step) for(let gx=sx0;gx<=sx1;gx+=step){
      const [px,py]=worldToScreen(gx,gy); ctx.beginPath(); ctx.arc(px,py,Math.max(0.8,cam.zoom*0.06),0,7); ctx.fill();
    }
    ctx.restore();
  }

  // Gemaltes Gebiet als glatte Vektor-Silhouette mit eingeklippter Farbe
  if(terrPath){
    ctx.save();
    roundRect(ctx,ox,oy,wpx,wpx,rr); ctx.clip();        // innerhalb der Leinwand
    ctx.translate(ox,oy); ctx.scale(cam.zoom,cam.zoom);  // 1 Einheit = 1 Zelle
    ctx.save(); ctx.clip(terrPath,'evenodd');
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    ctx.drawImage(world, 0,0, GRID,GRID);
    // dezente Tiefe: Licht von oben, Schatten unten
    const sh=ctx.createLinearGradient(0,ownedBounds.minY,0,ownedBounds.maxY+0.001);
    sh.addColorStop(0,'rgba(255,255,255,.08)'); sh.addColorStop(.45,'rgba(255,255,255,0)'); sh.addColorStop(1,'rgba(0,0,0,.12)');
    ctx.fillStyle=sh; ctx.fill(terrPath,'evenodd');
    ctx.restore();
    ctx.lineJoin='round'; ctx.lineWidth=Math.max(0.03, 1.5/cam.zoom);
    ctx.strokeStyle='rgba(255,255,255,.15)'; ctx.stroke(terrPath);
    ctx.restore();
  }
  ctx.lineWidth=1.5; ctx.strokeStyle='rgba(255,255,255,.08)';
  roundRect(ctx,ox,oy,wpx,wpx,rr); ctx.stroke();

  // Live-Spur als weicher Pinselstrich
  if(trailCells.length){
    const rgb=curRGB(); const glow=progress.patternsOwned.magnetGlow;
    ctx.lineJoin='round'; ctx.lineCap='round'; ctx.lineWidth=Math.max(3,cam.zoom*0.78);
    ctx.strokeStyle=rgba(rgb,0.92);
    if(glow){ ctx.shadowColor=rgba(rgb,0.95); ctx.shadowBlur=cam.zoom*0.9; }
    ctx.beginPath();
    let first=true;
    for(const i of trailCells){ const x=(i%GRID)+0.5, y=((i/GRID)|0)+0.5; const [sx,sy]=worldToScreen(x,y);
      if(first){ ctx.moveTo(sx,sy); first=false; } else ctx.lineTo(sx,sy); }
    const [px,py]=worldToScreen(player.x,player.y); ctx.lineTo(px,py);
    ctx.stroke(); ctx.shadowBlur=0;
  }

  // Sterne
  for(const st of stars){ const [sx,sy]=worldToScreen(st.x,st.y);
    const tw=0.55+0.45*Math.sin(st.t*4), R=cam.zoom*0.7;
    ctx.save(); ctx.translate(sx,sy); ctx.rotate(st.t*0.4);
    ctx.shadowColor='#ffe27a'; ctx.shadowBlur=18; ctx.fillStyle=`rgba(255,228,120,${tw})`;
    sparkle(ctx,R); ctx.fill(); ctx.restore(); }

  // Partikel
  for(const q of particles){ const [sx,sy]=worldToScreen(q.x,q.y);
    ctx.globalAlpha=clamp(q.life/q.max,0,1); ctx.fillStyle='rgba('+q.color+',1)';
    ctx.beginPath(); ctx.arc(sx,sy,q.size,0,7); ctx.fill(); }
  ctx.globalAlpha=1;

  drawPlayer();
  ctx.restore();

  if(started) drawMinimap();
}
function drawMinimap(){
  const m=Math.min(150, W*0.32), mx=W/2-m/2, my=H-m-16;
  ctx.save();
  roundRect(ctx,mx,my,m,m,12); ctx.fillStyle='rgba(8,10,17,.82)'; ctx.fill();
  ctx.save(); roundRect(ctx,mx,my,m,m,12); ctx.clip();
  ctx.imageSmoothingEnabled=true; ctx.globalAlpha=0.95; ctx.drawImage(world, mx,my,m,m); ctx.globalAlpha=1;
  const px=mx+player.x/GRID*m, py=my+player.y/GRID*m;
  const vw=(W/cam.zoom)/GRID*m, vh=(H/cam.zoom)/GRID*m;
  ctx.strokeStyle='rgba(255,255,255,.45)'; ctx.lineWidth=1; ctx.strokeRect(px-vw/2,py-vh/2,vw,vh);
  ctx.fillStyle='#fff'; ctx.shadowColor='#22d3ee'; ctx.shadowBlur=6;
  ctx.beginPath(); ctx.arc(px,py,2.6,0,7); ctx.fill(); ctx.shadowBlur=0;
  ctx.restore();
  ctx.strokeStyle='rgba(255,255,255,.1)'; ctx.lineWidth=1; roundRect(ctx,mx,my,m,m,12); ctx.stroke();
  ctx.restore();
}
function sparkle(c,r){ c.beginPath();
  c.moveTo(0,-r); c.quadraticCurveTo(r*0.16,-r*0.16, r,0);
  c.quadraticCurveTo(r*0.16,r*0.16, 0,r); c.quadraticCurveTo(-r*0.16,r*0.16, -r,0);
  c.quadraticCurveTo(-r*0.16,-r*0.16, 0,-r); c.closePath(); }
function roundRect(c,x,y,w,h,r){ r=Math.min(r,w/2,h/2); c.beginPath(); c.moveTo(x+r,y);
  c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }

function drawPlayer(){
  const [sx,sy]=worldToScreen(player.x,player.y);
  const r=Math.max(9, cam.zoom*0.64);
  const skin=hexToRgb((SHOP.skins.find(s=>s.id===progress.skin)||SHOP.skins[0]).color);
  const paint=curRGB();
  ctx.save(); ctx.translate(sx,sy);
  // Glühender Halo
  const g=ctx.createRadialGradient(0,0,r*0.3, 0,0,r*2.6);
  g.addColorStop(0,rgba(skin,0.5)); g.addColorStop(1,rgba(skin,0));
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,r*2.6,0,7); ctx.fill();
  ctx.rotate(player.angle);
  // Pinsel-Spitze (zeigt aktuelle Malfarbe)
  ctx.fillStyle=rgbToHex(...paint); ctx.shadowColor=rgba(paint,0.8); ctx.shadowBlur=r*0.6;
  ctx.beginPath(); ctx.moveTo(r*1.7,0); ctx.lineTo(r*0.25,-r*0.85); ctx.lineTo(r*0.25,r*0.85); ctx.closePath(); ctx.fill();
  ctx.shadowBlur=0;
  // Körper (Orb)
  const bg=ctx.createRadialGradient(-r*0.35,-r*0.35,r*0.1, 0,0,r);
  bg.addColorStop(0,rgbToHex(...mix(skin,[255,255,255],0.55))); bg.addColorStop(1,rgbToHex(...skin));
  ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(0,0,r,0,7); ctx.fill();
  // heller Ring
  ctx.lineWidth=Math.max(1.4,r*0.13); ctx.strokeStyle='rgba(255,255,255,.9)';
  ctx.beginPath(); ctx.arc(0,0,r*0.84,0,7); ctx.stroke();
  // Glanzpunkt
  ctx.fillStyle='rgba(255,255,255,.95)'; ctx.beginPath(); ctx.arc(-r*0.32,-r*0.32,r*0.18,0,7); ctx.fill();
  ctx.restore();
}

/* ============================================================
   GEBIETS-KONTUR (glatte Vektor-Silhouette via Marching Squares)
   ============================================================ */
let terrPath=null;
function chaikin(pts,iter){
  for(let it=0;it<iter;it++){ const out=[], n=pts.length;
    for(let i=0;i<n;i++){ const p=pts[i],q=pts[(i+1)%n];
      out.push([p[0]*0.75+q[0]*0.25, p[1]*0.75+q[1]*0.25]);
      out.push([p[0]*0.25+q[0]*0.75, p[1]*0.25+q[1]*0.75]); }
    pts=out; }
  return pts;
}
function buildTerritoryPath(){
  if(ownedBounds.maxX<ownedBounds.minX){ terrPath=null; return; }
  const x0=Math.max(0,ownedBounds.minX-1), y0=Math.max(0,ownedBounds.minY-1),
        x1=Math.min(GRID-1,ownedBounds.maxX+1), y1=Math.min(GRID-1,ownedBounds.maxY+1);
  const val=(x,y)=>(x<0||y<0||x>=GRID||y>=GRID)?0:owned[idx(x,y)];
  const K=p=>Math.round(p[0]*2)+'_'+Math.round(p[1]*2);
  const edges=new Map();
  const add=(a,b)=>{ const ka=K(a),kb=K(b);
    if(!edges.has(ka)) edges.set(ka,{p:a,n:[]}); if(!edges.has(kb)) edges.set(kb,{p:b,n:[]});
    edges.get(ka).n.push(kb); edges.get(kb).n.push(ka); };
  const TBL={1:[['L','B']],2:[['B','R']],3:[['L','R']],4:[['T','R']],5:[['T','L'],['B','R']],
    6:[['T','B']],7:[['T','L']],8:[['T','L']],9:[['T','B']],10:[['T','R'],['B','L']],
    11:[['T','R']],12:[['L','R']],13:[['B','R']],14:[['L','B']]};
  for(let y=y0-1;y<=y1;y++) for(let x=x0-1;x<=x1;x++){
    const tl=val(x,y),tr=val(x+1,y),br=val(x+1,y+1),bl=val(x,y+1);
    const c=(tl?8:0)|(tr?4:0)|(br?2:0)|(bl?1:0); if(c===0||c===15) continue;
    const E={ T:[x+1,y+0.5], R:[x+1.5,y+1], B:[x+1,y+1.5], L:[x+0.5,y+1] };
    for(const s of TBL[c]) add(E[s[0]], E[s[1]]);
  }
  const used=new Set(), ek=(a,b)=>a<b?a+'|'+b:b+'|'+a, loops=[];
  for(const [k,node] of edges){
    for(const nk of node.n){
      if(used.has(ek(k,nk))) continue;
      const loop=[node.p]; let prev=k, cur=nk, guard=0; used.add(ek(k,nk));
      while(cur!==k && guard++<200000){
        const cn=edges.get(cur); loop.push(cn.p); let nxt=null;
        for(const m of cn.n){ if(m!==prev && !used.has(ek(cur,m))){ nxt=m; break; } }
        if(nxt===null) for(const m of cn.n){ if(!used.has(ek(cur,m))){ nxt=m; break; } }
        if(nxt===null) break; used.add(ek(cur,nxt)); prev=cur; cur=nxt;
      }
      if(loop.length>2) loops.push(loop);
    }
  }
  const path=new Path2D();
  for(let loop of loops){ loop=chaikin(loop,3);
    path.moveTo(loop[0][0],loop[0][1]); for(let i=1;i<loop.length;i++) path.lineTo(loop[i][0],loop[i][1]); path.closePath(); }
  terrPath=path;
}

/* ---------- Loop ---------- */
let lastT=performance.now();
function loop(now){ const dt=Math.min(0.05,(now-lastT)/1000); lastT=now; update(dt); render(); requestAnimationFrame(loop); }

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
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.add('hidden'),1600); }
let comboT=null;
function showCombo(msg){ const c=el('comboPop'); c.textContent=msg; c.classList.remove('hidden');
  c.style.animation='none'; void c.offsetWidth; c.style.animation=''; clearTimeout(comboT); comboT=setTimeout(()=>c.classList.add('hidden'),750); }

/* ---------- statische Icons setzen ---------- */
function setStaticIcons(){
  el('btnShop').innerHTML=ICONS.tools; el('btnPalette').innerHTML=ICONS.palette;
  el('btnShot').innerHTML=ICONS.share; el('btnMute').innerHTML=muted?ICONS.mute:ICONS.sound;
  el('btnHelp').innerHTML=ICONS.help; el('btnZoomIn').innerHTML=ICONS.plus; el('btnZoomOut').innerHTML=ICONS.minus;
  el('icoDrops').innerHTML=ICONS.drop; el('icoLevel').innerHTML=ICONS.star;
  el('icoCombo').innerHTML=ICONS.flame; el('icoPainted').innerHTML=ICONS.frame;
  el('icoBal').innerHTML=ICONS.drop; el('opacityLock').innerHTML=ICONS.lock;
  document.querySelectorAll('.closex').forEach(b=>b.innerHTML=ICONS.close);
}

/* ============================================================
   OVERLAYS
   ============================================================ */
const openOverlay = id => el(id).classList.remove('hidden');
const closeOverlay = id => el(id).classList.add('hidden');
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click', e=>{ sfx.click(); e.target.closest('.overlay').classList.add('hidden'); }));
el('btnStart').addEventListener('click', ()=>{ sfx.click(); startGame(); });
el('btnShop').addEventListener('click', ()=>{ sfx.click(); renderShop('brushes'); openOverlay('shopScreen'); });
el('btnPalette').addEventListener('click', ()=>{ sfx.click(); renderPalette(); openOverlay('paletteScreen'); });
el('btnHelp').addEventListener('click', ()=>{ sfx.click(); openOverlay('helpScreen'); });
el('btnShot').addEventListener('click', ()=>{ sfx.click(); exportPainting(); });
el('btnMute').addEventListener('click', ()=>{ muted=!muted; el('btnMute').innerHTML=muted?ICONS.mute:ICONS.sound; if(!muted) sfx.click(); });
el('btnZoomIn').addEventListener('click', ()=>zoomAt(W/2,H/2,1.25));
el('btnZoomOut').addEventListener('click', ()=>zoomAt(W/2,H/2,1/1.25));

/* ============================================================
   SHOP
   ============================================================ */
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click', ()=>{ sfx.click(); renderShop(t.dataset.tab); }));
function renderShop(tab){
  el('shopDrops').textContent=Math.floor(stats.drops);
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
  const body=el('shopBody'); body.innerHTML='';
  if(tab==='brushes'){
    SHOP.brushes.forEach(b=>{ const owned=!!progress.brushesOwned[b.id], eq=ui.brush===b.id;
      body.appendChild(makeCard({ gradient:brushPreview(b.id), name:b.name, desc:b.desc,
        state:eq?'equipped':owned?'owned':'buy', cost:b.cost, action:()=>{
          if(eq) return; if(owned){ ui.brush=b.id; sfx.click(); renderShop(tab); saveSoon(); return; }
          if(buy(b.cost)){ progress.brushesOwned[b.id]=true; ui.brush=b.id; sfx.unlock(); showToast(b.name+' freigeschaltet'); renderShop(tab); saveSoon(); } } })); });
  } else if(tab==='patterns'){
    SHOP.patterns.forEach(p=>{ const owned=p.id==='opacity'?progress.opacityUnlocked:!!progress.patternsOwned[p.id];
      body.appendChild(makeCard({ gradient:'linear-gradient(135deg,#7c5cff,#22d3ee)', iconHtml:ICONS[p.icon], name:p.name, desc:p.desc,
        state:owned?'owned':'buy', cost:p.cost, action:()=>{ if(owned) return; if(buy(p.cost)){
          if(p.id==='opacity') progress.opacityUnlocked=true; else progress.patternsOwned[p.id]=true;
          sfx.unlock(); showToast(p.name+' freigeschaltet'); renderShop(tab); saveSoon(); } } })); });
  } else if(tab==='upgrades'){
    SHOP.upgrades.forEach(u=>{ const lvl=progress.upgrades[u.id], maxed=lvl>=u.max, cost=u.base+u.step*lvl;
      body.appendChild(makeCard({ gradient:'linear-gradient(135deg,#34d399,#22d3ee)', iconHtml:ICONS[u.icon],
        name:u.name, desc:u.desc, dots:{lvl,max:u.max}, state:maxed?'owned':'buy', cost:maxed?'MAX':cost,
        action:()=>{ if(maxed) return; if(buy(cost)){ progress.upgrades[u.id]++; applyUpgrades(); sfx.unlock(); showToast(u.name+' verbessert'); renderShop(tab); saveSoon(); } } })); });
  } else if(tab==='skins'){
    SHOP.skins.forEach(s=>{ const owned=!!progress.skinsOwned[s.id], eq=progress.skin===s.id;
      body.appendChild(makeCard({ gradient:`radial-gradient(circle at 50% 38%, ${s.color}, #0a0c12 78%)`, name:s.name, desc:'Figur-Design',
        state:eq?'equipped':owned?'owned':'buy', cost:s.cost, action:()=>{ if(eq) return;
          if(owned){ progress.skin=s.id; sfx.click(); renderShop(tab); saveSoon(); return; }
          if(buy(s.cost)){ progress.skinsOwned[s.id]=true; progress.skin=s.id; sfx.unlock(); showToast(s.name+' freigeschaltet'); renderShop(tab); saveSoon(); } } })); });
  }
}
function makeCard({gradient,iconHtml,name,desc,state,cost,action,dots}){
  const c=document.createElement('div'); c.className='card';
  const label = state==='equipped'?'Aktiv' : state==='owned'?'Auswählen' : (cost==='MAX'?'MAX':ic('drop')+' '+cost);
  const afford = state!=='buy' || cost==='MAX' || stats.drops>=cost;
  const cls = state==='equipped'?'equipped' : state==='owned'?'owned' : (afford?'':'cant');
  const dotsHtml = dots ? `<p style="min-height:0;color:#cfd6ec">${'●'.repeat(dots.lvl)}${'○'.repeat(dots.max-dots.lvl)}</p>` : '';
  c.innerHTML = `<div class="preview" style="background:${gradient}">${iconHtml?`<span class="picon">${iconHtml}</span>`:''}</div>
    <h4>${name}</h4><p>${desc}</p>${dotsHtml}<button class="buy ${cls}">${label}</button>`;
  c.querySelector('.buy').addEventListener('click', ()=>{ if(state==='buy'&&!afford){ sfx.fail(); showToast('Nicht genug Tropfen'); return; } action(); });
  return c;
}
function buy(cost){ if(stats.drops<cost){ sfx.fail(); showToast('Nicht genug Tropfen'); return false; }
  stats.drops-=cost; el('shopDrops').textContent=Math.floor(stats.drops); updateHUD(); return true; }
function applyUpgrades(){
  stats.speed=7.4+progress.upgrades.speed*1.4; stats.inkMax=240+progress.upgrades.ink*120;
  stats.turn=5.8+progress.upgrades.turn*1.4; ZMIN=4-progress.upgrades.zoom; ZMAX=70+progress.upgrades.zoom*40;
}

/* ============================================================
   PALETTE
   ============================================================ */
const svC=el('svCanvas'), svCtx=svC.getContext('2d');
function drawSV(){
  const h=ui.color.h, img=svCtx.createImageData(svC.width,svC.height), d=img.data;
  for(let y=0;y<svC.height;y++) for(let x=0;x<svC.width;x++){
    const [r,g,b]=hsvToRgb(h, x/svC.width, 1-y/svC.height); const i=(y*svC.width+x)*4;
    d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255; }
  svCtx.putImageData(img,0,0);
  const mx=ui.color.s*svC.width, my=(1-ui.color.v)*svC.height;
  svCtx.strokeStyle='#fff'; svCtx.lineWidth=2; svCtx.beginPath(); svCtx.arc(mx,my,7,0,7); svCtx.stroke();
  svCtx.strokeStyle='rgba(0,0,0,.5)'; svCtx.lineWidth=1; svCtx.beginPath(); svCtx.arc(mx,my,7,0,7); svCtx.stroke();
}
function pickSV(e){ const r=svC.getBoundingClientRect();
  const cx=(e.touches?e.touches[0].clientX:e.clientX)-r.left, cy=(e.touches?e.touches[0].clientY:e.clientY)-r.top;
  ui.color.s=clamp(cx/r.width,0,1); ui.color.v=clamp(1-cy/r.height,0,1); drawSV(); refreshCur(); }
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
function refreshCur(){ const hex=rgbToHex(...curRGB()); el('curSwatch').style.background=hex; el('curHex').textContent=hex; saveSoon(); }
function renderSwatches(){ const box=el('savedSwatches'); box.innerHTML='';
  ui.swatches.forEach(hex=>{ const d=document.createElement('div'); d.className='swatch'; d.style.background=hex;
    d.addEventListener('click',()=>{ const [h,s,v]=hexToHsv(hex); ui.color={h,s,v}; el('hueRange').value=h; drawSV(); refreshCur(); }); box.appendChild(d); }); }
function hexToHsv(hex){ const [R,G,B]=hexToRgb(hex), r=R/255,g=G/255,b=B/255;
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b),dd=mx-mn; let h=0;
  if(dd){ if(mx===r)h=((g-b)/dd)%6; else if(mx===g)h=(b-r)/dd+2; else h=(r-g)/dd+4; h*=60; if(h<0)h+=360; }
  return [h, mx?dd/mx:0, mx]; }
function renderPalette(){
  drawSV(); refreshCur(); renderSwatches(); el('hueRange').value=ui.color.h;
  const opR=el('opacityRange'), opL=el('opacityLock');
  if(progress.opacityUnlocked){ opL.style.display='none'; opR.disabled=false; opR.value=ui.opacity*100; }
  else { opL.style.display='inline-flex'; opR.disabled=true; }
  const bl=el('brushList'); bl.innerHTML='';
  Object.keys(BRUSHES).forEach(id=>{ const b=BRUSHES[id], owned=id==='solid'||progress.brushesOwned[id];
    const chip=document.createElement('div'); chip.className='brush-chip'+(ui.brush===id?' active':'')+(owned?'':' locked');
    chip.innerHTML=`<span class="bdot" style="background:${brushPreview(id)}"></span>${b.name}`;
    chip.addEventListener('click',()=>{ if(!owned){ sfx.fail(); showToast('In der Werkstatt freischalten'); return; }
      ui.brush=id; sfx.click(); renderPalette(); saveSoon(); }); bl.appendChild(chip); });
}

/* ============================================================
   EXPORT
   ============================================================ */
function exportPainting(){
  const size=1600, pad=44, out=document.createElement('canvas'); out.width=size; out.height=size;
  const o=out.getContext('2d');
  const bgGrad=o.createLinearGradient(0,0,size,size); bgGrad.addColorStop(0,'#0a0c14'); bgGrad.addColorStop(1,'#05060a');
  o.fillStyle=bgGrad; o.fillRect(0,0,size,size);
  o.imageSmoothingEnabled=true; o.imageSmoothingQuality='high';
  roundRectPath(o, pad,pad,size-2*pad,size-2*pad,24); o.save(); o.clip();
  o.drawImage(world, pad,pad, size-2*pad, size-2*pad); o.restore();
  o.lineWidth=2; o.strokeStyle='rgba(255,255,255,.1)'; roundRectPath(o,pad,pad,size-2*pad,size-2*pad,24); o.stroke();
  o.fillStyle='rgba(255,255,255,.55)'; o.font='600 22px Inter,system-ui,sans-serif'; o.textAlign='right';
  o.fillText('PaintDrift', size-pad, size-16);
  out.toBlob(blob=>{ const url=URL.createObjectURL(blob), a=document.createElement('a');
    a.href=url; a.download='paintdrift.png'; a.click(); URL.revokeObjectURL(url); showToast('Gemälde gespeichert'); }, 'image/png');
}
function roundRectPath(c,x,y,w,h,r){ r=Math.min(r,w/2,h/2); c.beginPath(); c.moveTo(x+r,y);
  c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }

/* ============================================================
   SPEICHERN / LADEN
   ============================================================ */
let saveT=null;
function saveSoon(){ clearTimeout(saveT); saveT=setTimeout(saveGame,800); }
function packOwned(){ const bytes=new Uint8Array(Math.ceil(GRID*GRID/8));
  for(let i=0;i<GRID*GRID;i++) if(owned[i]) bytes[i>>3]|=(1<<(i&7));
  let s=''; for(let i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return btoa(s); }
function unpackOwned(b64){ const s=atob(b64);
  for(let i=0;i<GRID*GRID;i++){ owned[i]=(s.charCodeAt(i>>3)>>(i&7))&1; } }
function saveGame(){ try{
  localStorage.setItem(SAVE_KEY, JSON.stringify({ v:2, stats, progress, ui, milestones:[...milestonesHit],
    player:{x:player.x,y:player.y}, bounds:ownedBounds, ownedB64:packOwned(), worldPng:world.toDataURL('image/png') }));
}catch(e){} }
function loadGame(){
  let raw; try{ raw=localStorage.getItem(SAVE_KEY); }catch(e){ return false; } if(!raw) return false;
  try{ const d=JSON.parse(raw);
    Object.assign(stats,d.stats); Object.assign(progress,d.progress); Object.assign(ui,d.ui);
    (d.milestones||[]).forEach(m=>milestonesHit.add(m));
    if(d.bounds) Object.assign(ownedBounds,d.bounds);
    unpackOwned(d.ownedB64);
    stats.paintedCount=0; for(let i=0;i<GRID*GRID;i++) if(owned[i]) stats.paintedCount++;
    if(d.player){ player.x=d.player.x; player.y=d.player.y; cam.x=player.x; cam.y=player.y; }
    applyUpgrades(); stats.ink=stats.inkMax;
    const img=new Image(); img.onload=()=>{ wctx.drawImage(img,0,0,WPX,WPX); worldImg.data.set(wctx.getImageData(0,0,WPX,WPX).data); };
    img.src=d.worldPng; buildTerritoryPath(); return true;
  }catch(e){ return false; }
}

/* ============================================================
   START
   ============================================================ */
function startGame(){ closeOverlay('startScreen'); el('hud').classList.remove('hidden');
  if(!loaded){ seedTerritory(GRID/2|0, GRID/2|0, 6); wctx.putImageData(worldImg,0,0); }
  buildTerritoryPath();
  started=true; player.targetAngle=0; player.angle=0; saveGame();
}

let loaded=false;
setStaticIcons(); applyUpgrades(); loaded=loadGame(); updateHUD();
requestAnimationFrame(loop);
window.addEventListener('beforeunload', saveGame);
setInterval(()=>{ if(started) saveGame(); }, 15000);

})();

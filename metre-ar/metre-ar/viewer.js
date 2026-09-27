// Mesure après coup sur les photos 3D (téléphone ou ordinateur)
import * as G from './geo.js';
import { $, $$, fmtLen, fmtArea, KIND, toast, armConfirm, valShort } from './util.js';
import { getPhoto, delPhoto } from './store.js';

const cv = $('#vc'), ctx = cv.getContext('2d'), lp = $('#vloupe'), lctx = lp.getContext('2d');
let C = null; // contexte fourni par app.js
const V = window.__metreViewer = { idx: 0, photo: null, img: null, view: { x: 0, y: 0, k: 1 }, mode: 'dist', src: 'floor', pts: [], aim: null, aimPx: null, wallId: null };
let dpr = 1;

const TIPS = {
  dist: ['Touchez le point de départ', 'Touchez le point d\'arrivée'],
  height: ['Touchez le pied, au sol', 'Touchez le haut (plafond, haut de porte…)'],
  floor: ['Touchez un angle du sol', 'Angle suivant', 'Angle suivant… touchez le 1er point ou « Terminer »'],
  wall: ['Touchez le pied du mur à GAUCHE (au sol)', 'Touchez le pied du mur à DROITE (au sol)', 'Touchez le HAUT du mur'],
  opening: ['Touchez un coin de la fenêtre / porte', 'Touchez le coin opposé'],
};
const SRC_LABEL = { floor: 'Sol', wall: 'Mur', depth: 'Profondeur' };

export function openViewer(ctxApp, photoId) {
  C = ctxApp;
  const i = C.rel().photos.findIndex((p) => p.id === photoId);
  $('#viewer').hidden = false; document.body.classList.add('noscroll');
  loadPhoto(Math.max(0, i));
}
function close() {
  $('#viewer').hidden = true; document.body.classList.remove('noscroll');
  V.img?.close?.(); V.img = null; V.photo = null; V.pts = [];
  C.onClose();
}

async function loadPhoto(i) {
  const list = C.rel().photos;
  if (!list.length) { close(); return; }
  V.idx = (i + list.length) % list.length;
  const rec = await getPhoto(list[V.idx].id);
  if (!rec) { toast('Photo introuvable sur cet appareil'); return; }
  const oldSid = V.photo && V.photo.sid;
  V.photo = rec; V.img?.close?.();
  V.img = await createImageBitmap(rec.blob);
  if (oldSid !== rec.sid) V.pts = [];
  V.photo.floorY = (C.rel().sess || {})[rec.sid] ?? rec.floorY;
  const walls = sessMeasures().filter((m) => m.kind === 'wall');
  V.wallId = walls.length ? walls[walls.length - 1].id : null;
  $('#vIdx').textContent = `Photo ${V.idx + 1} / ${list.length}`;
  if (!rec.depth && V.src === 'depth') V.src = 'floor';
  resize(); renderTools();
}
const sessMeasures = () => C.rel().measures.filter((m) => m.sid && V.photo && m.sid === V.photo.sid && m.pts);
function activeWall() {
  const m = C.rel().measures.find((x) => x.id === V.wallId);
  return m ? { ...G.wallFrom(m.pts[0], m.pts[1]), id: m.id, name: m.name } : null;
}

/* ---------- vue ---------- */
function fit() {
  if (!V.img) return;
  const W = cv.clientWidth, H = cv.clientHeight, k = Math.min(W / V.img.width, H / V.img.height);
  V.view = { k, x: (W - V.img.width * k) / 2, y: (H - V.img.height * k) / 2 }; draw();
}
function resize() { dpr = window.devicePixelRatio || 1; cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr); fit(); }
new ResizeObserver(() => { if (!$('#viewer').hidden) resize(); }).observe($('#vstage'));
const toS = (u, v) => [u * V.view.k + V.view.x, v * V.view.k + V.view.y];
const toI = (x, y) => [(x - V.view.x) / V.view.k, (y - V.view.y) / V.view.k];
// l'image affichée peut être plus petite que l'image caméra d'origine : on travaille en pixels caméra
const cam = () => V.photo;
const imgScale = () => V.img.width / V.photo.W;
const projS = (p) => { const q = G.projectPixel(cam(), p); if (!q) return null; const s = imgScale(); return toS(q[0] * s, q[1] * s); };

/* ---------- résolution d'un point touché ---------- */
function resolve(u, v) { // u,v en pixels de l'image affichée
  const s = imgScale(), cu = u / s, cvv = v / s, P = V.pts, ph = V.photo;
  const ray = G.pixelRay(ph, cu, cvv);
  const floor = () => (ph.floorY == null ? { err: 'Sol inconnu sur cette photo' } : (G.floorPlaneHit(ray, ph.floorY) ? { p: G.floorPlaneHit(ray, ph.floorY) } : { err: 'Touchez le sol' }));
  const onWall = (w) => { if (!w) return { err: 'Mesurez d\'abord un mur' }; const t = G.rayPlane(ray.o, ray.dn, w.A, w.n); return t ? { p: t } : { err: 'Touchez le mur' }; };
  switch (V.mode) {
    case 'dist':
      if (V.src === 'depth') { const d = G.depthPoint(ph, cu, cvv); return d ? { p: d } : { err: 'Profondeur inconnue ici' }; }
      if (V.src === 'wall') return onWall(activeWall());
      return floor();
    case 'height':
      if (!P.length) return floor();
      { const t = G.closestOnVertical(P[0], ray.o, ray.dn); return t ? { p: t } : { err: 'Touchez au-dessus du point' }; }
    case 'floor': {
      if (P.length >= 3) { const a = projS(P[0]), b = toS(u, v); if (a && Math.hypot(a[0] - b[0], a[1] - b[1]) < 24) return { p: P[0], snap: true }; }
      return floor();
    }
    case 'wall':
      if (P.length < 2) return floor();
      return onWall(G.wallFrom(P[0], P[1]));
    case 'opening': return onWall(activeWall());
  }
  return { err: '' };
}
function liveValue(T) {
  const P = V.pts; if (!T) return '';
  switch (V.mode) {
    case 'dist': return P.length ? fmtLen(G.dist(P[0], T)) : '';
    case 'height': return P.length ? fmtLen(Math.abs(T[1] - P[0][1])) : '';
    case 'floor': return P.length >= 2 ? fmtArea(G.polyArea3([...P, T])) : P.length ? fmtLen(G.dist(P[0], T)) : '';
    case 'wall': if (P.length === 1) return fmtLen(G.hdist(P[0], T)); if (P.length === 2) { const w = G.wallFrom(P[0], P[1]); return `${fmtLen(w.width)} × ${fmtLen(Math.max(0, T[1] - w.baseY))}`; } return '';
    case 'opening': if (P.length === 1 && activeWall()) { const o = G.openingOn(activeWall(), P[0], T); return `${fmtLen(o.width)} × ${fmtLen(o.height)}`; } return '';
  }
  return '';
}

function addPoint(r) {
  if (!r || r.err) { toast(r ? r.err : 'Point impossible'); return; }
  const P = V.pts, sid = V.photo.sid;
  if (V.mode === 'floor' && r.snap) { finishFloor(); return; }
  P.push([...r.p]); navigator.vibrate?.(10);
  if (V.mode === 'dist' && P.length === 2) C.add('dist', { len: G.dist(P[0], P[1]) }, [...P], sid);
  else if (V.mode === 'height' && P.length === 2) {
    const h = Math.abs(P[1][1] - P[0][1]); if (h < 0.01) { P.pop(); return; }
    C.add('height', { len: h }, [...P], sid);
  } else if (V.mode === 'wall') {
    if (P.length === 2 && G.hdist(P[0], P[1]) < 0.1) { P.pop(); toast('Points trop proches'); }
    if (P.length === 3) {
      const w = G.wallFrom(P[0], P[1]), h = P[2][1] - w.baseY;
      if (h < 0.2) { P.pop(); toast('Touchez plus haut'); draw(); return; }
      const rect = G.wallRect(w, h), m = C.add('wall', { w: w.width, h, area: w.width * h }, rect, sid, { diag: { source: 'photo 3D', photo: V.photo.id, ...G.wallDiag(P[0], P[1], P[2]) } });
      V.wallId = m.id; V.pts = []; toast(`${m.name} : ${fmtArea(w.width * h)} · « Ouverture » pour déduire`, 3000);
    }
  } else if (V.mode === 'opening' && P.length === 2) {
    const w = activeWall(), o = G.openingOn(w, P[0], P[1]);
    if (o.area < 0.02) { P.pop(); return; }
    C.add('opening', { w: o.width, h: o.height, area: o.area }, o.corners, sid, { wallId: w.id, wallName: w.name });
  }
  if ((V.mode === 'dist' || V.mode === 'height' || V.mode === 'opening') && P.length === 2) V.pts = [];
  renderTools(); draw();
}
function finishFloor() {
  const P = V.pts; if (P.length < 3) return;
  C.add('floor', { area: G.polyArea3(P), per: G.perimeter(P) }, [...P], V.photo.sid);
  V.pts = []; renderTools(); draw();
}

/* ---------- dessin ---------- */
function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  if (!V.img) return;
  ctx.setTransform(dpr * V.view.k, 0, 0, dpr * V.view.k, dpr * V.view.x, dpr * V.view.y); ctx.drawImage(V.img, 0, 0);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const labels = [];
  for (const m of sessMeasures()) {
    const S = m.pts.map(projS); if (S.some((s) => !s)) continue;
    const c = KIND[m.kind].css, closed = m.kind !== 'dist' && m.kind !== 'height';
    path(S, closed);
    if (closed) { ctx.fillStyle = hexA(c, m.kind === 'opening' ? 0.3 : 0.22); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 4; ctx.stroke(); ctx.strokeStyle = c; ctx.lineWidth = m.id === V.wallId && m.kind === 'wall' ? 3 : 2; ctx.stroke();
    S.forEach((s) => dot(s, c));
    const cx = S.reduce((a, s) => a + s[0], 0) / S.length, cy = S.reduce((a, s) => a + s[1], 0) / S.length;
    labels.push([cx, cy, valShort(m), c]);
  }
  // tracé en cours
  const P = V.pts.map(projS).filter(Boolean), A = V.aim && !V.aim.err ? projS(V.aim.p) : null;
  const all = A ? [...P, A] : P;
  if (all.length > 1) { path(all, V.mode === 'floor' && all.length > 2); ctx.setLineDash([8, 6]); ctx.strokeStyle = '#ffc31a'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]); }
  if (V.mode === 'wall' && V.pts.length === 2 && V.aim && !V.aim.err) {
    const w = G.wallFrom(V.pts[0], V.pts[1]), h = V.aim.p[1] - w.baseY;
    if (h > 0) { const R = G.wallRect(w, h).map(projS); if (R.every(Boolean)) { path(R, true); ctx.fillStyle = 'rgba(255,195,26,.18)'; ctx.fill(); } }
  }
  if (V.mode === 'opening' && V.pts.length === 1 && A && activeWall()) {
    const R = G.openingOn(activeWall(), V.pts[0], V.aim.p).corners.map(projS); if (R.every(Boolean)) { path(R, true); ctx.fillStyle = 'rgba(255,90,74,.25)'; ctx.fill(); }
  }
  P.forEach((s) => dot(s, '#ffc31a'));
  if (V.aimPx) { const [x, y] = V.aimPx; ctx.strokeStyle = V.aim && !V.aim.err ? '#ffc31a' : '#ff5a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.moveTo(x - 18, y); ctx.lineTo(x - 5, y); ctx.moveTo(x + 5, y); ctx.lineTo(x + 18, y); ctx.moveTo(x, y - 18); ctx.lineTo(x, y - 5); ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 18); ctx.stroke(); }
  labels.forEach((l) => pill(...l));
}
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function path(S, close) { ctx.beginPath(); S.forEach((s, i) => (i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]))); if (close) ctx.closePath(); }
function dot(s, c) { ctx.beginPath(); ctx.arc(s[0], s[1], 5, 0, 7); ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#0e1215'; ctx.stroke(); }
function pill(x, y, t, c) { ctx.font = '600 14px Barlow, system-ui, sans-serif'; const w = ctx.measureText(t).width + 16; ctx.fillStyle = 'rgba(14,18,21,.88)'; ctx.beginPath(); ctx.roundRect(x - w / 2, y - 13, w, 26, 13); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y + 1); }
function loupe(sx, sy, fingerX) {
  lp.hidden = false; lp.style.left = fingerX < cv.clientWidth / 2 ? 'auto' : '10px'; lp.style.right = fingerX < cv.clientWidth / 2 ? '10px' : 'auto';
  const [u, v] = toI(sx, sy), Z = V.view.k * 3 * 2, s = 240;
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.fillStyle = '#000'; lctx.fillRect(0, 0, s, s);
  lctx.setTransform(Z, 0, 0, Z, s / 2 - u * Z, s / 2 - v * Z); lctx.drawImage(V.img, 0, 0);
  lctx.setTransform(1, 0, 0, 1, 0, 0); lctx.strokeStyle = '#ffc31a'; lctx.lineWidth = 2; lctx.beginPath();
  lctx.moveTo(s / 2, s / 2 - 36); lctx.lineTo(s / 2, s / 2 - 6); lctx.moveTo(s / 2, s / 2 + 6); lctx.lineTo(s / 2, s / 2 + 36);
  lctx.moveTo(s / 2 - 36, s / 2); lctx.lineTo(s / 2 - 6, s / 2); lctx.moveTo(s / 2 + 6, s / 2); lctx.lineTo(s / 2 + 36, s / 2); lctx.stroke();
}

/* ---------- barre d'outils ---------- */
function renderTools() {
  const ph = V.photo, walls = sessMeasures().filter((m) => m.kind === 'wall');
  $$('.vmode').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.m === V.mode)); if (b.dataset.m === 'opening') b.disabled = !walls.length; });
  const srcs = ['floor', 'wall', ...(ph && ph.depth ? ['depth'] : [])];
  $('#vSrc').hidden = V.mode !== 'dist';
  $('#vSrc').innerHTML = '<span class="small">Point sur :</span>' + srcs.map((s) => `<button class="chip${V.src === s ? ' on' : ''}" data-s="${s}" type="button" ${s === 'wall' && !walls.length ? 'disabled' : ''}>${SRC_LABEL[s]}</button>`).join('');
  const needWall = (V.mode === 'opening' || (V.mode === 'dist' && V.src === 'wall')) && walls.length > 1;
  $('#vWall').hidden = !needWall;
  if (needWall) $('#vWall').innerHTML = '<span class="small">Mur :</span>' + walls.map((w) => `<button class="chip${w.id === V.wallId ? ' on' : ''}" data-w="${w.id}" type="button">${w.name}</button>`).join('');
  const arr = TIPS[V.mode];
  let tip = arr[Math.min(V.pts.length, arr.length - 1)];
  if (ph && ph.floorY == null) tip = 'Sol non détecté pendant la prise de vue : seules les mesures « Profondeur » sont possibles.';
  $('#vHint').textContent = tip;
  $('#vUndo').disabled = !V.pts.length && !C.canUndo();
  $('#vFin').hidden = V.mode !== 'floor'; $('#vFin').disabled = V.pts.length < 3;
}
$$('.vmode').forEach((b) => (b.onclick = () => { V.mode = b.dataset.m; V.pts = []; V.aim = null; renderTools(); draw(); }));
$('#vSrc').addEventListener('click', (e) => { const b = e.target.closest('[data-s]'); if (!b) return; V.src = b.dataset.s; V.pts = []; renderTools(); draw(); });
$('#vWall').addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (!b) return; V.wallId = +b.dataset.w; renderTools(); draw(); });
$('#vUndo').onclick = () => { if (V.pts.length) V.pts.pop(); else C.undo(); renderTools(); draw(); };
$('#vFin').onclick = finishFloor;
$('#vBack').onclick = close;
$('#vPrev').onclick = () => loadPhoto(V.idx - 1);
$('#vNext').onclick = () => loadPhoto(V.idx + 1);
$('#vDel').onclick = (e) => armConfirm(e.currentTarget, async () => {
  const id = C.rel().photos[V.idx].id; await delPhoto(id); C.removePhoto(id);
  if (!C.rel().photos.length) close(); else loadPhoto(V.idx);
});

/* ---------- gestes ---------- */
const Ptr = new Map(); let Gs = null;
const rel = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
const OFFSET = 70; // au doigt, la cible est un peu au-dessus pour rester visible
function aimAt(sx, sy) {
  V.aimPx = [sx, sy]; const [u, v] = toI(sx, sy);
  V.aim = u >= 0 && v >= 0 && u <= V.img.width && v <= V.img.height ? resolve(u, v) : { err: 'Hors de la photo' };
  $('#vVal').textContent = V.aim.err ? V.aim.err : liveValue(V.aim.p) || '';
  draw();
}
cv.addEventListener('pointerdown', (e) => {
  if (!V.img) return; cv.setPointerCapture(e.pointerId); const p = rel(e); Ptr.set(e.pointerId, p);
  if (Ptr.size === 2) { const [a, b] = [...Ptr.values()]; Gs = { t: 'pinch', d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v0: { ...V.view } }; V.aimPx = null; lp.hidden = true; draw(); return; }
  if (Ptr.size > 2) return;
  if (e.pointerType === 'mouse') Gs = { t: 'mouse', s: p, v0: { ...V.view }, moved: false };
  else { Gs = { t: 'aim' }; aimAt(p[0], p[1] - OFFSET); loupe(p[0], p[1] - OFFSET, p[0]); }
});
cv.addEventListener('pointermove', (e) => {
  const p = rel(e);
  if (!Ptr.has(e.pointerId)) { if (e.pointerType === 'mouse' && V.img) aimAt(p[0], p[1]); return; }
  Ptr.set(e.pointerId, p); if (!Gs) return;
  if (Gs.t === 'pinch' && Ptr.size >= 2) {
    const [a, b] = [...Ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const k = Math.min(30, Math.max(0.05, (Gs.v0.k * d) / Gs.d0)), iu = (Gs.m0[0] - Gs.v0.x) / Gs.v0.k, iv = (Gs.m0[1] - Gs.v0.y) / Gs.v0.k;
    V.view = { k, x: m[0] - iu * k, y: m[1] - iv * k }; draw();
  } else if (Gs.t === 'aim') { aimAt(p[0], p[1] - OFFSET); loupe(p[0], p[1] - OFFSET, p[0]); }
  else if (Gs.t === 'mouse') {
    const dx = p[0] - Gs.s[0], dy = p[1] - Gs.s[1];
    if (Math.hypot(dx, dy) > 5) Gs.moved = true;
    if (Gs.moved) { V.view.x = Gs.v0.x + dx; V.view.y = Gs.v0.y + dy; V.aimPx = null; draw(); }
  }
});
function up(e, cancel) {
  if (!Ptr.has(e.pointerId)) return; Ptr.delete(e.pointerId);
  if (!Gs) return;
  if (Gs.t === 'pinch') { if (Ptr.size === 0) Gs = null; return; }
  if (Gs.t === 'aim') { lp.hidden = true; if (!cancel) addPoint(V.aim); V.aimPx = null; }
  if (Gs.t === 'mouse' && !Gs.moved && !cancel) { const p = rel(e); aimAt(p[0], p[1]); addPoint(V.aim); }
  Gs = null; draw();
}
cv.addEventListener('pointerup', (e) => up(e));
cv.addEventListener('pointercancel', (e) => up(e, true));
cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !Ptr.size) { V.aimPx = null; draw(); } });
cv.addEventListener('wheel', (e) => {
  e.preventDefault(); const [x, y] = rel(e), k = Math.min(30, Math.max(0.05, V.view.k * Math.exp(-e.deltaY * 0.0015)));
  const iu = (x - V.view.x) / V.view.k, iv = (y - V.view.y) / V.view.k; V.view = { k, x: x - iu * k, y: y - iv * k }; aimAt(x, y);
}, { passive: false });
$('#vFit').onclick = fit;
document.addEventListener('keydown', (e) => { if ($('#viewer').hidden) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') loadPhoto(V.idx + 1); if (e.key === 'ArrowLeft') loadPhoto(V.idx - 1); });

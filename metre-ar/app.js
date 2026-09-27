import * as G from './geo.js';

/* ================= utilitaires ================= */
const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const num = (v) => { const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : NaN; };
const fr = (n, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtLen = (m) => (m < 1 ? fr(m * 100, 1) + ' cm' : fr(m, 2) + ' m');
const fmtArea = (a) => fr(a, 2) + ' m²';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
};
let toastT;
function toast(msg) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2200);
}
function armConfirm(btn, fn, need = true) {
  if (!need || btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label || btn.textContent; fn(); return; }
  btn.dataset.label = btn.textContent; btn.dataset.armed = '1'; btn.textContent = 'Confirmer ?';
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
}

const KIND = {
  dist: { label: 'Distance', css: '#ffffff', rgb: [1, 1, 1] },
  height: { label: 'Hauteur', css: '#ffc31a', rgb: [1, 0.76, 0.1] },
  floor: { label: 'Sol', css: '#3ddc84', rgb: [0.24, 0.86, 0.52] },
  wall: { label: 'Mur', css: '#3d9be9', rgb: [0.24, 0.61, 0.91] },
  opening: { label: 'Ouverture', css: '#ff5a4a', rgb: [1, 0.35, 0.29] },
};
const YELLOW = [1, 0.76, 0.1], GREEN = [0.24, 0.86, 0.52];

/* ================= relevé (données) ================= */
let rel = LS.get('metre-ar-current', { name: '', measures: [], savedId: null });
let nextId = rel.measures.reduce((a, m) => Math.max(a, m.id), 0) + 1;
function persist() {
  LS.set('metre-ar-current', rel);
  if (rel.savedId) {
    const list = LS.get('metre-ar-saved', []), i = list.findIndex((r) => r.id === rel.savedId);
    if (i >= 0) { list[i] = { ...list[i], name: rel.name || list[i].name, measures: rel.measures, date: Date.now() }; LS.set('metre-ar-saved', list); }
  }
}
function totals(ms = rel.measures) {
  const t = { floor: 0, wall: 0, opening: 0 };
  ms.forEach((m) => { if (m.kind in t) t[m.kind] += m.v.area; });
  t.net = Math.max(0, t.wall - t.opening);
  return t;
}
function valHtml(m) {
  const v = m.v;
  if (m.kind === 'dist' || m.kind === 'height') return fmtLen(v.len);
  if (m.kind === 'floor') return `${fmtArea(v.area)}<small>périm. ${fmtLen(v.per)}</small>`;
  return `${m.kind === 'opening' ? '− ' : ''}${fmtArea(v.area)}<small>${fmtLen(v.w)} × ${fmtLen(v.h)}</small>`;
}
function valText(m) {
  const v = m.v;
  if (m.kind === 'dist' || m.kind === 'height') return fmtLen(v.len);
  if (m.kind === 'floor') return `${fmtArea(v.area)} (périmètre ${fmtLen(v.per)})`;
  return `${fmtArea(v.area)} (${fmtLen(v.w)} × ${fmtLen(v.h)})`;
}

/* ================= écran d'accueil ================= */
function renderHome() {
  $('#relName').value = rel.name || '';
  const list = $('#list');
  list.innerHTML = rel.measures.length
    ? rel.measures.map((m) => `<li class="m k-${m.kind}" data-id="${m.id}"><span class="sw"></span><input class="nm" id="nm${m.id}" value="${esc(m.name)}" aria-label="Nom"><span class="val">${valHtml(m)}</span><button class="del" type="button" aria-label="Supprimer">×</button></li>`).join('')
    : '<li class="empty">Aucune mesure pour l\'instant. Touchez « Démarrer la mesure ».</li>';
  const t = totals(), has = (k) => rel.measures.some((m) => m.kind === k);
  let h = '';
  if (has('floor')) h += `<span>Sols</span><span>${fmtArea(t.floor)}</span>`;
  if (has('wall')) h += `<span>Murs (brut)</span><span>${fmtArea(t.wall)}</span>`;
  if (has('opening')) h += `<span>Ouvertures</span><span style="color:var(--deduct)">− ${fmtArea(t.opening)}</span>`;
  if (has('wall')) h += `<b>Murs (net)</b><span class="big">${fmtArea(t.net)}</span>`;
  $('#totals').innerHTML = h; $('#totals').hidden = !h;
  renderSaved();
}
$('#relName').addEventListener('input', (e) => { rel.name = e.target.value; persist(); });
$('#list').addEventListener('input', (e) => {
  if (!e.target.classList.contains('nm')) return;
  const m = rel.measures.find((x) => x.id == e.target.closest('li').dataset.id); m.name = e.target.value; persist();
});
$('#list').addEventListener('click', (e) => {
  const b = e.target.closest('.del'); if (!b) return;
  const id = +b.closest('li').dataset.id;
  rel.measures = rel.measures.filter((m) => m.id !== id && m.wallId !== id); persist(); renderHome();
});
const dirty = () => rel.measures.length > 0 && !rel.savedId;
$('#newBtn').onclick = (e) => armConfirm(e.currentTarget, () => { rel = { name: '', measures: [], savedId: null }; persist(); renderHome(); }, dirty());
$('#saveBtn').onclick = () => {
  if (!rel.measures.length) { toast('Rien à enregistrer'); return; }
  const list = LS.get('metre-ar-saved', []);
  if (!rel.name) rel.name = 'Relevé du ' + new Date().toLocaleDateString('fr-FR');
  if (!rel.savedId) { rel.savedId = 'r' + Date.now(); list.unshift({ id: rel.savedId, name: rel.name, date: Date.now(), measures: rel.measures }); LS.set('metre-ar-saved', list); }
  persist(); renderHome(); toast('Relevé enregistré sur ce téléphone');
};
function renderSaved() {
  const list = LS.get('metre-ar-saved', []);
  $('#saved').innerHTML = list.length
    ? list.map((r) => { const t = totals(r.measures); return `<li data-id="${r.id}"><div class="t"><b>${esc(r.name)}</b><span class="small muted">${new Date(r.date).toLocaleDateString('fr-FR')} · ${r.measures.length} mesure(s)${t.wall ? ' · murs ' + fmtArea(t.net) : ''}${t.floor ? ' · sol ' + fmtArea(t.floor) : ''}</span></div><button class="btn sm" data-a="open" type="button">${r.id === rel.savedId ? 'Ouvert' : 'Ouvrir'}</button><button class="del" data-a="del" type="button" aria-label="Supprimer">×</button></li>`; }).join('')
    : '<li class="empty">Aucun relevé enregistré.</li>';
}
$('#saved').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.closest('li').dataset.id, list = LS.get('metre-ar-saved', []), r = list.find((x) => x.id === id);
  if (b.dataset.a === 'open' && r && id !== rel.savedId) armConfirm(b, () => {
    rel = { name: r.name, measures: r.measures, savedId: r.id }; nextId = rel.measures.reduce((a, m) => Math.max(a, m.id), 0) + 1; persist(); renderHome(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }, dirty());
  if (b.dataset.a === 'del') armConfirm(b, () => {
    LS.set('metre-ar-saved', list.filter((x) => x.id !== id)); if (rel.savedId === id) { rel.savedId = null; persist(); } renderSaved();
  });
});

/* ---------- partage ---------- */
function summary() {
  let t = `${rel.name || 'Relevé'} · ${new Date().toLocaleDateString('fr-FR')}\n\n`;
  rel.measures.forEach((m) => { t += `${m.kind === 'opening' ? '− ' : ''}${m.name} : ${valText(m)}\n`; });
  const T = totals();
  if (T.floor) t += `\nSols : ${fmtArea(T.floor)}`;
  if (T.wall) t += `\nMurs brut : ${fmtArea(T.wall)}\nOuvertures : ${fmtArea(T.opening)}\nMurs net : ${fmtArea(T.net)}`;
  return t + '\n\nMesuré avec Métré AR';
}
$('#shareBtn').onclick = async () => {
  const text = summary();
  if (navigator.share) { try { await navigator.share({ title: rel.name || 'Relevé', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Relevé copié'); }
  catch (e) { const a = $('#copyfb'); a.hidden = false; a.value = text; a.focus(); a.select(); }
};

/* ================= compatibilité ================= */
async function checkCompat() {
  const b = $('#startBtn'), c = $('#compat');
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!window.isSecureContext) { b.textContent = 'Adresse non sécurisée'; c.textContent = 'Ouvrez l\'adresse en https:// (lien GitHub Pages).'; return; }
  if (!navigator.xr) {
    b.textContent = 'Réalité augmentée indisponible';
    c.innerHTML = ios ? 'Sur iPhone, Safari ne permet pas la mesure en réalité augmentée depuis une page web. Utilisez un téléphone Android avec Chrome.' : 'Ouvrez ce lien dans <b>Chrome</b> sur un téléphone Android compatible ARCore.';
    return;
  }
  let ok = false; try { ok = await navigator.xr.isSessionSupported('immersive-ar'); } catch (e) { /* non géré */ }
  if (!ok) { b.textContent = 'Téléphone non compatible'; c.innerHTML = 'Installez ou mettez à jour « Google Play Services pour la RA » puis rechargez la page. <a href="https://play.google.com/store/apps/details?id=com.google.ar.core" target="_blank" rel="noopener">Ouvrir le Play Store</a>'; return; }
  b.disabled = false; b.textContent = 'Démarrer la mesure';
  c.textContent = 'La caméra va s\'ouvrir. Balayez le sol lentement jusqu\'à voir le cercle jaune.';
}

/* ================= WebGL minimal ================= */
const canvas = $('#gl');
let gl, prog, loc;
function initGL() {
  gl = canvas.getContext('webgl', { xrCompatible: true, alpha: true, antialias: true });
  if (!gl) throw new Error('WebGL indisponible');
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec3 p;uniform mat4 P;uniform mat4 V;void main(){gl_Position=P*V*vec4(p,1.0);}'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision mediump float;uniform vec4 c;void main(){gl_FragColor=vec4(c.rgb*c.a,c.a);}'));
  gl.linkProgram(prog);
  loc = { p: gl.getAttribLocation(prog, 'p'), P: gl.getUniformLocation(prog, 'P'), V: gl.getUniformLocation(prog, 'V'), c: gl.getUniformLocation(prog, 'c') };
}
class Mesh {
  constructor() { this.buf = gl.createBuffer(); this.n = 0; }
  set(arr) { gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.DYNAMIC_DRAW); this.n = arr.length / 3; return this; }
  draw(rgb, a) {
    if (!this.n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0);
    gl.uniform4f(loc.c, rgb[0], rgb[1], rgb[2], a); gl.drawArrays(gl.TRIANGLES, 0, this.n);
  }
  dispose() { gl.deleteBuffer(this.buf); }
}
const solidOf = (dots, segs, r = 0.003) => [...segs.flatMap(([a, b]) => G.prism(a, b, r)), ...dots.flatMap((p) => G.octa(p))];
const closedSegs = (pts) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
const centroid = (pts) => G.scale(pts.reduce((s, p) => G.add(s, p), [0, 0, 0]), 1 / pts.length);

/* ================= séance AR ================= */
let session = null, refSpace = null, hitSource = null, wakeLock = null;
const visuals = new Map(); // id -> {solid, fill, rgb, label:{el,pos}}
const A = { mode: 'dist', pts: [], target: null, hitSeen: false, wall: null, sessionIds: [], lastHud: 0, flash: null, C: [0, 0, 0] };
let prevSolid, prevFill, reticle;

const TIPS = {
  dist: ['Visez le point de départ, puis appuyez sur +', 'Visez le point d\'arrivée, puis +'],
  height: ['Visez le pied, au sol, puis appuyez sur +', 'Levez le téléphone : visez le haut, puis +'],
  floor: ['Visez un angle du sol, puis appuyez sur +', 'Visez l\'angle suivant, puis +', 'Angle suivant… Revenez au 1er point ou touchez « Terminer »'],
  wall: ['Visez le pied du mur à GAUCHE (au sol), puis +', 'Visez le pied du mur à DROITE (au sol), puis +', 'Visez le HAUT du mur (angle avec le plafond), puis +'],
  opening: ['Visez un coin de la fenêtre ou de la porte, puis +', 'Visez le coin opposé (en diagonale), puis +'],
};

$('#startBtn').onclick = startAR;
async function startAR() {
  try { if (!gl) initGL(); } catch (e) { toast(e.message); return; }
  const root = $('#ar'); root.hidden = false;
  try {
    session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay', 'local-floor'], domOverlay: { root } });
  } catch (e) { root.hidden = true; toast('Impossible de lancer la caméra AR : ' + e.message); return; }
  try {
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
    refSpace = await session.requestReferenceSpace('local');
    const viewer = await session.requestReferenceSpace('viewer');
    hitSource = await session.requestHitTestSource({ space: viewer });
  } catch (e) { toast('Erreur AR : ' + e.message); session.end(); return; }
  session.addEventListener('end', onEnd);
  $('#home').hidden = true;
  prevSolid = new Mesh(); prevFill = new Mesh(); reticle = new Mesh();
  Object.assign(A, { pts: [], target: null, hitSeen: false, wall: null, sessionIds: [], flash: null });
  $('.mode[data-m="opening"]').disabled = true;
  setMode('dist');
  navigator.wakeLock?.request('screen').then((w) => (wakeLock = w)).catch(() => { /* facultatif */ });
  session.requestAnimationFrame(onFrame);
}
function onEnd() {
  try { hitSource?.cancel(); } catch (e) { /* déjà libéré */ }
  hitSource = null; session = null;
  visuals.forEach((v) => { v.solid.dispose(); v.fill.dispose(); v.label.el.remove(); }); visuals.clear();
  [prevSolid, prevFill, reticle].forEach((m) => m && m.dispose());
  try { wakeLock?.release(); } catch (e) { /* rien */ }
  $('#ar').hidden = true; $('#home').hidden = false; renderHome();
}
$('#ar').addEventListener('beforexrselect', (e) => e.preventDefault());
$('#quitBtn').onclick = () => session && session.end();
$$('.mode').forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
$('#addBtn').onclick = addPoint;
$('#finBtn').onclick = () => { if (A.mode === 'floor' && A.pts.length >= 3) finishFloor(); };
$('#undoBtn').onclick = () => {
  if (A.pts.length) { A.pts.pop(); return; }
  const id = A.sessionIds.pop(); if (id == null) return;
  const m = rel.measures.find((x) => x.id === id);
  removeVisual(id); rel.measures = rel.measures.filter((x) => x.id !== id); persist();
  if (m && m.kind === 'wall' && A.wall && A.wall.id === id) { A.wall = null; $('.mode[data-m="opening"]').disabled = true; if (A.mode === 'opening') setMode('wall'); }
  A.flash = { text: 'Mesure supprimée', until: performance.now() + 1500 };
};
function setMode(m) {
  A.mode = m; A.pts = [];
  $$('.mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
  $('#hudMode').textContent = KIND[m].label;
}

function computeTarget(C, D, hit) {
  const P = A.pts;
  switch (A.mode) {
    case 'dist': return hit;
    case 'height': {
      if (!P.length) return hit;
      const v = G.closestOnVertical(P[0], C, D);
      return v && { p: v, n: G.norm([C[0] - v[0], 0, C[2] - v[2]]) };
    }
    case 'floor':
      if (hit && P.length >= 3 && G.dist(hit.p, P[0]) < 0.1) return { p: P[0], n: hit.n, snap: true };
      return hit;
    case 'wall': {
      if (P.length < 2) return hit;
      const w = G.wallFrom(P[0], P[1]), t = G.rayPlane(C, D, w.A, w.n);
      return t && { p: t, n: w.n };
    }
    case 'opening': {
      if (!A.wall) return null;
      const t = G.rayPlane(C, D, A.wall.A, A.wall.n);
      return t && { p: t, n: A.wall.n };
    }
  }
  return null;
}

function addVisual(m, dots, segs, fillPts, labelPos, text) {
  const el = document.createElement('div'); el.className = 'lbl'; el.style.setProperty('--c', KIND[m.kind].css); el.textContent = text;
  $('#labels').appendChild(el);
  visuals.set(m.id, { solid: new Mesh().set(solidOf(dots, segs)), fill: new Mesh().set(fillPts ? G.fillMesh(fillPts) : []), rgb: KIND[m.kind].rgb, label: { el, pos: labelPos } });
}
function removeVisual(id) { const v = visuals.get(id); if (!v) return; v.solid.dispose(); v.fill.dispose(); v.label.el.remove(); visuals.delete(id); }
function finalize(kind, v, extra = {}) {
  const n = rel.measures.filter((m) => m.kind === kind).length + 1;
  const m = { id: nextId++, kind, name: `${KIND[kind].label} ${n}${extra.wallName ? ' – ' + extra.wallName : ''}`, v, ...(extra.wallId ? { wallId: extra.wallId } : {}) };
  rel.measures.push(m); A.sessionIds.push(m.id); A.pts = []; persist();
  A.flash = { text: `${m.name} : ${kind === 'dist' || kind === 'height' ? fmtLen(v.len) : fmtArea(v.area)}`, until: performance.now() + 2500 };
  navigator.vibrate?.([20, 40, 20]);
  return m;
}
function finishFloor() {
  const P = A.pts; if (P.length < 3) return;
  const area = G.polyArea3(P), per = G.perimeter(P);
  const m = finalize('floor', { area, per });
  addVisual(m, P, closedSegs(P), P, centroid(P), fmtArea(area));
}
function addPoint() {
  const t = A.target;
  if (!t) { navigator.vibrate?.(80); A.flash = { text: 'Aucune surface visée', until: performance.now() + 1200 }; return; }
  if (A.mode === 'floor' && t.snap) { finishFloor(); return; }
  const p = [...t.p], P = A.pts;
  P.push(p); navigator.vibrate?.(15);
  switch (A.mode) {
    case 'dist':
      if (P.length === 2) { const L = G.dist(P[0], P[1]); const m = finalize('dist', { len: L }); addVisual(m, P, [[P[0], P[1]]], null, G.add(centroid(P), [0, 0.03, 0]), fmtLen(L)); }
      break;
    case 'height':
      if (P.length === 2) {
        const h = Math.abs(P[1][1] - P[0][1]); if (h < 0.01) { P.pop(); return; }
        const m = finalize('height', { len: h }); addVisual(m, P, [[P[0], P[1]]], null, centroid(P), fmtLen(h));
      }
      break;
    case 'wall':
      if (P.length === 2 && G.hdist(P[0], P[1]) < 0.1) { P.pop(); A.flash = { text: 'Points trop proches', until: performance.now() + 1500 }; }
      if (P.length === 3) {
        const w = G.wallFrom(P[0], P[1]), h = p[1] - w.baseY;
        if (h < 0.2) { P.pop(); A.flash = { text: 'Visez plus haut', until: performance.now() + 1500 }; return; }
        const rect = G.wallRect(w, h), area = w.width * h;
        const m = finalize('wall', { w: w.width, h, area });
        addVisual(m, rect, closedSegs(rect), rect, centroid(rect), fmtArea(area));
        A.wall = { ...w, id: m.id, name: m.name, h };
        $('.mode[data-m="opening"]').disabled = false;
        A.flash = { text: `${m.name} : ${fmtArea(area)} · touchez « Ouverture » pour déduire fenêtres et portes`, until: performance.now() + 4000 };
      }
      break;
    case 'opening':
      if (P.length === 2) {
        const o = G.openingOn(A.wall, P[0], P[1]); if (o.area < 0.02) { P.pop(); return; }
        const m = finalize('opening', { w: o.width, h: o.height, area: o.area }, { wallId: A.wall.id, wallName: A.wall.name });
        addVisual(m, o.corners, closedSegs(o.corners), o.corners, centroid(o.corners), '− ' + fmtArea(o.area));
      }
      break;
  }
}

/* ---------- aperçu en direct ---------- */
function livePreview() {
  const P = A.pts, t = A.target, dots = [...P], segs = [];
  let fill = null, val = '';
  for (let i = 1; i < P.length; i++) segs.push([P[i - 1], P[i]]);
  if (t) {
    const T = t.p;
    switch (A.mode) {
      case 'dist': if (P.length) { segs.push([P[0], T]); val = fmtLen(G.dist(P[0], T)); } break;
      case 'height': if (P.length) { segs.push([P[0], T]); val = fmtLen(Math.abs(T[1] - P[0][1])); } break;
      case 'floor':
        if (P.length) segs.push([P[P.length - 1], T]);
        if (P.length >= 2) { const poly = t.snap ? P : [...P, T]; fill = poly; if (!t.snap) segs.push([T, P[0]]); val = fmtArea(G.polyArea3(poly)); }
        else if (P.length === 1) val = fmtLen(G.dist(P[0], T));
        break;
      case 'wall':
        if (P.length === 1) { segs.push([P[0], T]); val = fmtLen(G.hdist(P[0], T)); }
        if (P.length === 2) {
          const w = G.wallFrom(P[0], P[1]), h = T[1] - w.baseY;
          if (h > 0) { const r = G.wallRect(w, h); fill = r; segs.length = 0; segs.push(...closedSegs(r)); val = `${fmtLen(w.width)} × ${fmtLen(h)}`; }
        }
        break;
      case 'opening':
        if (P.length === 1) { const o = G.openingOn(A.wall, P[0], T); fill = o.corners; segs.push(...closedSegs(o.corners)); val = `${fmtLen(o.width)} × ${fmtLen(o.height)}`; }
        break;
    }
  }
  prevSolid.set(solidOf(dots, segs, 0.0035));
  prevFill.set(fill && fill.length >= 3 ? G.fillMesh(fill) : []);
  reticle.set(t ? [...G.ringMesh(t.p, t.n), ...G.octa(t.p, 0.005)] : []);
  return val;
}

/* ---------- boucle d'image ---------- */
function rotate(v, q) {
  const u = [q.x, q.y, q.z], w = q.w;
  const t = G.scale(G.cross(u, v), 2);
  return G.add(G.add(v, G.scale(t, w)), G.cross(u, t));
}
function project(p, P, V) {
  const x = p[0], y = p[1], z = p[2];
  const v = [0, 1, 2, 3].map((r) => V[r] * x + V[4 + r] * y + V[8 + r] * z + V[12 + r]);
  const c = [0, 1, 2, 3].map((r) => P[r] * v[0] + P[4 + r] * v[1] + P[8 + r] * v[2] + P[12 + r] * v[3]);
  if (c[3] <= 0.01) return null;
  return [((c[0] / c[3]) * 0.5 + 0.5) * innerWidth, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * innerHeight];
}
function onFrame(time, frame) {
  const s = frame.session; s.requestAnimationFrame(onFrame);
  const layer = s.renderState.baseLayer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const pose = frame.getViewerPose(refSpace);
  if (!pose) { hud('—', 'Suivi perdu : bougez lentement le téléphone'); return; }
  const tp = pose.transform.position, C = [tp.x, tp.y, tp.z], D = G.norm(rotate([0, 0, -1], pose.transform.orientation));
  let hit = null;
  if (hitSource) {
    const r = frame.getHitTestResults(hitSource);
    if (r.length) { const hp = r[0].getPose(refSpace); if (hp) { const m = hp.transform.matrix; hit = { p: [m[12], m[13], m[14]], n: G.norm([m[4], m[5], m[6]]) }; A.hitSeen = true; } }
  }
  A.target = computeTarget(C, D, hit);
  const live = livePreview();

  gl.useProgram(prog); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST);
  for (const view of pose.views) {
    const vp = layer.getViewport(view); gl.viewport(vp.x, vp.y, vp.width, vp.height);
    gl.uniformMatrix4fv(loc.P, false, view.projectionMatrix); gl.uniformMatrix4fv(loc.V, false, view.transform.inverse.matrix);
    gl.depthMask(true);
    visuals.forEach((v) => v.solid.draw(v.rgb, 1));
    prevSolid.draw(YELLOW, 1);
    gl.depthMask(false);
    visuals.forEach((v) => v.fill.draw(v.rgb, 0.28));
    prevFill.draw(YELLOW, 0.22);
    gl.disable(gl.DEPTH_TEST); reticle.draw(A.target && A.target.snap ? GREEN : YELLOW, 0.95); gl.enable(gl.DEPTH_TEST);
  }
  gl.depthMask(true);

  const v0 = pose.views[0];
  visuals.forEach((v) => {
    const s2 = project(v.label.pos, v0.projectionMatrix, v0.transform.inverse.matrix);
    v.label.el.hidden = !s2;
    if (s2) v.label.el.style.transform = `translate(${s2[0]}px,${s2[1]}px) translate(-50%,-50%)`;
  });

  if (time - A.lastHud > 90) {
    A.lastHud = time;
    const far = A.target && G.dist(C, A.target.p) > 5;
    let tip;
    if (!A.hitSeen) tip = 'Balayez lentement le sol avec le téléphone…';
    else if (!A.target) tip = A.mode === 'opening' ? 'Visez le mur mesuré' : 'Aucune surface ici : bougez doucement le téléphone';
    else { const arr = TIPS[A.mode]; tip = arr[Math.min(A.pts.length, arr.length - 1)]; if (far) tip += ' · rapprochez-vous pour plus de précision'; }
    const fl = A.flash && A.flash.until > performance.now() ? A.flash.text : null;
    hud(live || (fl ? '✓' : '—'), fl || tip);
    $('#finBtn').disabled = !(A.mode === 'floor' && A.pts.length >= 3);
    $('#finBtn').classList.toggle('go', !$('#finBtn').disabled);
    $('#addBtn').disabled = !A.target;
  }
}
function hud(val, tip) { $('#hudVal').textContent = val; $('#hudTip').textContent = tip; }

/* ================= démarrage ================= */
renderHome();
checkCompat();

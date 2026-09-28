import * as G from './geo.js?v=2.0.1';
import * as P from './plan.js?v=2.0.1';
import { $, $$, fmtLen, fmtArea, esc, KIND, toast, armConfirm, round3, saveFile, slug } from './util.js?v=2.0.1';
import { openPlan, buildPages } from './planview.js?v=2.0.1';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } },
};
const YELLOW = [1, 0.76, 0.1], GREEN = [0.24, 0.86, 0.52], BLUE = [0.24, 0.61, 0.91], RED = [1, 0.35, 0.29];
const cm = (m) => String(Math.round(m * 100));

/* ================= chantier (données) ================= */
const blank = () => ({ name: '', rooms: [], measures: [], savedId: null });
let rel = Object.assign(blank(), LS.get('metre-ar-current', {}));
delete rel.photos; delete rel.sess;
if (!Array.isArray(rel.rooms)) rel.rooms = []; if (!Array.isArray(rel.measures)) rel.measures = [];
rel.rooms.forEach(P.normalizeRoom);
let nextId = Math.max(0, ...rel.measures.map((m) => m.id), ...rel.rooms.map((r) => r.id)) + 1;
const undoStack = [];
function snapshot() { undoStack.push(JSON.stringify({ rooms: rel.rooms, measures: rel.measures })); if (undoStack.length > 50) undoStack.shift(); }
function undo() { const s = undoStack.pop(); if (!s) return false; const o = JSON.parse(s); rel.rooms = o.rooms; rel.measures = o.measures; persist(); return true; }
function persist() {
  LS.set('metre-ar-current', rel);
  if (rel.savedId) {
    const list = LS.get('metre-ar-saved', []), i = list.findIndex((r) => r.id === rel.savedId);
    if (i >= 0) { list[i] = { ...list[i], name: rel.name || list[i].name, rooms: rel.rooms, measures: rel.measures, date: Date.now() }; LS.set('metre-ar-saved', list); }
  }
}
function addMeasure(kind, v, pts, sid, extra = {}) {
  const n = rel.measures.filter((m) => m.kind === kind).length + 1;
  const m = { id: nextId++, kind, name: `${KIND[kind].label} ${n}`, v, pts: pts.map(round3), sid, ...extra };
  rel.measures.push(m); persist(); return m;
}
function roomSummary(r) {
  const g = P.roomGeometry(r), net = g.wallStats.reduce((s, w) => s + w.net, 0), nv = r.verifications.length;
  return { g, txt: `${r.corners.length} murs · sol ${fmtArea(g.sol)} · ${P.hspText(g)}${g.complet ? ' · murs nets ' + fmtArea(net) : ''} · ${r.openings.length} ouverture(s)${nv ? ` · ${nv} cote(s) vérifiée(s)` : ''}${g.ok ? '' : ' · ⚠ cotes à revoir'}` };
}
function valHtml(m) {
  const v = m.v;
  if (m.kind === 'dist' || m.kind === 'height') return fmtLen(v.len);
  if (m.kind === 'floor') return `${fmtArea(v.area)}<small>périm. ${fmtLen(v.per)}</small>`;
  return `${m.kind === 'opening' ? '− ' : ''}${fmtArea(v.area)}<small>${fmtLen(v.w)} × ${fmtLen(v.h)}</small>`;
}

/* ================= écran d'accueil ================= */
function renderHome() {
  $('#relName').value = rel.name || '';
  $('#rooms').innerHTML = rel.rooms.length
    ? rel.rooms.map((r) => `<li data-id="${r.id}"><div class="t"><input class="nm" value="${esc(r.name)}" aria-label="Nom de la pièce"><span class="small muted">${roomSummary(r).txt}</span></div><button class="btn sm primary" data-a="plan" type="button">Plan</button><button class="del" data-a="del" type="button" aria-label="Supprimer la pièce">×</button></li>`).join('')
    : '<li class="empty">Aucune pièce. Touchez « Démarrer la mesure », puis visez les angles de la pièce au sol.</li>';
  $('#allPdfBtn').hidden = !rel.rooms.length;
  $('#list').innerHTML = rel.measures.length
    ? rel.measures.map((m) => `<li class="m k-${m.kind}" data-id="${m.id}"><span class="sw"></span><input class="nm" value="${esc(m.name)}" aria-label="Nom"><span class="val">${valHtml(m)}</span><button class="del" type="button" aria-label="Supprimer">×</button></li>`).join('')
    : '<li class="empty">Distances et hauteurs mesurées à part.</li>';
  renderSaved();
}
const planCtx = () => ({ rel: () => rel, persist, snapshot, undo, canUndo: () => undoStack.length > 0, onClose: () => { $('#home').hidden = false; renderHome(); } });
$('#rooms').addEventListener('input', (e) => { if (!e.target.classList.contains('nm')) return; rel.rooms.find((r) => r.id == e.target.closest('li').dataset.id).name = e.target.value; persist(); });
$('#rooms').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return; const id = +b.closest('li').dataset.id;
  if (b.dataset.a === 'plan') { $('#home').hidden = true; openPlan(planCtx(), id); }
  if (b.dataset.a === 'del') armConfirm(b, () => { snapshot(); rel.rooms = rel.rooms.filter((r) => r.id !== id); persist(); renderHome(); });
});
$('#relName').addEventListener('input', (e) => { rel.name = e.target.value; persist(); });
$('#list').addEventListener('input', (e) => { if (!e.target.classList.contains('nm')) return; rel.measures.find((x) => x.id == e.target.closest('li').dataset.id).name = e.target.value; persist(); });
$('#list').addEventListener('click', (e) => { const b = e.target.closest('.del'); if (!b) return; snapshot(); rel.measures = rel.measures.filter((m) => m.id !== +b.closest('li').dataset.id); persist(); renderHome(); });
$('#allPdfBtn').onclick = () => {
  let paper = 'A4'; try { paper = localStorage.getItem('metre-ar-paper') || 'A4'; } catch (e) { /* rien */ }
  const pages = [], sums = [];
  for (const r of rel.rooms) { const { g, pages: pg } = buildPages(r, rel.name, { paper, scale: null }); pages.push(...pg.slice(0, -1)); sums.push({ name: r.name, g }); }
  pages.push(P.summaryPage(rel.name, sums, paper, new Date().toLocaleDateString('fr-FR')));
  saveFile(`plans-${slug(rel.name)}.pdf`, P.toPDF(pages), 'application/pdf');
};
const dirty = () => (rel.rooms.length || rel.measures.length) && !rel.savedId;
function replaceRel(next) { rel = Object.assign(blank(), next); delete rel.photos; delete rel.sess; rel.rooms = (rel.rooms || []).map(P.normalizeRoom); rel.measures = rel.measures || []; nextId = Math.max(0, ...rel.measures.map((m) => m.id), ...rel.rooms.map((r) => r.id)) + 1; undoStack.length = 0; persist(); renderHome(); }
$('#newBtn').onclick = (e) => armConfirm(e.currentTarget, () => replaceRel(blank()), dirty());
$('#saveBtn').onclick = () => {
  if (!rel.rooms.length && !rel.measures.length) { toast('Rien à enregistrer'); return; }
  const list = LS.get('metre-ar-saved', []);
  if (!rel.name) rel.name = 'Chantier du ' + new Date().toLocaleDateString('fr-FR');
  if (!rel.savedId) { rel.savedId = 'r' + Date.now(); list.unshift({ id: rel.savedId, name: rel.name, date: Date.now(), rooms: rel.rooms, measures: rel.measures }); LS.set('metre-ar-saved', list); }
  persist(); renderHome(); toast('Chantier enregistré sur cet appareil');
};
function renderSaved() {
  const list = LS.get('metre-ar-saved', []);
  $('#saved').innerHTML = list.length
    ? list.map((r) => `<li data-id="${r.id}"><div class="t"><b>${esc(r.name)}</b><span class="small muted">${new Date(r.date).toLocaleDateString('fr-FR')} · ${(r.rooms || []).length} pièce(s) · ${(r.measures || []).length} mesure(s)</span></div><button class="btn sm" data-a="open" type="button">${r.id === rel.savedId ? 'Ouvert' : 'Ouvrir'}</button><button class="del" data-a="del" type="button" aria-label="Supprimer">×</button></li>`).join('')
    : '<li class="empty">Aucun chantier enregistré.</li>';
}
$('#saved').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.closest('li').dataset.id, list = LS.get('metre-ar-saved', []), r = list.find((x) => x.id === id);
  if (b.dataset.a === 'open' && r && id !== rel.savedId) armConfirm(b, () => { replaceRel({ rooms: [], ...r, savedId: r.id }); window.scrollTo({ top: 0, behavior: 'smooth' }); }, dirty());
  if (b.dataset.a === 'del') armConfirm(b, () => { LS.set('metre-ar-saved', list.filter((x) => x.id !== id)); if (rel.savedId === id) { rel.savedId = null; persist(); } renderSaved(); });
});

/* ---------- texte, fichiers ---------- */
function summary() {
  let t = `${rel.name || 'Chantier'} · ${new Date().toLocaleDateString('fr-FR')}\n`;
  for (const r of rel.rooms) {
    const g = P.roomGeometry(r);
    t += `\n${r.name} — sol ${fmtArea(g.sol)}, ${P.hspText(g)}${g.plafond != null ? `, plafond ${fmtArea(g.plafond)}` : ''}\n`;
    g.walls.forEach((w, i) => { const s = g.wallStats[i]; t += `  M${i + 1} : ${cm(w.L)} cm${w.statut === 'verifiee' ? ' (vérifiée)' : w.statut === 'ajustee' ? ' (ajustée)' : ''}${s.has ? ` — net ${fmtArea(s.net)}` : ''}\n`; });
  }
  if (rel.measures.length) { t += '\nMesures :\n'; rel.measures.forEach((m) => { t += `  ${m.name} : ${m.kind === 'dist' || m.kind === 'height' ? fmtLen(m.v.len) : fmtArea(m.v.area)}\n`; }); }
  return t + '\nMesuré avec Métré AR';
}
$('#shareBtn').onclick = async () => {
  const text = summary();
  if (navigator.share) { try { await navigator.share({ title: rel.name || 'Chantier', text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text); toast('Texte copié'); } catch (e) { const a = $('#copyfb'); a.hidden = false; a.value = text; a.select(); }
};
$('#exportBtn').onclick = () => {
  if (!rel.rooms.length && !rel.measures.length) { toast('Rien à exporter'); return; }
  saveFile(`chantier-${slug(rel.name)}.json`, JSON.stringify({ app: 'metre-ar', version: 4, rel: { ...rel, savedId: null } }), 'application/json');
};
$('#importBtn').onclick = (e) => armConfirm(e.currentTarget, () => $('#importFile').click(), dirty());
$('#importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const d = JSON.parse(await f.text()); if (d.app !== 'metre-ar') throw new Error(); replaceRel({ rooms: [], ...d.rel, savedId: null }); toast(`Chantier importé : ${rel.rooms.length} pièce(s)`); }
  catch (err) { toast('Fichier illisible : choisissez un fichier exporté par Métré AR'); }
});
$('#diagBtn').onclick = () => {
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const d = {
    app: 'metre-ar', type: 'diagnostic', version: 4, date: new Date().toISOString(), navigateur: navigator.userAgent, unites: 'mètres ; plan : x, z du repère WebXR',
    pieces: rel.rooms.map((r) => {
      const g = P.roomGeometry(r);
      return {
        nom: r.name, seance: r.sid, coinsMesures: r.corners, hauteurSol: r.floorY, hauteurs: r.hauteurs,
        verifications: r.verifications, ajusterAngles: r.ajusterAngles, misDEquerre: !!r.square, brut: r.raw || null,
        plan: { methode: g.methode, ferme: g.ok, ecartFermeture: r3(g.ecartFermeture), murs: g.walls.map((w) => ({ mur: w.i + 1, longueurAR: r3(w.LAR), longueur: r3(w.L), statut: w.statut })), angles: g.angles.map(r3), sol: r3(g.sol), solAR: r3(g.solAR), perimetre: r3(g.perimetre), plafond: g.plafond && r3(g.plafond), surfaces: g.wallStats.map((x) => ({ brut: r3(x.brut), ouvertures: r3(x.ouv), net: r3(x.net) })) },
        ouvertures: r.openings,
      };
    }),
    mesures: rel.measures, seances: rel.seances || {},
  };
  saveFile(`diagnostic-${Date.now()}.json`, JSON.stringify(d, null, 2), 'application/json');
};

/* ================= compatibilité ================= */
async function checkCompat() {
  const b = $('#startBtn'), c = $('#compat');
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!window.isSecureContext) { b.textContent = 'Adresse non sécurisée'; c.textContent = 'Ouvrez l\'adresse en https:// (lien GitHub Pages).'; return; }
  if (!navigator.xr) {
    b.textContent = 'Mesure indisponible sur cet appareil';
    c.innerHTML = ios ? 'Sur iPhone, Safari ne permet pas la réalité augmentée depuis une page web. Utilisez un téléphone Android avec Chrome.' : 'Sur ordinateur : importez un chantier pour voir, corriger et imprimer les plans. Pour mesurer, ouvrez ce lien dans <b>Chrome</b> sur un téléphone Android.';
    return;
  }
  let ok = false; try { ok = await navigator.xr.isSessionSupported('immersive-ar'); } catch (e) { /* non géré */ }
  if (!ok) { b.textContent = 'Mesure indisponible sur cet appareil'; c.innerHTML = 'Sur téléphone : installez ou mettez à jour « Google Play Services pour la RA » puis rechargez (<a href="https://play.google.com/store/apps/details?id=com.google.ar.core" target="_blank" rel="noopener">Play Store</a>). Sur ordinateur : importez un chantier pour les plans.'; return; }
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
  draw(rgb, a) { if (!this.n) return; gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0); gl.uniform4f(loc.c, rgb[0], rgb[1], rgb[2], a); gl.drawArrays(gl.TRIANGLES, 0, this.n); }
  dispose() { gl.deleteBuffer(this.buf); }
}
const solidOf = (dots, segs, r = 0.003) => [...segs.flatMap(([a, b]) => G.prism(a, b, r)), ...dots.flatMap((p) => G.octa(p))];
const closedSegs = (pts) => pts.map((p, i) => [p, pts[(i + 1) % pts.length]]);
const centroid = (pts) => G.scale(pts.reduce((s, p) => G.add(s, p), [0, 0, 0]), 1 / pts.length);

/* ================= séance AR ================= */
let session = null, refSpace = null, hitSource = null, wakeLock = null;
const visuals = new Map(); // clé -> { parts:[{mesh, rgb, a}], labels:[{el,pos}] }
const A = { mode: 'room', pts: [], taps: [], target: null, hitSeen: false, lastHud: 0, flash: null, sid: null, roomId: null, openWall: null, frame: 0, lastC: null, lastD: null, lastHit: null, hMode: 'unique', hk: 0, lost: false, lossStart: null, resumed: false, reset: false };
let prevSolid, prevFill, reticle;
const curRoom = () => rel.rooms.find((r) => r.id === A.roomId && r.sid === A.sid);
const corner3 = (r, i) => [r.corners[i][0], r.floorY, r.corners[i][1]];
const seance = () => { rel.seances = rel.seances || {}; return (rel.seances[A.sid] = rel.seances[A.sid] || { debut: new Date().toISOString(), pertesSuivi: [] }); };
const TIPS = {
  room: ['Visez un ANGLE de la pièce, au sol, puis +', 'Angle suivant (en faisant le tour), puis +', 'Angle suivant… revenez au 1er angle ou touchez « Terminer »'],
  ceiling: ['Visez le HAUT d\'un angle (jonction avec le plafond), puis +'],
  ceilingA: ['Angle A{n} : visez le HAUT de cet angle (jonction avec le plafond), puis +'],
  opening: ['Visez un coin d\'une porte ou fenêtre, puis +', 'Visez le coin opposé (en diagonale), puis +'],
  dist: ['Visez le point de départ, puis +', 'Visez le point d\'arrivée, puis +'],
  height: ['Visez le pied, au sol, puis +', 'Levez le téléphone : visez le haut, puis +'],
};
const LABEL = { room: 'Pièce', ceiling: 'Plafond', opening: 'Ouverture', dist: 'Distance', height: 'Hauteur' };

$('#startBtn').onclick = startAR;
async function startAR() {
  try { if (!gl) initGL(); } catch (e) { toast(e.message); return; }
  const root = $('#ar'); root.hidden = false;
  try { session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root } }); }
  catch (e) { root.hidden = true; toast('Impossible de lancer la caméra AR : ' + e.message); return; }
  try {
    session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });
    refSpace = await session.requestReferenceSpace('local');
    hitSource = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') });
  } catch (e) { toast('Erreur AR : ' + e.message); session.end(); return; }
  session.addEventListener('end', onEnd);
  refSpace.addEventListener('reset', onReset);
  $('#home').hidden = true;
  prevSolid = new Mesh(); prevFill = new Mesh(); reticle = new Mesh();
  Object.assign(A, { pts: [], taps: [], target: null, hitSeen: false, flash: null, sid: 's' + Date.now(), roomId: null, openWall: null, lost: false, resumed: false, reset: false });
  seance(); persist();
  $('#lost').hidden = true; $('#resetBox').hidden = true;
  setMode('room');
  navigator.wakeLock?.request('screen').then((w) => (wakeLock = w)).catch(() => { /* facultatif */ });
  session.requestAnimationFrame(onFrame);
}
// Le repère AR a été réinitialisé : les points posés ne correspondent plus à la pièce.
function onReset() {
  const s = seance(); s.pertesSuivi.push({ debut: new Date().toISOString(), fin: new Date().toISOString(), reinitialisation: true }); persist();
  const done = rel.rooms.some((r) => r.sid === A.sid) || rel.measures.some((m) => m.sid === A.sid);
  if (!A.pts.length && !done) return; // rien à perdre : on continue dans le nouveau repère
  A.reset = true; $('#resetBox').hidden = false; $('#lost').hidden = true;
  $('#resetMsg').textContent = `${done ? 'Les pièces déjà relevées sont conservées, mais ne peuvent plus être complétées en AR (plafond, ouvertures : saisissez-les sur le plan). ' : ''}${A.pts.length ? 'La pièce en cours est à recommencer.' : ''}`;
}
$('#restartBtn').onclick = () => {
  const s = seance(); s.fin = new Date().toISOString();
  Object.assign(A, { sid: 's' + Date.now(), pts: [], taps: [], roomId: null, openWall: null, reset: false, resumed: false });
  seance(); persist(); $('#resetBox').hidden = true; setMode('room'); rebuildVisuals();
  flash('Nouvelle séance : ces pièces seront placées à part sur le plan d\'ensemble', 4000);
};
$('#quit2Btn').onclick = () => session && session.end();
function onEnd() {
  try { const s = seance(); s.fin = new Date().toISOString(); persist(); } catch (e) { /* rien */ }
  try { hitSource?.cancel(); } catch (e) { /* déjà libéré */ }
  hitSource = null; session = null;
  clearVisuals(); [prevSolid, prevFill, reticle].forEach((m) => m && m.dispose());
  try { wakeLock?.release(); } catch (e) { /* rien */ }
  $('#ar').hidden = true; $('#home').hidden = false; renderHome();
}
$('#ar').addEventListener('beforexrselect', (e) => e.preventDefault());
$('#quitBtn').onclick = () => session && session.end();
$$('#ar .mode').forEach((b) => (b.onclick = () => setMode(b.dataset.m)));
$('#addBtn').onclick = addPoint;
$('#finBtn').onclick = () => {
  if (A.mode === 'room' && A.pts.length >= 3) finishRoom();
  else if (A.mode === 'ceiling') {
    const r = curRoom(); if (!r) return;
    if (A.hMode === 'unique') { A.hMode = 'angles'; A.hk = 0; A.pts = []; flash('Une hauteur par angle : visez le haut de chaque angle, dans l\'ordre'); }
    else nextCorner(r, true);
    updateModeButtons();
  }
};
function nextCorner(r, skip) {
  A.hk++; A.pts = []; A.taps = [];
  if (skip) flash(`Angle A${A.hk} passé`, 1200);
  if (A.hk >= r.corners.length) { flash('Hauteurs relevées · passez aux ouvertures'); setMode('opening'); }
}
$('#undoBtn').onclick = () => {
  if (A.pts.length) { A.pts.pop(); A.taps.pop(); return; }
  if (undo()) { rebuildVisuals(); if (!curRoom()) { A.roomId = null; } if (A.mode === 'ceiling' && A.hMode === 'angles' && A.hk > 0) A.hk--; updateModeButtons(); A.flash = { text: 'Dernière action annulée', until: performance.now() + 1500 }; }
};
function setMode(m) {
  A.mode = m; A.pts = []; A.taps = []; A.openWall = null;
  if (m === 'ceiling') { const r = curRoom(); A.hMode = r && r.hauteurs.mode === 'angles' ? 'angles' : 'unique'; A.hk = 0; }
  $$('#ar .mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
  $('#hudMode').textContent = LABEL[m]; updateModeButtons();
}
function updateModeButtons() {
  const r = curRoom();
  $('#ar .mode[data-m="ceiling"]').disabled = !r; $('#ar .mode[data-m="opening"]').disabled = !r;
  $('#hudRoom').textContent = r ? `${r.name} · ${P.hspText(P.roomGeometry(r))} · ${r.openings.length} ouv.` : '';
  const fb = $('#finBtn');
  if (A.mode === 'ceiling') { fb.textContent = A.hMode === 'unique' ? 'Une par angle' : 'Passer'; fb.disabled = !r; }
  else fb.textContent = 'Terminer';
}

/* ---------- visée ---------- */
function computeTarget(C, D, hit) {
  const Pp = A.pts, r = curRoom();
  switch (A.mode) {
    case 'room':
      if (hit && Pp.length >= 3 && G.dist(hit.p, Pp[0]) < 0.12) return { p: Pp[0], n: hit.n, snap: true };
      return hit;
    case 'dist': return hit;
    case 'height': {
      if (!Pp.length) return hit;
      const v = G.closestOnVertical(Pp[0], C, D); return v && { p: v, n: G.norm([C[0] - v[0], 0, C[2] - v[2]]) };
    }
    case 'ceiling': {
      if (!r) return null;
      let best = null;
      r.corners.forEach((_, i) => {
        if (A.hMode === 'angles' && i !== A.hk) return;
        const c = corner3(r, i), v = G.closestOnVertical(c, C, D); if (!v || v[1] < r.floorY + 1) return;
        const w = G.sub(v, C), off = G.len(G.sub(w, G.scale(D, G.dot(w, D))));
        if (!best || off < best.off) best = { p: v, n: G.norm([C[0] - v[0], 0, C[2] - v[2]]), off, corner: i };
      });
      return best;
    }
    case 'opening': {
      if (!r) return null;
      const Hh = P.roomGeometry(r).Hmax || 3.2; let best = null;
      r.corners.forEach((_, i) => {
        if (A.openWall != null && i !== A.openWall) return;
        const a = corner3(r, i), b = corner3(r, (i + 1) % r.corners.length), w = G.wallFrom(a, b), t = G.rayPlane(C, D, a, w.n);
        if (!t) return; const s = G.dot(G.sub(t, a), w.dir);
        if (s < -0.03 || s > w.width + 0.03 || t[1] < r.floorY - 0.05 || t[1] > r.floorY + Hh + 0.05) return;
        const dd = G.dist(C, t); if (!best || dd < best.d) best = { p: t, n: w.n, d: dd, wall: i, s };
      });
      return best;
    }
  }
  return null;
}

/* ---------- appuis ---------- */
function logTap(p, t) { A.taps.push({ n: A.taps.length + 1, heure: new Date().toISOString(), image: A.frame, point: round3(p), camera: A.lastC && round3(A.lastC), visee: A.lastD && round3(A.lastD), impact: A.lastHit ? round3(A.lastHit.p) : null, valeurAffichee: $('#hudVal').textContent, mur: t.wall ?? null }); }
function flash(text, ms = 2500) { A.flash = { text, until: performance.now() + ms }; }
function addPoint() {
  if (A.lost || A.reset) return;
  const t = A.target;
  if (!t) { navigator.vibrate?.(80); flash('Rien de visé ici', 1200); return; }
  if (A.mode === 'room' && t.snap) { finishRoom(); return; }
  if (A.mode === 'room' && A.pts.length && G.hdist(A.pts[A.pts.length - 1], t.p) < 0.05) { flash('Trop près de l\'angle précédent', 1500); return; }
  const p = [...t.p], Pp = A.pts; Pp.push(p); logTap(p, t); navigator.vibrate?.(15);
  const r = curRoom();
  switch (A.mode) {
    case 'dist':
      if (Pp.length === 2) { snapshot(); const L = G.dist(Pp[0], Pp[1]); addMeasure('dist', { len: L }, Pp, A.sid, { diag: { appuis: A.taps } }); flash(`Distance : ${fmtLen(L)}`); A.pts = []; A.taps = []; rebuildVisuals(); }
      break;
    case 'height':
      if (Pp.length === 2) { const h = Math.abs(Pp[1][1] - Pp[0][1]); if (h < 0.01) { Pp.pop(); A.taps.pop(); return; } snapshot(); addMeasure('height', { len: h }, Pp, A.sid, { diag: { appuis: A.taps } }); flash(`Hauteur : ${fmtLen(h)}`); A.pts = []; A.taps = []; rebuildVisuals(); }
      break;
    case 'ceiling': {
      const h = p[1] - r.floorY;
      if (!(h > 1 && h < 8)) { Pp.pop(); A.taps.pop(); flash('Hauteur incohérente : visez le haut de l\'angle, au plafond', 2500); return; }
      snapshot();
      const H = r.hauteurs, rawH = { point: round3(p), coin: t.corner + 1, heure: new Date().toISOString(), apresReprise: A.resumed };
      r.raw = { ...(r.raw || {}), plafond: [...(Array.isArray(r.raw?.plafond) ? r.raw.plafond : []), rawH] };
      if (A.hMode === 'unique') {
        H.mode = 'unique'; H.unique.ar = Math.round(h * 1000) / 1000;
        persist(); A.pts = []; A.taps = []; rebuildVisuals(); flash(`Hauteur sous plafond : ${cm(h)} cm · passez aux ouvertures`); setMode('opening');
      } else {
        H.mode = 'angles'; (H.angles[t.corner] = H.angles[t.corner] || {}).ar = Math.round(h * 1000) / 1000;
        persist(); rebuildVisuals(); flash(`A${t.corner + 1} : ${cm(h)} cm`, 1500); nextCorner(r, false);
      }
      updateModeButtons();
      break;
    }
    case 'opening':
      if (Pp.length === 1) { A.openWall = t.wall; break; }
      {
        const a = corner3(r, A.openWall), b = corner3(r, (A.openWall + 1) % r.corners.length), w = G.wallFrom(a, b);
        const s1 = G.dot(G.sub(Pp[0], a), w.dir), s2 = G.dot(G.sub(Pp[1], a), w.dir);
        const y0 = Math.min(Pp[0][1], Pp[1][1]) - r.floorY, y1 = Math.max(Pp[0][1], Pp[1][1]) - r.floorY;
        const o = { id: nextId++, wall: A.openWall, s: Math.min(s1, s2), w: Math.abs(s2 - s1), sill: Math.max(0, y0), h: y1 - Math.max(0, y0), type: y0 < 0.1 ? 'porte' : 'fenetre', appuis: A.taps };
        if (o.w < 0.1 || o.h < 0.1) { Pp.pop(); A.taps.pop(); flash('Ouverture trop petite', 1500); return; }
        snapshot(); r.openings.push(o); persist(); rebuildVisuals();
        flash(`${o.type === 'porte' ? 'Porte' : 'Fenêtre'} ${cm(o.w)} × ${cm(o.h)} sur M${o.wall + 1}`);
        A.pts = []; A.taps = []; A.openWall = null; updateModeButtons();
      }
      break;
  }
}
function finishRoom() {
  const Pp = A.pts; if (Pp.length < 3) return;
  const err = P.checkContour(Pp.map((p) => [p[0], p[2]]));
  if (err) { navigator.vibrate?.([60, 60, 60]); flash(`${err.raison} Touchez « Annuler » pour reprendre.`, 6000); return; }
  snapshot();
  const ys = Pp.map((p) => p[1]).sort((a, b) => a - b), m = ys.length, floorY = m % 2 ? ys[(m - 1) / 2] : (ys[m / 2 - 1] + ys[m / 2]) / 2;
  const n = rel.rooms.length + 1;
  const r = P.normalizeRoom({ id: nextId++, name: `Pièce ${n}`, sid: A.sid, floorY: Math.round(floorY * 1000) / 1000, corners: Pp.map((p) => [Math.round(p[0] * 1000) / 1000, Math.round(p[2] * 1000) / 1000]), verifications: [], ajusterAngles: false, square: false, hauteurs: { mode: 'unique', unique: {}, angles: {} }, openings: [], raw: { coins3D: Pp.map(round3), ecartsSol: Pp.map((p) => Math.round(Math.abs(p[1] - floorY) * 1000) / 1000), appuis: A.taps, apresReprise: A.resumed } });
  rel.rooms.push(r); persist(); A.roomId = r.id; A.pts = []; A.taps = [];
  const g = P.roomGeometry(r);
  flash(`${r.name} : ${r.corners.length} murs, sol ${fmtArea(g.sol)} · visez maintenant le plafond`, 3500);
  rebuildVisuals(); setMode('ceiling');
}

/* ---------- dessins 3D ---------- */
function clearVisuals() { visuals.forEach((v) => { v.parts.forEach((p) => p.mesh.dispose()); v.labels.forEach((l) => l.el.remove()); }); visuals.clear(); }
function addVisual(key, parts, labels) {
  const els = labels.map(([pos, text, css]) => { const el = document.createElement('div'); el.className = 'lbl'; el.style.setProperty('--c', css); el.textContent = text; $('#labels').appendChild(el); return { el, pos }; });
  visuals.set(key, { parts: parts.map(([arr, rgb, a]) => ({ mesh: new Mesh().set(arr), rgb, a })), labels: els });
}
function rebuildVisuals() {
  if (!session) return; clearVisuals();
  for (const r of rel.rooms.filter((x) => x.sid === A.sid)) {
    const n = r.corners.length, F = r.corners.map((_, i) => corner3(r, i)), hs = P.cornerHeights(r).map((h) => h.v), parts = [], labels = [];
    parts.push([solidOf(F, closedSegs(F)), GREEN, 1]);
    const T = F.map((p, i) => (hs[i] != null ? [p[0], p[1] + hs[i], p[2]] : null)), vert = F.map((p, i) => T[i] && [p, T[i]]).filter(Boolean);
    const top = T.every(Boolean) ? closedSegs(T) : [];
    if (vert.length) parts.push([solidOf([], [...top, ...vert], 0.0025), GREEN, 0.9]);
    if (r.hauteurs.mode === 'angles') T.forEach((q, i) => q && labels.push([q, `A${i + 1} · ${cm(hs[i])}`, '#3ddc84']));
    F.forEach((p, i) => { const q = F[(i + 1) % n]; labels.push([[(p[0] + q[0]) / 2, r.floorY + 0.03, (p[2] + q[2]) / 2], `M${i + 1} · ${cm(G.dist(p, q))}`, '#3ddc84']); });
    for (const o of r.openings) {
      if (o.wall >= n) continue;
      const a = F[o.wall], b = F[(o.wall + 1) % n], w = G.wallFrom(a, b);
      const c = [G.add(a, G.scale(w.dir, o.s)), G.add(a, G.scale(w.dir, o.s + o.w))].flatMap((p) => [[p[0], r.floorY + o.sill, p[2]], [p[0], r.floorY + o.sill + o.h, p[2]]]);
      const rect = [c[0], c[2], c[3], c[1]].map((p) => G.add(p, G.scale(w.n, 0.004)));
      parts.push([solidOf(rect, closedSegs(rect)), RED, 1], [G.fillMesh(rect), RED, 0.25]);
      labels.push([centroid(rect), `${cm(o.w)}×${cm(o.h)}`, '#ff5a4a']);
    }
    addVisual('r' + r.id, parts, labels);
  }
  for (const m of rel.measures.filter((x) => x.sid === A.sid && x.pts)) addVisual('m' + m.id, [[solidOf(m.pts, [[m.pts[0], m.pts[1]]]), m.kind === 'height' ? YELLOW : [1, 1, 1], 1]], [[centroid(m.pts), fmtLen(m.v.len), KIND[m.kind].css]]);
  updateModeButtons();
}

/* ---------- aperçu en direct ---------- */
function livePreview() {
  const Pp = A.pts, t = A.target, dots = [...Pp], segs = [], r = curRoom();
  let fill = null, val = '';
  for (let i = 1; i < Pp.length; i++) segs.push([Pp[i - 1], Pp[i]]);
  if (t) {
    const T = t.p;
    switch (A.mode) {
      case 'room':
        if (Pp.length) { segs.push([Pp[Pp.length - 1], T]); val = fmtLen(G.hdist(Pp[Pp.length - 1], T)); }
        if (Pp.length >= 2) { const poly = t.snap ? Pp : [...Pp, T]; fill = poly; if (!t.snap) segs.push([T, Pp[0]]); val += ` · ${fmtArea(G.polyArea3(poly))}`; }
        break;
      case 'dist': if (Pp.length) { segs.push([Pp[0], T]); val = fmtLen(G.dist(Pp[0], T)); } break;
      case 'height': if (Pp.length) { segs.push([Pp[0], T]); val = fmtLen(Math.abs(T[1] - Pp[0][1])); } break;
      case 'ceiling': if (r) { const c = corner3(r, t.corner); segs.push([c, T]); val = `${A.hMode === 'angles' ? `A${t.corner + 1} · ` : 'HSP '}${cm(T[1] - r.floorY)} cm`; } break;
      case 'opening':
        if (Pp.length === 1 && r) {
          const a = corner3(r, A.openWall), b = corner3(r, (A.openWall + 1) % r.corners.length), w = G.wallFrom(a, b);
          const o = G.openingOn(w, Pp[0], T); fill = o.corners; segs.push(...closedSegs(o.corners)); val = `${cm(o.width)} × ${cm(o.height)}`;
        } else if (r) val = `M${t.wall + 1} · ${cm(t.s)} du coin`;
        break;
    }
  }
  prevSolid.set(solidOf(dots, segs, 0.0035));
  prevFill.set(fill && fill.length >= 3 ? G.fillMesh(fill) : []);
  reticle.set(t ? [...G.ringMesh(t.p, t.n), ...G.octa(t.p, 0.005)] : []);
  return val;
}

/* ---------- boucle d'image ---------- */
function rotate(v, q) { const u = [q.x, q.y, q.z], t = G.scale(G.cross(u, v), 2); return G.add(G.add(v, G.scale(t, q.w)), G.cross(u, t)); }
function project(p, Pm, V) {
  const v = [0, 1, 2, 3].map((r) => V[r] * p[0] + V[4 + r] * p[1] + V[8 + r] * p[2] + V[12 + r]);
  const c = [0, 1, 2, 3].map((r) => Pm[r] * v[0] + Pm[4 + r] * v[1] + Pm[8 + r] * v[2] + Pm[12 + r] * v[3]);
  if (c[3] <= 0.01) return null;
  return [((c[0] / c[3]) * 0.5 + 0.5) * innerWidth, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * innerHeight];
}
function onFrame(time, frame) {
  const s = frame.session; if (!session) return; s.requestAnimationFrame(onFrame);
  const layer = s.renderState.baseLayer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const pose = frame.getViewerPose(refSpace);
  const lost = !pose || pose.emulatedPosition;
  if (lost && !A.lost) { A.lost = true; A.lossStart = new Date().toISOString(); }
  if (!lost && A.lost) {
    A.lost = false; seance().pertesSuivi.push({ debut: A.lossStart, fin: new Date().toISOString(), reinitialisation: false }); persist();
    if (A.pts.length || curRoom()) { A.resumed = true; flash('Suivi retrouvé : vérifiez que les points posés sont restés en place', 4000); }
  }
  $('#lost').hidden = !A.lost || A.reset;
  if (A.lost || A.reset) $('#addBtn').disabled = true;
  if (!pose) { hud('—', 'Suivi perdu : revenez lentement vers une zone déjà filmée'); return; }
  const tp = pose.transform.position, C = [tp.x, tp.y, tp.z], D = G.norm(rotate([0, 0, -1], pose.transform.orientation));
  let hit = null;
  if (hitSource && !A.lost) { const r = frame.getHitTestResults(hitSource); if (r.length) { const hp = r[0].getPose(refSpace); if (hp) { const m = hp.transform.matrix; hit = { p: [m[12], m[13], m[14]], n: G.norm([m[4], m[5], m[6]]) }; A.hitSeen = true; } } }
  A.frame++; A.lastC = C; A.lastD = D; A.lastHit = hit;
  A.target = computeTarget(C, D, hit);
  const live = livePreview();
  gl.useProgram(prog); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST);
  for (const view of pose.views) {
    const vp = layer.getViewport(view); gl.viewport(vp.x, vp.y, vp.width, vp.height);
    gl.uniformMatrix4fv(loc.P, false, view.projectionMatrix); gl.uniformMatrix4fv(loc.V, false, view.transform.inverse.matrix);
    gl.depthMask(true); visuals.forEach((v) => v.parts.forEach((p) => p.a === 1 && p.mesh.draw(p.rgb, 1))); prevSolid.draw(YELLOW, 1);
    gl.depthMask(false); visuals.forEach((v) => v.parts.forEach((p) => p.a < 1 && p.mesh.draw(p.rgb, p.a))); prevFill.draw(YELLOW, 0.22);
    gl.disable(gl.DEPTH_TEST); reticle.draw(A.target && A.target.snap ? GREEN : YELLOW, 0.95); gl.enable(gl.DEPTH_TEST);
  }
  gl.depthMask(true);
  const v0 = pose.views[0];
  visuals.forEach((v) => v.labels.forEach((l) => { const q = project(l.pos, v0.projectionMatrix, v0.transform.inverse.matrix); l.el.hidden = !q; if (q) l.el.style.transform = `translate(${q[0]}px,${q[1]}px) translate(-50%,-50%)`; }));
  if (time - A.lastHud > 90) {
    A.lastHud = time;
    let tip;
    if (A.lost) tip = 'Suivi perdu : revenez lentement vers une zone déjà filmée';
    else if (!A.hitSeen) tip = 'Balayez lentement le sol avec le téléphone…';
    else if (!A.target) tip = A.mode === 'opening' ? 'Visez un mur de la pièce' : A.mode === 'ceiling' ? 'Visez le haut d\'un angle de la pièce' : 'Aucune surface ici : bougez doucement le téléphone';
    else if (A.mode === 'ceiling' && A.hMode === 'angles') tip = TIPS.ceilingA[0].replace('{n}', A.hk + 1) + ` (${A.hk + 1}/${curRoom()?.corners.length || '?'})`;
    else { const arr = TIPS[A.mode]; tip = arr[Math.min(A.pts.length, arr.length - 1)]; if (G.dist(C, A.target.p) > 5) tip += ' · rapprochez-vous'; }
    const fl = A.flash && A.flash.until > performance.now() ? A.flash.text : null;
    hud(live || (fl ? '✓' : '—'), fl || tip);
    if (A.mode !== 'ceiling') { $('#finBtn').disabled = !(A.mode === 'room' && A.pts.length >= 3); $('#finBtn').classList.toggle('go', !$('#finBtn').disabled); }
    else $('#finBtn').classList.remove('go');
    if (!A.lost && !A.reset) $('#addBtn').disabled = !A.target;
  }
}
function hud(val, tip) { $('#hudVal').textContent = val; $('#hudTip').textContent = tip; }

/* ================= démarrage ================= */
renderHome();
checkCompat();

// Métré AR v1 — plan de pièce : relevé des angles au sol, vue 2D, corrections au mètre, PDF.
import * as G from './geo.js';
import * as P from './plan.js';
import { $, $$, esc, toast, armConfirm, round3, saveFile, slug } from './util.js';

const KEY = 'metre-ar-v1-releves';
const store = {
  all() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } },
  save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { toast('Enregistrement impossible sur cet appareil (stockage plein ou bloqué)'); return false; } },
  get(id) { return this.all().find((r) => r.id === id); },
  put(rel) { rel.modifieLe = Date.now(); const l = this.all(), i = l.findIndex((r) => r.id === rel.id); if (i >= 0) l[i] = rel; else l.unshift(rel); return this.save(l); },
  del(id) { this.save(this.all().filter((r) => r.id !== id)); },
};
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const cmS = (m) => String(Math.round(m * 1000) / 10).replace('.', ',');
const cmIn = (v) => { const n = parseFloat(String(v).replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n / 100 : NaN; };
let cur = null; // relevé ouvert

/* ================= écrans ================= */
function show(id) { $$('.screen').forEach((s) => (s.hidden = s.id !== id)); window.scrollTo(0, 0); }
function renderList() {
  const l = store.all();
  $('#list').innerHTML = l.length ? l.map((r) => {
    let info = 'contour à relever';
    if (r.ferme) { const g = P.geometry(r); info = `${r.angles.length} murs · ${P.m2(g.surface)} · ${(r.verifications || []).length} cote(s) vérifiée(s)`; }
    return `<li data-id="${r.id}"><div class="t"><b>${esc(r.nom)} — ${esc(r.piece)}</b><span class="small muted">${new Date(r.modifieLe).toLocaleDateString('fr-FR')} · ${info}</span></div><button class="btn sm" data-a="open" type="button">Ouvrir</button></li>`;
  }).join('') : '<li class="empty">Aucun relevé pour l\'instant.</li>';
}
$('#newForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const r = { id: uid('r'), version: 1, nom: $('#newNom').value.trim(), piece: $('#newPiece').value.trim(), creeLe: Date.now(), modifieLe: Date.now(), seance: null, sol: null, angles: [], ferme: false, verifications: [], ajusterAngles: false };
  if (!r.nom || !r.piece) return;
  if (store.put(r)) { $('#newForm').reset(); openRel(r.id); }
});
$('#list').addEventListener('click', (e) => { const b = e.target.closest('[data-a="open"]'); if (b) openRel(b.closest('li').dataset.id); });
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (d.app !== 'metre-ar' || !d.releve || !Array.isArray(d.releve.angles)) throw new Error();
    const r = { ...d.releve }; if (store.get(r.id)) r.id = uid('r');
    store.put(r); renderList(); toast(`Relevé importé : ${r.nom} — ${r.piece}`);
  } catch (err) { toast('Fichier illisible : choisissez un fichier exporté par Métré AR (plan de pièce)'); }
});

function openRel(id) { cur = store.get(id); if (!cur) return; show('rel'); renderRel(); }
$('#backBtn').onclick = () => { cur = null; show('home'); renderList(); };
$('#relNom').addEventListener('input', (e) => { cur.nom = e.target.value; store.put(cur); $('#relTitle').textContent = `${cur.nom} — ${cur.piece}`; });
$('#relPiece').addEventListener('input', (e) => { cur.piece = e.target.value; store.put(cur); $('#relTitle').textContent = `${cur.nom} — ${cur.piece}`; renderPlan(); });

function planSVG(g, opts = {}, el) {
  // écran : dessin ramené à ~100 unités, textes agrandis ; aucune échelle n'est annoncée à l'écran
  const ext = Math.max(...g.pts.map((p) => p[0])) - Math.min(...g.pts.map((p) => p[0])), eyy = Math.max(...g.pts.map((p) => p[1])) - Math.min(...g.pts.map((p) => p[1]));
  const ops = P.drawRoom(cur, g, 100 / Math.max(ext, eyy, 0.5), { ...opts, ts: 1.9 }), b = P.bbox(ops), m = 3;
  el.innerHTML = P.toSVG(ops, [b.x0 - m, b.y0 - m, b.w + 2 * m, b.h + 2 * m]);
}
function renderRel() {
  $('#relNom').value = cur.nom; $('#relPiece').value = cur.piece; $('#relTitle').textContent = `${cur.nom} — ${cur.piece}`;
  $('#noContour').hidden = !!cur.ferme; $('#contour').hidden = !cur.ferme; $('#actions').hidden = !cur.ferme;
  try { $('#paper').value = localStorage.getItem('metre-ar-papier') || 'A4'; } catch (e) { /* rien */ }
  if (cur.ferme) renderPlan();
}
const ST = { AR: 'AR', verifiee: 'vérifiée', ajustee: 'ajustée' };
function renderPlan() {
  if (!cur || !cur.ferme) return;
  const g = P.geometry(cur);
  planSVG(g, { ecarts: cur.angles.map((a) => a.ecartSol) }, $('#view'));
  $('#methode').textContent = `Géométrie : ${g.methode}`;
  $('#stats').innerHTML = `<div><span>Surface au sol</span><b>${P.m2(g.surface)}</b></div><div><span>Mesure AR brute</span><b>${P.m2(g.surfaceAR)}</b></div><div><span>Périmètre</span><b>${cmS(g.perimetre)} cm</b></div><div><span>Murs</span><b>${g.walls.length}</b></div>`;
  const al = [];
  if (!g.ok) al.push(`Les cotes vérifiées ne permettent pas de fermer le contour sans modifier les angles (écart ${cmS(g.ecartFermeture)} cm). Le plan affiché reste la mesure AR. Vérifiez les cotes saisies, ou touchez une cote vérifiée et choisissez « Ajuster aussi les angles ».`);
  cur.angles.forEach((a, i) => { if (a.ecartSol > 0.03) al.push(`L'angle A${i + 1} a été visé à ${cmS(a.ecartSol)} cm du sol commun (plinthe, meuble ?). Contrôlez les murs M${i ? i : cur.angles.length} et M${i + 1} au mètre.`); });
  if ((cur.seance?.pertesSuivi || []).length) al.push(`Le suivi AR a été interrompu ${cur.seance.pertesSuivi.length} fois pendant le relevé. Les angles posés après une reprise sont notés « après reprise » : vérifiez une ou deux cotes au mètre.`);
  if (cur.ajusterAngles) al.push('Vous avez accepté l\'ajustement des angles : ils peuvent différer légèrement de la mesure AR.');
  $('#alerts').innerHTML = al.map((t) => `<p>${esc(t)}</p>`).join('');
  $('#walls').innerHTML = `<thead><tr><th>Mur</th><th>AR</th><th>Au mètre</th><th>Plan</th><th>Statut</th><th></th></tr></thead><tbody>${g.walls.map((w, i) => `<tr class="s-${w.statut}"><td>M${i + 1}<small> A${i + 1}–A${(i + 1) % g.walls.length + 1}${cur.angles[(i + 1) % g.walls.length].qualite?.apresReprise ? ' · après reprise' : ''}</small></td><td>${cmS(w.LAR)}</td><td>${w.Lver != null ? cmS(w.Lver) : '—'}</td><td><b>${cmS(w.L)}</b></td><td>${ST[w.statut]}</td><td><button class="btn sm" data-w="${i}" type="button">${w.Lver != null ? 'Modifier' : 'Vérifier'}</button></td></tr>`).join('')}</tbody>`;
}
$('#walls').addEventListener('click', (e) => { const b = e.target.closest('[data-w]'); if (b) openCorr(+b.dataset.w); });
$('#view').addEventListener('click', (e) => { const t = e.target.closest('[data-edit]'); if (t) openCorr(JSON.parse(t.dataset.edit).i); });
$('#paper').onchange = (e) => { try { localStorage.setItem('metre-ar-papier', e.target.value); } catch (err) { /* rien */ } };
$('#pdfBtn').onclick = () => {
  const g = P.geometry(cur), pages = P.pdfPages(cur, g, $('#paper').value);
  saveFile(`plan-${slug(cur.nom)}-${slug(cur.piece)}.pdf`, P.toPDF(pages), 'application/pdf');
  if (!pages[0].scale) toast('Pièce trop grande pour une échelle normalisée : le PDF indique « plan non à l\'échelle »', 4000);
};
$('#fileBtn').onclick = () => {
  const g = P.geometry(cur);
  const data = { app: 'metre-ar', type: 'plan-de-piece', version: 1, exporteLe: new Date().toISOString(), releve: cur, calcule: { methode: g.methode, surface: g.surface, surfaceAR: g.surfaceAR, perimetre: g.perimetre, murs: g.walls.map((w) => ({ mur: w.i + 1, longueurAR: w.LAR, longueurVerifiee: w.Lver, longueurPlan: w.L, statut: w.statut })), angles: g.angles, plan: g.pts } };
  saveFile(`releve-${slug(cur.nom)}-${slug(cur.piece)}.json`, JSON.stringify(data, null, 2), 'application/json');
};
$('#delBtn').onclick = (e) => armConfirm(e.currentTarget, () => { store.del(cur.id); cur = null; show('home'); renderList(); toast('Relevé supprimé'); });
$('#redoBtn').onclick = (e) => armConfirm(e.currentTarget, () => startAR(), (cur.verifications || []).length > 0 || cur.ferme);

/* ================= correction d'une longueur ================= */
const C = { wall: null, pending: null, angles: false };
function openCorr(i) {
  const g = P.geometry(cur), w = g.walls[i]; C.wall = i; C.pending = null; C.angles = false;
  $('#corrTitle').textContent = `Mur M${i + 1} (A${i + 1} → A${(i + 1) % g.walls.length + 1})`;
  $('#corrInfo').innerHTML = `Mesure AR : <b>${cmS(w.LAR)} cm</b> · sur le plan : <b>${cmS(w.L)} cm</b>${w.Lver != null ? ` · vérifiée : <b>${cmS(w.Lver)} cm</b>` : ''}.<br>La correction modifie la forme du plan : les angles mesurés sont conservés, les murs non vérifiés s'ajustent le moins possible pour que le contour reste fermé.`;
  $('#corrVal').value = w.Lver != null ? cmS(w.Lver) : ''; $('#corrRevert').hidden = w.Lver == null;
  $('#preview').hidden = true; $('#sheet').hidden = false; setTimeout(() => $('#corrVal').focus(), 60);
}
function closeCorr() { $('#sheet').hidden = true; C.pending = null; }
$('#corrClose').onclick = closeCorr; $('#cancelBtn').onclick = closeCorr;
function verifsWith(i, L, tool) {
  const n = cur.angles.length, a = cur.angles[i].id, b = cur.angles[(i + 1) % n].id, g = P.geometry(cur);
  const rest = (cur.verifications || []).filter((v) => !(v.mur.de === a && v.mur.a === b));
  return L == null ? rest : [...rest, { mur: { de: a, a: b }, longueurAR: g.walls[i].LAR, longueurVerifiee: L, outil: tool, date: new Date().toISOString() }];
}
function previewCorr(verifs, forceAngles) {
  const before = P.geometry(cur), after = P.geometry(cur, verifs, forceAngles);
  C.pending = { verifs, forceAngles: !!forceAngles };
  $('#preview').hidden = false;
  if (!after.ok) {
    $('#pview').innerHTML = '';
    $('#pchanges').innerHTML = `<p class="warn">Impossible de fermer le contour avec ces cotes sans modifier les angles : il manque <b>${cmS(after.ecartFermeture)} cm</b>. Rien n'a été changé.</p><p class="small">Vérifiez la valeur saisie et les autres cotes vérifiées. Si elles sont justes, la pièce n'a pas exactement les angles mesurés : vous pouvez accepter d'ajuster aussi les angles.</p>`;
    $('#applyBtn').hidden = true; $('#anglesBtn').hidden = false; return;
  }
  planSVG(after, { ghost: before.pts }, $('#pview'));
  const ch = after.walls.filter((w, i) => Math.abs(w.L - before.walls[i].L) > 0.0005).map((w) => `<li>M${w.i + 1} : ${cmS(before.walls[w.i].L)} → <b>${cmS(w.L)} cm</b> (${w.L > before.walls[w.i].L ? '+' : '−'}${cmS(Math.abs(w.L - before.walls[w.i].L))})${w.statut === 'verifiee' ? ' · vérifiée' : ' · ajustée'}</li>`);
  const angCh = after.angles.map((a, i) => Math.abs(a - before.angles[i])).reduce((m, v) => Math.max(m, v), 0);
  $('#pchanges').innerHTML = `<ul>${ch.join('') || '<li>Aucun mur ne change de longueur.</li>'}</ul><p>Surface au sol : ${P.m2(before.surface)} → <b>${P.m2(after.surface)}</b></p><p class="small">${forceAngles ? `Angles modifiés de ${angCh.toFixed(1).replace('.', ',')}° au plus.` : 'Angles inchangés.'} Contour précédent en pointillés. La mesure AR d'origine reste conservée.</p>`;
  $('#applyBtn').hidden = false; $('#anglesBtn').hidden = true;
}
$('#corrForm').addEventListener('submit', (e) => {
  e.preventDefault(); const L = cmIn($('#corrVal').value);
  if (!(L > 0.05 && L < 100)) { toast('Saisissez une longueur en centimètres, par exemple 412 ou 412,5'); return; }
  previewCorr(verifsWith(C.wall, L, $('#corrTool').value), cur.ajusterAngles);
});
$('#corrRevert').onclick = () => previewCorr(verifsWith(C.wall, null), cur.ajusterAngles && verifsWith(C.wall, null).length > 0);
$('#anglesBtn').onclick = () => previewCorr(C.pending.verifs, true);
$('#applyBtn').onclick = () => {
  if (!C.pending) return;
  cur.verifications = C.pending.verifs; cur.ajusterAngles = C.pending.forceAngles && cur.verifications.length > 0;
  store.put(cur); closeCorr(); renderPlan(); toast('Correction appliquée');
};

/* ================= compatibilité ================= */
async function checkCompat() {
  const msg = [$('#compat'), $('#compat2')], b = $('#startBtn');
  const set = (t) => msg.forEach((m) => (m.innerHTML = t));
  if (!window.isSecureContext) { b.textContent = 'Adresse non sécurisée'; set('Ouvrez l\'adresse en https://.'); return; }
  if (!navigator.xr) { b.textContent = 'Relevé impossible sur cet appareil'; set(/iPhone|iPad/.test(navigator.userAgent) ? 'Sur iPhone, Safari ne permet pas la réalité augmentée depuis une page web. Utilisez un téléphone Android avec Chrome.' : 'Pour relever, ouvrez ce lien dans Chrome sur un téléphone Android. Sur ordinateur : importez un relevé pour le corriger et imprimer le PDF.'); return; }
  let ok = false; try { ok = await navigator.xr.isSessionSupported('immersive-ar'); } catch (e) { /* non géré */ }
  if (!ok) { b.textContent = 'Relevé impossible sur cet appareil'; set('Installez ou mettez à jour « Google Play Services pour la RA » puis rechargez la page (<a href="https://play.google.com/store/apps/details?id=com.google.ar.core" target="_blank" rel="noopener">Play Store</a>).'); return; }
  b.disabled = false; b.textContent = 'Relever le contour'; set('');
}
$('#startBtn').onclick = () => startAR();

/* ================= WebGL minimal ================= */
let gl, prog, loc;
function initGL() {
  gl = $('#gl').getContext('webgl', { xrCompatible: true, alpha: true, antialias: true });
  if (!gl) throw new Error('WebGL indisponible');
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec3 p;uniform mat4 P;uniform mat4 V;void main(){gl_Position=P*V*vec4(p,1.0);}'));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'precision mediump float;uniform vec4 c;void main(){gl_FragColor=vec4(c.rgb*c.a,c.a);}'));
  gl.linkProgram(prog);
  loc = { p: gl.getAttribLocation(prog, 'p'), P: gl.getUniformLocation(prog, 'P'), V: gl.getUniformLocation(prog, 'V'), c: gl.getUniformLocation(prog, 'c') };
}
class Mesh {
  constructor() { this.buf = gl.createBuffer(); this.n = 0; }
  set(a) { gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.DYNAMIC_DRAW); this.n = a.length / 3; return this; }
  draw(rgb, al) { if (!this.n) return; gl.bindBuffer(gl.ARRAY_BUFFER, this.buf); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0); gl.uniform4f(loc.c, rgb[0], rgb[1], rgb[2], al); gl.drawArrays(gl.TRIANGLES, 0, this.n); }
  dispose() { gl.deleteBuffer(this.buf); }
}
const YEL = [1, 0.76, 0.1], GRN = [0.24, 0.86, 0.52], RED = [1, 0.35, 0.29];
const solidOf = (dots, segs, r = 0.003) => [...segs.flatMap(([a, b]) => G.prism(a, b, r)), ...dots.flatMap((p) => G.octa(p))];

/* ================= séance AR ================= */
let session = null, refSpace = null, hitSource = null, wakeLock = null, meshes = null;
const A = {};
const labels = [];
function resetA() { Object.assign(A, { pts: [], meta: [], target: null, hitSeen: false, lost: false, lossStart: 0, pertes: [], resumed: false, reset: false, lastHud: 0, flash: null, bad: null }); }
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
  refSpace.addEventListener('reset', () => { if (A.pts.length) { A.reset = true; $('#resetBox').hidden = false; } A.pertes.push({ debut: new Date().toISOString(), fin: new Date().toISOString(), reinitialisation: true }); });
  session.addEventListener('end', onEnd);
  resetA(); A.seance = { id: uid('s'), debut: new Date().toISOString() };
  meshes = { path: new Mesh(), preview: new Mesh(), fill: new Mesh(), reticle: new Mesh() };
  $('#home').hidden = true; $('#rel').hidden = true;
  $('#hudRoom').textContent = `${cur.nom} — ${cur.piece}`; $('#lost').hidden = true; $('#resetBox').hidden = true;
  navigator.wakeLock?.request('screen').then((w) => (wakeLock = w)).catch(() => { /* facultatif */ });
  session.requestAnimationFrame(onFrame);
}
function onEnd() {
  try { hitSource?.cancel(); } catch (e) { /* déjà libéré */ }
  hitSource = null; session = null;
  Object.values(meshes || {}).forEach((m) => m.dispose()); meshes = null;
  labels.forEach((l) => l.el.remove()); labels.length = 0;
  try { wakeLock?.release(); } catch (e) { /* rien */ }
  $('#ar').hidden = true; show('rel'); renderRel();
}
$('#ar').addEventListener('beforexrselect', (e) => e.preventDefault());
$('#quitBtn').onclick = (e) => armConfirm(e.currentTarget, () => session && session.end(), A.pts.length > 0);
$('#quit2Btn').onclick = () => session && session.end();
$('#restartBtn').onclick = () => { A.pts = []; A.meta = []; A.reset = false; A.resumed = false; $('#resetBox').hidden = true; rebuildLabels(); flash('Contour recommencé : visez le premier angle'); };
$('#undoBtn').onclick = () => { if (!A.pts.length) return; A.pts.pop(); A.meta.pop(); A.bad = null; rebuildLabels(); flash('Dernier angle retiré', 1200); };
$('#addBtn').onclick = addPoint;
$('#closeBtn').onclick = closeContour;
function flash(t, ms = 2500) { A.flash = { t, until: performance.now() + ms }; }

function addPoint() {
  if (A.lost || A.reset) return;
  const t = A.target; if (!t) { navigator.vibrate?.(80); flash('Aucune surface visée', 1200); return; }
  if (t.snap) { closeContour(); return; }
  if (A.pts.length && G.hdist(A.pts[A.pts.length - 1], t.p) < 0.05) { flash('Trop près de l\'angle précédent', 1500); return; }
  A.pts.push([...t.p]);
  A.meta.push({ horodatage: new Date().toISOString(), distanceCamera: Math.round(G.dist(A.C, t.p) * 1000) / 1000, surface: t.n[1] > 0.9 ? 'horizontale' : 'autre', apresReprise: A.resumed });
  navigator.vibrate?.(15); A.bad = null; rebuildLabels();
}
function closeContour() {
  if (A.pts.length < 3) { flash('Il faut au moins 3 angles'); return; }
  const fl = P.projectFloor(A.pts), err = P.checkContour(fl.plan);
  if (err) { A.bad = err; navigator.vibrate?.([60, 60, 60]); flash(`${err.raison} Touchez « Annuler le point » pour reprendre.`, 6000); return; }
  const angles = A.pts.map((p, i) => ({ id: uid('a'), n: i + 1, horodatage: A.meta[i].horodatage, brut: round3(p), plan: round3(fl.plan[i]), ecartSol: Math.round(fl.ecarts[i] * 1000) / 1000, qualite: { distanceCamera: A.meta[i].distanceCamera, surfaceDetectee: A.meta[i].surface, apresReprise: A.meta[i].apresReprise } }));
  cur.angles = angles; cur.ferme = true; cur.verifications = []; cur.ajusterAngles = false;
  cur.sol = { y: Math.round(fl.y * 1000) / 1000, methode: 'médiane des hauteurs des angles, repère AR vertical', ecarts: angles.map((a) => a.ecartSol) };
  cur.seance = { ...A.seance, fin: new Date().toISOString(), pertesSuivi: A.pertes };
  store.put(cur); navigator.vibrate?.([20, 40, 20]);
  const g = P.geometry(cur); toast(`Contour fermé : ${angles.length} murs, ${P.m2(g.surface)}`, 3000);
  session.end();
}

function computeTarget(hit) {
  if (!hit) return null;
  if (A.pts.length >= 3 && G.hdist(hit.p, A.pts[0]) < 0.1) return { p: A.pts[0], n: hit.n, snap: true };
  return hit;
}
function rebuildLabels() {
  labels.forEach((l) => l.el.remove()); labels.length = 0;
  for (let i = 1; i < A.pts.length; i++) {
    const a = A.pts[i - 1], b = A.pts[i], el = document.createElement('div'); el.className = 'lbl'; el.style.setProperty('--c', '#3ddc84');
    el.textContent = `M${i} · ${Math.round(G.hdist(a, b) * 100)}`; $('#labels').appendChild(el); labels.push({ el, pos: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.02, (a[2] + b[2]) / 2] });
  }
  A.pts.forEach((p, i) => { const el = document.createElement('div'); el.className = 'lbl small'; el.textContent = `A${i + 1}`; $('#labels').appendChild(el); labels.push({ el, pos: [p[0], p[1] + 0.06, p[2]] }); });
  if (meshes) meshes.path.set(solidOf(A.pts, A.pts.slice(1).map((p, i) => [A.pts[i], p])));
}
function rotate(v, q) { const u = [q.x, q.y, q.z], t = G.scale(G.cross(u, v), 2); return G.add(G.add(v, G.scale(t, q.w)), G.cross(u, t)); }
function project(p, Pm, V) {
  const v = [0, 1, 2, 3].map((r) => V[r] * p[0] + V[4 + r] * p[1] + V[8 + r] * p[2] + V[12 + r]);
  const c = [0, 1, 2, 3].map((r) => Pm[r] * v[0] + Pm[4 + r] * v[1] + Pm[8 + r] * v[2] + Pm[12 + r] * v[3]);
  return c[3] > 0.01 ? [((c[0] / c[3]) * 0.5 + 0.5) * innerWidth, (1 - ((c[1] / c[3]) * 0.5 + 0.5)) * innerHeight] : null;
}
function hud(v, t) { $('#hudVal').textContent = v; $('#hudTip').textContent = t; }
function onFrame(time, frame) {
  const s = frame.session; if (!meshes || !session) return; s.requestAnimationFrame(onFrame);
  const layer = s.renderState.baseLayer;
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const pose = frame.getViewerPose(refSpace);
  const lost = !pose || pose.emulatedPosition;
  if (lost && !A.lost) { A.lost = true; A.lossStart = new Date().toISOString(); }
  if (!lost && A.lost) { A.lost = false; A.pertes.push({ debut: A.lossStart, fin: new Date().toISOString(), reinitialisation: false }); if (A.pts.length) { A.resumed = true; flash('Suivi retrouvé : vérifiez que les angles posés sont restés en place', 4000); } }
  $('#lost').hidden = !A.lost || A.reset; $('#addBtn').disabled = A.lost || A.reset;
  if (!pose) return;
  const tp = pose.transform.position; A.C = [tp.x, tp.y, tp.z];
  let hit = null;
  if (hitSource && !A.lost) { const r = frame.getHitTestResults(hitSource); if (r.length) { const hp = r[0].getPose(refSpace); if (hp) { const m = hp.transform.matrix; hit = { p: [m[12], m[13], m[14]], n: G.norm([m[4], m[5], m[6]]) }; A.hitSeen = true; } } }
  A.target = computeTarget(hit);
  // aperçu
  const Pp = A.pts, t = A.target, segs = [];
  let val = '';
  if (t && Pp.length) {
    segs.push([Pp[Pp.length - 1], t.p]); val = `${Math.round(G.hdist(Pp[Pp.length - 1], t.p) * 100)} cm`;
    if (Pp.length >= 2) { const poly = t.snap ? Pp : [...Pp, t.p]; if (!t.snap) segs.push([t.p, Pp[0]]); val += ` · ${P.m2(Math.abs(P.area2(poly.map((q) => [q[0], q[2]]))))}`; meshes.fill.set(G.fillMesh(poly.map((q) => [q[0], Pp[0][1], q[2]]))); }
    else meshes.fill.set([]);
  } else meshes.fill.set([]);
  meshes.preview.set(solidOf([], segs, 0.0035));
  meshes.reticle.set(t ? [...G.ringMesh(t.p, t.n), ...G.octa(t.p, 0.005)] : []);
  gl.useProgram(prog); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.DEPTH_TEST);
  for (const view of pose.views) {
    const vp = layer.getViewport(view); gl.viewport(vp.x, vp.y, vp.width, vp.height);
    gl.uniformMatrix4fv(loc.P, false, view.projectionMatrix); gl.uniformMatrix4fv(loc.V, false, view.transform.inverse.matrix);
    gl.depthMask(true); meshes.path.draw(A.bad ? RED : GRN, 1); meshes.preview.draw(YEL, 1);
    gl.depthMask(false); meshes.fill.draw(YEL, 0.18);
    gl.disable(gl.DEPTH_TEST); meshes.reticle.draw(t && t.snap ? GRN : YEL, 0.95); gl.enable(gl.DEPTH_TEST);
  }
  gl.depthMask(true);
  const v0 = pose.views[0];
  labels.forEach((l) => { const q = project(l.pos, v0.projectionMatrix, v0.transform.inverse.matrix); l.el.hidden = !q; if (q) l.el.style.transform = `translate(${q[0]}px,${q[1]}px) translate(-50%,-50%)`; });
  if (time - A.lastHud > 90) {
    A.lastHud = time;
    let tip;
    if (A.lost) tip = 'Suivi perdu : revenez lentement vers une zone déjà filmée';
    else if (!A.hitSeen) tip = 'Balayez lentement le sol avec le téléphone…';
    else if (!t) tip = 'Aucune surface ici : visez le sol près de l\'angle';
    else if (t.snap) tip = 'Premier angle atteint : touchez + pour fermer le contour';
    else if (!Pp.length) tip = 'Visez le 1er angle de la pièce, au sol, puis touchez +';
    else tip = Pp.length < 3 ? `Angle A${Pp.length + 1} : suivez le mur jusqu'à l'angle suivant` : `Angle A${Pp.length + 1}, ou revenez au 1er angle / « Fermer le contour »`;
    if (t && !t.snap && t.n[1] < 0.9) tip += ' · surface non horizontale : visez bien le sol';
    const fl = A.flash && A.flash.until > performance.now() ? A.flash.t : null;
    hud(val || `${Pp.length} angle(s)`, fl || tip);
    $('#closeBtn').disabled = Pp.length < 3; $('#closeBtn').classList.toggle('go', Pp.length >= 3);
    $('#undoBtn').disabled = !Pp.length;
    if (!A.lost && !A.reset) $('#addBtn').disabled = !t;
  }
}

/* ================= démarrage ================= */
renderList(); checkCompat();

// Écran « Plan » : aperçu à l'échelle, corrections de cotes, exports PDF / DXF / image
import * as P from './plan.js';
import { $, $$, toast, saveFile, slug } from './util.js';

let C = null; // contexte fourni par app.js : { rel(), persist(), snapshot(), undo(), onClose() }
const S = { roomId: null, page: 0, paper: 'A4', scale: 'auto', pages: [], g: null, vb: null };
try { S.paper = localStorage.getItem('metre-ar-paper') || 'A4'; } catch (e) { /* rien */ }

const room = () => C.rel().rooms.find((r) => r.id === S.roomId);
const cmIn = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n / 100 : NaN; };
const cmOut = (m) => String(Math.round(m * 1000) / 10).replace('.', ',');

export function openPlan(ctx, roomId, page = 0) {
  C = ctx; S.roomId = roomId; S.page = page; S.vb = null;
  $('#plan').hidden = false; document.body.classList.add('noscroll');
  render();
}
function close() { $('#plan').hidden = true; $('#pEdit').hidden = true; document.body.classList.remove('noscroll'); C.onClose(); }

export function buildPages(r, chantier, opts) {
  const { g, pages } = P.roomPages(r, chantier, opts);
  const recap = P.summaryPage(chantier, [{ name: r.name, g }], opts.paper, new Date().toLocaleDateString('fr-FR'));
  return { g, pages: [...pages, recap] };
}

function render() {
  const r = room(); if (!r) { close(); return; }
  const opts = { paper: S.paper, scale: S.scale === 'auto' ? null : +S.scale };
  const { g, pages } = buildPages(r, C.rel().name, opts);
  S.g = g; S.pages = pages; if (S.page >= pages.length) S.page = 0;
  $('#pTitle').textContent = `${C.rel().name ? C.rel().name + ' · ' : ''}${r.name}`;
  $('#pTabs').innerHTML = pages.map((p, i) => `<button class="ptab" role="tab" aria-selected="${i === S.page}" data-i="${i}" type="button">${i === 0 ? 'Dessus' : p.title}</button>`).join('');
  $$('[data-paper]').forEach((b) => b.classList.toggle('on', b.dataset.paper === S.paper));
  $('#pScale').value = S.scale; $('#pSquare').checked = !!r.square;
  const pg = pages[S.page];
  $('#pStage').innerHTML = P.toSVG(pg);
  const svg = $('#pStage svg'); svg.removeAttribute('width'); svg.removeAttribute('height');
  if (!S.vb || S.vb.page !== S.page) S.vb = { page: S.page, x: 0, y: 0, w: pg.W, h: pg.H };
  applyVB();
  // informations
  const info = [];
  if (pg.scale) info.push(`Échelle 1/${pg.scale} sur ${S.paper} ${pg.W > pg.H ? 'paysage' : 'portrait'}${pg.fits === false ? ' — ne tient pas sur la feuille' : ''}`);
  if (!g.complet) info.push(g.hMode === 'unique' ? 'Hauteur sous plafond non mesurée : touchez « HSP » pour la saisir' : 'Hauteurs incomplètes : touchez « h ? » pour les saisir');
  if (!g.ok) info.push(`⚠ Les cotes vérifiées ne ferment pas le contour (écart ${cmOut(g.ecartFermeture)} cm) : touchez une cote pour corriger`);
  else if (g.methode === 'angles ajustés') info.push('Angles ajustés pour respecter les cotes vérifiées');
  const deb = g.wallStats.flatMap((st, i) => st.deborde.map(() => `M${i + 1}`));
  if (deb.length) info.push(`⚠ Ouverture qui dépasse du mur : ${[...new Set(deb)].join(', ')}`);
  info.push('Touchez une cote pour la corriger (V = vérifiée, A = ajustée).');
  $('#pInfo').textContent = info.join(' · ');
  $('#pAddOpen').hidden = !(S.page >= 1 && S.page <= g.walls.length);
  $('#pUndo').disabled = !C.canUndo();
}
function applyVB() { const v = S.vb, svg = $('#pStage svg'); if (svg) svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); }

/* ---------- corrections ---------- */
function change(fn) { C.snapshot(); fn(room()); C.persist(); $('#pEdit').hidden = true; render(); }
function editForm(html, onApply, extra, label = 'Appliquer') {
  const f = $('#pEdit'); f.innerHTML = html + `<div class="prow"><button class="btn sm dark go" type="submit">${label}</button>${extra || ''}<button class="btn sm dark" data-x="close" type="button">Fermer</button></div>`;
  f.hidden = false; f.onsubmit = (e) => { e.preventDefault(); onApply(new FormData(f)); };
  const first = f.querySelector('input'); if (first) setTimeout(() => first.focus(), 50);
}
$('#pEdit').addEventListener('click', (e) => {
  const b = e.target.closest('[data-x]'); if (!b) return;
  if (b.dataset.x === 'close') $('#pEdit').hidden = true;
  if (b.dataset.x === 'revert') { const v = verifsWith(E.wall, null); preview(v, room().ajusterAngles && v.length > 0); }
  if (b.dataset.x === 'keepang') preview(room().verifications, false);
  if (b.dataset.x === 'delopen') change((r) => { r.openings = r.openings.filter((o) => o.id !== +b.dataset.id); });
});
const E = { wall: null, pending: null };
function verifsWith(i, L, tool) {
  const r = room(), rest = (r.verifications || []).filter((v) => v.mur !== i);
  return L == null ? rest : [...rest, { mur: i, longueurAR: Math.round(S.g.walls[i].LAR * 1000) / 1000, longueurVerifiee: L, outil: tool, date: new Date().toISOString() }];
}
function editWall(i) {
  const r = room(), w = S.g.walls[i], n = S.g.walls.length; E.wall = i; E.pending = null;
  editForm(`<b>Mur M${i + 1} (A${i + 1} → A${(i + 1) % n + 1})</b>
    <span class="small">Mesure AR : <b>${cmOut(w.LAR)} cm</b> · sur le plan : <b>${cmOut(w.L)} cm</b>${w.Lver != null ? ` · vérifiée : <b>${cmOut(w.Lver)} cm</b>` : ''}.<br>Les angles mesurés sont conservés ; les murs non vérifiés s'ajustent le moins possible pour que le contour reste fermé.</span>
    <div class="fields">
      <label class="f">Longueur mesurée (cm)<input name="v" inputmode="decimal" value="${w.Lver != null ? cmOut(w.Lver) : ''}" placeholder="${cmOut(w.L)}"></label>
      <label class="f">Outil<select name="tool"><option value="mètre">Mètre ruban</option><option value="laser">Télémètre laser</option></select></label>
    </div>
    <div id="pPrev" hidden></div>`,
  (fd) => {
    if (E.pending) { apply(); return; }
    const v = cmIn(fd.get('v')); if (!(v > 0.05 && v < 100)) { toast('Saisissez une longueur en centimètres, par exemple 412 ou 412,5'); return; }
    preview(verifsWith(i, v, fd.get('tool')), r.ajusterAngles);
  },
  (w.Lver != null ? '<button class="btn sm dark" data-x="revert" type="button">Revenir à la mesure AR</button>' : '') + (r.ajusterAngles ? '<button class="btn sm dark" data-x="keepang" type="button">Revenir aux angles mesurés</button>' : ''),
  'Voir l\'effet');
  const t = r.verifications.find((x) => x.mur === i); if (t) $('#pEdit select[name="tool"]').value = t.outil;
  $('#pEdit input[name="v"]').addEventListener('input', () => { E.pending = null; $('#pPrev').hidden = true; $('#pEdit [type="submit"]').textContent = 'Voir l\'effet'; });
}
function preview(verifs, force) {
  const r = room(), before = P.roomGeometry(r), after = P.roomGeometry(r, verifs, force), box = $('#pPrev'), sub = $('#pEdit [type="submit"]');
  box.hidden = false;
  const oldAng = $('#pEdit [data-x="angles"]'); if (oldAng) oldAng.remove();
  if (!after.ok) {
    E.pending = null; sub.textContent = 'Voir l\'effet';
    box.innerHTML = `<p class="warn">Impossible de fermer le contour avec ces cotes sans modifier les angles : il manque <b>${cmOut(after.ecartFermeture)} cm</b>. Rien n'a été changé.</p><p class="small">Vérifiez la valeur saisie et les autres cotes vérifiées. Si elles sont justes, la pièce n'a pas exactement les angles mesurés : vous pouvez accepter d'ajuster aussi les angles.</p>`;
    sub.insertAdjacentHTML('afterend', '<button class="btn sm dark" data-x="angles" type="button">Ajuster aussi les angles</button>');
    $('#pEdit [data-x="angles"]').onclick = () => preview(verifs, true);
    return;
  }
  E.pending = { verifs, force: !!force && verifs.length > 0 };
  const pg = P.layoutPage((sc) => P.buildTop(r, after, sc, r.name, { ghost: before.pts }), 'A4', null);
  const ch = after.walls.filter((w, i) => Math.abs(w.L - before.walls[i].L) > 0.0005).map((w) => `<li>M${w.i + 1} : ${cmOut(before.walls[w.i].L)} → <b>${cmOut(w.L)} cm</b> (${w.L > before.walls[w.i].L ? '+' : '−'}${cmOut(Math.abs(w.L - before.walls[w.i].L))})${w.statut === 'verifiee' ? ' · vérifiée' : ' · ajustée'}</li>`);
  const angCh = after.angles.map((a, i) => Math.abs(a - before.angles[i])).reduce((m, v) => Math.max(m, v), 0);
  const deb = after.wallStats.flatMap((st, i) => st.deborde.map((o) => `<li class="warn">${o.type === 'porte' ? 'Porte' : 'Fenêtre'} ${cmOut(o.w)} cm : dépasse du mur M${i + 1} → corrigez sa position ensuite</li>`));
  box.innerHTML = `<div class="pprev">${pg ? P.toSVG({ ...pg, ops: pg.ops }) : ''}</div>
    <ul class="small">${ch.join('') || '<li>Aucun mur ne change de longueur.</li>'}${deb.join('')}</ul>
    <p class="small">Surface au sol : ${P.m2(before.sol)} → <b>${P.m2(after.sol)}</b> · ${E.pending.force ? `angles modifiés de ${angCh.toFixed(1).replace('.', ',')}° au plus` : 'angles inchangés'}. Contour précédent en pointillés ; la mesure AR d'origine reste conservée.</p>`;
  sub.textContent = 'Appliquer la correction';
}
function apply() {
  const p = E.pending; if (!p) return;
  change((rr) => { rr.verifications = p.verifs; rr.ajusterAngles = p.force; });
  toast('Correction appliquée');
}
function editHeight() {
  const r = room(), H = r.hauteurs, n = r.corners.length;
  const row = (key, lab, o) => `<tr><td>${lab}</td><td>${o?.ar != null ? cmOut(o.ar) : '—'}</td><td><input name="h-${key}" inputmode="decimal" value="${o?.verifiee != null ? cmOut(o.verifiee) : ''}" placeholder="—"></td></tr>`;
  const table = (mode) => `<table class="htab"><tr><th></th><th>AR</th><th>Au mètre (cm)</th></tr>${mode === 'unique' ? row('u', 'Pièce', H.unique) : Array.from({ length: n }, (_, i) => row(i, `Angle A${i + 1}`, H.angles[i])).join('')}</table>`;
  let mode = H.mode === 'angles' ? 'angles' : 'unique';
  editForm(`<b>Hauteurs sous plafond</b>
    <div class="seg" role="radiogroup"><button type="button" data-hm="unique" role="radio">Une hauteur</button><button type="button" data-hm="angles" role="radio">Une par angle</button></div>
    <span class="small" id="hHelp"></span><div id="hTab"></div>`,
  (fd) => {
    const get = (k) => { const t = String(fd.get('h-' + k) || '').trim(); if (!t) return null; const v = cmIn(t); return v > 0.5 && v < 10 ? v : NaN; };
    const keys = mode === 'unique' ? ['u'] : Array.from({ length: n }, (_, i) => i), vals = keys.map(get);
    if (vals.some((v) => Number.isNaN(v))) { toast('Hauteur invalide : en centimètres, par exemple 250'); return; }
    change((rr) => {
      const HH = rr.hauteurs; HH.mode = mode;
      keys.forEach((k, j) => { const o = k === 'u' ? HH.unique : (HH.angles[k] = HH.angles[k] || {}); if (vals[j] == null) delete o.verifiee; else o.verifiee = Math.round(vals[j] * 1000) / 1000; });
    });
    toast('Hauteurs enregistrées');
  });
  const draw = () => {
    $$('#pEdit [data-hm]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.hm === mode)));
    $('#hHelp').textContent = mode === 'unique' ? 'Plafond horizontal : une seule hauteur pour toute la pièce.' : 'Plafond en pente ou irrégulier : une hauteur dans chaque angle ; chaque mur est calculé en trapèze.';
    $('#hTab').innerHTML = table(mode);
  };
  $$('#pEdit [data-hm]').forEach((b) => (b.onclick = () => { mode = b.dataset.hm; draw(); }));
  draw();
}
function editOpening(id, wallIdx) {
  const r = room(), o = id != null ? r.openings.find((q) => q.id === id) : null, wi = o ? o.wall : wallIdx, w = S.g.walls[wi];
  const left = o ? P.openLeft(w, o) : 0.3;
  editForm(`<b>${o ? 'Ouverture' : 'Nouvelle ouverture'} — mur M${wi + 1}</b>
    <div class="fields">
      <label class="f">Type<select name="type"><option value="porte">Porte</option><option value="fenetre">Fenêtre</option><option value="autre">Autre</option></select></label>
      <label class="f">Depuis le coin gauche (cm)<input name="x" inputmode="decimal" value="${cmOut(left)}"></label>
      <label class="f">Largeur (cm)<input name="w" inputmode="decimal" value="${o ? cmOut(o.w) : '83'}"></label>
      <label class="f">Allège (cm)<input name="sill" inputmode="decimal" value="${o ? cmOut(o.sill) : '0'}"></label>
      <label class="f">Hauteur (cm)<input name="h" inputmode="decimal" value="${o ? cmOut(o.h) : '204'}"></label>
    </div>`,
  (fd) => {
    const x = cmIn(fd.get('x')), ww = cmIn(fd.get('w')), sill = cmIn(fd.get('sill')), h = cmIn(fd.get('h'));
    if (![x, ww, sill, h].every((v) => v >= 0) || !(ww > 0) || !(h > 0)) { toast('Valeurs invalides'); return; }
    change((rr) => {
      const s = P.openFromLeft(w, x, ww), q = { wall: wi, s, w: ww, sill, h, type: fd.get('type'), manual: true };
      if (o) Object.assign(rr.openings.find((z) => z.id === o.id), q); else rr.openings.push({ id: Date.now(), ...q });
    });
  }, o ? `<button class="btn sm dark" data-x="delopen" data-id="${o.id}" type="button">Supprimer</button>` : '');
  $('#pEdit select').value = o ? o.type : 'porte';
}

/* ---------- interactions ---------- */
$('#pBack').onclick = close;
$('#pTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; S.page = +b.dataset.i; $('#pEdit').hidden = true; render(); });
$$('[data-paper]').forEach((b) => (b.onclick = () => { S.paper = b.dataset.paper; try { localStorage.setItem('metre-ar-paper', S.paper); } catch (e) { /* rien */ } S.vb = null; render(); }));
$('#pScale').onchange = (e) => { S.scale = e.target.value; S.vb = null; render(); };
$('#pSquare').onchange = (e) => {
  const r = room(), g = P.roomGeometry({ ...r, square: e.target.checked });
  if (!g.ok) { e.target.checked = !e.target.checked; toast(`Impossible de mettre d'équerre avec les cotes vérifiées (écart ${cmOut(g.ecartFermeture)} cm)`); return; }
  change((rr) => { rr.square = e.target.checked; });
};
$('#pUndo').onclick = () => { C.undo(); render(); };
$('#pAddOpen').onclick = () => editOpening(null, S.page - 1);
function exportAll(kind) {
  const r = room(), name = `plan-${slug(C.rel().name)}-${slug(r.name)}`;
  if (kind === 'pdf') saveFile(name + '.pdf', P.toPDF(S.pages), 'application/pdf');
  if (kind === 'dxf') saveFile(name + '.dxf', P.toDXF(S.pages.filter((p) => p.scale)), 'application/dxf');
  if (kind === 'png') {
    const pg = S.pages[S.page], k = 6, c = document.createElement('canvas'); c.width = Math.round(pg.W * k); c.height = Math.round(pg.H * k);
    P.drawCanvas(c.getContext('2d'), pg, k);
    c.toBlob((b) => saveFile(`${name}-${pg.title || 'page'}.png`.replace(/\s+/g, '_'), b, 'image/png'), 'image/png');
  }
}
$('#pPdf').onclick = () => exportAll('pdf');
$('#pDxf').onclick = () => exportAll('dxf');
$('#pPng').onclick = () => exportAll('png');

// zoom / déplacement de l'aperçu, et toucher une cote
const Ptr = new Map(); let G = null;
const stage = $('#pStage');
function toSvg(x, y) { const r = stage.getBoundingClientRect(), v = S.vb, k = Math.max(v.w / r.width, v.h / r.height), ox = (r.width * k - v.w) / 2, oy = (r.height * k - v.h) / 2; return [v.x + (x - r.left) * k - ox, v.y + (y - r.top) * k - oy, k]; }
function zoomAt(x, y, f) {
  const [sx, sy] = toSvg(x, y), pg = S.pages[S.page], v = S.vb;
  const w = Math.min(pg.W * 1.2, Math.max(15, v.w / f)), h = (w * v.h) / v.w;
  S.vb = { ...v, x: sx - ((sx - v.x) * w) / v.w, y: sy - ((sy - v.y) * h) / v.h, w, h }; applyVB();
}
stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId); Ptr.set(e.pointerId, [e.clientX, e.clientY]);
  if (Ptr.size === 2) { const [a, b] = [...Ptr.values()]; G = { t: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; return; }
  G = { t: 'tap', s: [e.clientX, e.clientY], v: { ...S.vb }, moved: false };
});
stage.addEventListener('pointermove', (e) => {
  if (!Ptr.has(e.pointerId) || !G) return; Ptr.set(e.pointerId, [e.clientX, e.clientY]);
  if (G.t === 'pinch' && Ptr.size >= 2) { const [a, b] = [...Ptr.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / G.d); G.d = d; return; }
  if (G.t === 'tap') {
    const dx = e.clientX - G.s[0], dy = e.clientY - G.s[1]; if (Math.hypot(dx, dy) > 6) G.moved = true;
    if (G.moved) { const k = toSvg(0, 0)[2]; S.vb = { ...G.v, x: G.v.x - dx * k, y: G.v.y - dy * k }; applyVB(); }
  }
});
stage.addEventListener('pointerup', (e) => {
  Ptr.delete(e.pointerId); if (!G) return;
  if (G.t === 'tap' && !G.moved) {
    const el = document.elementFromPoint(e.clientX, e.clientY), t = el && el.closest('[data-edit]');
    if (t) {
      const ed = JSON.parse(t.dataset.edit);
      if (ed.kind === 'wall') editWall(ed.i); else if (ed.kind === 'height') editHeight(); else if (ed.kind === 'opening') editOpening(ed.id); else if (ed.kind === 'page') { S.page = ed.page; render(); }
    }
  }
  if (G.t !== 'pinch' || Ptr.size === 0) G = null;
});
stage.addEventListener('pointercancel', (e) => { Ptr.delete(e.pointerId); G = null; });
stage.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
stage.addEventListener('dblclick', () => { S.vb = null; render(); });

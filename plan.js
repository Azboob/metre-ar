// Plans à l'échelle : géométrie de la pièce, mise en page, et sorties SVG / PDF / DXF / PNG.
// Coordonnées du plan : mètres, x vers la droite, y = z du monde (vers le bas sur la feuille).

/* ================= géométrie de la pièce ================= */
const d2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const ang = (v) => Math.atan2(v[1], v[0]);
const rot2 = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
export function area2(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export function inside2(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };

/* ---- données d'une pièce ----
room = { id, name, sid, floorY, corners:[[x,z]…] (mesure AR, jamais modifiée),
  verifications:[{ mur, longueurAR, longueurVerifiee, outil, date }], ajusterAngles, square,
  hauteurs:{ mode:'unique'|'angles', unique:{ar, verifiee}, angles:{ [indiceAngle]:{ar, verifiee} } },
  openings:[…], raw } */
export function normalizeRoom(r) {
  if (!r.verifications) r.verifications = Object.entries(r.len || {}).map(([i, v]) => ({ mur: +i, longueurAR: null, longueurVerifiee: v, outil: 'mètre', date: null }));
  delete r.len;
  if (!r.hauteurs) {
    r.hauteurs = { mode: 'unique', unique: {}, angles: {} };
    if (r.height) { if (r.hManual) r.hauteurs.unique.verifiee = r.height; if (r.hMeasured) r.hauteurs.unique.ar = r.hMeasured; }
  }
  r.hauteurs.unique = r.hauteurs.unique || {}; r.hauteurs.angles = r.hauteurs.angles || {};
  delete r.height; delete r.hMeasured; delete r.hManual;
  r.openings = r.openings || []; r.ajusterAngles = !!r.ajusterAngles; r.square = !!r.square;
  return r;
}
const hval = (o) => (o ? (o.verifiee ?? o.ar ?? null) : null);
const hst = (o) => (!o ? null : o.verifiee != null ? 'verifiee' : o.ar != null ? 'AR' : null);
// hauteur retenue à chaque angle : [{ v, st }]
export function cornerHeights(room) {
  const H = room.hauteurs || {}, n = room.corners.length;
  if (H.mode === 'angles') return Array.from({ length: n }, (_, i) => ({ v: hval(H.angles?.[i]), st: hst(H.angles?.[i]) }));
  return Array.from({ length: n }, () => ({ v: hval(H.unique), st: hst(H.unique) }));
}

// Géométrie finale d'une pièce.
// Directions des murs : mesurées (ou mises d'équerre si demandé). Longueurs vérifiées au mètre : figées.
// Autres longueurs : ajustées au minimum (moindres carrés) pour que le contour se ferme.
// Si c'est impossible sans toucher aux angles : ok = false, plan inchangé, écart signalé
// (sauf si « ajuster aussi les angles » est accepté).
export function roomGeometry(room, overrideVerifs, forceAngles) {
  const C = room.corners, n = C.length;
  const LAR = C.map((p, i) => d2(p, C[(i + 1) % n]));
  const verifs = overrideVerifs || room.verifications || [];
  const ver = new Array(n).fill(null); verifs.forEach((v) => { if (v.mur >= 0 && v.mur < n) ver[v.mur] = v.longueurVerifiee; });
  const nVer = ver.filter((v) => v != null).length, angAdj = forceAngles ?? room.ajusterAngles;
  const dirs = C.map((p, i) => ang([C[(i + 1) % n][0] - p[0], C[(i + 1) % n][1] - p[1]]));
  const turns = dirs.map((a, i) => wrapPi(dirs[(i + 1) % n] - a));
  const squared = [];
  const th = [dirs[0]];
  for (let i = 0; i < n - 1; i++) {
    let t = turns[i];
    if (room.square) {
      const q = Math.round(t / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(t - q) < (5 * Math.PI) / 180) { if (Math.abs(t - q) > 1e-9) squared.push({ coin: i + 2, avant: 180 - (t * 180) / Math.PI, apres: 180 - (q * 180) / Math.PI }); t = q; }
    }
    th.push(th[i] + t);
  }
  const U = th.map((a) => [Math.cos(a), Math.sin(a)]);
  let pts = C.map((p) => [...p]), ok = true, ecartFermeture = 0, methode = 'mesure AR';
  if (nVer || room.square) {
    const r = solveDirections(C[0], U, LAR, ver);
    if (r.ok && !(angAdj && nVer)) { pts = r.pts; methode = nVer ? 'directions conservées' : 'mis d\'équerre'; }
    else if (angAdj && nVer) { pts = solveAngles(C, LAR, ver, room.square ? U : null); methode = 'angles ajustés'; }
    else { ok = false; ecartFermeture = r.gap; methode = 'impossible sans ajuster les angles'; }
  }
  const A = area2(pts), n2 = pts.length;
  const walls = pts.map((a, i) => {
    const b = pts[(i + 1) % n2], L = d2(a, b), dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    let nIn = [-dir[1], dir[0]]; const mid = [(a[0] + b[0]) / 2 + nIn[0] * 0.01, (a[1] + b[1]) / 2 + nIn[1] * 0.01];
    if (!inside2(mid, pts)) nIn = [-nIn[0], -nIn[1]];
    const r = [nIn[1], -nIn[0]]; // droite de la personne qui regarde le mur depuis l'intérieur
    const flip = dir[0] * r[0] + dir[1] * r[1] < 0; // vrai si le mur se lit de b vers a
    const statut = ver[i] != null ? 'verifiee' : Math.abs(L - LAR[i]) > 0.0005 ? 'ajustee' : 'AR';
    return { i, a, b, L, dir, nIn, flip, LAR: LAR[i], Lver: ver[i], statut, manual: statut === 'verifiee', adjusted: statut === 'ajustee', adj: L - LAR[i] };
  });
  const angles = pts.map((p, i) => { // angle intérieur au coin i (entre mur i-1 et mur i)
    const w0 = walls[(i - 1 + n2) % n2], w1 = walls[i];
    const t = wrapPi(ang(w1.dir) - ang(w0.dir)), sgn = A > 0 ? 1 : -1;
    return 180 - (sgn * t * 180) / Math.PI;
  });
  // hauteurs
  const hs = cornerHeights(room), hv = hs.map((h) => h.v), complet = hv.every((v) => v != null);
  const hMode = room.hauteurs?.mode === 'angles' ? 'angles' : 'unique';
  const H = hMode === 'unique' ? hv[0] : null; // hauteur unique (ou null)
  const Hmax = hv.filter((v) => v != null).reduce((m, v) => Math.max(m, v), 0) || null;
  const openings = (room.openings || []).map((o) => ({ ...o }));
  const wallStats = walls.map((w) => {
    const ha = hv[w.i], hb = hv[(w.i + 1) % n2], has = ha != null && hb != null;
    const brut = has ? (w.L * (ha + hb)) / 2 : 0;
    const ops = openings.filter((o) => o.wall === w.i), ouv = ops.reduce((s, o) => s + o.w * o.h, 0);
    const deborde = ops.filter((o) => o.s < -0.005 || o.s + o.w > w.L + 0.005);
    return { brut, ouv, net: has ? Math.max(0, brut - ouv) : 0, has, ha, hb, deborde };
  });
  let plafond = null;
  if (complet) { // plafond plan ou incliné : aire du polygone 3D (x, h, y)
    const P3 = pts.map((p, i) => [p[0], hv[i], p[1]]); let c = [0, 0, 0];
    for (let i = 0; i < n2; i++) { const a = P3[i], b = P3[(i + 1) % n2]; c = [c[0] + a[1] * b[2] - a[2] * b[1], c[1] + a[2] * b[0] - a[0] * b[2], c[2] + a[0] * b[1] - a[1] * b[0]]; }
    plafond = Math.hypot(...c) / 2;
  }
  const closing = { ferme: ok, ecartResiduel: ecartFermeture, methode, ajustements: walls.filter((w) => w.statut === 'ajustee').map((w) => ({ mur: w.i + 1, mesure: w.LAR, plan: w.L, ecart: w.adj })) };
  return { ok, methode, ecartFermeture, pts, walls, angles, closing, squared, hs, hMode, H, Hmax, complet, plafond, openings, sol: Math.abs(A), solAR: Math.abs(area2(C)), perimetre: walls.reduce((s, w) => s + w.L, 0), wallStats };
}
function solveDirections(P0, U, LAR, ver) {
  const n = U.length, L = LAR.map((l, i) => (ver[i] != null ? ver[i] : l)), F = L.map((_, i) => i).filter((i) => ver[i] == null);
  const sum = [0, 0]; L.forEach((l, i) => { sum[0] += l * U[i][0]; sum[1] += l * U[i][1]; });
  const gap = Math.hypot(sum[0], sum[1]);
  let a11 = 0, a12 = 0, a22 = 0; F.forEach((i) => { a11 += U[i][0] ** 2; a12 += U[i][0] * U[i][1]; a22 += U[i][1] ** 2; });
  const det = a11 * a22 - a12 * a12;
  if (F.length < 2 || Math.abs(det) < 1e-6) return { ok: gap < 0.0005, gap, pts: gap < 0.0005 ? build(P0, U, L) : null };
  const e = [-sum[0], -sum[1]], l0 = (a22 * e[0] - a12 * e[1]) / det, l1 = (-a12 * e[0] + a11 * e[1]) / det;
  F.forEach((i) => { L[i] += U[i][0] * l0 + U[i][1] * l1; });
  if (L.some((l) => l <= 0.02)) return { ok: false, gap };
  return { ok: true, pts: build(P0, U, L), gap };
}
function build(P0, U, L) { const pts = [[...P0]]; for (let i = 0; i < U.length - 1; i++) pts.push([pts[i][0] + L[i] * U[i][0], pts[i][1] + L[i] * U[i][1]]); return pts; }
// Ajustement des angles accepté : moindres carrés non linéaires sur les positions des angles
// (longueurs vérifiées très pondérées, longueurs AR et angles d'origine faiblement).
function solveAngles(P0, LAR, ver, Usq) {
  const n = P0.length;
  const turn0 = Usq ? Usq.map((u, i) => wrapPi(ang(u) - ang(Usq[(i - 1 + n) % n]))) : P0.map((p, i) => { const a = P0[(i - 1 + n) % n], c = P0[(i + 1) % n]; return wrapPi(ang([c[0] - p[0], c[1] - p[1]]) - ang([p[0] - a[0], p[1] - a[1]])); });
  let x = P0.flat();
  const res = (x) => {
    const p = (i) => [x[2 * ((i + n) % n)], x[2 * ((i + n) % n) + 1]], r = [];
    for (let i = 0; i < n; i++) { const L = d2(p(i), p(i + 1)); r.push(ver[i] != null ? 100 * (L - ver[i]) : L - LAR[i]); }
    for (let i = 0; i < n; i++) { const a = p(i - 1), b = p(i), c = p(i + 1); r.push(0.3 * wrapPi(ang([c[0] - b[0], c[1] - b[1]]) - ang([b[0] - a[0], b[1] - a[1]]) - turn0[i])); }
    r.push(0.01 * (x[0] - P0[0][0]), 0.01 * (x[1] - P0[0][1]));
    const d0 = [P0[1][0] - P0[0][0], P0[1][1] - P0[0][1]], d1 = [x[2] - x[0], x[3] - x[1]]; r.push(0.3 * wrapPi(ang(d1) - ang(d0)));
    return r;
  };
  let lam = 1e-3;
  for (let it = 0; it < 60; it++) {
    const r0 = res(x), m = r0.length, N = x.length, J = [];
    for (let j = 0; j < N; j++) { const xe = [...x]; xe[j] += 1e-6; const r1 = res(xe); J.push(r1.map((v, k) => (v - r0[k]) / 1e-6)); }
    const Am = Array.from({ length: N }, (_, a) => Array.from({ length: N }, (_, b) => { let s = 0; for (let k = 0; k < m; k++) s += J[a][k] * J[b][k]; return s + (a === b ? lam : 0); }));
    const g = Array.from({ length: N }, (_, a) => { let s = 0; for (let k = 0; k < m; k++) s -= J[a][k] * r0[k]; return s; });
    const dx = solveLin(Am, g); if (!dx) break;
    const xn = x.map((v, j) => v + dx[j]), c0 = r0.reduce((s, v) => s + v * v, 0), c1 = res(xn).reduce((s, v) => s + v * v, 0);
    if (c1 < c0) { x = xn; lam *= 0.3; if (c0 - c1 < 1e-14) break; } else lam *= 10;
  }
  return Array.from({ length: n }, (_, i) => [x[2 * i], x[2 * i + 1]]);
}
function solveLin(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (Math.abs(M[p][i]) < 1e-12) return null; [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < n; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/* ================= contrôle du contour ================= */
const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segCross(a, b, c, d) {
  const d1 = cross2(c, d, a), d2_ = cross2(c, d, b), d3 = cross2(a, b, c), d4 = cross2(a, b, d);
  if (((d1 > 0 && d2_ < 0) || (d1 < 0 && d2_ > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p, q, r) => Math.abs(cross2(p, q, r)) < 1e-9 && Math.min(p[0], q[0]) - 1e-9 <= r[0] && r[0] <= Math.max(p[0], q[0]) + 1e-9 && Math.min(p[1], q[1]) - 1e-9 <= r[1] && r[1] <= Math.max(p[1], q[1]) + 1e-9;
  return on(c, d, a) || on(c, d, b) || on(a, b, c) || on(a, b, d);
}
// null si le contour est acceptable, sinon { raison, murs?, angles? }
export function checkContour(pts) {
  const n = pts.length;
  if (n < 3) return { raison: 'Il faut au moins 3 angles pour fermer le contour.' };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (d2(pts[i], pts[j]) < 0.05) return { raison: `Les angles A${i + 1} et A${j + 1} sont à moins de 5 cm l'un de l'autre.`, angles: [i, j] };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (segCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return { raison: `Le contour se croise : les murs M${i + 1} et M${j + 1} se coupent.`, murs: [i, j] };
  }
  if (Math.abs(area2(pts)) < 0.5) return { raison: 'Surface inférieure à 0,5 m² : vérifiez les angles visés.' };
  return null;
}
// position d'une ouverture en élévation (depuis le coin gauche vu de l'intérieur)
export const openLeft = (w, o) => (w.flip ? w.L - o.s - o.w : o.s);
export const openFromLeft = (w, xLeft, width) => (w.flip ? w.L - xLeft - width : xLeft);

/* ================= mise en page ================= */
export const PAPER = { A4: [210, 297], A3: [297, 420] };
export const SCALES = [10, 20, 25, 50, 100];
const M = 10, TB = 22; // marge, hauteur du cartouche (mm)
const cm = (m) => String(Math.round(m * 100));
const m2 = (a) => a.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²';
export { m2, cm };
// texte de hauteur sous plafond pour une pièce
export function hspText(g) {
  const v = g.hs.map((h) => h.v).filter((x) => x != null);
  if (g.hMode === 'unique') return g.H != null ? `HSP ${cm(g.H)}${g.hs[0].st === 'verifiee' ? ' V' : ''}` : 'HSP à mesurer';
  if (!v.length) return 'HSP à mesurer';
  const a = Math.min(...v), b = Math.max(...v), r = Math.round(a * 100) === Math.round(b * 100) ? cm(a) : `${cm(a)} à ${cm(b)}`;
  return `HSP ${r}${g.complet ? '' : ' (incomplet)'}`;
}

function bbox(ops) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const o of ops) {
    if (o.hidden) continue;
    if (o.t === 'line') { add(o.x1, o.y1); add(o.x2, o.y2); }
    else if (o.t === 'poly') o.p.forEach((q) => add(q[0], q[1]));
    else if (o.t === 'text') { const w = o.s * 0.55 * o.str.length, h = o.s; const r = ((o.rot || 0) * Math.PI) / 180; const ex = Math.abs(Math.cos(r)) * w / 2 + Math.abs(Math.sin(r)) * h, ey = Math.abs(Math.sin(r)) * w / 2 + Math.abs(Math.cos(r)) * h; add(o.x - ex, o.y - ey); add(o.x + ex, o.y + ey); }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
// ligne de cote entre p et q (mm papier), décalée de off vers le vecteur unitaire nOut
// st : 'verifiee' (bleu, « V »), 'ajustee' (orange, « A »), true (saisie à la main, bleu « * »), sinon noir
const SUF = { verifiee: ' V', ajustee: ' A' }, SCOL = { verifiee: 'manual', ajustee: 'adj' };
function dim(ops, p, q, nOut, off, label, edit, st, noExt) {
  const a = [p[0] + nOut[0] * off, p[1] + nOut[1] * off], b = [q[0] + nOut[0] * off, q[1] + nOut[1] * off];
  const ext = (s, e) => ops.push({ t: 'line', x1: s[0] + nOut[0] * 1, y1: s[1] + nOut[1] * 1, x2: e[0] + nOut[0] * 1.5, y2: e[1] + nOut[1] * 1.5, w: 0.13, layer: 'COTES' });
  if (!noExt) { ext(p, a); ext(q, b); }
  ops.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 0.18, layer: 'COTES' });
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) return;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], tk = 1.2;
  for (const c of [a, b]) ops.push({ t: 'line', x1: c[0] - (u[0] + nOut[0]) * tk * 0.7, y1: c[1] - (u[1] + nOut[1]) * tk * 0.7, x2: c[0] + (u[0] + nOut[0]) * tk * 0.7, y2: c[1] + (u[1] + nOut[1]) * tk * 0.7, w: 0.35, layer: 'COTES' });
  let rot = (Math.atan2(u[1], u[0]) * 180) / Math.PI; if (rot > 90.5) rot -= 180; if (rot <= -89.5) rot += 180;
  const tx = (a[0] + b[0]) / 2 + nOut[0] * 2.2, ty = (a[1] + b[1]) / 2 + nOut[1] * 2.2;
  ops.push({ t: 'text', x: tx, y: ty, str: label + (st === true ? '*' : SUF[st] || ''), s: 2.5, rot, anchor: 'middle', layer: 'COTES', color: st === true ? 'manual' : SCOL[st] || null, edit });
}

// ---- vue de dessus ----
export function buildTop(room, g, scale, name, opts = {}) {
  const k = 1000 / scale, ops = [];
  // orientation : mur le plus long à l'horizontale
  let li = 0; g.walls.forEach((w, i) => { if (w.L > g.walls[li].L) li = i; });
  const a0 = -ang(g.walls[li].dir);
  const P = g.pts.map((p) => rot2(p, a0).map((v) => v * k));
  const R = (v) => rot2(v, a0);
  if (opts.ghost) ops.push({ t: 'poly', p: opts.ghost.map((p) => rot2(p, a0).map((v) => v * k)), close: true, w: 0.3, dash: true, color: 'ghost', layer: 'REPERE' });
  ops.push({ t: 'poly', p: P, close: true, w: 0.5, layer: 'MURS' });
  g.walls.forEach((w, i) => {
    const a = P[i], b = P[(i + 1) % P.length], dir = R(w.dir), nOut = R(w.nIn).map((v) => -v);
    // ouvertures sur le mur
    for (const o of g.openings.filter((q) => q.wall === i)) {
      const s0 = [a[0] + dir[0] * o.s * k, a[1] + dir[1] * o.s * k], s1 = [a[0] + dir[0] * (o.s + o.w) * k, a[1] + dir[1] * (o.s + o.w) * k];
      ops.push({ t: 'line', x1: s0[0], y1: s0[1], x2: s1[0], y2: s1[1], w: 1.4, color: 'paper', layer: 'OUVERTURES' });
      for (const s of [s0, s1]) ops.push({ t: 'line', x1: s[0] + nOut[0] * 1.2, y1: s[1] + nOut[1] * 1.2, x2: s[0] - nOut[0] * 1.2, y2: s[1] - nOut[1] * 1.2, w: 0.35, layer: 'OUVERTURES' });
      ops.push({ t: 'line', x1: s0[0], y1: s0[1], x2: s1[0], y2: s1[1], w: 0.13, layer: 'OUVERTURES' });
      const mid = [(s0[0] + s1[0]) / 2 - nOut[0] * 3.2, (s0[1] + s1[1]) / 2 - nOut[1] * 3.2];
      let rot = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI; if (rot > 90.5) rot -= 180; if (rot <= -89.5) rot += 180;
      ops.push({ t: 'text', x: mid[0], y: mid[1], str: `${o.type === 'porte' ? 'P' : o.type === 'fenetre' ? 'F' : 'O'} ${cm(o.w)}`, s: 2.2, rot, anchor: 'middle', layer: 'OUVERTURES', edit: { kind: 'opening', id: o.id } });
    }
    dim(ops, a, b, nOut, 7, cm(w.L), { kind: 'wall', i }, w.statut);
    // repère du mur
    const mid = [(a[0] + b[0]) / 2 - nOut[0] * 5.5, (a[1] + b[1]) / 2 - nOut[1] * 5.5];
    ops.push({ t: 'text', x: mid[0], y: mid[1], str: `M${i + 1}`, s: 2.6, anchor: 'middle', bold: true, layer: 'TEXTE', color: 'accent', edit: { kind: 'page', page: i + 1 } });
  });
  // repère des angles, angles hors équerre, hauteurs par angle
  g.angles.forEach((deg, i) => {
    const w0 = g.walls[(i - 1 + P.length) % P.length], w1 = g.walls[i];
    const bis = R([w1.nIn[0] + w0.nIn[0], w1.nIn[1] + w0.nIn[1]]); const L = Math.hypot(...bis) || 1, u = [bis[0] / L, bis[1] / L];
    ops.push({ t: 'text', x: P[i][0] - u[0] * 3.2, y: P[i][1] - u[1] * 3.2, str: `A${i + 1}`, s: 1.9, anchor: 'middle', layer: 'TEXTE', color: 'muted' });
    if (Math.abs(deg - 90) >= 0.5 || (room.square && Math.abs(deg - 90) >= 0.05)) ops.push({ t: 'text', x: P[i][0] + u[0] * 6, y: P[i][1] + u[1] * 6, str: `${deg.toFixed(1).replace('.', ',')}°`, s: 2, anchor: 'middle', layer: 'COTES' });
    if (g.hMode === 'angles') { const h = g.hs[i]; ops.push({ t: 'text', x: P[i][0] + u[0] * 11, y: P[i][1] + u[1] * 11, str: h.v != null ? `h ${cm(h.v)}${h.st === 'verifiee' ? ' V' : ''}` : 'h ?', s: 2.2, anchor: 'middle', bold: true, layer: 'TEXTE', color: h.st === 'verifiee' ? 'manual' : null, edit: { kind: 'height' } }); }
  });
  // texte central
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
  ops.push({ t: 'text', x: cx, y: cy - 4, str: name, s: 3.5, anchor: 'middle', bold: true, layer: 'TEXTE' });
  ops.push({ t: 'text', x: cx, y: cy + 1, str: `Sol ${m2(g.sol)} · périmètre ${cm(g.perimetre)}`, s: 2.3, anchor: 'middle', layer: 'TEXTE' });
  ops.push({ t: 'text', x: cx, y: cy + 5.5, str: hspText(g), s: 2.5, anchor: 'middle', layer: 'TEXTE', color: g.hMode === 'unique' && g.hs[0].st === 'verifiee' ? 'manual' : null, edit: { kind: 'height' } });
  if (g.plafond != null && Math.abs(g.plafond - g.sol) > 0.005) ops.push({ t: 'text', x: cx, y: cy + 9.5, str: `Plafond ${m2(g.plafond)}`, s: 2.2, anchor: 'middle', layer: 'TEXTE' });
  return ops;
}

// ---- élévation d'un mur (vu de l'intérieur) ----
export function buildElev(room, g, i, scale) {
  const k = 1000 / scale, ops = [], w = g.walls[i], L = w.L * k, st = g.wallStats[i], n = g.walls.length;
  const iL = w.flip ? (i + 1) % n : i, iR = w.flip ? i : (i + 1) % n; // angles à gauche / à droite, vus de l'intérieur
  if (!st.has) { ops.push({ t: 'poly', p: [[0, 0], [L, 0]], close: false, w: 0.5, layer: 'MURS' }); ops.push({ t: 'text', x: L / 2, y: -6, str: `Hauteur sous plafond non mesurée (A${iL + 1} ou A${iR + 1})`, s: 3, anchor: 'middle', layer: 'TEXTE', edit: { kind: 'height' } }); dim(ops, [0, 0], [L, 0], [0, 1], 6, cm(w.L), { kind: 'wall', i }, w.statut); return ops; }
  const hl = g.hs[iL].v, hr = g.hs[iR].v, Hm = Math.max(hl, hr) * k, HL = hl * k, HR = hr * k;
  ops.push({ t: 'poly', p: [[0, Hm], [L, Hm], [L, Hm - HR], [0, Hm - HL]], close: true, w: 0.5, layer: 'MURS' });
  const ops2 = g.openings.filter((o) => o.wall === i).map((o) => ({ o, x: openLeft(w, o) })).sort((a, b) => a.x - b.x);
  const chain = [0];
  for (const { o, x } of ops2) {
    const x0 = x * k, x1 = (x + o.w) * k, y1 = Hm - o.sill * k, y0 = Hm - (o.sill + o.h) * k;
    ops.push({ t: 'poly', p: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], close: true, w: 0.35, layer: 'OUVERTURES', fill: 'opening', edit: { kind: 'opening', id: o.id } });
    if (o.type === 'fenetre') ops.push({ t: 'line', x1: x0, y1: y0, x2: x1, y2: y1, w: 0.1, layer: 'OUVERTURES' }, { t: 'line', x1: x1, y1: y0, x2: x0, y2: y1, w: 0.1, layer: 'OUVERTURES' });
    ops.push({ t: 'text', x: (x0 + x1) / 2, y: (y0 + y1) / 2, str: `${o.type === 'porte' ? 'Porte' : o.type === 'fenetre' ? 'Fenêtre' : 'Ouverture'} ${cm(o.w)}×${cm(o.h)}`, s: 2.2, anchor: 'middle', layer: 'OUVERTURES', edit: { kind: 'opening', id: o.id } });
    if (o.sill > 0.005) dim(ops, [x1, Hm], [x1, y1], [1, 0], 3, cm(o.sill), { kind: 'opening', id: o.id }, o.manual || null);
    dim(ops, [x1, y1], [x1, y0], [1, 0], 3, cm(o.h), { kind: 'opening', id: o.id }, o.manual || null);
    chain.push(x, x + o.w);
  }
  chain.push(w.L);
  const cs = [...new Set(chain.map((v) => Math.round(v * 1000) / 1000))].sort((a, b) => a - b);
  if (cs.length > 2) for (let j = 0; j < cs.length - 1; j++) if (cs[j + 1] - cs[j] > 0.001) dim(ops, [cs[j] * k, Hm], [cs[j + 1] * k, Hm], [0, 1], 6, cm(cs[j + 1] - cs[j]), null, null);
  dim(ops, [0, Hm], [L, Hm], [0, 1], cs.length > 2 ? 13 : 6, cm(w.L), { kind: 'wall', i }, w.statut);
  const sl = g.hs[iL].st, sr = g.hs[iR].st;
  dim(ops, [0, Hm], [0, Hm - HL], [-1, 0], 6, cm(hl), { kind: 'height' }, sl === 'verifiee' ? 'verifiee' : null);
  if (g.hMode === 'angles') dim(ops, [L, Hm], [L, Hm - HR], [1, 0], 6, cm(hr), { kind: 'height' }, sr === 'verifiee' ? 'verifiee' : null);
  ops.push({ t: 'text', x: 0, y: Hm + 3.5, str: `A${iL + 1}`, s: 2, anchor: 'middle', layer: 'TEXTE', color: 'muted' }, { t: 'text', x: L, y: Hm + 3.5, str: `A${iR + 1}`, s: 2, anchor: 'middle', layer: 'TEXTE', color: 'muted' });
  ops.push({ t: 'text', x: L / 2, y: Hm - Math.max(HL, HR) - 5, str: `Surface brute ${m2(st.brut)} · ouvertures ${m2(st.ouv)} · nette ${m2(st.net)}`, s: 2.6, anchor: 'middle', layer: 'TEXTE' });
  for (const o of st.deborde) ops.push({ t: 'text', x: L / 2, y: Hm - Math.max(HL, HR) - 9, str: `Attention : ${o.type === 'porte' ? 'la porte' : 'la fenêtre'} ${cm(o.w)} dépasse du mur — corrigez sa position`, s: 2.4, anchor: 'middle', layer: 'TEXTE', color: 'adj', edit: { kind: 'opening', id: o.id } });
  return ops;
}

// Choix de l'échelle et de l'orientation ; retourne la page mise en place (mm)
export function layoutPage(buildFn, paper, forced, scales = SCALES) {
  const [pw, ph] = PAPER[paper];
  const tries = forced ? [forced] : scales;
  for (const sc of tries) {
    const ops = buildFn(sc), b = bbox(ops);
    for (const [W, Hh] of [[pw, ph], [ph, pw]].sort((x, y) => (b.w > b.h ? y[0] - x[0] : x[0] - y[0]))) {
      const aw = W - 2 * M, ah = Hh - 2 * M - TB - 4;
      if (b.w <= aw && b.h <= ah || forced) {
        const dx = M + (aw - b.w) / 2 - b.x0, dy = M + (ah - b.h) / 2 - b.y0;
        return { W, H: Hh, scale: sc, fits: b.w <= aw && b.h <= ah, ops: ops.map((o) => shift(o, dx, dy)) };
      }
    }
  }
  return null;
}
function shift(o, dx, dy) {
  if (o.t === 'line') return { ...o, x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
  if (o.t === 'poly') return { ...o, p: o.p.map((q) => [q[0] + dx, q[1] + dy]) };
  return { ...o, x: o.x + dx, y: o.y + dy };
}
export function titleBlock(page, info) {
  const { W, H } = page, y0 = H - M - TB, ops = [], c = 'CARTOUCHE';
  ops.push({ t: 'poly', p: [[M, M], [W - M, M], [W - M, H - M], [M, H - M]], close: true, w: 0.35, layer: c });
  ops.push({ t: 'line', x1: M, y1: y0, x2: W - M, y2: y0, w: 0.35, layer: c });
  const x2 = W - M - 58; ops.push({ t: 'line', x1: x2, y1: y0, x2: x2, y2: H - M, w: 0.2, layer: c });
  ops.push({ t: 'text', x: M + 3, y: y0 + 6, str: info.chantier || 'Chantier', s: 3.5, bold: true, layer: c });
  ops.push({ t: 'text', x: M + 3, y: y0 + 11.5, str: info.vue, s: 3, layer: c });
  ops.push({ t: 'text', x: M + 3, y: y0 + 17, str: info.note, s: 2.2, layer: c });
  ops.push({ t: 'text', x: x2 + 3, y: y0 + 7, str: `Échelle 1/${page.scale}`, s: 4, bold: true, layer: c });
  ops.push({ t: 'text', x: x2 + 3, y: y0 + 12.5, str: `${info.date} · cotes en cm`, s: 2.2, layer: c });
  // trait de contrôle d'impression : 5 cm sur papier
  ops.push({ t: 'line', x1: x2 + 3, y1: y0 + 17, x2: x2 + 53, y2: y0 + 17, w: 0.35, layer: c });
  ops.push({ t: 'line', x1: x2 + 3, y1: y0 + 15.8, x2: x2 + 3, y2: y0 + 18.2, w: 0.35, layer: c }, { t: 'line', x1: x2 + 53, y1: y0 + 15.8, x2: x2 + 53, y2: y0 + 18.2, w: 0.35, layer: c });
  ops.push({ t: 'text', x: x2 + 28, y: y0 + 20.3, str: `ce trait = 5 cm = ${(0.05 * page.scale).toLocaleString('fr-FR')} m réels`, s: 1.8, anchor: 'middle', layer: c });
  return ops;
}
export function summaryPage(chantier, rooms, paper, date) {
  const [W, H] = PAPER[paper], ops = [], L = 'TEXTE'; let y = M + 12;
  const tx = (x, str, sz = 2.8, bold = false) => ops.push({ t: 'text', x, y, str, s: sz, bold, layer: L });
  ops.push({ t: 'poly', p: [[M, M], [W - M, M], [W - M, H - M], [M, H - M]], close: true, w: 0.35, layer: 'CARTOUCHE' });
  tx(M + 5, `${chantier || 'Chantier'} — récapitulatif des surfaces (${date})`, 4.2, true); y += 10;
  for (const { name, g } of rooms) {
    if (y > H - 30) break;
    tx(M + 5, `${name} — sol ${m2(g.sol)} · périmètre ${cm(g.perimetre)} cm · ${hspText(g)}`, 3.2, true); y += 6;
    g.walls.forEach((w, i) => { const st = g.wallStats[i]; const h = !st.has ? '—' : Math.abs(st.ha - st.hb) < 0.005 ? cm(st.ha) : `${cm(st.ha)}/${cm(st.hb)}`; tx(M + 9, `M${i + 1} : ${cm(w.L)} × ${h} cm — brut ${st.has ? m2(st.brut) : '—'}, ouvertures ${m2(st.ouv)}, net ${st.has ? m2(st.net) : '—'}${w.statut === 'verifiee' ? ' (vérifiée au mètre)' : w.statut === 'ajustee' ? ' (ajustée)' : ''}`, 2.6); y += 4.8; });
    const t = g.wallStats.reduce((a, st) => ({ brut: a.brut + st.brut, ouv: a.ouv + st.ouv, net: a.net + st.net }), { brut: 0, ouv: 0, net: 0 });
    tx(M + 9, `Total murs : ${g.complet ? `brut ${m2(t.brut)}, ouvertures ${m2(t.ouv)}, net ${m2(t.net)}` : 'hauteurs incomplètes'} · plafond ${g.plafond != null ? m2(g.plafond) : '—'}`, 2.8, true); y += 10;
  }
  return { W, H, scale: null, title: 'Récap', ops };
}

// Toutes les pages d'une pièce
export function roomPages(room, chantier, opts) {
  const g = roomGeometry(room), date = new Date().toLocaleDateString('fr-FR'), pages = [];
  const top = layoutPage((sc) => buildTop(room, g, sc, room.name), opts.paper, opts.scale);
  if (top) { top.title = 'Vue de dessus'; top.ops.push(...titleBlock(top, { chantier, vue: `${room.name} — vue de dessus`, note: `V = vérifiée au mètre · A = ajustée pour fermer${room.square ? ' · angles proches de 90° mis d\'équerre' : ''}`, date })); pages.push(top); }
  g.walls.forEach((w, i) => {
    const p = layoutPage((sc) => buildElev(room, g, i, sc), opts.paper, opts.scale);
    if (p) { p.title = `M${i + 1}`; p.ops.push(...titleBlock(p, { chantier, vue: `${room.name} — élévation du mur M${i + 1} (vu de l'intérieur)`, note: 'V = vérifiée au mètre · A = ajustée pour fermer · * saisie à la main', date })); pages.push(p); }
  });
  return { g, pages };
}

/* ================= rendus ================= */
const COL = { adj: '#c26a00', muted: '#6b747a', ghost: '#9aa3a8', manual: '#1f6fd1', accent: '#b07800', paper: '#ffffff', opening: 'rgba(200,64,47,.10)', wall: '#8f969b', paper2: '#ffffff', sel: 'rgba(240,180,0,.18)' };
const escX = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function toSVG(page) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.W} ${page.H}" width="${page.W}mm" height="${page.H}mm" font-family="Helvetica, Arial, sans-serif"><rect width="${page.W}" height="${page.H}" fill="#fff"/>`;
  const groups = new Map(); const order = [];
  for (const o of page.ops) { if (o.hidden) continue; const k = o.sid || ''; if (!groups.has(k)) { groups.set(k, []); order.push(k); } groups.get(k).push(o); }
  for (const k of order) {
    if (k) s += `<g data-sid="${k}">`;
    for (const o of groups.get(k)) {
      const ed = o.edit ? ` data-edit='${JSON.stringify(o.edit)}' class="ed"` : '';
      if (o.t === 'line') s += `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${COL[o.color] || '#111'}" stroke-width="${o.w}" stroke-linecap="round"/>`;
      else if (o.t === 'poly') s += `<${o.close ? 'polygon' : 'polyline'} points="${o.p.map((q) => q.join(',')).join(' ')}" fill="${o.fill ? COL[o.fill] : 'none'}" stroke="${o.w ? COL[o.color] || '#111' : 'none'}" stroke-width="${o.w || 0}" stroke-linejoin="round"${o.dash ? ' stroke-dasharray="1.6 1.2"' : ''}${ed}/>`;
      else if (o.t === 'text') {
        const tr = `translate(${o.x},${o.y})${o.rot ? ` rotate(${o.rot})` : ''}`;
        if (o.edit) { const w = Math.max(8, o.s * 0.6 * o.str.length + 4), h = o.s + 4; s += `<rect transform="${tr}" x="${-(o.anchor === 'middle' ? w / 2 : 2)}" y="${-h / 2}" width="${w}" height="${h}" fill="transparent"${ed}/>`; }
        s += `<text transform="${tr}" font-size="${o.s}" dominant-baseline="central" text-anchor="${o.anchor === 'middle' ? 'middle' : 'start'}" fill="${COL[o.color] || '#111'}"${o.bold ? ' font-weight="bold"' : ''} style="pointer-events:none">${escX(o.str)}</text>`;
      }
    }
    if (k) s += '</g>';
  }
  return s + '</svg>';
}
export function drawCanvas(ctx, page, pxPerMm) {
  ctx.save(); ctx.scale(pxPerMm, pxPerMm); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, page.W, page.H); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const o of page.ops) {
    if (o.hidden) continue;
    if (o.t === 'line') { ctx.strokeStyle = COL[o.color] || '#111'; ctx.lineWidth = o.w; ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke(); }
    else if (o.t === 'poly') { ctx.beginPath(); o.p.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); if (o.close) ctx.closePath(); if (o.fill) { ctx.fillStyle = COL[o.fill]; ctx.fill(); } if (o.w) { ctx.strokeStyle = '#111'; ctx.lineWidth = o.w; ctx.stroke(); } }
    else if (o.t === 'text') { ctx.save(); ctx.translate(o.x, o.y); if (o.rot) ctx.rotate((o.rot * Math.PI) / 180); ctx.font = `${o.bold ? 'bold ' : ''}${o.s}px Helvetica, Arial, sans-serif`; ctx.fillStyle = COL[o.color] || '#111'; ctx.textAlign = o.anchor === 'middle' ? 'center' : 'left'; ctx.textBaseline = 'middle'; ctx.fillText(o.str, 0, 0); ctx.restore(); }
  }
  ctx.restore();
}

// ---- PDF vectoriel minimal (Helvetica, WinAnsi) ----
const WIN = { '€': 128, '‚': 130, '„': 132, '…': 133, '–': 150, '—': 151, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, 'œ': 156, 'Œ': 140 };
function pdfStr(s) {
  let out = '(';
  for (const ch of s) {
    let c = WIN[ch] ?? ch.charCodeAt(0);
    if (c > 255) c = 63;
    if (c === 40 || c === 41 || c === 92) out += '\\' + String.fromCharCode(c);
    else if (c < 32 || c > 126) out += '\\' + c.toString(8).padStart(3, '0');
    else out += String.fromCharCode(c);
  }
  return out + ')';
}
const HW = 0.52; // largeur moyenne approchée d'un caractère Helvetica (em)
export function toPDF(pages) {
  const k = 72 / 25.4, f = (v) => (Math.round(v * 1000) / 1000).toString();
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesId = objs.length + 1; objs.push(null);
  const kids = [];
  for (const pg of pages) {
    const Y = (y) => (pg.H - y) * k; let c = '1 J 1 j\n';
    for (const o of pg.ops) {
      if (o.hidden) continue;
      const col = o.color === 'manual' ? '0.12 0.44 0.82' : o.color === 'adj' ? '0.76 0.42 0' : o.color === 'muted' ? '0.42 0.45 0.48' : o.color === 'accent' ? '0.69 0.47 0' : o.color === 'paper' ? '1 1 1' : '0.07 0.07 0.07';
      if (o.t === 'line') c += `${col} RG ${f(o.w * k)} w ${f(o.x1 * k)} ${f(Y(o.y1))} m ${f(o.x2 * k)} ${f(Y(o.y2))} l S\n`;
      else if (o.t === 'poly') {
        const path = o.p.map((q, i) => `${f(q[0] * k)} ${f(Y(q[1]))} ${i ? 'l' : 'm'}`).join(' ') + (o.close ? ' h' : '');
        if (o.fill) c += `${o.fill === 'wall' ? '0.56 0.59 0.61' : '0.98 0.92 0.91'} rg ${path} f\n`;
        if (o.w) c += `0.07 0.07 0.07 RG ${f(o.w * k)} w ${path} S\n`;
      } else if (o.t === 'text') {
        const r = ((o.rot || 0) * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), w = o.anchor === 'middle' ? o.str.length * HW * o.s : 0;
        // repère texte : origine au point (x,y), rotation (sens horaire sur la feuille = négatif en PDF)
        // point de base : centre - w/2 le long du texte + 0,35·taille vers le bas du texte (repère feuille, y vers le bas)
        const bx = o.x - (w / 2) * cs - 0.35 * o.s * sn, by = o.y - (w / 2) * sn + 0.35 * o.s * cs;
        const tx = bx * k, ty = Y(by);
        c += `BT ${col.replace(/ RG$/, '')} rg /${o.bold ? 'F2' : 'F1'} ${f(o.s * k * 1.0)} Tf ${f(cs)} ${f(-sn)} ${f(sn)} ${f(cs)} ${f(tx)} ${f(ty)} Tm ${pdfStr(o.str)} Tj ET\n`;
      }
    }
    const cont = add(`<< /Length ${c.length} >>\nstream\n${c}endstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(pg.W * k)} ${f(pg.H * k)}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> /Contents ${cont} 0 R >>`));
  }
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((i) => i + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}

// ---- DXF R12 (millimètres, taille réelle 1:1) ----
export function toDXF(pages) {
  const L = [], e = (...a) => L.push(...a.map(String));
  const dxfText = (s) => [...s].map((ch) => (ch.charCodeAt(0) > 126 ? `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}` : ch)).join('');
  e(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  const layers = ['MURS', 'OUVERTURES', 'COTES', 'TEXTE'];
  e(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.length);
  layers.forEach((n, i) => e(0, 'LAYER', 2, n, 70, 0, 62, [7, 1, 3, 5][i], 6, 'CONTINUOUS'));
  e(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
  let ox = 0;
  for (const pg of pages) {
    const s = pg.scale || 1, X = (x) => ox + x * s, Y = (y) => -y * s;
    for (const o of pg.ops) {
      if (o.hidden || o.layer === 'CARTOUCHE' || o.color === 'paper' || (o.t === 'poly' && !o.w)) continue;
      if (o.t === 'line') e(0, 'LINE', 8, o.layer, 10, X(o.x1).toFixed(2), 20, Y(o.y1).toFixed(2), 11, X(o.x2).toFixed(2), 21, Y(o.y2).toFixed(2));
      else if (o.t === 'poly') { const P = o.close ? [...o.p, o.p[0]] : o.p; for (let i = 0; i < P.length - 1; i++) e(0, 'LINE', 8, o.layer, 10, X(P[i][0]).toFixed(2), 20, Y(P[i][1]).toFixed(2), 11, X(P[i + 1][0]).toFixed(2), 21, Y(P[i + 1][1]).toFixed(2)); }
      else if (o.t === 'text') e(0, 'TEXT', 8, o.layer, 10, X(o.x).toFixed(2), 20, Y(o.y).toFixed(2), 40, (o.s * 0.75 * s).toFixed(2), 1, dxfText(o.str), 50, (-(o.rot || 0)).toFixed(2), 72, o.anchor === 'middle' ? 1 : 0, 73, 2, 11, X(o.x).toFixed(2), 21, Y(o.y).toFixed(2));
    }
    ox += (pg.W * s) + 1000;
  }
  e(0, 'ENDSEC', 0, 'EOF');
  return L.join('\r\n');
}

/* ================= plan d'étage (toutes les pièces) ================= */
// place[sid] = { x, y, a } : position de chaque séance de relevé sur le plan d'ensemble (m, rad)
const tf = (T) => (p) => { const q = rot2(p, T.a || 0); return [q[0] + (T.x || 0), q[1] + (T.y || 0)]; };
export function withDefaultPlacement(rooms, place) {
  const pl = { ...(place || {}) }, sids = [...new Set(rooms.map((r) => r.sid || 'sans'))];
  const bb = (list) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; list.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }); return { x0, y0, x1, y1 }; };
  const ptsOf = (sid, T) => rooms.filter((r) => (r.sid || 'sans') === sid).flatMap((r) => roomGeometry(r).pts.map(tf(T)));
  let placed = sids.filter((s) => pl[s]);
  if (!placed.length && sids.length) { pl[sids[0]] = { x: 0, y: 0, a: 0 }; placed = [sids[0]]; }
  for (const sid of sids) {
    if (pl[sid]) continue;
    const g = bb(placed.flatMap((s) => ptsOf(s, pl[s]))), b = bb(ptsOf(sid, { x: 0, y: 0, a: 0 }));
    pl[sid] = { x: g.x1 + 1 - b.x0, y: g.y0 - b.y0, a: 0 }; placed.push(sid);
  }
  return pl;
}
export function floorModel(rooms, place) {
  const pl = withDefaultPlacement(rooms, place);
  const items = rooms.map((room) => {
    const g = roomGeometry(room), T = pl[room.sid || 'sans'], f = tf(T), a = T.a || 0;
    const walls = g.walls.map((w) => ({ ...w, a: f(w.a), b: f(w.b), dir: rot2(w.dir, a), nIn: rot2(w.nIn, a), room, paired: 0 }));
    return { room, g, P: g.pts.map(f), walls };
  });
  // cloisons : murs de deux pièces différentes, parallèles, face à face, à moins de 45 cm
  const parts = [];
  for (let i = 0; i < items.length; i++) for (let j = 0; j < items.length; j++) {
    if (i === j) continue;
    for (const A of items[i].walls) for (const B of items[j].walls) {
      if (A.nIn[0] * B.nIn[0] + A.nIn[1] * B.nIn[1] > -0.995) continue;
      const out = [-A.nIn[0], -A.nIn[1]], d = (B.a[0] - A.a[0]) * out[0] + (B.a[1] - A.a[1]) * out[1];
      if (d < 0.02 || d > 0.45) continue;
      const tb0 = (B.a[0] - A.a[0]) * A.dir[0] + (B.a[1] - A.a[1]) * A.dir[1], tb1 = (B.b[0] - A.a[0]) * A.dir[0] + (B.b[1] - A.a[1]) * A.dir[1];
      const lo = Math.max(0, Math.min(tb0, tb1)), hi = Math.min(A.L, Math.max(tb0, tb1));
      if (hi - lo < 0.1) continue;
      A.paired += hi - lo;
      if (i < j) parts.push({ A, lo, hi, d });
    }
  }
  // orientation de la feuille : mur le plus long de la première séance à l'horizontale
  const ref = items.filter((it) => (it.room.sid || 'sans') === Object.keys(pl)[0]).flatMap((it) => it.walls);
  let lw = ref[0] || items[0]?.walls[0]; ref.forEach((w) => { if (w.L > lw.L) lw = w; });
  const ga = lw ? -ang(lw.dir) : 0;
  return { items, parts, place: pl, ga };
}
function chainDims(ops, pts, side, base, k) {
  // pts : [[coord le long du côté, position de l'arête]], side : 'b','t','l','r' ; base : ligne extérieure (mm)
  const horiz = side === 'b' || side === 't', sg = side === 'b' || side === 'r' ? 1 : -1;
  const u = [...new Set(pts.map((p) => Math.round(p[0] * 10) / 10))].sort((a, b) => a - b);
  if (u.length < 2) return;
  const line = base + sg * 8, over = base + sg * 15, nOut = horiz ? [0, sg] : [sg, 0];
  const P = (c, v) => (horiz ? [c, v] : [v, c]);
  for (const [c, e] of pts) { const a = P(c, e + sg * 1), b = P(c, (u.length > 2 ? over : line) + sg * 1.5); ops.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 0.13, layer: 'COTES' }); }
  const seg = (c0, c1, v, lab) => {
    const a = P(c0, v), b = P(c1, v); ops.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 0.18, layer: 'COTES' });
    const dvec = horiz ? [1, 0] : [0, 1];
    for (const c of [a, b]) ops.push({ t: 'line', x1: c[0] - (dvec[0] + nOut[0]) * 0.85, y1: c[1] - (dvec[1] + nOut[1]) * 0.85, x2: c[0] + (dvec[0] + nOut[0]) * 0.85, y2: c[1] + (dvec[1] + nOut[1]) * 0.85, w: 0.35, layer: 'COTES' });
    const m = P((c0 + c1) / 2, v + sg * 2.2); ops.push({ t: 'text', x: m[0], y: m[1], str: lab, s: 2.3, rot: horiz ? 0 : -90, anchor: 'middle', layer: 'COTES' });
  };
  for (let i = 0; i < u.length - 1; i++) if (u[i + 1] - u[i] > 1) seg(u[i], u[i + 1], line, String(Math.round(((u[i + 1] - u[i]) * 100) / k)));
  if (u.length > 2) seg(u[0], u[u.length - 1], over, String(Math.round(((u[u.length - 1] - u[0]) * 100) / k)));
}
export function buildFloor(model, scale) {
  const k = 1000 / scale, ops = [], R = (p) => rot2(p, model.ga).map((v) => v * k), Rv = (v) => rot2(v, model.ga);
  for (const pt of model.parts) {
    const A = pt.A, out = [-A.nIn[0], -A.nIn[1]];
    const q = [[A.a[0] + A.dir[0] * pt.lo, A.a[1] + A.dir[1] * pt.lo], [A.a[0] + A.dir[0] * pt.hi, A.a[1] + A.dir[1] * pt.hi]];
    const quad = [q[0], q[1], [q[1][0] + out[0] * pt.d, q[1][1] + out[1] * pt.d], [q[0][0] + out[0] * pt.d, q[0][1] + out[1] * pt.d]].map(R);
    ops.push({ t: 'poly', p: quad, close: true, w: 0, fill: 'wall', layer: 'MURS' });
    if ((pt.hi - pt.lo) * k > 12) { const c = quad.reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4], [0, 0]), dr = Rv(A.dir), n = Rv(out); let rot = (Math.atan2(dr[1], dr[0]) * 180) / Math.PI; if (rot > 90.5) rot -= 180; if (rot <= -89.5) rot += 180; ops.push({ t: 'text', x: c[0] + dr[0] * 8, y: c[1] + dr[1] * 8, str: cm(pt.d), s: 1.7, rot, anchor: 'middle', layer: 'COTES', color: 'paper2' }); }
  }
  const all = [];
  for (const it of model.items) {
    const st = ops.length, r = it.room, sid = r.sid || 'sans', P = it.P.map(R); all.push(...P);
    ops.push({ t: 'poly', p: P, close: true, w: 0.45, layer: 'MURS' });
    ops.push({ t: 'poly', p: P, close: true, w: 0, hidden: true, meta: { room: r.id, sid } });
    // pièce étroite (placard, couloir fin) : étiquette compacte, cotes des grands murs omises
    let lw0 = it.walls[0]; it.walls.forEach((w) => { if (w.L > lw0.L) lw0 = w; });
    const ext = it.P.map((p) => [(p[0]) * lw0.dir[0] + p[1] * lw0.dir[1], -p[0] * lw0.dir[1] + p[1] * lw0.dir[0]]);
    const narrow = (Math.max(...ext.map((e) => e[1])) - Math.min(...ext.map((e) => e[1]))) * k < 22;
    it.walls.forEach((w, i) => {
      const a = R(w.a), b = R(w.b), dir = Rv(w.dir), nIn = Rv(w.nIn);
      ops.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 0, hidden: true, meta: { wall: i, room: r.id, sid } });
      for (const o of it.g.openings.filter((q) => q.wall === i)) {
        const s0 = [a[0] + dir[0] * o.s * k, a[1] + dir[1] * o.s * k], s1 = [a[0] + dir[0] * (o.s + o.w) * k, a[1] + dir[1] * (o.s + o.w) * k];
        ops.push({ t: 'line', x1: s0[0], y1: s0[1], x2: s1[0], y2: s1[1], w: 0.9, color: 'paper', layer: 'OUVERTURES' });
        for (const s of [s0, s1]) ops.push({ t: 'line', x1: s[0] - nIn[0] * 0.8, y1: s[1] - nIn[1] * 0.8, x2: s[0] + nIn[0] * 0.8, y2: s[1] + nIn[1] * 0.8, w: 0.3, layer: 'OUVERTURES' });
        ops.push({ t: 'line', x1: s0[0], y1: s0[1], x2: s1[0], y2: s1[1], w: 0.1, layer: 'OUVERTURES' });
      }
      if (w.L * k > 8 && (!narrow || w.L * k < 30)) dim(ops, a, b, nIn, 2.2, cm(w.L), { kind: 'wall', i, roomId: r.id }, w.statut, true);
    });
    // étiquette de la pièce (centre de gravité, ou moyenne des coins s'il tombe dehors)
    let A2 = 0, cx = 0, cy = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], c = p[0] * q[1] - q[0] * p[1]; A2 += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
    let C = [cx / (3 * A2), cy / (3 * A2)]; if (!inside2(C, P)) C = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]);
    if (narrow) {
      const dr = Rv(lw0.dir); let rot = (Math.atan2(dr[1], dr[0]) * 180) / Math.PI; if (rot > 90.5) rot -= 180; if (rot <= -89.5) rot += 180;
      ops.push({ t: 'text', x: C[0], y: C[1], str: `${r.name.toUpperCase()} ${m2(it.g.sol)}`, s: 1.9, rot, anchor: 'middle', bold: true, layer: 'TEXTE', edit: { kind: 'room', roomId: r.id } });
    } else {
      ops.push({ t: 'text', x: C[0], y: C[1] - 3.2, str: r.name.toUpperCase(), s: 2.8, anchor: 'middle', bold: true, layer: 'TEXTE', edit: { kind: 'room', roomId: r.id } });
      ops.push({ t: 'text', x: C[0], y: C[1] + 0.6, str: m2(it.g.sol), s: 2.2, anchor: 'middle', layer: 'TEXTE' });
      ops.push({ t: 'text', x: C[0], y: C[1] + 4, str: hspText(it.g), s: 2.1, anchor: 'middle', layer: 'TEXTE', edit: { kind: 'height', roomId: r.id } });
    }
    for (let j = st; j < ops.length; j++) ops[j].sid = sid;
  }
  if (!all.length) return ops;
  // cotes extérieures : murs sans cloison en face, par côté de la feuille
  const X = all.map((p) => p[0]), Y = all.map((p) => p[1]), bx = [Math.min(...X), Math.max(...X)], by = [Math.min(...Y), Math.max(...Y)];
  const sides = { b: [], t: [], l: [], r: [] };
  for (const it of model.items) for (const w of it.walls) {
    if (w.paired > w.L * 0.5) continue;
    const out = Rv([-w.nIn[0], -w.nIn[1]]), a = R(w.a), b = R(w.b);
    if (out[1] > 0.95) sides.b.push([a[0], a[1]], [b[0], b[1]]); else if (out[1] < -0.95) sides.t.push([a[0], a[1]], [b[0], b[1]]);
    else if (out[0] > 0.95) sides.r.push([a[1], a[0]], [b[1], b[0]]); else if (out[0] < -0.95) sides.l.push([a[1], a[0]], [b[1], b[0]]);
  }
  chainDims(ops, sides.b, 'b', by[1], k); chainDims(ops, sides.t, 't', by[0], k);
  chainDims(ops, sides.r, 'r', bx[1], k); chainDims(ops, sides.l, 'l', bx[0], k);
  return ops;
}
export function floorPage(rooms, place, chantier, paper, forced) {
  const model = floorModel(rooms, place);
  const pg = layoutPage((sc) => buildFloor(model, sc), paper, forced, [50, 100, 200]);
  if (!pg) return null;
  const tot = model.items.reduce((s, it) => s + it.g.sol, 0);
  pg.ops.push(...titleBlock(pg, { chantier, vue: `Plan d'ensemble — ${model.items.length} pièce(s), ${m2(tot)} au sol`, note: 'Cotes intérieures en cm · * cote saisie à la main · murs extérieurs sans épaisseur', date: new Date().toLocaleDateString('fr-FR') }));
  pg.title = 'Plan'; pg.ga = model.ga; pg.place = model.place;
  return pg;
}

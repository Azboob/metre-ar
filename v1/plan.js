// Métré AR — plan de pièce (v1) : géométrie, corrections, dessin, PDF.
// Unités internes : mètres. Plan 2D : x vers la droite, y = z du repère AR (vers le bas sur la feuille).

/* ================= outils 2D ================= */
export const d2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const ang = (v) => Math.atan2(v[1], v[0]);
const rot2 = (p, a) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
export function area2(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
export const perim = (pts) => pts.reduce((s, p, i) => s + d2(p, pts[(i + 1) % pts.length]), 0);
function inside2(p, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segCross(a, b, c, d) {
  const d1 = cross2(c, d, a), d2_ = cross2(c, d, b), d3 = cross2(a, b, c), d4 = cross2(a, b, d);
  if (((d1 > 0 && d2_ < 0) || (d1 < 0 && d2_ > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p, q, r) => Math.abs(cross2(p, q, r)) < 1e-9 && Math.min(p[0], q[0]) - 1e-9 <= r[0] && r[0] <= Math.max(p[0], q[0]) + 1e-9 && Math.min(p[1], q[1]) - 1e-9 <= r[1] && r[1] <= Math.max(p[1], q[1]) + 1e-9;
  return on(c, d, a) || on(c, d, b) || on(a, b, c) || on(a, b, d);
}

/* ================= contrôle du contour ================= */
// Retourne null si le contour est acceptable, sinon { raison, murs? }
export function checkContour(pts) {
  const n = pts.length;
  if (n < 3) return { raison: 'Il faut au moins 3 angles pour fermer le contour.' };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (d2(pts[i], pts[j]) < 0.05) return { raison: `Les angles A${i + 1} et A${j + 1} sont à moins de 5 cm l'un de l'autre.`, angles: [i, j] };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue; // murs voisins
    if (segCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return { raison: `Le contour se croise : les murs M${i + 1} et M${j + 1} se coupent.`, murs: [i, j] };
  }
  if (Math.abs(area2(pts)) < 0.5) return { raison: 'Surface inférieure à 0,5 m² : vérifiez les angles visés.' };
  return null;
}

/* ================= projection au sol ================= */
// angles bruts [x,y,z] → hauteur de sol commune (médiane) + points 2D
export function projectFloor(raw) {
  const ys = raw.map((p) => p[1]).sort((a, b) => a - b), m = ys.length;
  const y = m % 2 ? ys[(m - 1) / 2] : (ys[m / 2 - 1] + ys[m / 2]) / 2;
  return { y, plan: raw.map((p) => [p[0], p[2]]), ecarts: raw.map((p) => Math.abs(p[1] - y)) };
}

/* ================= géométrie avec corrections ================= */
// rel.angles[i].plan, rel.verifications[{mur:{de,a}, longueurVerifiee}], rel.ajusterAngles (bool)
export function wallIndex(rel, v) { const n = rel.angles.length; return rel.angles.findIndex((a, i) => a.id === v.mur.de && rel.angles[(i + 1) % n].id === v.mur.a); }
export function geometry(rel, overrideVerifs, forceAngles) {
  const P0 = rel.angles.map((a) => a.plan), n = P0.length;
  const LAR = P0.map((p, i) => d2(p, P0[(i + 1) % n]));
  const verifs = overrideVerifs || rel.verifications || [];
  const ver = new Array(n).fill(null);
  verifs.forEach((v) => { const i = wallIndex(rel, v); if (i >= 0) ver[i] = v.longueurVerifiee; });
  const nVer = ver.filter((v) => v != null).length;
  let pts = P0.map((p) => [...p]), methode = 'mesure AR', ok = true, ecartFermeture = 0;
  if (nVer) {
    const r = solveDirections(P0, LAR, ver);
    if (r.ok && !(forceAngles ?? rel.ajusterAngles)) { pts = r.pts; methode = 'directions conservées'; }
    else if (forceAngles ?? rel.ajusterAngles) { pts = solveAngles(P0, LAR, ver); methode = 'angles ajustés'; }
    else { ok = false; ecartFermeture = r.gap; methode = 'impossible sans ajuster les angles'; }
  }
  const walls = pts.map((a, i) => {
    const b = pts[(i + 1) % n], L = d2(a, b), st = ver[i] != null ? 'verifiee' : Math.abs(L - LAR[i]) > 0.0005 ? 'ajustee' : 'AR';
    return { i, a, b, L, LAR: LAR[i], Lver: ver[i], statut: st, delta: L - LAR[i] };
  });
  // angles intérieurs (degrés)
  const sg = area2(pts) > 0 ? 1 : -1;
  const angles = pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n], t = wrapPi(ang([c[0] - p[0], c[1] - p[1]]) - ang([p[0] - a[0], p[1] - a[1]]));
    return 180 - (sg * t * 180) / Math.PI;
  });
  return { ok, methode, ecartFermeture, pts, walls, angles, surface: Math.abs(area2(pts)), surfaceAR: Math.abs(area2(P0)), perimetre: perim(pts), residu: walls.filter((w) => w.Lver != null).reduce((m, w) => Math.max(m, Math.abs(w.L - w.Lver)), 0) };
}
// Directions de murs conservées ; longueurs vérifiées figées ; autres longueurs ajustées au minimum (moindres carrés) pour fermer.
function solveDirections(P0, LAR, ver) {
  const n = P0.length, U = P0.map((p, i) => { const q = P0[(i + 1) % n], L = d2(p, q) || 1; return [(q[0] - p[0]) / L, (q[1] - p[1]) / L]; });
  const L = LAR.map((l, i) => (ver[i] != null ? ver[i] : l)), F = L.map((_, i) => i).filter((i) => ver[i] == null);
  const sum = [0, 0]; L.forEach((l, i) => { sum[0] += l * U[i][0]; sum[1] += l * U[i][1]; });
  const gap = Math.hypot(sum[0], sum[1]);
  let a11 = 0, a12 = 0, a22 = 0; F.forEach((i) => { a11 += U[i][0] ** 2; a12 += U[i][0] * U[i][1]; a22 += U[i][1] ** 2; });
  const det = a11 * a22 - a12 * a12;
  if (F.length < 2 || Math.abs(det) < 1e-6) return { ok: false, gap };
  const e = [-sum[0], -sum[1]], l0 = (a22 * e[0] - a12 * e[1]) / det, l1 = (-a12 * e[0] + a11 * e[1]) / det;
  F.forEach((i) => { L[i] += U[i][0] * l0 + U[i][1] * l1; });
  if (L.some((l) => l <= 0.02)) return { ok: false, gap };
  const pts = [[...P0[0]]]; for (let i = 0; i < n - 1; i++) pts.push([pts[i][0] + L[i] * U[i][0], pts[i][1] + L[i] * U[i][1]]);
  return { ok: true, pts, gap };
}
// Ajustement des angles accepté : moindres carrés non linéaires sur les positions des angles
// (longueurs vérifiées très pondérées, longueurs AR et angles d'origine faiblement).
function solveAngles(P0, LAR, ver) {
  const n = P0.length, turn0 = P0.map((p, i) => { const a = P0[(i - 1 + n) % n], c = P0[(i + 1) % n]; return wrapPi(ang([c[0] - p[0], c[1] - p[1]]) - ang([p[0] - a[0], p[1] - a[1]])); });
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
    const A = Array.from({ length: N }, (_, a) => Array.from({ length: N }, (_, b) => { let s = 0; for (let k = 0; k < m; k++) s += J[a][k] * J[b][k]; return s + (a === b ? lam : 0); }));
    const g = Array.from({ length: N }, (_, a) => { let s = 0; for (let k = 0; k < m; k++) s -= J[a][k] * r0[k]; return s; });
    const dx = solveLin(A, g); if (!dx) break;
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

/* ================= dessin (mm papier) ================= */
export const PAPER = { A4: [210, 297], A3: [297, 420] };
const SCALES = [10, 20, 25, 50, 100];
const M = 10, TB = 30;
export const cm = (m) => String(Math.round(m * 100));
export const m2 = (a) => a.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²';
const SUFFIX = { AR: '', verifiee: ' V', ajustee: ' A' };
const STCOL = { AR: null, verifiee: 'ver', ajustee: 'adj' };

function bbox(ops) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const o of ops) {
    if (o.t === 'line') { add(o.x1, o.y1); add(o.x2, o.y2); }
    else if (o.t === 'poly') o.p.forEach((q) => add(q[0], q[1]));
    else if (o.t === 'text') { const w = o.s * 0.55 * o.str.length, h = o.s, r = ((o.rot || 0) * Math.PI) / 180, ex = Math.abs(Math.cos(r)) * w / 2 + Math.abs(Math.sin(r)) * h / 2, ey = Math.abs(Math.sin(r)) * w / 2 + Math.abs(Math.cos(r)) * h / 2; add(o.x - ex, o.y - ey); add(o.x + ex, o.y + ey); }
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
function dim(ops, p, q, nOut, off, label, color, edit, ts = 1) {
  off *= ts;
  const a = [p[0] + nOut[0] * off, p[1] + nOut[1] * off], b = [q[0] + nOut[0] * off, q[1] + nOut[1] * off];
  for (const [s, e] of [[p, a], [q, b]]) ops.push({ t: 'line', x1: s[0] + nOut[0] * ts, y1: s[1] + nOut[1] * ts, x2: e[0] + nOut[0] * 1.5 * ts, y2: e[1] + nOut[1] * 1.5 * ts, w: 0.13 * ts });
  ops.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], w: 0.18 * ts, color });
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) return;
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  for (const c of [a, b]) ops.push({ t: 'line', x1: c[0] - (u[0] + nOut[0]) * 0.85 * ts, y1: c[1] - (u[1] + nOut[1]) * 0.85 * ts, x2: c[0] + (u[0] + nOut[0]) * 0.85 * ts, y2: c[1] + (u[1] + nOut[1]) * 0.85 * ts, w: 0.35 * ts, color });
  let rot = (Math.atan2(u[1], u[0]) * 180) / Math.PI; if (rot > 90.5) rot -= 180; if (rot <= -89.5) rot += 180;
  ops.push({ t: 'text', x: (a[0] + b[0]) / 2 + nOut[0] * 2.4 * ts, y: (a[1] + b[1]) / 2 + nOut[1] * 2.4 * ts, str: label, s: 2.6 * ts, rot, anchor: 'middle', color, edit, bold: color === 'ver' });
}
// Dessin du contour ; k = mm papier par mètre. Retourne des ops en mm (origine arbitraire).
export function drawRoom(rel, g, k, opts = {}) {
  const ops = [], n = g.pts.length, ts = opts.ts || 1;
  let li = 0; g.walls.forEach((w, i) => { if (w.L > g.walls[li].L) li = i; });
  const a0 = -ang([g.walls[li].b[0] - g.walls[li].a[0], g.walls[li].b[1] - g.walls[li].a[1]]);
  const R = (p) => rot2(p, a0).map((v) => v * k);
  const P = g.pts.map(R), sg = area2(P) > 0 ? 1 : -1;
  if (opts.ghost) ops.push({ t: 'poly', p: opts.ghost.map(R), close: true, w: 0.25 * ts, color: 'ghost', dash: true });
  ops.push({ t: 'poly', p: P, close: true, w: 0.6 * ts, fill: 'floor' });
  g.walls.forEach((w, i) => {
    const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dir = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const nOut = [dir[1] * sg, -dir[0] * sg];
    const label = `${cm(w.L)}${SUFFIX[w.statut]}`;
    dim(ops, a, b, nOut, 7, label, STCOL[w.statut], { kind: 'wall', i }, ts);
    ops.push({ t: 'text', x: (a[0] + b[0]) / 2 - nOut[0] * 3.5 * ts, y: (a[1] + b[1]) / 2 - nOut[1] * 3.5 * ts, str: `M${i + 1}`, s: 2.2 * ts, anchor: 'middle', color: 'muted', edit: { kind: 'wall', i } });
  });
  P.forEach((p, i) => {
    const pa = P[(i - 1 + n) % n], pc = P[(i + 1) % n];
    const u1 = [pa[0] - p[0], pa[1] - p[1]], u2 = [pc[0] - p[0], pc[1] - p[1]], l1 = Math.hypot(...u1) || 1, l2 = Math.hypot(...u2) || 1;
    let bis = [u1[0] / l1 + u2[0] / l2, u1[1] / l1 + u2[1] / l2]; const bl = Math.hypot(...bis);
    bis = bl < 1e-6 ? [-u1[1] / l1 * sg, u1[0] / l1 * sg] : [bis[0] / bl, bis[1] / bl];
    if (!inside2([p[0] + bis[0] * 0.5, p[1] + bis[1] * 0.5], P)) bis = [-bis[0], -bis[1]];
    const deg = g.angles[i], alert = opts.ecarts && opts.ecarts[i] > 0.03;
    if (opts.heights && opts.heightsMode === 'angles' && opts.heights[i].v != null) ops.push({ t: 'text', x: p[0] + bis[0] * 14 * ts, y: p[1] + bis[1] * 14 * ts, str: `h ${cm(opts.heights[i].v)}${opts.heights[i].st === 'verifiee' ? ' V' : ''}`, s: 2 * ts, anchor: 'middle', color: opts.heights[i].st === 'verifiee' ? 'ver' : null, bold: true });
    ops.push({ t: 'text', x: p[0] + bis[0] * 5 * ts, y: p[1] + bis[1] * 5 * ts, str: `A${i + 1}${alert ? '!' : ''}`, s: 1.9 * ts, anchor: 'middle', color: alert ? 'adj' : 'muted' });
    if (Math.abs(deg - 90) >= 0.5) ops.push({ t: 'text', x: p[0] + bis[0] * 9.5 * ts, y: p[1] + bis[1] * 9.5 * ts, str: `${deg.toFixed(1).replace('.', ',')}°`, s: 1.8 * ts, anchor: 'middle', color: 'muted' });
  });
  let A2 = 0, cx = 0, cy = 0; for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n], c = p[0] * q[1] - q[0] * p[1]; A2 += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; }
  let C = [cx / (3 * A2), cy / (3 * A2)]; if (!inside2(C, P)) C = P.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  ops.push({ t: 'text', x: C[0], y: C[1] - 2.5 * ts, str: rel.piece || 'Pièce', s: 3.4 * ts, anchor: 'middle', bold: true });
  ops.push({ t: 'text', x: C[0], y: C[1] + 2.5 * ts, str: `${m2(g.surface)}`, s: 2.8 * ts, anchor: 'middle' });
  if (opts.heights && opts.heightsMode === 'unique' && opts.heights[0]?.v != null) ops.push({ t: 'text', x: C[0], y: C[1] + 7 * ts, str: `HSP ${cm(opts.heights[0].v)}${opts.heights[0].st === 'verifiee' ? ' V' : ''}`, s: 2.4 * ts, anchor: 'middle', color: opts.heights[0].st === 'verifiee' ? 'ver' : null });
  return ops;
}

/* ================= mise en page PDF ================= */
function shift(o, dx, dy, s = 1) {
  if (o.t === 'line') return { ...o, x1: o.x1 * s + dx, y1: o.y1 * s + dy, x2: o.x2 * s + dx, y2: o.y2 * s + dy };
  if (o.t === 'poly') return { ...o, p: o.p.map((q) => [q[0] * s + dx, q[1] * s + dy]) };
  return { ...o, x: o.x * s + dx, y: o.y * s + dy };
}
export function pdfPages(rel, g, paper = 'A4') {
  const [pw, ph] = PAPER[paper], date = new Date().toLocaleDateString('fr-FR');
  let page = null;
  for (const sc of SCALES) {
    const ops = drawRoom(rel, g, 1000 / sc, { ecarts: rel.angles.map((a) => a.ecartSol) }), b = bbox(ops);
    for (const [W, H] of (b.w > b.h ? [[ph, pw], [pw, ph]] : [[pw, ph], [ph, pw]])) {
      const aw = W - 2 * M, ah = H - 2 * M - TB - 4;
      if (b.w <= aw && b.h <= ah) { page = { W, H, scale: sc, ops: ops.map((o) => shift(o, M + (aw - b.w) / 2 - b.x0, M + (ah - b.h) / 2 - b.y0)) }; break; }
    }
    if (page) break;
  }
  if (!page) { // aucune échelle normalisée ne tient : dessin réduit, sans échelle
    const [W, H] = [ph, pw], ops0 = drawRoom(rel, g, 10), b = bbox(ops0), aw = W - 2 * M, ah = H - 2 * M - TB - 4, s = Math.min(aw / b.w, ah / b.h);
    page = { W, H, scale: null, ops: ops0.map((o) => shift(o, M + (aw - b.w * s) / 2 - b.x0 * s, M + (ah - b.h * s) / 2 - b.y0 * s, s)) };
  }
  const { W, H } = page, y0 = H - M - TB, T = (x, y, str, s, bold, color) => page.ops.push({ t: 'text', x, y, str, s, bold, color });
  page.ops.push({ t: 'poly', p: [[M, M], [W - M, M], [W - M, H - M], [M, H - M]], close: true, w: 0.35 }, { t: 'line', x1: M, y1: y0, x2: W - M, y2: y0, w: 0.35 });
  const xr = W - M - 64; page.ops.push({ t: 'line', x1: xr, y1: y0, x2: xr, y2: H - M, w: 0.2 });
  T(M + 3, y0 + 5.5, `${rel.nom || 'Relevé'} — ${rel.piece || 'Pièce'}`, 3.6, true);
  T(M + 3, y0 + 10.5, `Surface intérieure au sol : ${m2(g.surface)}${g.walls.some((w) => w.statut !== 'AR') ? ` (mesure AR brute : ${m2(g.surfaceAR)})` : ''} · périmètre ${cm(g.perimetre)} cm`, 2.5);
  T(M + 3, y0 + 15, `Relevé le ${new Date(rel.creeLe).toLocaleDateString('fr-FR')} · PDF du ${date} · cotes intérieures en centimètres`, 2.3);
  T(M + 3, y0 + 19.5, 'Statut des cotes : 412 = mesure caméra (AR) · 410 V = vérifiée au mètre · 405 A = ajustée pour fermer le contour', 2.1);
  const nV = g.walls.filter((w) => w.statut === 'verifiee').length;
  T(M + 3, y0 + 24, `${g.walls.length} murs · ${nV} vérifié(s) au mètre · géométrie : ${g.methode}${g.ok ? '' : ` · écart de fermeture ${cm(g.ecartFermeture)} cm`} · angles non forcés`, 2.1);
  if (page.scale) {
    T(xr + 3, y0 + 6, `Échelle 1/${page.scale}`, 4, true);
    T(xr + 3, y0 + 11, `Format ${paper} — valable imprimé à 100 %`, 2.1);
    T(xr + 3, y0 + 14.5, '(« taille réelle », sans ajustement à la page)', 1.9);
    page.ops.push({ t: 'line', x1: xr + 4, y1: y0 + 20, x2: xr + 54, y2: y0 + 20, w: 0.35 }, { t: 'line', x1: xr + 4, y1: y0 + 18.8, x2: xr + 4, y2: y0 + 21.2, w: 0.35 }, { t: 'line', x1: xr + 54, y1: y0 + 18.8, x2: xr + 54, y2: y0 + 21.2, w: 0.35 });
    T(xr + 4, y0 + 24.5, `Contrôle : ce trait doit mesurer 5 cm (= ${(0.05 * page.scale).toLocaleString('fr-FR')} m)`, 1.8);
  } else {
    T(xr + 3, y0 + 7, 'Plan non à l\'échelle', 3.6, true);
    T(xr + 3, y0 + 12.5, 'Les cotes font foi.', 2.4);
  }
  // page 2 : tableau des cotes
  const t2 = { W: pw, H: ph, scale: null, ops: [] }, L2 = (x, y, str, s = 2.6, bold = false, color) => t2.ops.push({ t: 'text', x, y, str, s, bold, color });
  t2.ops.push({ t: 'poly', p: [[M, M], [pw - M, M], [pw - M, ph - M], [M, ph - M]], close: true, w: 0.35 });
  L2(M + 5, M + 10, `${rel.nom || 'Relevé'} — ${rel.piece || 'Pièce'} : détail des cotes (cm)`, 3.8, true);
  const cols = [M + 5, M + 25, M + 55, M + 90, M + 125, M + 150];
  let y = M + 22; ['Mur', 'Mesure AR', 'Au mètre', 'Sur le plan', 'Écart', 'Statut'].forEach((h, i) => L2(cols[i], y, h, 2.6, true));
  y += 2.5; t2.ops.push({ t: 'line', x1: M + 5, y1: y, x2: pw - M - 5, y2: y, w: 0.25 }); y += 5;
  const ST = { AR: 'mesure AR', verifiee: 'vérifiée', ajustee: 'ajustée' };
  g.walls.forEach((w, i) => {
    [`M${i + 1} (A${i + 1}-A${(i + 1) % g.walls.length + 1})`, cm(w.LAR), w.Lver != null ? cm(w.Lver) : '—', cm(w.L), (Math.abs(w.delta) < 0.0005 ? '0' : `${w.delta > 0 ? '+' : '-'}${Math.abs(Math.round(w.delta * 1000) / 10).toString().replace('.', ',')}`), ST[w.statut]].forEach((v, c) => L2(cols[c], y, v, 2.5, false, c === 5 ? STCOL[w.statut] : null));
    y += 5.2;
  });
  y += 4;
  L2(M + 5, y, `Surface au sol : ${m2(g.surface)} (mesure AR brute : ${m2(g.surfaceAR)}) · périmètre ${cm(g.perimetre)} cm`, 2.6, true); y += 6;
  L2(M + 5, y, 'Angles intérieurs : ' + g.angles.map((a, i) => `A${i + 1} ${a.toFixed(1).replace('.', ',')}°`).join(' · '), 2.3); y += 6;
  const al = rel.angles.map((a, i) => (a.ecartSol > 0.03 ? `A${i + 1} (${cm(a.ecartSol)} cm)` : null)).filter(Boolean);
  if (al.length) { L2(M + 5, y, `Attention : angle(s) visé(s) loin du sol commun : ${al.join(', ')} — vérifiez-les.`, 2.3, false, 'adj'); y += 6; }
  if ((rel.seance?.pertesSuivi || []).length) { L2(M + 5, y, `Suivi AR interrompu ${rel.seance.pertesSuivi.length} fois pendant le relevé.`, 2.3); y += 6; }
  L2(M + 5, y, 'Les mesures AR d\'origine sont conservées dans le relevé ; les corrections au mètre ne les effacent pas.', 2.2);
  return [page, t2];
}

/* ================= rendus ================= */
const COL = { ver: '#1f6fd1', adj: '#c26a00', muted: '#6b747a', paper: '#ffffff', ghost: '#9aa3a8', floor: 'rgba(61,155,233,.06)', sel: 'rgba(255,195,26,.35)' };
const PCOL = { ver: '0.12 0.44 0.82', adj: '0.76 0.42 0', muted: '0.42 0.45 0.48', ghost: '0.6 0.64 0.66' };
const escX = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function toSVG(ops, vb) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" font-family="Helvetica, Arial, sans-serif">`;
  for (const o of ops) {
    const ed = o.edit ? ` data-edit='${JSON.stringify(o.edit)}' class="ed"` : '';
    if (o.t === 'line') s += `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${COL[o.color] || '#111'}" stroke-width="${o.w}" stroke-linecap="round"/>`;
    else if (o.t === 'poly') s += `<polygon points="${o.p.map((q) => q.join(',')).join(' ')}" fill="${o.fill ? COL[o.fill] : 'none'}" stroke="${COL[o.color] || '#111'}" stroke-width="${o.w}"${o.dash ? ' stroke-dasharray="1.5 1"' : ''} stroke-linejoin="round"/>`;
    else if (o.t === 'text') {
      const tr = `translate(${o.x},${o.y})${o.rot ? ` rotate(${o.rot})` : ''}`;
      if (o.edit) { const w = Math.max(9, o.s * 0.6 * o.str.length + 5), h = o.s + 5; s += `<rect transform="${tr}" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" fill="transparent"${ed}/>`; }
      s += `<text transform="${tr}" font-size="${o.s}" dominant-baseline="central" text-anchor="${o.anchor === 'middle' ? 'middle' : 'start'}" fill="${COL[o.color] || '#111'}"${o.bold ? ' font-weight="bold"' : ''} style="pointer-events:none">${escX(o.str)}</text>`;
    }
  }
  return s + '</svg>';
}
export { bbox };
const WIN = { '−': 45, '€': 128, '…': 133, '–': 150, '—': 151, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, 'œ': 156, 'Œ': 140 };
function pdfStr(s) {
  let out = '(';
  for (const ch of s) {
    let c = WIN[ch] ?? ch.charCodeAt(0); if (c > 255) c = 63;
    if (c === 40 || c === 41 || c === 92) out += '\\' + String.fromCharCode(c);
    else if (c < 32 || c > 126) out += '\\' + c.toString(8).padStart(3, '0');
    else out += String.fromCharCode(c);
  }
  return out + ')';
}
export function toPDF(pages) {
  const k = 72 / 25.4, f = (v) => (Math.round(v * 1000) / 1000).toString(), HW = 0.52;
  const objs = [], add = (s) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const pagesId = objs.length + 1; objs.push(null); const kids = [];
  for (const pg of pages) {
    const Y = (y) => (pg.H - y) * k; let c = '1 J 1 j\n';
    for (const o of pg.ops) {
      const col = PCOL[o.color] || (o.color === 'paper' ? '1 1 1' : '0.07 0.07 0.07');
      if (o.t === 'line') c += `${col} RG ${f(o.w * k)} w ${f(o.x1 * k)} ${f(Y(o.y1))} m ${f(o.x2 * k)} ${f(Y(o.y2))} l S\n`;
      else if (o.t === 'poly') {
        const path = o.p.map((q, i) => `${f(q[0] * k)} ${f(Y(q[1]))} ${i ? 'l' : 'm'}`).join(' ') + ' h';
        if (o.fill === 'floor') c += `0.96 0.975 0.99 rg ${path} f\n`;
        c += `${o.dash ? '[2 1.5] 0 d ' : ''}${col} RG ${f(o.w * k)} w ${path} S${o.dash ? ' [] 0 d' : ''}\n`;
      } else if (o.t === 'text') {
        const r = ((o.rot || 0) * Math.PI) / 180, cs = Math.cos(r), sn = Math.sin(r), w = o.anchor === 'middle' ? o.str.length * HW * o.s : 0;
        const bx = o.x - (w / 2) * cs - 0.35 * o.s * sn, by = o.y - (w / 2) * sn + 0.35 * o.s * cs;
        c += `BT ${col} rg /${o.bold ? 'F2' : 'F1'} ${f(o.s * k)} Tf ${f(cs)} ${f(-sn)} ${f(sn)} ${f(cs)} ${f(bx * k)} ${f(Y(by))} Tm ${pdfStr(o.str)} Tj ET\n`;
      }
    }
    const cont = add(`<< /Length ${c.length} >>\nstream\n${c}endstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(pg.W * k)} ${f(pg.H * k)}] /Resources << /Font << /F1 ${font} 0 R /F2 ${fontB} 0 R >> >> /Contents ${cont} 0 R >>`));
  }
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((i) => i + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /PrintScaling /None >> >>`);
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}

/* ================= hauteurs sous plafond ================= */
// rel.hauteurs = { mode: 'unique' | 'angles', unique: {ar, verifiee}, angles: { [idAngle]: {ar, verifiee} } }
const hval = (o) => (o ? (o.verifiee ?? o.ar ?? null) : null);
const hst = (o) => (!o ? null : o.verifiee != null ? 'verifiee' : o.ar != null ? 'AR' : null);
export function heights(rel) {
  const H = rel.hauteurs; if (!H) return null;
  if (H.mode === 'unique') return rel.angles.map(() => ({ v: hval(H.unique), st: hst(H.unique) }));
  return rel.angles.map((a) => ({ v: hval(H.angles?.[a.id]), st: hst(H.angles?.[a.id]) }));
}
// Surfaces brutes (portes et fenêtres non déduites). Mur entre deux angles : trapèze L × (h1 + h2) / 2.
export function surfaces(rel, g) {
  const hs = heights(rel); if (!hs) return null;
  const n = g.walls.length;
  const murs = g.walls.map((w, i) => { const a = hs[i].v, b = hs[(i + 1) % n].v; return a != null && b != null ? w.L * (a + b) / 2 : null; });
  const vals = hs.map((h) => h.v).filter((v) => v != null), complet = vals.length === n;
  let plafond = null;
  if (complet) { // plafond plan ou incliné : aire du polygone 3D (x, h, y)
    const P3 = g.pts.map((p, i) => [p[0], hs[i].v, p[1]]); let c = [0, 0, 0];
    for (let i = 0; i < n; i++) { const a = P3[i], b = P3[(i + 1) % n]; c = [c[0] + a[1] * b[2] - a[2] * b[1], c[1] + a[2] * b[0] - a[0] * b[2], c[2] + a[0] * b[1] - a[1] * b[0]]; }
    plafond = Math.hypot(...c) / 2;
  }
  return { hs, murs, totalMurs: murs.every((v) => v != null) ? murs.reduce((s, v) => s + v, 0) : null, plafond, min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null, complet };
}

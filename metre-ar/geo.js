// Géométrie 3D pure (mètres, repère WebXR : Y vers le haut). Aucune dépendance.
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const dist = (a, b) => len(sub(a, b));
export const hdist = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

// Surface d'un polygone plan en 3D (formule vectorielle)
export function polyArea3(pts) {
  let s = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) s = add(s, cross(pts[i], pts[(i + 1) % pts.length]));
  return len(s) / 2;
}
export function perimeter(pts, closed = true) {
  let p = 0;
  for (let i = 0; i < pts.length - (closed ? 0 : 1); i++) p += dist(pts[i], pts[(i + 1) % pts.length]);
  return p;
}
export function newellNormal(pts) {
  let n = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]);
  }
  return norm(n);
}

// Point de la verticale passant par A le plus proche du rayon caméra (C, D)
export function closestOnVertical(A, C, D) {
  const u = [0, 1, 0], w0 = sub(A, C);
  const a = 1, b = dot(u, D), c = dot(D, D), d = dot(u, w0), e = dot(D, w0);
  const den = a * c - b * b;
  if (den < 1e-6) return null;
  const sc = (b * e - c * d) / den, tc = (a * e - b * d) / den;
  if (tc < 0) return null;
  return [A[0], A[1] + sc, A[2]];
}

// Intersection rayon / plan
export function rayPlane(C, D, P0, n) {
  const den = dot(n, D);
  if (Math.abs(den) < 1e-4) return null;
  const t = dot(n, sub(P0, C)) / den;
  if (t <= 0 || t > 30) return null;
  return add(C, scale(D, t));
}

// Mur vertical défini par 2 points au pied du mur
export function wallFrom(A, B) {
  const dir = norm([B[0] - A[0], 0, B[2] - A[2]]);
  return { A, B, dir, n: [-dir[2], 0, dir[0]], baseY: (A[1] + B[1]) / 2, width: hdist(A, B) };
}
export function wallPoint(w, s, y) { return [w.A[0] + w.dir[0] * s, y, w.A[2] + w.dir[2] * s]; }
export function wallRect(w, h) {
  const y0 = w.baseY, s1 = w.width;
  return [wallPoint(w, 0, y0), wallPoint(w, s1, y0), wallPoint(w, s1, y0 + h), wallPoint(w, 0, y0 + h)];
}
export function openingOn(w, P1, P2) {
  const s1 = dot(sub(P1, w.A), w.dir), s2 = dot(sub(P2, w.A), w.dir);
  const width = Math.abs(s2 - s1), height = Math.abs(P2[1] - P1[1]);
  const lo = Math.min(s1, s2), hi = Math.max(s1, s2), y0 = Math.min(P1[1], P2[1]), y1 = Math.max(P1[1], P2[1]);
  const off = scale(w.n, 0.004);
  const c = [wallPoint(w, lo, y0), wallPoint(w, hi, y0), wallPoint(w, hi, y1), wallPoint(w, lo, y1)].map((p) => add(p, off));
  return { width, height, area: width * height, corners: c };
}

// Triangulation (oreilles) d'un polygone plan 3D -> liste d'indices
export function triangulate(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const N = newellNormal(pts), u = norm(sub(pts[1], pts[0])), v = cross(N, u);
  const P = pts.map((p) => { const d = sub(p, pts[0]); return [dot(d, u), dot(d, v)]; });
  let area = 0;
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
  let idx = [...Array(n).keys()];
  if (area < 0) idx.reverse();
  const crs = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const inTri = (p, a, b, c) => crs(a, b, p) >= 0 && crs(b, c, p) >= 0 && crs(c, a, p) >= 0;
  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 1000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i + idx.length - 1) % idx.length], i1 = idx[i], i2 = idx[(i + 1) % idx.length];
      const a = P[i0], b = P[i1], c = P[i2];
      if (crs(a, b, c) <= 1e-12) continue;
      if (idx.some((k) => k !== i0 && k !== i1 && k !== i2 && inTri(P[k], a, b, c))) continue;
      out.push(i0, i1, i2); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push(...idx);
  return out;
}

/* ---------- maillages (triangles en coordonnées monde) ---------- */
export function prism(a, b, r = 0.003, sides = 6) {
  const d = norm(sub(b, a));
  const h = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(d, h)), v = cross(d, u), out = [];
  const ring = (p) => Array.from({ length: sides }, (_, k) => {
    const t = (k / sides) * Math.PI * 2;
    return add(p, add(scale(u, Math.cos(t) * r), scale(v, Math.sin(t) * r)));
  });
  const ra = ring(a), rb = ring(b);
  for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    out.push(...ra[k], ...rb[k], ...rb[k2], ...ra[k], ...rb[k2], ...ra[k2]);
  }
  return out;
}
export function octa(p, r = 0.008) {
  const V = [[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]].map((o) => add(p, o));
  const F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
  return F.flatMap((f) => f.flatMap((i) => V[i]));
}
export function ringMesh(c, nrm, r1 = 0.05, r2 = 0.065, seg = 32) {
  const n = norm(nrm), h = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(n, h)), v = cross(n, u), out = [];
  const P = (r, t) => add(c, add(scale(u, Math.cos(t) * r), scale(v, Math.sin(t) * r)));
  for (let k = 0; k < seg; k++) {
    const t0 = (k / seg) * Math.PI * 2, t1 = ((k + 1) / seg) * Math.PI * 2;
    out.push(...P(r1, t0), ...P(r2, t0), ...P(r2, t1), ...P(r1, t0), ...P(r2, t1), ...P(r1, t1));
  }
  return out;
}
export function fillMesh(pts) { return triangulate(pts).flatMap((i) => pts[i]); }

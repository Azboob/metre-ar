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

/* ---------- photos 3D : caméra enregistrée ----------
   cam = { W, H, P (projection 4x4, colonnes), M (caméra -> monde), V (monde -> caméra) } */
export function pixelRay(cam, u, v) {
  const x = (2 * u) / cam.W - 1, y = 1 - (2 * v) / cam.H, P = cam.P, M = cam.M;
  const xv = (x + P[8]) / P[0], yv = (y + P[9]) / P[5];
  const d = [M[0] * xv + M[4] * yv - M[8], M[1] * xv + M[5] * yv - M[9], M[2] * xv + M[6] * yv - M[10]];
  return { o: [M[12], M[13], M[14]], d, dn: norm(d) }; // o + d*k : point à k mètres de profondeur caméra
}
export function projectPixel(cam, p) {
  const V = cam.V, P = cam.P;
  const v = [0, 1, 2, 3].map((r) => V[r] * p[0] + V[4 + r] * p[1] + V[8 + r] * p[2] + V[12 + r]);
  const c = [0, 1, 2, 3].map((r) => P[r] * v[0] + P[4 + r] * v[1] + P[8 + r] * v[2] + P[12 + r] * v[3]);
  if (c[3] <= 0.01) return null;
  return [((c[0] / c[3] + 1) / 2) * cam.W, ((1 - c[1] / c[3]) / 2) * cam.H];
}
export const floorPlaneHit = (ray, floorY) => rayPlane(ray.o, ray.dn, [0, floorY, 0], [0, 1, 0]);
export function depthAt(cam, u, v) {
  const dp = cam.depth; if (!dp) return null;
  const x = (u / cam.W) * dp.w - 0.5, y = (v / cam.H) * dp.h - 0.5;
  const x0 = Math.max(0, Math.min(dp.w - 1, Math.floor(x))), y0 = Math.max(0, Math.min(dp.h - 1, Math.floor(y)));
  const x1 = Math.min(dp.w - 1, x0 + 1), y1 = Math.min(dp.h - 1, y0 + 1), fx = Math.min(1, Math.max(0, x - x0)), fy = Math.min(1, Math.max(0, y - y0));
  const g = (i, j) => dp.data[j * dp.w + i];
  const vals = [g(x0, y0), g(x1, y0), g(x0, y1), g(x1, y1)];
  if (vals.some((z) => !(z > 0.05))) { const ok = vals.filter((z) => z > 0.05); return ok.length ? Math.min(...ok) : null; }
  return (g(x0, y0) * (1 - fx) + g(x1, y0) * fx) * (1 - fy) + (g(x0, y1) * (1 - fx) + g(x1, y1) * fx) * fy;
}
export function depthPoint(cam, u, v) {
  const z = depthAt(cam, u, v); if (!z) return null;
  const r = pixelRay(cam, u, v); return add(r.o, scale(r.d, z));
}

/* ---------- diagnostic du mode « Mur » (aucune correction, uniquement des constats) ----------
   A, B : pieds du mur au sol ; T : point visé en haut. Méthode actuelle :
   largeur = distance horizontale A-B ; hauteur = T.y - moyenne(A.y, B.y) ; surface = largeur × hauteur. */
export function wallDiag(A, B, T) {
  const w = wallFrom(A, B), h = T[1] - w.baseY, rect = wallRect(w, h);
  return {
    methode: 'surface = largeur horizontale (A-B) × hauteur verticale (T - moyenne des pieds)',
    points: { A, B, T },
    ordreSaisie: ['A = pied gauche (1er appui)', 'B = pied droit (2e appui)', 'T = haut du mur (3e appui)'],
    largeur: w.width,
    longueurAB3D: dist(A, B),
    denivelePiedsAmoinsB: A[1] - B[1],
    baseY: w.baseY,
    hauteur: h,
    surfaceProduit: w.width * h,
    surfacePolygone: polyArea3(rect),
    sommetsRectangle: rect,
    ordreSommets: ['pied A', 'pied B', 'haut au-dessus de B', 'haut au-dessus de A'],
    ecartHautAuPlanDuMur: dot(sub(T, w.A), w.n),
    positionHautLeLongDuMur: dot(sub(T, w.A), w.dir),
  };
}

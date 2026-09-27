// Outils partagés (format des nombres, types de mesure, petits utilitaires d'interface)
export const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
export const fr = (n, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtLen = (m) => (m < 1 ? fr(m * 100, 1) + ' cm' : fr(m, 2) + ' m');
export const fmtArea = (a) => fr(a, 2) + ' m²';
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const KIND = {
  dist: { label: 'Distance', css: '#ffffff', rgb: [1, 1, 1] },
  height: { label: 'Hauteur', css: '#ffc31a', rgb: [1, 0.76, 0.1] },
  floor: { label: 'Sol', css: '#3ddc84', rgb: [0.24, 0.86, 0.52] },
  wall: { label: 'Mur', css: '#3d9be9', rgb: [0.24, 0.61, 0.91] },
  opening: { label: 'Ouverture', css: '#ff5a4a', rgb: [1, 0.35, 0.29] },
};
export const valShort = (m) => (m.kind === 'dist' || m.kind === 'height' ? fmtLen(m.v.len) : (m.kind === 'opening' ? '− ' : '') + fmtArea(m.v.area));
let toastT;
export function toast(msg, ms = 2200) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), ms);
}
export function armConfirm(btn, fn, need = true) {
  if (!need || btn.dataset.armed) { delete btn.dataset.armed; if (btn.dataset.label) btn.textContent = btn.dataset.label; fn(); return; }
  btn.dataset.label = btn.textContent; btn.dataset.armed = '1'; btn.textContent = 'Confirmer ?';
  setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 3000);
}
export const round3 = (p) => p.map((x) => Math.round(x * 1000) / 1000);
// Enregistre / partage un fichier (partage Android si possible, sinon téléchargement)
export async function saveFile(name, data, type) {
  const file = new File([data], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000); toast('Fichier enregistré dans Téléchargements');
}
export const slug = (s) => (s || 'plan').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 40);

// Stockage des photos 3D (image JPEG + position de la caméra + profondeur) dans IndexedDB.
const DB = 'metre-ar', STORE = 'photos';
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
    t.onerror = () => rej(t.error);
  });
}
export const putPhoto = (rec) => tx('readwrite', (s) => s.put(rec));
export const getPhoto = (id) => tx('readonly', (s) => s.get(id));
export const delPhoto = (id) => tx('readwrite', (s) => s.delete(id));
export async function delPhotos(ids) { for (const id of ids) { try { await delPhoto(id); } catch (e) { /* déjà supprimée */ } } }

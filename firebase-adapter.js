/* 進銷存系統：把 Firebase（Firestore）包成系統原本使用的資料庫／使用者／下載介面。
 * 這個檔案不含任何 Firebase 金鑰，也不直接載入 SDK，方便單獨測試。 */
(function (root) {
  function fixErr(e) {
    if (e && typeof e === 'object') e.code = String(e.code || '').replace(/^firestore\//, '').replace(/-/g, '_');
    /* 資料庫突然說「沒有權限」：可能是費用保護把資料庫暫時鎖住了，通知啟動程式去確認（它會問雲端函式，不是每個錯誤都會問） */
    if (e && e.code === 'permission_denied' && typeof root.__onPermDenied === 'function') { try { root.__onPermDenied(e); } catch (_) {} }
    return e;
  }
  const wrap = p => Promise.resolve(p).catch(e => { throw fixErr(e); });

  /* fsApi：{doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, runTransaction}；fs：Firestore 實例；prefix：集合名稱前綴 */
  function makeDb(fsApi, fs, prefix) {
    prefix = prefix || '';
    const P = path => prefix + path;
    const wrapSnap = s => ({ id: s.id, exists: typeof s.exists === 'function' ? s.exists() : !!s.exists, data: () => s.data(), metadata: s.metadata || {} });
    const docRef = path => {
      const r = fsApi.doc(fs, P(path));
      return {
        id: r.id, path,
        get: () => wrap(fsApi.getDoc(r).then(wrapSnap)),
        set: d => wrap(fsApi.setDoc(r, d)),
        update: d => wrap(fsApi.updateDoc(r, d)),
        delete: () => wrap(fsApi.deleteDoc(r)),
        onSnapshot: (next, err) => fsApi.onSnapshot(r, s => next(wrapSnap(s)), e => err && err(fixErr(e))),
        collection: p => colRef(path + '/' + p)
      };
    };
    const colRef = path => {
      const c = fsApi.collection(fs, P(path));
      return {
        path,
        doc: id => docRef(path + '/' + (id || fsApi.doc(c).id)),
        add: async d => { const r = docRef(path + '/' + fsApi.doc(c).id); await r.set(d); return r; },
        onSnapshot: (next, err) => fsApi.onSnapshot(c, s => next({ docs: s.docs.map(wrapSnap), size: s.size, empty: s.empty, docChanges: () => [], metadata: s.metadata || {} }), e => err && err(fixErr(e)))
      };
    };
    /* 流水號：用交易保證兩個人同時開單不會拿到同一個號碼 */
    const nextSerial = (path, floor) => wrap(fsApi.runTransaction(fs, async tx => {
      const r = fsApi.doc(fs, P(path)), snap = await tx.get(r);
      const last = (typeof snap.exists === 'function' ? snap.exists() : snap.exists) ? Number((snap.data() || {}).last) || 0 : 0;
      const next = Math.max(last, Number(floor) || 0) + 1;
      tx.set(r, { last: next });
      return next;
    }));
    /* 伺服器的現在時間（毫秒）：寫一筆「伺服器時間戳記」再從伺服器讀回來。手機沒有網路、或伺服器沒回應就丟出錯誤（呼叫的人會改用手機時間並標記）。
       每個使用者只會有一筆（每次覆蓋），用來防止「改手機時間來假裝準時打卡」。 */
    const serverNow = (key) => {
      if (!fsApi.serverTimestamp || !fsApi.getDocFromServer) return Promise.reject(new Error('no server time'));
      const r = fsApi.doc(fs, P('timecheck/' + String(key || 'x').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)));
      const t0 = Date.now();
      return wrap(fsApi.setDoc(r, { t: fsApi.serverTimestamp() }).then(() => fsApi.getDocFromServer(r)).then(s => {
        const v = (typeof s.exists === 'function' ? s.exists() : s.exists) ? (s.data() || {}).t : null, ms = v && typeof v.toMillis === 'function' ? v.toMillis() : null;
        if (!ms) throw new Error('no server time');
        return ms + Math.round((Date.now() - t0) / 2);
      }));
    };
    return { doc: docRef, collection: colRef, nextSerial, serverNow };
  }

  /* info：{uid, name, avatarUrl, email, level, lookup(ids) -> Promise<{id:{name,avatarUrl}}>}；level：admin / edit / view */
  function makeUser(info) {
    return {
      me: async () => ({ id: info.uid, name: info.name, avatarUrl: info.avatarUrl || '', email: info.email || '' }),
      can: async () => info.level === 'admin' || info.level === 'edit',
      canEdit: async () => info.level === 'admin',
      isOwner: async () => false,
      profiles: async ids => info.lookup ? info.lookup(ids) : {}
    };
  }

  const MIME = { csv: 'text/csv;charset=utf-8', json: 'application/json', html: 'text/html;charset=utf-8', pdf: 'application/pdf', txt: 'text/plain;charset=utf-8', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
  function makeDownloads(doc, win) {
    return {
      save: async ({ filename, data }) => {
        const ext = String(filename).split('.').pop().toLowerCase();
        const blob = (typeof Blob !== 'undefined' && data instanceof Blob) ? data : new Blob([data], { type: MIME[ext] || 'application/octet-stream' });
        const url = (win || root).URL.createObjectURL(blob);
        const a = doc.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        doc.body.append(a); a.click();
        setTimeout(() => { try { (win || root).URL.revokeObjectURL(url); } catch (_) {} a.remove(); }, 1500);
      }
    };
  }

  const api = { makeDb, makeUser, makeDownloads, fixErr };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FirebaseAdapter = api;
})(typeof window !== 'undefined' ? window : globalThis);

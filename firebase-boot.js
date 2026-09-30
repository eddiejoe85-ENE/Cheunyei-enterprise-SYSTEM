/* 啟動程式：登入畫面、讀取使用者層級、把 Firebase 接成系統要用的介面。 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, runTransaction } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PFX = window.INV_PREFIX || 'inv_';
const cfg = window.FIREBASE_CONFIG || {};
const ov = document.createElement('div');
ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--bg,#E9EDF1);display:flex;align-items:center;justify-content:center;padding:20px;font:16px/1.5 -apple-system,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;color:var(--ink,#131C26)';
document.body.append(ov);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const card = html => { ov.style.display = 'flex'; ov.innerHTML = '<div style="width:100%;max-width:380px;background:var(--panel,#fff);border:1px solid var(--line,#D8DEE4);border-radius:16px;padding:22px">' + html + '</div>'; };
const inputCss = 'width:100%;height:46px;margin:6px 0 12px;padding:0 12px;border:1px solid #C4CCD3;border-radius:10px;font-size:16px;box-sizing:border-box;background:var(--panel,#fff);color:inherit';
const btnCss = 'width:100%;height:48px;border:0;border-radius:12px;background:var(--brand,#0F5C6E);color:var(--brandi,#fff);font-size:17px;font-weight:700;cursor:pointer';
const linkCss = 'background:none;border:0;color:var(--brand,#0F5C6E);font-size:14px;cursor:pointer;padding:8px 0';
const AUTHERR = { 'auth/invalid-credential': '帳號或密碼不正確', 'auth/wrong-password': '密碼不正確', 'auth/user-not-found': '找不到這個帳號', 'auth/invalid-email': 'Email 格式不正確', 'auth/too-many-requests': '嘗試次數太多，請稍後再試', 'auth/network-request-failed': '網路連線失敗', 'auth/user-disabled': '這個帳號已被停用', 'auth/email-already-in-use': '這個 Email 已經有帳號了', 'auth/weak-password': '密碼至少要 6 個字元' };
const errText = e => AUTHERR[e && e.code] || ('發生錯誤：' + ((e && (e.message || e.code)) || e));

function fatal(msg) { card('<h2 style="margin:0 0 8px;font-size:20px">無法啟動</h2><p style="margin:0;color:#B93A2B">' + msg + '</p>'); }

if (!cfg.apiKey || /貼上/.test(cfg.apiKey) || !cfg.projectId || /你的/.test(cfg.projectId)) {
  fatal('還沒有設定 Firebase。請打開 <b>firebase-config.js</b>，把 Firebase 主控台的網頁應用程式設定貼進去，再重新整理。');
} else {
  start();
}

function start() {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  let fs;
  try { fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }), ignoreUndefinedProperties: true }); }
  catch (_) { fs = initializeFirestore(app, { ignoreUndefinedProperties: true }); }
  const fsApi = { doc, collection, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, runTransaction };
  const A = window.FirebaseAdapter;
  const db = A.makeDb(fsApi, fs, PFX);
  const usersDoc = uid => doc(fs, PFX + 'users/' + uid);
  let booted = false;

  function showLogin(msg) {
    card('<h2 style="margin:0 0 4px;font-size:22px">進銷存系統</h2><p style="margin:0 0 14px;color:#78858F;font-size:14px">請登入</p>'
      + '<label style="font-size:13px;color:#78858F">Email</label><input id="fbEmail" type="email" autocomplete="username" style="' + inputCss + '">'
      + '<label style="font-size:13px;color:#78858F">密碼</label><input id="fbPass" type="password" autocomplete="current-password" style="' + inputCss + '">'
      + '<div id="fbMsg" style="min-height:22px;margin-bottom:8px;font-size:14px;color:#B93A2B">' + esc(msg || '') + '</div>'
      + '<button id="fbGo" style="' + btnCss + '">登入</button><div style="text-align:center;margin-top:6px"><button id="fbReset" style="' + linkCss + '">忘記密碼</button></div>');
    const $ = id => ov.querySelector('#' + id), setMsg = t => { $('fbMsg').textContent = t; };
    const go = async () => {
      const email = $('fbEmail').value.trim(), pw = $('fbPass').value;
      if (!email || !pw) return setMsg('請輸入 Email 和密碼');
      $('fbGo').disabled = true; $('fbGo').textContent = '登入中…';
      try { await signInWithEmailAndPassword(auth, email, pw); }
      catch (e) { $('fbGo').disabled = false; $('fbGo').textContent = '登入'; setMsg(errText(e)); }
    };
    $('fbGo').onclick = go; $('fbPass').onkeydown = e => { if (e.key === 'Enter') go(); };
    $('fbReset').onclick = async () => {
      const email = $('fbEmail').value.trim(); if (!email) return setMsg('請先輸入 Email，再按忘記密碼');
      try { await sendPasswordResetEmail(auth, email); setMsg(''); $('fbMsg').style.color = '#1E7F52'; $('fbMsg').textContent = '已寄出重設密碼的信，請到信箱收信。'; }
      catch (e) { setMsg(errText(e)); }
    };
  }

  async function bootUser(u) {
    card('<p style="margin:0;text-align:center">載入中…</p>');
    let snap;
    try { snap = await getDoc(usersDoc(u.uid)); }
    catch (e) { return card('<h2 style="margin:0 0 8px;font-size:20px">讀取失敗</h2><p style="color:#B93A2B;margin:0 0 12px">' + esc(errText(e)) + '</p><p style="margin:0;font-size:14px;color:#78858F">多半是 Firestore 安全規則還沒設好，請照說明檔設定規則。</p><button id="fbOut" style="' + btnCss + ';margin-top:14px">登出</button>'), ov.querySelector('#fbOut').addEventListener('click', () => signOut(auth)); }
    if (!snap.exists()) {
      card('<h2 style="margin:0 0 8px;font-size:20px">帳號尚未開通</h2><p style="margin:0 0 10px">請把下面這串代碼給管理員，由管理員開通你的權限：</p><div style="padding:10px;background:#F0F3F6;border-radius:8px;word-break:break-all;font-size:13px;user-select:all">' + esc(u.uid) + '</div><button id="fbOut" style="' + btnCss + ';margin-top:14px">登出</button>');
      ov.querySelector('#fbOut').onclick = () => signOut(auth); return;
    }
    const d = snap.data() || {}, level = ['admin', 'edit', 'view'].includes(d.level) ? d.level : 'view';
    const names = {};
    const lookup = async ids => {
      const out = {};
      await Promise.all(ids.map(async id => {
        try {
          let s = await getDoc(usersDoc(id));
          if (!s.exists()) s = await getDoc(doc(fs, PFX + 'members/' + id));
          if (s.exists()) out[id] = { name: (s.data() || {}).name || '', avatarUrl: (s.data() || {}).avatarUrl || '' };
        } catch (_) {}
      }));
      return out;
    };
    const info = { uid: u.uid, name: d.name || u.displayName || u.email || '使用者', avatarUrl: u.photoURL || '', email: u.email || '', level, lookup };
    window.__DOC_LIMIT = 500000;
    window.appLogout = async () => { await signOut(auth); location.reload(); };
    if (level === 'admin') window.appCreateUser = async ({ email, password, name, level: lv }) => {
      const sec = initializeApp(cfg, 'secondary-' + Date.now()), sauth = getAuth(sec);
      try {
        const cred = await createUserWithEmailAndPassword(sauth, email, password);
        await setDoc(usersDoc(cred.user.uid), { name: name || email, email, level: ['admin', 'edit', 'view'].includes(lv) ? lv : 'edit', createdAt: Date.now() });
        return cred.user.uid;
      } catch (e) { throw new Error(errText(e)); }
      finally { try { await signOut(sauth); } catch (_) {} }
    };
    ov.style.display = 'none';
    if (!booted) { booted = true; window.__fbResolve({ db, user: A.makeUser(info), downloads: A.makeDownloads(document, window) }); }
  }

  onAuthStateChanged(auth, u => {
    if (u) { if (!booted) bootUser(u); }
    else if (booted) location.reload();
    else showLogin();
  });
}

/* 雲端同步:Firebase Firestore + Google 登入。
   對 app 只暴露 window.FinanceCloud,app 本身不認識 Firebase。 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut as fbSignOut, onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, onSnapshot, runTransaction
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const done = window.__financeCloudResolve || (() => {});

if (!firebaseConfig || !firebaseConfig.apiKey){
  done(null);                       // 還沒設定 Firebase:app 維持本機模式
}else{
  try{
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const provider = new GoogleAuthProvider();

    // 登入狀態留在這台裝置,下次開不用再登
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    // 用轉址登入時,回來這一趟要把結果收掉
    getRedirectResult(auth).catch(() => {});

    done({
      onAuth(cb){
        onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email || '' } : null));
      },
      async signIn(){
        try{
          await signInWithPopup(auth, provider);
        }catch(e){
          // 主畫面 app、內建瀏覽器常擋彈出視窗,改用整頁轉址
          const fallback = [
            'auth/popup-blocked',
            'auth/operation-not-supported-in-this-environment',
            'auth/web-storage-unsupported'
          ];
          if (fallback.includes(e && e.code)) await signInWithRedirect(auth, provider);
          else if (e && e.code === 'auth/cancelled-popup-request') return;  // 連按兩次,忽略
          else throw e;
        }
      },
      signOut(){ return fbSignOut(auth); },
      // 存取 users/{uid}/data/{name} 底下任一份獨立文件,不動主資料那份。
      // 回測用的完整歷史價格就是靠這個存取——只在按「抓完整歷史」時寫,不會跟著
      // 主資料每次編輯都一起送出去,不拖慢平常記帳/存檔的同步速度。
      namedDoc(name){
        const uid = auth.currentUser.uid;
        const ref = doc(db, 'users', uid, 'data', name);
        return {
          get: async () => { const s = await getDoc(ref); return s.exists() ? s.data() : null; },
          set: d => setDoc(ref, d)
        };
      },
      docApi(){
        const uid = auth.currentUser.uid;
        const ref = doc(db, 'users', uid, 'data', 'finance');
        const backupCol = collection(db, 'users', uid, 'backups');
        return {
          get: async () => { const s = await getDoc(ref); return s.exists() ? s.data() : null; },
          set: d => setDoc(ref, d),
          // 有條件寫入(2026-10-13):在同一個交易裡讀雲端現在那份,isCurrent(那份) 說「還是我上次看到的」才寫。
          // 開著很久、監聽早就斷了的分頁拿舊資料整份蓋掉雲端,就是因為以前直接 setDoc。
          // 兩台同時存時 Firestore 會讓後到的交易重跑,重跑時讀到的就是先寫進去的那份。
          // 回傳 { ok: true } 或 { ok: false, current: 雲端那份 }(交給 app 先合併再存)
          setIf: (d, isCurrent) => runTransaction(db, async tx => {
            const s = await tx.get(ref);
            const cur = s.exists() ? s.data() : null;
            if (!isCurrent(cur)) return { ok: false, current: cur };
            tx.set(ref, d);
            return { ok: true };
          }),
          // 回傳取消監聽的函式;出錯時(權限、配額、斷線太久)Firestore 會停掉這個監聽,要通知 app 重連,不能吞掉
          onChange: (cb, onErr) => onSnapshot(ref, s => { if (s.exists()) cb(s.data()); }, e => { if (onErr) onErr(e); }),
          backups: {
            list: async () => (await getDocs(backupCol)).docs.map(d => d.id).sort().reverse(),
            get: async id => { const s = await getDoc(doc(backupCol, id)); return s.exists() ? s.data() : null; },
            put: (id, data) => setDoc(doc(backupCol, id), data),
            del: id => deleteDoc(doc(backupCol, id))
          }
        };
      }
    });
  }catch(e){
    done(null);
  }
}

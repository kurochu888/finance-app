/* 雲端同步:Firebase Firestore + Google 登入。
   對 app 只暴露 window.FinanceCloud,app 本身不認識 Firebase。 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  signOut as fbSignOut, onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot
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
      docApi(){
        const ref = doc(db, 'users', auth.currentUser.uid, 'data', 'finance');
        return {
          get: async () => { const s = await getDoc(ref); return s.exists() ? s.data() : null; },
          set: d => setDoc(ref, d),
          onChange: cb => onSnapshot(ref, s => { if (s.exists()) cb(s.data()); }, () => {})
        };
      }
    });
  }catch(e){
    done(null);
  }
}

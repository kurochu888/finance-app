/* Firebase 設定 —— 從 Firebase 主控台「專案設定 → 你的應用程式 → 網頁應用程式」複製過來。

   這幾個值不是密碼,寫在公開網頁裡是 Firebase 的正常用法;
   真正擋住別人的是 firestore.rules 裡的安全規則(只有本人讀得到自己的資料)。

   apiKey 留空時,app 會維持「只存本機」模式,一切功能照常。 */
export const firebaseConfig = {
  apiKey: "AIzaSyBu8hPAr34_u9myqnUoPb-YVHiVDE_TLfg",
  authDomain: "kuro-finance-09078a32e4.firebaseapp.com",
  projectId: "kuro-finance-09078a32e4",
  appId: "1:982740079071:web:b0a3288fd5ce197c04346a"
};

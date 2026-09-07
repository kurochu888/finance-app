# 開啟雲端同步(Firebase + Google 登入)

做完這幾步,手機和電腦登入同一個 Google 帳號就會即時同步。
沒做完之前 app 一切照常,只是資料留在各自的裝置。

全部在 https://console.firebase.google.com 完成,約 5 分鐘。

## 1. 建立專案

「建立專案」→ 名稱隨意(例如 `my-finance`)→ Google Analytics 選**不啟用** → 建立。

## 2. 開啟 Firestore 資料庫

左側「建構 → Firestore Database」→ 建立資料庫
- 位置選 **asia-east1(台灣)**
- 模式選 **正式版模式**(規則等一下會換掉)

## 3. 設定安全規則

Firestore Database → 上方「規則」分頁 → 把內容整段換成本專案的 `firestore.rules`:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

→ 發布。這一步是關鍵:它讓每個人只能讀寫自己的資料,別人和未登入者一律拒絕。

## 4. 開啟 Google 登入

「建構 → Authentication」→ 開始使用 → 登入方式選 **Google** → 啟用
→ 填「專案的公開名稱」與支援電子郵件 → 儲存。

## 5. 允許網站網域

Authentication → 「設定」分頁 → 已授權的網域 → 新增網域:

```
kurochu888.github.io
```

## 6. 取得設定值

「專案設定(齒輪)→ 一般」→ 最下面「你的應用程式」→ 點 **`</>`(網頁)**
→ 應用程式暱稱隨意 → **不要**勾「同時設定 Firebase Hosting」→ 註冊應用程式

畫面會出現一段 `const firebaseConfig = { ... }`,把大括號裡的內容貼進
本專案的 `firebase-config.js`,然後:

```sh
python3 build.py
git add -A && git commit -m "接上 Firebase" && git push
```

推上去約一分鐘後重新整理網頁,總覽最下面的「資料」卡就會出現
**用 Google 帳號登入以同步**。

## 費用

免費方案(Spark)每天 5 萬次讀取、2 萬次寫入,個人記帳用不到零頭,不會產生費用。

## 常見問題

**按登入沒反應** — 手機把網站裝成 app 後,彈出視窗可能被擋,程式會自動改用整頁轉址,
等它跳轉回來即可。若仍失敗,確認第 5 步的網域有加對。

**顯示 auth/unauthorized-domain** — 第 5 步的網域沒加,或加成 `https://kurochu888.github.io`
(不要帶 `https://`,只填網域)。

**登入後資料不見了** — 雲端是空的,而本機有資料時會自動上傳;若是反過來(雲端有、本機也有),
以雲端為準。要保險起見,登入前先用「匯出備份」存一份。

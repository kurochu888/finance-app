# 這個專案是什麼

個人用的手機理財 app:記帳、資產負債、淨資產走勢,加上「用房屋理財型房貸額度買 00631L/00675L
兩檔台灣加權正2 ETF」這套槓桿策略的完整試算與訊號工具。單一使用者(屋主本人),沒有登入系統、
沒有多人共用,Firebase 只是拿來做「同一個人跨裝置同步」用的。

面向使用者的功能說明在 [README.md](README.md);槓桿頁每個公式、每個訊號怎麼判斷,
寫在 app 本身的「說明」分頁裡(`tests/help.js` 會檢查這兩者跟程式碼是否一致)。
這份文件是寫給**下一個接手這個 repo 的 Claude session**看的:專案骨架、目前的設計為什麼長這樣、
改動時要注意什麼。

## 開發前必讀:唯一可編輯的原始檔

**只改 `app.template.html`。** 這是整個 app 唯一的原始碼(HTML/CSS/JS 全部在一份檔案裡)。
`build.py` 從它產生三份輸出,這三份都是**產物,不要手動編輯**:

| 產物 | 用途 | 存檔方式 |
|---|---|---|
| `finance_app.html` | 獨立單檔,雙擊即用 | 瀏覽器 localStorage |
| `docs/index.html`(+`docs/sw.js`) | GitHub Pages 的 PWA,線上版網址 | 瀏覽器 localStorage,離線可用 |
| `finance_app_artifact.html` | Claude Artifact 版(`QUOTES_ENABLED=false`,不能連線抓報價) | Claude 雲端帳號 |

流程固定是:改 `app.template.html` → `python3 build.py` → `bash tests/run.sh` 全綠 →
commit 三份產物一起進去(不要只 commit 原始檔)→ push(GitHub Pages 從 `main` 的 `/docs` 自動發佈)。

`build.py` 會依 build 內容算一個 hash 換 `docs/sw.js` 的 CACHE 名稱,所以正常改完重新整理
應該會抓到新版;如果使用者說「改了但看起來沒變」,先懷疑是不是忘了跑 `build.py`,
其次才懷疑瀏覽器/PWA 快取沒更新。

## 測試

```sh
python3 build.py && bash tests/run.sh
```

跑完應該全部 `OK`/`沒有發現問題`。細節見 [tests/README.md](tests/README.md)。重點提醒:

- 測試讀的是 **`docs/index.html`**(build 產物),不是 `app.template.html`——改完原始檔一定要
  先 build 再測,不然測的是舊版程式碼。
- 每個測試檔開頭都用同一套手法:extract 最長的 `<script>` block、`eval()` 它,再用一個
  `globalThis.A = {...}` bridge 物件把裡面的 `let`/`const` 活繫結接出來給測試用
  (因為 `eval` 內的變數不會自然外洩到外層)。要在測試裡摸到新的內部函式/變數,record 要加進
  對應測試檔的這個 bridge 裡。
- `longrun.js` 會把 `Date` 換成假的、模擬 15 年每天開 app,跑起來要 30~60 秒,是最慢的一個。
- `audit.js` **不在** `tests/run.sh` 裡跑(故意的)——它是版面密度盤點,不是通過/失敗測試,
  要看的話手動 `node tests/audit.js`。
- `hunt.js` 有一項「normalize 往返後欄位不同」的已知誤報(補齊預設欄位不算掉資料),
  詳見 `tests/README.md`。

## 資料模型(`state`)重點

完整定義在 `emptyState()`(app.template.html:368)/`normalize()`(:379,舊資料遷移與防呆都在這裡)。
跟槓桿策略最相關的兩塊:

**`state.instruments[]`** ——持有的標的(00631L、00675L,也可以自己加 0050 之類的 1 倍標的)。
每檔有 `leverage`(曝險倍數換算用)跟 `trend`(均線訊號參數)跟 `priceHistory[]`(每日收盤,
均線訊號的原始資料,從證交所回補或匯入)。

**`state.leverage.draws[]`** ——房貸動用記錄的**自由清單**,每筆 `{id, label, amount, useDate,
note, repayments[]}`。這是整個 app 的房貸帳本:借款餘額、利息、曝險比例分母,全部從這裡加總。
早期版本這裡是固定的 `tranches[3]`(對應 −20/−32/−45% 跌幅門檻)+ 一個獨立的 `core`(長期部位)
兩種形狀混用;2026-09 這輪改動把兩者合併成一個沒有桶數限制、可以自由新增刪除的清單,因為
「-20/-32/-45% 跌幅動用」那套決策邏輯本身已經在更早一輪改動裡整個拿掉(見下一節),留著
tranches/core 的形狀區分已經沒有意義。`normalize()` 裡有舊資料 → `draws[]` 的遷移邏輯,
id 沿用舊值以確保重複呼叫不會飄動。

`DEFAULT_LEVERAGE`(app.template.html:334)裡還留著 `marketHigh`/`marketCurrent`/
`historicalHighValue`/`autoHigh` 這幾個欄位——**這些是舊觸發邏輯的遺跡,現在沒有任何 UI 讀寫它們**
(只有 `tests/longrun.js` 拿來當模擬腳本的心跳,不是在測真的 app 邏輯)。純粹是為了舊存檔資料
能讀得進來不出錯才留著,新增功能不要依賴這些欄位。

## 決策邏輯是怎麼演變的(現況 vs 已經拿掉的東西)

這個 repo 經歷過一次策略上的大轉向,是為了理解「為什麼程式碼長這樣」而不是「程式碼在做什麼」
才需要知道的背景:

1. **最早的設計**:固定三桶(−20%/−32%/−45% 跌幅各動用一桶)+ 每年 8% 撤退門檻。
   後來用真實加權指數歷史回測發現,正2 ETF 的波動耗損在「磨人型」(長期橫盤震盪)行情下,
   這套機制可能要 20 年以上才解套——回測結果否掉了整個策略。
2. **改成均線趨勢跟隨**:`computeTrend(it)`(app.template.html:2012)是一個三狀態機
   ——`WATCH`(還沒進場)→ `HOLD`(續抱)→ `WAIT_RECOVER`(接刀/分批加碼中),
   靠快線/慢線交叉、出場緩衝、加碼間距等參數判斷。**刻意設計成每次都從完整的
   `priceHistory` 重新回放整個狀態機**,不是把 `status`/`pyramidCount` 存成 state 裡
   逐筆增量修改的可變狀態——早期版本這樣做過,曾經有 `pyramidCount` 永遠不被重置的 bug,
   改成無狀態重算之後這整類 bug 不可能再發生。這套邏輯用 Monte Carlo(block bootstrap)
   對歷史報酬做過驗證。
3. **加上曝險目標**:光有訊號(該不該續抱/該不該加碼)還不夠,還要知道「加碼要加多少錢」。
   `computeExposurePlan()`(app.template.html:2069)把兩檔正2 的「加碼進度」(取兩檔裡比較
   保守的那個)對照 `state.leverage.exposureTargets`(每一層加碼對應的目標曝險比例),
   解一個代數式算出「全部用現金該投入多少」跟「全部用房貸該投入多少」這兩個邊界值
   ——公式細節見 app 說明頁或 `tests/trend.js` 裡的驗證案例。
4. **拿掉舊觸發邏輯,只留記帳**:−20/−32/−45% 的動用門檻判斷、8%/年撤退門檻、`exitReached`/
   `triggered` 這些欄位跟徽章,整批拿掉了(訊號判斷已經全部交給第 2、3 點)。
   但**動用日期/金額/還款這本帳不能刪**——借款餘額、利息、曝險比例的分母全部靠它,
   於是保留成現在的 `state.leverage.draws[]` 自由清單(見上一節)。

一句話版本:**現在唯一的決策依據是「訊號」分頁(均線趨勢 + 曝險目標 + 壓力測試);
「紀錄」分頁的動用記錄純粹是記帳,不做任何判斷。**

## 曝險比例公式(`computeRisk()`,app.template.html:1270)

```
部位淨值(equity) = 部位市值(pv) − 借款餘額(loan)
分母(capacity)   = 部位淨值 + 房貸總額度(creditLimit)
實質曝險(exposure) = Σ(各標的市值 × 該標的槓桿倍數)
曝險比例          = 實質曝險 ÷ 分母 × 100%
```

分母刻意用「部位淨值」不用「部位市值」——已借出的錢同時存在於部位market value跟額度裡,
用市值當分母會把它算兩次,比例會虛低。這點在 `tests/smoke.js` 有專門的回歸測試
(壓力測試那段,「沒有借款時下跌後曝險比例反而下降」的反直覺案例也有寫在裡面,
連同手算驗證的注解一起,別看到「曝險比例應該要升高」這種直覺斷言就照抄)。

## 常見的坑

- **測的是 `docs/index.html`,不是 `app.template.html`**——改完忘記 build 就跑測試,
  等於在測舊程式碼,測試會綠但其實沒測到新改動。
- **不要用 `.notice` 作為「這段文字有沒有被轉成可收合區塊」的判斷依據**——2026-09 這輪把
  幾段常駐說明文字改成 `<details class="tip">` 時,漏了一段用 `.muted` 寫的解釋文字
  (在 `renderExposurePlanCard()` 裡),因為當初只 grep 了 `class="notice"`。以後如果要
  找「這頁還有哪些說明文字」,`.notice` 跟 `.muted` 都要查,或者直接找中文的長句子。
- **這是 public repo**(`kurochu888/finance-app`)。`investment-policy.md`(使用者真實的部位
  金額,900萬/800萬那類數字)在 `.gitignore` 裡,只留在本機,絕對不要不小心 `git add` 進去。
- **PWA 快取是 network-first for navigation**(見 `docs/sw.js`),所以正常重新整理應該就能
  拿到新版;使用者回報「改了但沒變化」時,先確認是不是忘了 build,或者他測的是很久以前
  下載到本機的 `finance_app.html`(那份是靜態檔案,不會自動更新)。

## Git 慣例

- commit message 用中文,說「為什麼改」不是「改了什麼」(diff 自己看得出改了什麼)。
- commit 結尾固定加 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`(或當時對話
  指定的 attribution)。
- 只在使用者明確要求時才 commit/push;改完程式碼不代表可以自動 commit。

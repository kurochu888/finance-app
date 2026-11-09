# 設定 ETF 即時折溢價(Cloudflare Worker)

股票分頁的台股 ETF 可以顯示「預估淨值」跟「折溢價」,資料來自證交所的 ETF 即時預估淨值
(盤中約 15 秒更新一次)。證交所不允許網頁直接讀,所以要經過一個你自己的小轉送程式。
Cloudflare Workers 免費方案一天 10 萬次請求,這個 app 一台裝置開盤中一分鐘問一次,一天幾百次,用不完。

## 步驟(約 5~10 分鐘,只要做一次)

1. 到 <https://dash.cloudflare.com/sign-up> 註冊(免費,不用綁信用卡)。
2. 左邊選單 **Workers & Pages**(或「運算 → Workers」)→ **Create** → **Create Worker**(Hello World 範本)。
3. 名字隨便取,例如 `etf-nav`,按 **Deploy**。
4. 部署好之後按 **Edit code**,把左邊編輯器裡的內容**全部刪掉**,換成
   [`etf-nav-worker.js`](etf-nav-worker.js) 的全部內容,按右上角 **Deploy**。
5. 複製這個 Worker 的網址(長得像 `https://etf-nav.你的帳號.workers.dev`)。
   可以先用瀏覽器打開它:看到一大串 `{"a1":[{"msgArray":[...` 就是成功了。
6. 打開 app → **股票** 分頁 → 持股卡最下面的 **「ETF 即時折溢價」** → 把網址貼進去。

設定會跟著資料同步,其他裝置不用再貼一次。

## 顯示什麼

每檔台股 ETF 下面多一行:`預估淨值 27.73 · 溢價 +0.18%(09:03)`。
折溢價 = (市價 − 預估淨值) ÷ 預估淨值,用證交所算好的數字(市價跟淨值是同一個時間點的)。
溢價代表市價比淨值貴(現在買比較吃虧)、折價代表比較便宜。偏離 1% 以上會標 ⚠。
沒開盤時顯示的是最近一個交易日的數字,會標日期。

## 用指令部署(2026-11-09 實際是這樣部署的)

公司網路下 `wrangler login` 的瀏覽器授權沒成功,改用 API 金鑰:
Cloudflare 控制台 → My Profile → API Tokens → Create Token → 「Edit Cloudflare Workers」範本,
金鑰存在本機 `~/.cf-workers-token`(chmod 600,不進 repo),然後在 `tools/` 裡:

```sh
CLOUDFLARE_API_TOKEN="$(cat ~/.cf-workers-token)" npx wrangler deploy
```

設定在 [`wrangler.toml`](wrangler.toml)。帳號第一次用 Workers 要先有 workers.dev 子網域(這次用 API 申請了 `kurochu888`),
部署好的網址是 `https://etf-nav.kurochu888.workers.dev`;新子網域要等一兩分鐘才連得上。

## 出問題時

- 卡片上寫「折溢價抓不到」:先用瀏覽器打開 Worker 網址看看。
  - 打不開 / 錯誤:Worker 沒部署成功,回到第 4 步重新貼、按 Deploy。
  - 打得開但內容是錯誤訊息或空的:證交所可能擋了 Cloudflare 的連線,這時這個方法行不通,跟 Claude 說。
- 個股(不是 ETF)、美股不會有折溢價,這是正常的。

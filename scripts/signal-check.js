/* 每天收盤後檢查均線訊號,狀態改變就開一個 GitHub issue 通知(GitHub Actions 排程跑,見 .github/workflows/signal-check.yml)。
   app 的提醒只在打開 app 時才算,V 型急跌晚幾天看到差很多,所以在雲端每天自己算一次。

   - 規則不另外寫一份:直接載入 docs/index.html 裡的 app 程式,用同一個 computeTrend、mergeHistory(分割還原)、
     twseJson(證交所節流);跟測試同一套手法(eval 最長的 <script>)。
   - 用預設的標的(00631L/00675L)跟預設的訊號參數:使用者的資料在 Firebase/手機裡,這裡拿不到,也不該放進 public repo。
     在 app 裡改過訊號參數的話,這裡的結果會跟 app 不一樣。
   - 不存狀態:拿「到最後一個交易日」跟「到前一個交易日」各算一次,不一樣就是那天改變了。
     issue 標題帶那天的日期,同一個標題開過就不再開(連假、一天跑兩次都不會重複通知)。
   - 抓不到資料、歷史有缺口:結束碼非 0,GitHub 會寄排程失敗的通知,不會默默沒動靜。

   本機試跑(不開 issue,只印出來):node scripts/signal-check.js --dry
   假裝今天狀態變了(測通知用):node scripts/signal-check.js --dry --fake */
const fs = require('fs');
const path = require('path');

const DRY = process.argv.includes('--dry');
const FAKE = process.argv.includes('--fake');
const APP_URL = 'https://kurochu888.github.io/finance-app/';
// 續抱中「再跌幾 % 就出場」掉進這個範圍的那天先預警一次(前一天還在範圍外才發,同一段不會天天發)
const WARN_PCT = 5;

// ---- 載入 app(DOM 用假的,localStorage 記成「剛抓過報價」,啟動時才不會自己去抓) ----
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0, className:'', hidden:true,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;},
  setAttribute(){}, getAttribute(){ return null; } });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){}, visibilityState:'hidden' };
global.window = { claude: undefined, addEventListener(){} };
global.localStorage = { _d:{ financeQuoteFetchedAt: String(Date.now()) }, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const src = fs.readFileSync(path.join(__dirname, '..', 'docs', 'index.html'), 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { emptyState, computeTrend, trendHistoryGap, mergeHistory, closedRows, twseJson, monthParam,
  trendAlertText, TwseBlocked, TWSE_STOCK, BACKFILL_MONTHS, PRICE_HIST_KEEP };`);

const plain = t => String(t).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const STATUS = { HOLD: '續抱(HOLD)', WAIT_RECOVER: '接刀中(WAIT_RECOVER)', WATCH: '觀望(WATCH)' };
const describe = t => t.status === 'WAIT_RECOVER' ? `${STATUS[t.status]},已加碼 ${t.pyramidCount} 層` : STATUS[t.status] || t.status;

async function main(){
  const instruments = A.emptyState().instruments.filter(it => it.auto && it.id);
  const alerts = [], problems = [];
  for (const it of instruments){
    // 跟 app 的 backfillHistory 一樣:逐月往回抓,依序排隊、每次隔 2 秒(twseJson 管)
    let hist = [], splits = [];
    for (let offset = 0; offset > -A.BACKFILL_MONTHS; offset--){
      try{
        const j = await A.twseJson(A.TWSE_STOCK + encodeURIComponent(it.id) + '&date=' + A.monthParam(offset));
        if (j.stat === 'OK' && Array.isArray(j.data) && j.data.length) hist = A.mergeHistory(hist, A.closedRows(j.data), A.PRICE_HIST_KEEP, splits, it.id);
      }catch(e){
        if (e instanceof A.TwseBlocked) throw e;
        console.log(`  ${it.id} ${A.monthParam(offset)} 抓不到:${e.message}`);
      }
    }
    it.priceHistory = hist; it.splits = splits;
    const r = evaluate(it, FAKE);
    if (r.problem) problems.push(r.problem);
    alerts.push(...r.alerts);
  }
  if (FAKE) alerts.forEach(a => { a.title = '[測試] ' + a.title; });
  for (const a of alerts) await notify(a);
  if (!alerts.length) console.log('沒有狀態改變。');
  if (problems.length){
    problems.forEach(p => console.error('✗ ' + p));
    process.exitCode = 1;
  }
}

/* 一檔標的(priceHistory 已經填好)今天要發哪些通知。拆出來是為了測試能直接餵價格歷史(tests/signalcheck.js) */
function evaluate(it, fake = false){
  const alerts = [], hist = it.priceHistory;
  const t = A.computeTrend(it);
  if (t.barsAvailable < t.barsNeeded || A.trendHistoryGap(it))
    return { alerts, problem: `${it.id}:歷史不夠或中間缺一段(${t.barsAvailable}/${t.barsNeeded} 天),訊號不可信` };
  {
    const prev = A.computeTrend({ ...it, priceHistory: hist.slice(0, -1) });
    console.log(`${it.id} ${t.lastDate} 收盤 ${t.lastClose}:${describe(t)}(前一天 ${describe(prev)})`
      + (t.exitLine ? `,出場線 ${t.exitLine.toFixed(2)}、再跌 ${t.cushionPct.toFixed(1)}% 出場` : ''));
    const changed = prev.status !== t.status || (t.status === 'WAIT_RECOVER' && prev.pyramidCount !== t.pyramidCount);
    const nearExit = t.status === 'HOLD' && prev.status === 'HOLD' && t.cushionPct != null && t.cushionPct < WARN_PCT
      && !(prev.cushionPct != null && prev.cushionPct < WARN_PCT);
    if (nearExit){
      alerts.push({
        title: `⚠️ ${t.lastDate} ${it.id} 再跌 ${t.cushionPct.toFixed(1)}% 就出場`,
        body: [
          `**${it.id} ${t.lastDate}** 收盤 ${t.lastClose},出場線 ${t.exitLine.toFixed(2)}(快線 ${t.maFast.toFixed(2)} × ${it.trend.exitBuffer}),`
            + `再跌 ${t.cushionPct.toFixed(1)}% 收盤跌破就是出場訊號。`,
          '',
          '還不用動,只是先準備:出場的話正2 要賣多少、賣得的錢要不要還房貸,先在 app 的「正2 曝險目標」卡想好。'
            + '出場線會跟著快線移動,之後真的跌破會再發一次 🔔。',
          '',
          `app:${APP_URL}`,
          '',
          `<sub>續抱中距離出場線掉進 ${WARN_PCT}% 以內的那天發一次;GitHub Actions 用預設參數自動算的(scripts/signal-check.js)。</sub>`,
        ].join('\n'),
      });
    }
    if (!changed && !fake) return { alerts };
    // 提醒文字用 app 的同一份(trendAlertText),「上次看過的」當成前一天的狀態
    it.trend.lastSeenStatus = fake && !changed ? (t.status === 'HOLD' ? 'WAIT_RECOVER' : 'HOLD') : prev.status;
    it.trend.lastSeenLayers = prev.pyramidCount;
    const a = A.trendAlertText(t, it);
    alerts.push({
      title: `🔔 ${t.lastDate} ${plain(a.title)}`,
      body: [
        `**${it.id} ${t.lastDate}**:${describe(prev)} → **${describe(t)}**`,
        '',
        `收盤 ${t.lastClose}、快線 ${t.maFast.toFixed(2)}、慢線 ${t.maSlow.toFixed(2)}` + (t.exitLine ? `、出場線 ${t.exitLine.toFixed(2)}` : ''),
        '',
        plain(a.body),
        '',
        `打開 app 看金額、按「知道了」:${APP_URL}`,
        '',
        '<sub>GitHub Actions 每天收盤後用預設參數自動算的(scripts/signal-check.js);在 app 裡改過訊號參數的話以 app 為準。</sub>',
      ].join('\n'),
    });
  }
  return { alerts };
}

async function notify(a){
  console.log('\n' + a.title + '\n' + a.body);
  if (DRY) return;
  const repo = process.env.GITHUB_REPOSITORY, token = process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error('沒有 GITHUB_REPOSITORY / GITHUB_TOKEN(本機試跑請加 --dry)');
  const api = (p, opt = {}) => fetch('https://api.github.com/repos/' + repo + p, { ...opt, headers: {
    Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' } });
  // 同一個標題(含日期)開過就不再開:連假期間每天跑、一天跑兩次都不會重複通知
  const res = await api('/issues?state=all&per_page=100&creator=' + encodeURIComponent('app/github-actions'));
  const seen = res.ok ? (await res.json()).map(x => x.title) : [];
  if (seen.includes(a.title)){ console.log('(已經通知過,略過)'); return; }
  const owner = repo.split('/')[0];
  const r = await api('/issues', { method: 'POST', body: JSON.stringify({ title: a.title, body: a.body + `\n\n@${owner}` }) });
  if (!r.ok) throw new Error('開 issue 失敗:HTTP ' + r.status + ' ' + await r.text());
  console.log('已開 issue:' + (await r.json()).html_url);
}

if (require.main === module) main().catch(e => { console.error('✗ ' + (e && e.message || e)); process.exitCode = 1; });
else module.exports = { evaluate, A, WARN_PCT };

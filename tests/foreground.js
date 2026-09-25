/* 手機 PWA 放在背景、隔天切回來(同一個頁面繼續跑,不會重新 init)。2026-09 抓到:回到前景什麼都不做——
   不抓新收盤價(🔔 還是前一天的訊號)、標題日期跟記帳/買賣的預設日期停在前一天、不記當月利息。
   另外:13:00 抓過報價、13:50 再打開,以前要等滿一小時才會抓今天的收盤價。 */
const mkEl = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0, classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;}, setAttribute(){}, getAttribute(){} });
const store = {};
const listeners = {};
global.document = { activeElement:null, visibilityState:'visible', getElementById:id=>store[id]||(store[id]=mkEl(id)), querySelectorAll:()=>[], querySelector:()=>null,
  addEventListener(t, f){ (listeners[t] = listeners[t] || []).push(f); } };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;}, key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
global.window = {};

// 假時鐘:台灣時間(測試機時區不一定是台灣,todayISO 用的是本地時間,所以直接把 TZ 設成台北)
process.env.TZ = 'Asia/Taipei';
const RealDate = Date;
let nowMs = new RealDate('2026-09-24T13:00:00+08:00').getTime();
global.Date = class extends RealDate {
  constructor(...a){ if (a.length) super(...a); else super(nowMs); }
  static now(){ return nowMs; }
};
const setTime = s => { nowMs = new RealDate(s).getTime(); };

// 假證交所:記下每次請求。沒有自動報價的標的,抓報價只會問一次大盤(不會觸發回補),請求次數 = 抓報價次數
let quoteCalls = 0;
global.fetch = async (url) => {
  if (String(url).includes('twse')) quoteCalls++;
  return { ok:true, status:200, json: async () => ({ stat:'OK', data:[['115/09/23', '20000']] }) };
};

const src = require('fs').readFileSync(__dirname + '/../docs/index.html', 'utf8');
const js = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
const A = (0, eval)('(() => {' + js.replace(/\ninit\(\);\s*$/, '\n') + `; return { init, normalize,
  get state(){ return state; }, set state(v){ state = v; },
  onForeground, get draft(){ return draft; }, get tradeDraft(){ return tradeDraft; }, get viewMonth(){ return viewMonth; } }; })()`);
const wait = ms => new Promise(r => setTimeout(r, ms));
const bugs = [];

(async () => {
  localStorage.setItem('financeAppState_v2', JSON.stringify({
    version:2, assets:[{ id:'a', name:'現金', amount:100 }], liabilities:[], trades:[], transactions:[], netWorthHistory:[], budgets:[], instruments:[],
    leverage:{ creditLimit:1000000, annualRate:2.4, autoInterest:true, interestPosted:['2026-09'],
      draws:[{ id:'d1', label:'x', amount:500000, useDate:'2026-01-05', note:'', repayments:[] }] }
  }));
  A.init();
  await wait(3000);
  const first = quoteCalls;
  console.log('1. 9/24 13:00 打開:抓報價請求', first, '次,預設日期', A.draft.date, A.tradeDraft.date);
  if (!first) bugs.push('打開 app 沒有抓報價(測試本身有問題)');

  // 2) 13:50 切回來(同一天、還不到一小時):今天的收盤價 13:35 才確定,要再抓一次
  setTime('2026-09-24T13:50:00+08:00');
  (listeners.visibilitychange || []).forEach(f => f());
  await wait(3000);
  console.log('2. 同一天 13:50 切回前景:新的請求', quoteCalls - first, '次');
  if (quoteCalls === first) bugs.push('13:00 抓過、13:50 切回來沒有再抓(今天的收盤價要等到 14:00 以後)');

  // 2b) 13:55 再切回來:收盤後已經抓過了,一小時內不要再問證交所
  const after2 = quoteCalls;
  setTime('2026-09-24T13:55:00+08:00');
  (listeners.visibilitychange || []).forEach(f => f());
  await wait(1000);
  if (quoteCalls !== after2) bugs.push('收盤後抓過,5 分鐘後切回來又抓了一次(會吃掉證交所的請求額度)');

  // 3) 放在背景過了一個月,10/2 早上切回來
  const before = quoteCalls;
  setTime('2026-10-02T09:00:00+08:00');
  (listeners.visibilitychange || []).forEach(f => f());
  await wait(3000);
  const s = A.state;
  console.log('3. 10/2 切回前景:請求', quoteCalls - before, '次,預設日期', A.draft.date, A.tradeDraft.date,
    '| 看的月份', A.viewMonth, '| 已記利息的月份', s.leverage.interestPosted.join(','), '| 標題', store.todayDate && store.todayDate.textContent);
  if (quoteCalls === before) bugs.push('隔天切回前景沒有抓新收盤價(🔔 還是前一天的訊號)');
  if (A.draft.date !== '2026-10-02') bugs.push('記帳的預設日期還停在前一天:' + A.draft.date);
  if (A.tradeDraft.date !== '2026-10-02') bugs.push('買賣紀錄的預設日期還停在前一天:' + A.tradeDraft.date);
  if (A.viewMonth !== '2026-10') bugs.push('記帳頁還停在上個月:' + A.viewMonth);
  if (!s.leverage.interestPosted.includes('2026-10')) bugs.push('跨月切回前景沒有記當月的房貸利息');
  if (!s.dailyHistory.some(h => h.d === '2026-10-02')) bugs.push('切回前景沒有記當天的每日快照');
  if (!store.todayDate || store.todayDate.textContent !== '10/2') bugs.push('標題日期停在前一天:' + (store.todayDate && store.todayDate.textContent));

  // 4) 使用者自己選了別天(補記前幾天的),切回來不能被改掉
  A.draft.date = '2026-09-30';
  setTime('2026-10-03T09:00:00+08:00');
  (listeners.visibilitychange || []).forEach(f => f());
  await wait(100);
  console.log('4. 自己選的日期', A.draft.date);
  if (A.draft.date !== '2026-09-30') bugs.push('使用者自己選的日期被切回前景改掉了');

  // 5) 桌機分頁一直開在前景(10 分鐘計時器):不要每小時問一次,收盤後才抓一次
  await wait(2500);
  let c = quoteCalls;
  setTime('2026-10-03T11:30:00+08:00'); A.onForeground(true); await wait(500);
  if (quoteCalls !== c) bugs.push('計時器在盤中又抓了一次(桌機開著會整天每小時問證交所)');
  c = quoteCalls;
  setTime('2026-10-03T13:40:00+08:00'); A.onForeground(true); await wait(2500);
  if (quoteCalls === c) bugs.push('計時器在收盤後沒有抓今天的收盤價');
  console.log('5. 計時器:盤中不抓、收盤後抓', quoteCalls - c, '次');

  console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
  if (bugs.length) process.exitCode = 1;
  process.exit();
})();

/* 長期使用壓測:把時鐘換成可控的,模擬五年每天開 app 的行為,
   同時檢查資料一致性、存檔、效能與容量。 */
const RealDate = Date;
let simNow = new RealDate('2026-09-08T09:00:00').getTime();
class FakeDate extends RealDate {
  constructor(...a){ if (a.length === 0) super(simNow); else super(...a); }
  static now(){ return simNow; }
}
global.Date = FakeDate;
const DAY = 86400000;
const iso = t => { const d = new RealDate(t);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };

const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;},
  setAttribute(){}, getAttribute(){} });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
let quotaBytes = 5 * 1024 * 1024;                     // 模擬 localStorage 5MB 上限
global.localStorage = {
  _d:{},
  get length(){ return Object.keys(this._d).length; },
  key(i){ const k = Object.keys(this._d); return i < k.length ? k[i] : null; },
  getItem(k){ return this._d[k] ?? null; },
  setItem(k, v){
    const next = { ...this._d, [k]: String(v) };
    const size = Object.entries(next).reduce((s, [a, b]) => s + a.length + b.length, 0);
    if (size * 2 > quotaBytes){ const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this._d[k] = String(v);
  },
  removeItem(k){ delete this._d[k]; },
  usedBytes(){ return Object.entries(this._d).reduce((s, [a, b]) => s + a.length + b.length, 0) * 2; }
};

const fs = require('fs');
const src = fs.readFileSync('/ssd1/finance/docs/index.html','utf8');
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
eval(blocks.sort((a,b)=>b.length-a.length)[0] + `
globalThis.A = {
  get state(){return state}, set state(v){state=v}, set currentTab(v){currentTab=v},
  get storageMode(){return storageMode}, renderAll, emptyState, computePosition,
  computeLeverage, computeRisk, maybeSnapshot, maybeBackup, maybePostInterest,
  heldShares, save, todayISO, thisMonth, uid
};`);

const problems = [];
const seen = new Set();
const flag = (msg) => { if (!seen.has(msg)){ seen.add(msg); problems.push(msg); } };

A.state = A.emptyState();
const I = () => A.state.instruments.find(x => x.id === '00631L');
I().price = 36.64;
A.state.leverage.marketHigh = 24000;
A.state.leverage.marketCurrent = 22000;
A.state.leverage.creditLimit = 5000000;
A.state.assets = [{ id:'a1', name:'現金', amount:1500000 }, { id:'a2', name:'不動產', amount:9000000 }];
A.state.liabilities = [{ id:'l1', name:'房貸', amount:4000000 }];

let rnd = 12345;
const rand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

const tabs = ['overview','assets','ledger','leverage','help'];
let maxRender = 0, maxRenderDay = '', drawn = 0;
const samples = [];

const YEARS = 15;
(async () => {
for (let day = 0; day < 365 * YEARS; day++){
  simNow += DAY;
  const today = A.todayISO();
  const dom = new RealDate(simNow).getDate();

  /* 腳本化的多空循環,確保槓桿那條路真的被走到:
     第 1 年盤整 → 第 2 年崩 55% → 第 3~4 年復甦創新高 → 第 5 年高檔震盪 */
  const yr = day / 365;
  let drift;
  if (yr < 1) drift = 0.0002;
  else if (yr < 2) drift = -0.0032;      // 崩盤
  else if (yr < 4) drift = 0.0022;       // 復甦
  else if (yr < 7) drift = 0.0003;
  else if (yr < 8) drift = -0.0030;      // 第二次崩盤
  else drift = 0.0015;
  const shock = (rand() - 0.5) * 0.012;
  const idxRet = drift + shock;
  A.state.leverage.marketCurrent = Math.max(6000, A.state.leverage.marketCurrent * (1 + idxRet));
  if (A.state.leverage.marketCurrent > A.state.leverage.marketHigh)
    A.state.leverage.marketHigh = A.state.leverage.marketCurrent;
  I().price = Math.max(1, I().price * (1 + 2 * idxRet));   // 正2:兩倍

  // 記帳:平均一天一筆,月初一筆薪水
  if (dom === 1) A.state.transactions.push({ id:A.uid(), date:today, cat:'薪資', desc:'月薪', amount:120000 });
  if (rand() < 0.9) A.state.transactions.push({ id:A.uid(), date:today,
    cat:['餐飲','交通','娛樂','其他'][Math.floor(rand()*4)], desc:'日常消費', amount:-Math.round(200 + rand()*2000) });

  // 每季用薪水加碼
  if (dom === 5 && new RealDate(simNow).getMonth() % 3 === 0)
    A.state.trades.push({ id:A.uid(), date:today, symbol:'00631L', action:'buy',
      shares:2000, price:I().price, fee:Math.round(2000*I().price*0.001425), amount:0, source:'cash', note:'定期投入' });

  // 大盤跌到門檻就動用桶金;漲多了就還一點
  const r0 = A.computeLeverage();
  r0.tranches.forEach(view => {
    // computeLeverage 回傳的是複本,要改真的那一筆
    const t = A.state.leverage.tranches.find(x => x.id === view.id);
    if (t && !t.useDate && view.triggered && drawn < 3){
      t.useDate = today; t.useIndex = Math.round(A.state.leverage.marketCurrent); drawn++;
      A.state.trades.push({ id:A.uid(), date:today, symbol:'00631L', action:'buy',
        shares: Math.floor(t.amount / I().price), price:I().price, fee:Math.round(t.amount*0.001425),
        amount:0, source:'loan', note:t.label });
    }
  });
  if (r0.exitReached && rand() < 0.05){
    const held = A.heldShares('00631L');
    if (held > 3000){
      A.state.trades.push({ id:A.uid(), date:today, symbol:'00631L', action:'sell',
        shares:3000, price:I().price, fee:Math.round(3000*I().price*0.002425), amount:0, source:'cash', note:'減碼' });
      const t = A.state.leverage.tranches.find(x => x.useDate && x.balance !== 0 &&
        (x.repayments||[]).reduce((n,r)=>n+r.amount,0) < x.amount);
      if (t) t.repayments.push({ id:A.uid(), date:today, amount:200000 });
    }
  }
  if (dom === 20 && rand() < 0.1)
    A.state.trades.push({ id:A.uid(), date:today, symbol:'00631L', action:'dividend',
      shares:0, price:0, amount:Math.round(3000+rand()*5000), fee:0, source:'cash', note:'配息' });

  // 每天開 app 會做的事
  A.maybePostInterest();
  A.maybeSnapshot();
  await A.maybeBackup();     // 真的等它做完,才測得到備份與容量
  await A.save();

  // 每 30 天把每個分頁都畫一次並檢查
  if (day % 30 === 0 || day === 365*YEARS - 1){
    const t0 = process.hrtime.bigint();
    tabs.forEach(tab => {
      A.currentTab = tab;
      A.renderAll();
      const html = store.content.innerHTML;
      if (html.includes('NaN')) flag('第 ' + day + ' 天:' + tab + ' 出現 NaN');
      if (html.includes('undefined')) flag('第 ' + day + ' 天:' + tab + ' 出現 undefined');
      if (!html || html.length < 100) flag('第 ' + day + ' 天:' + tab + ' 幾乎是空的');
    });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms > maxRender){ maxRender = ms; maxRenderDay = today; }

    const p = A.computePosition();
    if (!isFinite(p.total)) flag('整體損益變成非數字');
    if (p.xirr !== null && !isFinite(p.xirr)) flag('XIRR 變成非數字');
    if (A.heldShares('00631L') < 0) flag('持股變成負數');
    if (A.storageMode === 'none') flag('第 ' + day + ' 天起存不進去了(' + today + ')');

    if (day % 1095 === 0 || day === 365*YEARS - 1){
      const bytes = Buffer.byteLength(JSON.stringify(A.state), 'utf8');
      let backups = 0;
      for (let i = 0; i < localStorage.length; i++)
        if (localStorage.key(i).indexOf('financeBackup_') === 0) backups++;
      samples.push({ year: (day/365).toFixed(1), date: today, idx: Math.round(A.state.leverage.marketCurrent),
        loan: Math.round(A.computeLeverage().usedAmount),
        tx: A.state.transactions.length, tr: A.state.trades.length,
        snap: A.state.netWorthHistory.length, backups,
        kb: (bytes/1024).toFixed(0), lsKB: (localStorage.usedBytes()/1024).toFixed(0),
        renderMs: ms.toFixed(1), mode: A.storageMode,
        xirr: p.xirr === null ? '—' : p.xirr.toFixed(1) + '%' });
    }
  }
}

console.log('模擬 ' + YEARS + ' 年,每天開一次 app\n');
console.log('年份  日期          大盤   借款餘額  交易  買賣 快照 備份  資料KB   localStorage 重畫   年化');
samples.forEach(s => {
  console.log(String(s.year).padStart(3) + '   ' + s.date + String(s.idx).padStart(8) +
    String(s.loan.toLocaleString()).padStart(11) +
    String(s.tx).padStart(6) + String(s.tr).padStart(6) + String(s.snap).padStart(5) +
    String(s.backups).padStart(5) + String(s.kb).padStart(8) + 'KB' +
    String(s.lsKB).padStart(10) + 'KB' + String(s.renderMs).padStart(7) + 'ms' + s.xirr.padStart(9));
});
console.log('\n最慢一次五頁重畫:' + maxRender.toFixed(1) + 'ms(' + maxRenderDay + ')');
console.log('\n動用桶金 ' + drawn + ' 桶 | 還款 ' +
  A.state.leverage.tranches.reduce((n,t)=>n+(t.repayments||[]).length,0) + ' 筆 | ' +
  '房貸利息自動入帳 ' + A.state.transactions.filter(t=>t.cat==='房貸利息').length + ' 筆');
console.log(problems.length ? '\n發現問題:\n' + problems.map((p,i)=>'  '+(i+1)+'. '+p).join('\n') : '\n沒有發現問題');
})();

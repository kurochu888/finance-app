/* 計算正確性的隨機測試:隨機產生幾百組買賣/配息/動用/還款,檢查會計恆等式跟 XIRR 真的是解。
   fuzz.js 檢查的是「算出來是不是有限數字」,這裡檢查的是「算得對不對」。 */
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;} });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)), querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{ financeTwseCooldownUntil: String(Date.now() + 1e12) }, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;}, getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, computePosition, computeLeverage,
  heldShares, cashFlows, accruedInterest, outstanding, todayISO };`);

const bugs = [];
const must = (c, m) => { if (!c && bugs.length < 12) bugs.push(m); };
let seed = 20260924;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dayOffset = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

console.log('隨機 400 組買賣/配息/動用/還款:會計恆等式、持股數、XIRR 是 NPV=0 的解');
for (let k = 0; k < 400; k++){
  const s = A.emptyState();
  s.instruments[0].price = 10 + rnd() * 90;
  s.instruments[1].price = 50 + rnd() * 300;
  const syms = s.instruments.map(it => it.id);
  const n = 1 + Math.floor(rnd() * 25);
  const held = {};
  for (let i = 0; i < n; i++){
    const sym = syms[Math.floor(rnd() * 2)];
    const date = dayOffset(Math.floor(rnd() * 1500));
    const r = rnd();
    if (r < 0.65 || !(held[sym] > 0)){
      const shares = 1000 * (1 + Math.floor(rnd() * 5));
      s.trades.push({ id:'t' + i, date, symbol: sym, action:'buy', shares, price: 5 + rnd() * 200, fee: Math.round(rnd() * 100), amount:0, source: rnd() < 0.4 ? 'loan' : 'cash', note:'' });
      held[sym] = (held[sym] || 0) + shares;
    }else if (r < 0.9){
      const shares = Math.min(held[sym], 1000 * (1 + Math.floor(rnd() * 3)));
      s.trades.push({ id:'t' + i, date, symbol: sym, action:'sell', shares, price: 5 + rnd() * 200, fee: Math.round(rnd() * 100), amount:0, source:'cash', note:'' });
      held[sym] -= shares;
    }else{
      s.trades.push({ id:'t' + i, date, symbol: sym, action:'dividend', shares:0, price:0, fee: 10, amount: Math.round(rnd() * 20000), source:'cash', note:'' });
    }
  }
  const nd = Math.floor(rnd() * 4);
  for (let j = 0; j < nd; j++){
    const amount = 100000 * (1 + Math.floor(rnd() * 20));
    const useDate = dayOffset(Math.floor(rnd() * 1200));
    const reps = [];
    for (let q = 0; q < Math.floor(rnd() * 4); q++) reps.push({ id:'r' + j + q, date: dayOffset(Math.floor(rnd() * 1200)), amount: Math.round(rnd() * amount / 2) });
    s.leverage.draws.push({ id:'d' + j, label:'x', amount, useDate, note:'', repayments: reps });
  }
  s.leverage.annualRate = rnd() * 5;
  A.state = A.normalize(JSON.parse(JSON.stringify(s)));
  const p = A.computePosition();
  // 會計恆等式:總損益 = 市值 + 賣出所得 + 配息 − 總投入(含手續費)− 利息(沒有賣超時成立)
  if (!p.oversold){
    const expect = p.marketValue + p.sellNet + p.dividends - p.invested - p.interest;
    must(Math.abs(p.total - expect) < 1e-6 * Math.max(1, Math.abs(expect)), `組 ${k}:總損益 ${p.total} ≠ 市值+賣出+配息−投入−利息 ${expect}`);
    for (const sym of syms){
      const lot = p.lots[sym];
      must(!lot || Math.abs(lot.shares - A.heldShares(sym)) < 1e-9, `組 ${k} ${sym}:逐筆回放的持股 ${lot && lot.shares} ≠ heldShares ${A.heldShares(sym)}`);
    }
  }
  // 借款利息:每筆各自累積的加總
  const L = A.computeLeverage();
  must(Math.abs(L.usedAmount - A.state.leverage.draws.reduce((a, d) => a + A.outstanding(d), 0)) < 1e-6, `組 ${k}:借款餘額加總不一致`);
  // XIRR 要真的是解:答案稍高、稍低一點的利率,NPV 正負號要相反(根被夾在中間)。
  // 不直接要求 NPV≈0——接近 −100% 時利率差 1e-10 NPV 就差上億,那個標準不適用。
  if (p.xirr !== null){
    const flows = A.cashFlows();
    const t0 = new Date(flows[0].date + 'T00:00:00').getTime();
    const npv = r => flows.reduce((acc, f) => acc + f.amount / Math.pow(1 + r, (new Date(f.date + 'T00:00:00').getTime() - t0) / (365.25 * 86400000)), 0);
    const r = p.xirr / 100, eps = Math.max(1e-9, (1 + r) * 1e-6);
    const a = npv(r - eps), b = npv(r + eps);
    must(a * b <= 0, `組 ${k}:XIRR ${p.xirr.toFixed(6)}% 不是解(r±ε 的 NPV 同號:${a.toFixed(2)} / ${b.toFixed(2)})`);
  }
}
console.log('  ok');

console.log('同一天先記賣出、後記買進(當沖/事後改日期):不能被當成賣超過持股');
{
  const s = A.emptyState();
  s.instruments[0].price = 50;
  const d = dayOffset(10);
  s.trades = [
    { id:'s1', date:d, symbol:'00631L', action:'sell', shares:1000, price:52, fee:50, amount:0, source:'cash', note:'' },
    { id:'b1', date:d, symbol:'00631L', action:'buy',  shares:1000, price:50, fee:50, amount:0, source:'cash', note:'' },
  ];
  A.state = A.normalize(s);
  const p = A.computePosition();
  must(!p.oversold, '同一天先記賣出再記買進,被判成賣超過持股');
  must(Math.abs(p.realized - (1000 * 52 - 50 - (1000 * 50 + 50))) < 1e-6, `同日買賣的已實現損益應該是 1900,得到 ${p.realized}`);
}
console.log('  ok');

console.log();
console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
process.exit(bugs.length ? 1 : 0);

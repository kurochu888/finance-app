/* 「照 app 的建議實際做一次,再讓 app 重算」的核對測試(oracle):
   - 曝險目標:照方案A(現金)或方案B(房貸)的金額,兩檔正2 各半買進,買完曝險比例要剛好等於目標。
   - 壓力測試:把每檔股價照自己的槓桿倍數真的調降,app 重算的曝險比例要跟壓力測試預測的一樣。
   用隨機的額度、借款、股價、持股跑很多組,抓的是公式跟實際計算接錯線(例如漏算 1 倍標的、手續費、重複代號)。 */
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
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, sampleData, normalize, computeExposurePlan, computeRisk,
  computeStress, todayISO };`);

const bugs = [];
const must = (c, m) => { if (!c && bugs.length < 12) bugs.push(m); };
let seed = 4242;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const clone = o => JSON.parse(JSON.stringify(o));

function randomState(){
  const s = A.sampleData();
  s.leverage.creditLimit = Math.round(1e6 + rnd() * 2e7);
  s.leverage.draws = [];
  const nd = Math.floor(rnd() * 3);
  for (let j = 0; j < nd; j++) s.leverage.draws.push({ id:'d' + j, label:'x', amount: Math.round(rnd() * 3e6), useDate:'2026-01-0' + (j + 1), note:'', repayments:[] });
  s.instruments.forEach(it => { it.price = Math.round((5 + rnd() * 400) * 100) / 100; });
  s.leverage.exposureTargets = { byLayer:[40 + Math.round(rnd() * 60), 80 + Math.round(rnd() * 80)], hold: 90 + Math.round(rnd() * 100) };
  return A.normalize(s);
}
function buy(state, delta, source){
  const lev2 = state.instruments.filter(it => it.leverage === 2);
  lev2.forEach((it, i) => state.trades.push({ id:'o' + i + source, date: A.todayISO(), symbol: it.id, action:'buy',
    shares: delta / lev2.length / it.price, price: it.price, fee: 0, amount: 0, source, note:'' }));
  if (source === 'loan') state.leverage.draws.push({ id:'dx', label:'x', amount: delta, useDate: A.todayISO(), note:'', repayments:[] });
}

console.log('曝險目標:照方案A/方案B買進之後,曝險比例要剛好等於目標(隨機 300 組)');
let tested = 0;
for (let k = 0; k < 300; k++){
  const base = randomState();
  A.state = clone(base);
  const plan = A.computeExposurePlan();
  if (!plan || !(plan.deltaLoan > 1)) continue;          // 只驗「該加碼」的情況
  tested++;
  for (const [src, delta] of [['loan', plan.deltaLoan], ['cash', plan.deltaCash]]){
    if (delta == null) continue;                          // 純現金到不了
    A.state = clone(base);
    buy(A.state, delta, src);
    const ratio = A.computeRisk().exposureRatio;
    must(Math.abs(ratio - plan.targetRatio) < 1e-6, `組 ${k}:方案${src === 'loan' ? 'B(房貸)' : 'A(現金)'}投入 ${delta.toFixed(0)} 後曝險 ${ratio.toFixed(4)}%,目標是 ${plan.targetRatio}%`);
  }
}
must(tested > 30, `(測試本身)應該要有夠多組是「該加碼」的情況,只有 ${tested} 組`);
console.log(`  ok(驗了 ${tested} 組)`);

console.log('壓力測試:把股價照槓桿倍數真的調降之後,app 重算的曝險比例要跟預測的一樣(隨機 300 組)');
for (let k = 0; k < 300; k++){
  const base = randomState();
  const d = Math.round(rnd() * 60);
  A.state = clone(base);
  const st = A.computeStress(d);
  if (!st) continue;
  A.state = clone(base);
  A.state.instruments.forEach(it => { it.price = it.price * Math.max(0, 1 - d * (it.leverage || 1) / 100); });
  const after = A.computeRisk();
  must(Math.abs(after.pv - st.newPv) < 1e-6 * Math.max(1, st.newPv), `組 ${k} 跌 ${d}%:預測市值 ${st.newPv} ≠ 實際 ${after.pv}`);
  must(Math.abs(after.exposureRatio - st.newRatio) < 1e-6, `組 ${k} 跌 ${d}%:預測曝險 ${st.newRatio.toFixed(4)}% ≠ 實際重算 ${after.exposureRatio.toFixed(4)}%`);
  must(Math.abs(after.equity - st.newEquity) < 1e-6 * Math.max(1, Math.abs(st.newEquity)), `組 ${k} 跌 ${d}%:預測淨值 ${st.newEquity} ≠ 實際 ${after.equity}`);
}
console.log('  ok');

console.log();
console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
process.exit(bugs.length ? 1 : 0);

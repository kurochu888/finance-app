/* 停用標的(2026-11 使用者要的:改用 00631L/00685L、不再用 00675L,買賣紀錄留著所以標的刪不掉)。
   停用 + 沒持股:不算訊號、不進曝險目標、提醒、收盤價太舊、健康檢查;還有持股的照常算;舊版分頁寫回來要補回。 */
const RealDate = Date;
let simNow = new RealDate('2026-11-20T15:00:00').getTime();
class FakeDate extends RealDate {
  constructor(...a){ super(...(a.length ? a : [simNow])); }
  static now(){ return simNow; }
}
global.Date = FakeDate;
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0, className:'',
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;} });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{ financeTwseCooldownUntil: String(simNow + 3600000 * 24 * 365) }, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];

eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, onClick,
  computeAllTrends, computeExposurePlan, trendChanges, signalStaleness, healthCheck, keepFieldsOldVersionsDrop, instOn,
  renderLeverage, set levTab(v){levTab=v}, get levMsg(){return levMsg}, computeLeverage };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };

// 300 個交易日:先漲到高點再跌 30%,兩檔都出場、接刀第 1 層
function hist(scale, lastDay){
  const out = [];
  let d = new RealDate('2025-08-01T00:00:00Z');
  const n = 300;
  for (let i = 0; i < n; i++){
    while ([0, 6].includes(d.getUTCDay())) d = new RealDate(d.getTime() + 86400000);
    const p = i < 260 ? 100 + i * 0.2 : 152 - (i - 259) * 1.5;
    out.push({ d: d.toISOString().slice(0, 10), c: +(p * scale).toFixed(2) });
    d = new RealDate(d.getTime() + 86400000);
  }
  return lastDay ? out.filter(h => h.d <= lastDay) : out;
}
function fresh(){
  const s = A.emptyState();
  const h1 = hist(1), last = h1[h1.length - 1].d;
  s.instruments = [
    { key:'k31', id:'00631L', name:'', leverage:2, price:h1[h1.length - 1].c, shares:0, auto:true, priceHistory:h1, splits:[] },
    // 00675L 停用,價格歷史停在 10 天前(不再抓報價)
    { key:'k75', id:'00675L', name:'', leverage:2, price:200, shares:0, auto:true, off:true, priceHistory:hist(2, h1[h1.length - 11].d), splits:[] },
  ];
  s.trades = [
    { id:'b1', date:'2025-09-01', symbol:'00675L', action:'buy', shares:1000, price:220, fee:300, source:'own' },
    { id:'s1', date:'2025-10-01', symbol:'00675L', action:'sell', shares:1000, price:230, fee:600, source:'own' },
  ];
  A.state = A.normalize(s);
  A.state.leverage.quoteDate = last;
  return last;
}

console.log('normalize 一定寫出 off');
fresh();
must(A.state.instruments[0].off === false && A.state.instruments[1].off === true, 'off 欄位:' + A.state.instruments.map(i => i.off));
must(JSON.stringify(A.normalize(JSON.parse(JSON.stringify(A.state))).instruments) === JSON.stringify(A.state.instruments), 'normalize 往返要一樣');

console.log('停用 + 已賣光:不算訊號、不進曝險目標');
must(!A.instOn(A.state.instruments[1]), '00675L 賣光又停用,不算啟用');
must(A.computeAllTrends().map(t => t.key).join() === 'k31', '訊號只剩 00631L:' + A.computeAllTrends().map(t => t.key));
const plan = A.computeExposurePlan();
must(plan && plan.instruments.join() === 'k31', '曝險目標只看 00631L:' + (plan && plan.instruments));
A.state.instruments[1].trend.lastSeenStatus = 'HOLD';   // 上次看過是續抱,啟用的話會跳提醒
must(!A.trendChanges().some(t => t.key === 'k75'), '停用的不跳提醒');
const st = A.signalStaleness('2026-11-20');
must(!st || st.date === A.state.instruments[0].priceHistory.slice(-1)[0].d, '收盤價太舊只看啟用的:' + JSON.stringify(st));
const hc = A.healthCheck().map(x => x.t).join('\n');
must(/00675L 已停用/.test(hc) && !/00675L .*收盤/.test(hc), '健康檢查列「已停用」、不列它的訊號:\n' + hc);
must(/00631L .*收盤/.test(hc), '健康檢查還是列 00631L 的訊號');
A.levTab = 'settings';
must(/已停用/.test(A.renderLeverage()), '設定頁收合那行要顯示已停用');
A.onClick({ dataset:{ act:'fold', v:'inst-k75' } });
must(/恢復使用/.test(A.renderLeverage()), '展開後要有恢復按鈕');

console.log('刪除被擋時提示可以停用');
A.onClick({ dataset:{ act:'del-instrument', id:'k75' } });
must(A.state.instruments.length === 2 && /停用/.test(A.levMsg), '有紀錄刪不掉、提示停用:' + A.levMsg);

console.log('還有持股的照常算');
A.state.trades.push({ id:'b2', date:'2026-11-01', symbol:'00675L', action:'buy', shares:1000, price:250, fee:300, source:'own', amount:0, note:'' });
A.state = A.normalize(A.state);
must(A.instOn(A.state.instruments[1]), '有持股就算啟用');
must(A.computeAllTrends().length === 2, '有持股的訊號照算');
A.levTab = 'settings';
must(/還有持股/.test(A.renderLeverage()), '設定頁要說還有持股照常算');

console.log('按鈕切換');
fresh();
A.onClick({ dataset:{ act:'inst-off', id:'k75' } });
must(A.state.instruments[1].off === false && A.computeAllTrends().length === 2, '恢復使用');
A.onClick({ dataset:{ act:'inst-off', id:'k31' } });
must(A.state.instruments[0].off === true && A.computeAllTrends().length === 1, '停用 00631L');

console.log('舊版分頁寫回來沒有 off');
fresh();
const prev = JSON.parse(JSON.stringify(A.state));
const raw = JSON.parse(JSON.stringify(A.state));
raw.instruments.forEach(i => delete i.off);
const next = A.normalize(raw);
must(next.instruments[1].off === false, '前提:舊版寫回來 normalize 成 false');
must(A.keepFieldsOldVersionsDrop(prev, raw, next) && next.instruments[1].off === true, '要從本機補回停用');
const raw2 = JSON.parse(JSON.stringify(A.state)); raw2.instruments[1].off = false;
const next2 = A.normalize(raw2);
A.keepFieldsOldVersionsDrop(prev, raw2, next2);
must(next2.instruments[1].off === false, '新版另一台恢復使用的不能被補回停用');

if (bugs.length){ console.log('發現 ' + bugs.length + ' 個問題:\n- ' + bugs.join('\n- ')); process.exitCode = 1; }
else console.log('沒有發現問題');

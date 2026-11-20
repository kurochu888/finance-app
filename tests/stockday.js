/* 股票分頁「今天漲跌」:今天加買的股數用今天的買價算,不從昨天收盤算(2026-11-20 使用者回報:大跌那天接刀買進,
   今天漲跌 −9.4%,新買的那批其實只差幾分錢)。開盤前補記昨天買的照昨天收盤;美股晚上買、隔天白天記也算那個時段;
   新增的那檔第一次抓到報價時補上時段;換到下一個時段就不用;舊版分頁寫回來補回。 */
process.env.TZ = 'Asia/Taipei';
const RealDate = Date;
let simNow = new RealDate('2026-11-20T07:00:00+08:00').getTime();
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
let fetchImpl = async () => { throw new Error('offline'); };
global.fetch = async (url, opt) => fetchImpl(url, opt);
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, onField, onClick,
  stockTotals, fetchStockQuotes, keepFieldsOldVersionsDrop, renderHelp };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };
const near = (a, b) => Math.abs(a - b) < 0.01;
const field = (k, v) => A.onField(k, { value: String(v) });
const ts = s => Math.floor(new RealDate(s).getTime() / 1000);
const quote = (sym, price, chg, t) => ({ '0': sym, '6': price, '11': chg, '200009': '', '200007': t });
const reply = data => async () => ({ ok: true, status: 200, json: async () => ({ statusCode: 200, data }) });
const at = s => { simNow = new RealDate(s).getTime(); };
const S = () => A.state.stocks;
async function quotes(list){
  fetchImpl = async url => String(url).includes('cnyes') ? reply(list)() : Promise.reject(new Error('offline'));
  await A.fetchStockQuotes();
}

(async () => {
  console.log('昨天就有的持股:照前一天收盤');
  A.state = A.normalize(A.emptyState());
  A.onClick({ dataset:{ act:'add-stock' } });
  const h = S().holdings[0];
  field('sk-code-' + h.id, '00631L');
  at('2026-11-19T10:00:00+08:00');
  await quotes([quote('FX:USDTWD:FOREX', 32, 0, ts('2026-11-19T10:00:00+08:00')), quote('TWS:00631L:STOCK', 25, 0.5, ts('2026-11-19T10:00:00+08:00'))]);
  field('sk-shares-' + h.id, '100000');
  field('sk-cost-' + h.id, '30');
  at('2026-11-20T09:30:00+08:00');
  await quotes([quote('FX:USDTWD:FOREX', 32, 0, ts('2026-11-20T09:30:00+08:00')), quote('TWS:00631L:STOCK', 21.5, -3.07, ts('2026-11-20T09:30:00+08:00'))]);
  must(near(A.stockTotals().day, 100000 * -3.07), '昨天的 10 萬股照 chg:' + A.stockTotals().day);

  console.log('盤中加買:新的股數從買價算');
  // 21.3 買 10 萬股,平均成本 (100000×30 + 100000×21.3) / 200000 = 25.65
  field('sk-shares-' + h.id, '200000');
  field('sk-cost-' + h.id, '25.65');
  let t = A.stockTotals();
  const want = 100000 * -3.07 + 100000 * (21.5 - 21.3);
  must(near(t.day, want), `今天漲跌 = 舊股數 × chg + 新股數 ×(現價 − 21.3)= ${want},得到 ${t.day}`);
  const yesterdayPlusBuy = 100000 * (21.5 + 3.07) + 100000 * 21.3;
  must(near(t.dayPct, want / yesterdayPlusBuy * 100), '百分比的分母 = 昨天的市值 + 今天買的成本:' + t.dayPct);

  console.log('同一個時段再改一次:基準不動');
  field('sk-shares-' + h.id, '200000');
  field('sk-cost-' + h.id, '25.65');
  must(near(A.stockTotals().day, want), '重填一樣的值不能把基準換掉:' + A.stockTotals().day);

  console.log('收盤後、隔天開盤前:還是今天的時段');
  at('2026-11-20T14:00:00+08:00');
  await quotes([quote('FX:USDTWD:FOREX', 32, 0, ts('2026-11-20T13:30:00+08:00')), quote('TWS:00631L:STOCK', 21.24, -3.33, ts('2026-11-20T13:30:00+08:00'))]);
  must(near(A.stockTotals().day, 100000 * -3.33 + 100000 * (21.24 - 21.3)), '收盤後照收盤價:' + A.stockTotals().day);
  const saved = A.normalize(JSON.parse(JSON.stringify(A.state)));
  must(JSON.stringify(saved.stocks.holdings) === JSON.stringify(S().holdings), 'normalize 往返要一樣');

  console.log('下一個交易時段:全部照 chg');
  at('2026-11-23T09:10:00+08:00');
  await quotes([quote('FX:USDTWD:FOREX', 32, 0, ts('2026-11-23T09:10:00+08:00')), quote('TWS:00631L:STOCK', 22, 0.76, ts('2026-11-23T09:10:00+08:00'))]);
  must(near(A.stockTotals().day, 200000 * 0.76), '換時段之後不再用今天買的價:' + A.stockTotals().day);

  console.log('開盤前補記前一天買的:開盤後照前一天收盤');
  at('2026-11-24T07:30:00+08:00');   // 報價還是 11/23 的
  field('sk-shares-' + h.id, '210000');
  field('sk-cost-' + h.id, '25.5');
  at('2026-11-24T09:30:00+08:00');
  await quotes([quote('FX:USDTWD:FOREX', 32, 0, ts('2026-11-24T09:30:00+08:00')), quote('TWS:00631L:STOCK', 23, 1, ts('2026-11-24T09:30:00+08:00'))]);
  must(near(A.stockTotals().day, 210000 * 1), '昨天買的照 chg:' + A.stockTotals().day);

  console.log('美股晚上買、隔天白天才記:算在那個時段');
  A.onClick({ dataset:{ act:'add-stock' } });
  const u = S().holdings[1];
  field('sk-code-' + u.id, 'AAPL');
  at('2026-11-24T10:00:00+08:00');
  const usClose = ts('2026-11-24T05:00:00+08:00');   // 紐約 11/23 收盤 = 台灣 11/24 05:00
  await quotes([quote('FX:USDTWD:FOREX', 32, 0, ts('2026-11-24T10:00:00+08:00')), quote('TWS:00631L:STOCK', 23, 1, ts('2026-11-24T09:30:00+08:00')), quote('USS:AAPL:STOCK', 350, 5, usClose)]);
  field('sk-shares-' + u.id, '10');
  field('sk-cost-' + u.id, '348');
  t = A.stockTotals();
  must(near(t.day, 210000 * 1 + 10 * (350 - 348) * 32), '新增的美股:從買價算(× 匯率):' + t.day);

  console.log('新增的那檔還沒報價就填股數:第一次抓到報價時補上時段');
  A.onClick({ dataset:{ act:'add-stock' } });
  const n = S().holdings[2];
  field('sk-code-' + n.id, '2330');
  field('sk-shares-' + n.id, '1000');
  field('sk-cost-' + n.id, '1980');
  must(n.base && n.base.q === '' && n.base.shares === 0, '還沒報價:時段先空著:' + JSON.stringify(n.base));
  await quotes([quote('FX:USDTWD:FOREX', 32, 0, ts('2026-11-24T10:00:00+08:00')), quote('TWS:00631L:STOCK', 23, 1, ts('2026-11-24T09:30:00+08:00')),
    quote('USS:AAPL:STOCK', 350, 5, usClose), quote('TWS:2330:STOCK', 1990, -20, ts('2026-11-24T10:00:00+08:00'))]);
  must(n.base.q === '2026-11-24', '抓到報價後補上時段:' + JSON.stringify(n.base));
  must(near(A.stockTotals().day, 210000 * 1 + 10 * 2 * 32 + 1000 * (1990 - 1980)), '新增的台股從買價算:' + A.stockTotals().day);

  console.log('賣出:剩下的照 chg');
  field('sk-shares-' + h.id, '100000');
  must(near(A.stockTotals().day, 100000 * 1 + 10 * 2 * 32 + 1000 * 10), '賣掉一半:' + A.stockTotals().day);

  console.log('第一次填進抱很久的股票(成本離今天的價格很遠):照 chg');
  A.onClick({ dataset:{ act:'add-stock' } });
  const o = S().holdings[3];
  field('sk-code-' + o.id, '2454');
  await quotes([quote('FX:USDTWD:FOREX', 32, 0, ts('2026-11-24T10:00:00+08:00')), quote('TWS:00631L:STOCK', 23, 1, ts('2026-11-24T09:30:00+08:00')),
    quote('USS:AAPL:STOCK', 350, 5, usClose), quote('TWS:2330:STOCK', 1990, -20, ts('2026-11-24T10:00:00+08:00')), quote('TWS:2454:STOCK', 1500, -30, ts('2026-11-24T10:00:00+08:00'))]);
  const before = A.stockTotals().day;
  field('sk-shares-' + o.id, '1000');
  field('sk-cost-' + o.id, '600');
  must(near(A.stockTotals().day - before, 1000 * -30), '成本 600、現價 1500:不能把 90 萬當成今天賺的:' + (A.stockTotals().day - before));

  console.log('換代號:基準清掉');
  field('sk-code-' + n.id, '2317');
  must(n.base === null, '換代號要清掉 base');

  console.log('舊版分頁寫回來沒有 base');
  const prev = JSON.parse(JSON.stringify(A.state));
  const raw = JSON.parse(JSON.stringify(A.state));
  raw.stocks.holdings.forEach(x => delete x.base);
  const next = A.normalize(raw);
  must(A.keepFieldsOldVersionsDrop(prev, raw, next) && JSON.stringify(next.stocks.holdings[0].base) === JSON.stringify(prev.stocks.holdings[0].base), '要從本機補回 base');

  must(/今天買的均價/.test(A.renderHelp()), '說明頁要寫今天買的怎麼算');

  if (bugs.length){ console.log('發現 ' + bugs.length + ' 個問題:\n- ' + bugs.join('\n- ')); process.exitCode = 1; }
  else console.log('沒有發現問題');
})().catch(e => { console.log('例外:', e && e.stack || e); process.exitCode = 1; });

/* 股票分頁(台股 + 美股):總值與匯率換算、從鉅亨網抓報價(假的 fetch)、查不到的代號、抓不到時不動、
   跟著總值的資產細項、每天的紀錄與今天盤中的點、存檔往返、舊版分頁丟掉 stocks 欄位時補回、刪除要確認、刪除紀錄。 */
process.env.TZ = 'Asia/Taipei';
const RealDate = Date;
let simNow = new RealDate('2026-10-28T10:15:00').getTime();
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
const fetched = [];
global.fetch = async (url, opt) => { fetched.push(String(url)); return fetchImpl(url, opt); };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, onField, onClick,
  renderAll, renderStocks, renderAssets, stockTotals, fetchStockQuotes, keepFieldsOldVersionsDrop, keySets, netWorth, sampleData,
  stockIntraday, stockDaysToFinalize, finalizeStockHistory, set currentTab(v){currentTab=v}, get stockMsg(){return stockMsg}, get pendingConfirm(){return pendingConfirm} };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };
const near = (a, b) => Math.abs(a - b) < 0.01;
const S = () => A.state.stocks;
const field = (k, v) => A.onField(k, { value: String(v) });
const quote = (sym, price, chg, name, t = 1793079000) => ({ '0': sym, '6': price, '11': chg, '200009': name, '200007': t });
const reply = data => async () => ({ ok: true, status: 200, json: async () => ({ statusCode: 200, data }) });

console.log('新增、填股數成本,美股照匯率換算');
A.state = A.normalize(A.emptyState());
A.onClick({ dataset:{ act:'add-stock' } });
A.onClick({ dataset:{ act:'add-stock' } });
const [tw, us] = S().holdings;
field('sk-code-' + tw.id, ' 2330 ');
field('sk-shares-' + tw.id, '1000');
field('sk-cost-' + tw.id, '1000');
field('sk-code-' + us.id, 'aapl');
field('sk-shares-' + us.id, '10');
field('sk-cost-' + us.id, '200');
must(tw.code === '2330' && us.code === 'AAPL', '代號去空白、轉大寫:' + tw.code + ' / ' + us.code);
let t = A.stockTotals();
must(t.twd === 0 && t.noFx === 1, '還沒有現價跟匯率:總值 0、1 檔美股缺匯率');

console.log('抓報價(假的鉅亨網回應)');
fetchImpl = reply([
  quote('FX:USDTWD:FOREX', 32, -0.05, '美元/台幣'),
  quote('TWS:2330:STOCK', 2400, 15, '台積電'),
  quote('USS:AAPL:STOCK', 350, 3.5, '蘋果'),
  'USS:NOPE:STOCK'                                   // 回應裡偶爾夾字串,不能讓整批讀不進來
]);
A.onClick({ dataset:{ act:'add-stock' } });
const bad = S().holdings[2];
field('sk-code-' + bad.id, 'ZZZZQ');
field('sk-shares-' + bad.id, '5');
await_(async () => {
  fetched.length = 0;
  await A.fetchStockQuotes();
  const url = decodeURIComponent(fetched[0] || '');
  must(/FX:USDTWD:FOREX/.test(url) && /TWS:2330:STOCK/.test(url) && /USS:AAPL:STOCK/.test(url) && /USS:ZZZZQ:STOCK/.test(url), '查詢網址要帶匯率跟每一檔:' + url);
  must(fetched.filter(u => u.includes('cnyes')).length === 1, '一次查完,得到 ' + fetched.join(' '));
  must(tw.price === 2400 && tw.chg === 15 && tw.name === '台積電', '台股現價/漲跌/名稱');
  must(us.price === 350 && us.name === '蘋果' && S().usd === 32, '美股現價、匯率');
  must(/ZZZZQ/.test(A.stockMsg), '查不到的代號要說:' + A.stockMsg);
  t = A.stockTotals();
  // 台股 1000 × 2400 = 2,400,000;美股 10 × 350 × 32 = 112,000
  must(near(t.twd, 2512000) && near(t.tw, 2400000) && near(t.us, 3500) && near(t.usTwd, 112000), '總值 ' + t.twd);
  // 成本 1000 × 1000 + 10 × 200 × 32 = 1,064,000
  must(near(t.cost, 1064000) && near(t.pnl, 1448000), '成本 ' + t.cost + ' 損益 ' + t.pnl);
  // 今天漲跌 1000 × 15 + 10 × 3.5 × 32 = 16,120
  must(near(t.day, 16120), '今天漲跌 ' + t.day);
  must(near(t.dayPct, 16120 / (2512000 - 16120) * 100), '今天漲跌 % ' + t.dayPct);
  must(S().history.length === 1 && S().history[0].d === '2026-10-28' && S().history[0].v === 2512000 && S().history[0].c === 1064000,
    '今天記一筆:' + JSON.stringify(S().history));
  must(A.stockIntraday().length === 1 && A.stockIntraday()[0][0] === '10:15', '今天盤中記一個點');

  console.log('同一天再抓:每天一筆,盤中多一個點');
  simNow += 30 * 60000;
  fetchImpl = reply([quote('FX:USDTWD:FOREX', 32, 0, ''), quote('TWS:2330:STOCK', 2410, 25, '台積電'), quote('USS:AAPL:STOCK', 350, 3.5, '蘋果')]);
  await A.fetchStockQuotes();
  must(S().history.length === 1 && S().history[0].v === 2522000, '同一天更新成最後一次:' + JSON.stringify(S().history));
  must(A.stockIntraday().length === 2 && A.stockIntraday()[1][1] === 2522000, '盤中兩個點');

  console.log('游標在欄位上時抓報價不整頁重畫');
  // 改完代號點下一格(股數)就會抓報價:以前一開始就整頁重畫,剛點進去的股數欄位失焦,打的字全部不見(2026-10-28 使用者手機上)
  A.currentTab = 'stocks';
  document.activeElement = { tagName: 'INPUT', dataset: { k: 'sk-shares-' + tw.id } };
  store.content = el('content'); store.content.innerHTML = 'KEEP';
  await A.fetchStockQuotes();
  must(store.content.innerHTML === 'KEEP', '打字中抓報價不能整頁重畫');
  document.activeElement = null;

  console.log('抓不到時維持原本的數字');
  fetchImpl = async () => { throw new Error('offline'); };
  await A.fetchStockQuotes();
  must(tw.price === 2410 && S().usd === 32 && /抓不到/.test(A.stockMsg), '沒網路不動價格:' + A.stockMsg);
  fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
  await A.fetchStockQuotes();
  must(tw.price === 2410 && /抓不到/.test(A.stockMsg), 'HTTP 錯誤不動價格');

  console.log('跟著總值的資產細項');
  A.state.assets.push({ id: 'cash1', name: '現金', amount: 500000 });
  field('sk-asset', 'new');
  const linked = A.state.assets.find(a => a.id === S().assetId);
  must(linked && linked.name === '股票(台股+美股)' && linked.amount === 2522000, '新增一項、金額 = 總值:' + JSON.stringify(linked));
  must(A.netWorth() === 500000 + 2522000, '淨資產算進去:' + A.netWorth());
  field('aa-' + linked.id, '1');
  must(linked.amount === 2522000, '跟著總值的那項不能手動改');
  must(A.renderAssets().includes('跟著股票分頁的總值'), '資產頁要說這項跟著股票分頁');
  field('sk-shares-' + tw.id, '2000');
  must(linked.amount === 2000 * 2410 + 112000, '改股數馬上跟著更新:' + linked.amount);
  must(S().history[S().history.length - 1].v === linked.amount, '今天的紀錄也跟著更新');
  const before = linked.amount;
  field('sk-code-' + tw.id, '2317');
  must(tw.price === 0 && tw.name === '' && linked.amount === before, '換代號:現價清掉,但資產跟紀錄等抓到新報價才動');
  field('sk-code-' + tw.id, '2330');
  field('sk-price-' + tw.id, '2410');   // PWA 版畫面上沒有這欄,但 onField 照收(Artifact 版用)
  must(tw.chg === 0, '手動填現價沒有「比昨天」');
  field('sk-asset', 'cash1');
  must(S().assetId === 'cash1' && A.state.assets.find(a => a.id === 'cash1').amount === Math.round(A.stockTotals().twd), '改選既有的一項:那項變成總值');
  field('sk-asset', '');
  must(S().assetId === '', '選「不算進資產頁」');
  field('sk-asset', 'cash1');
  A.state.stocks.usd = 0;
  const keep = A.state.assets.find(a => a.id === 'cash1').amount;
  field('sk-shares-' + us.id, '20');
  must(A.state.assets.find(a => a.id === 'cash1').amount === keep, '美股沒有匯率時不更新資產(不然淨資產掉一截)');
  field('sk-usd', '32');
  must(S().usd === 32, '手動填匯率');
  A.onClick({ dataset:{ act:'del-asset', id:'cash1' } });
  A.onClick({ dataset:{ act:'del-asset', id:'cash1' } });
  must(!A.state.assets.some(a => a.id === 'cash1') && S().assetId === '', '刪掉那項資產就不再連結');

  console.log('畫面');
  A.currentTab = 'stocks';
  A.renderAll();
  const html = store.content.innerHTML;
  must(html.includes('股票總值') && html.includes('2330') && html.includes('蘋果') && html.includes('更新報價') && html.includes('走勢'), '股票分頁畫得出來');
  must(!html.includes('NaN') && !html.includes('undefined'), '畫面不能有 NaN/undefined');
  A.state = A.normalize(A.emptyState());
  A.renderAll();
  must(store.content.innerHTML.includes('還沒有股票'), '空的時候');

  console.log('刪除要按兩次');
  A.state = A.normalize(A.sampleData());
  const id0 = S().holdings[0].id;
  A.onClick({ dataset:{ act:'del-stock', id: id0 } });
  must(S().holdings.length === 2, '第一次只是確認');
  A.onClick({ dataset:{ act:'del-stock', id: id0 } });
  must(S().holdings.length === 1, '第二次才刪');
  A.onClick({ dataset:{ act:'add-stock' } });
  const blank = S().holdings[1].id;
  A.onClick({ dataset:{ act:'del-stock', id: blank } });
  must(S().holdings.length === 1, '空白列直接刪');

  console.log('存檔往返、壞資料');
  const sd = A.normalize(A.sampleData());
  sd.stocks.history = [{ d:'2026-10-27', v:1, c:1 }, { d:'2026-10-27', v:2, c:2 }, { d:'2026-13-01', v:3, c:3 }];
  const once = A.normalize(JSON.parse(JSON.stringify(sd)));
  const twice = A.normalize(JSON.parse(JSON.stringify(once)));
  must(JSON.stringify(once.stocks) === JSON.stringify(twice.stocks), 'normalize 兩次要一樣');
  must(once.stocks.history.length === 1 && once.stocks.history[0].v === 2, '同一天只留最後一筆、壞日期不收');
  const junk = A.normalize({ stocks: { holdings: [null, 'x', { id: '"><img>', code: 2330, shares: 1e309, cost: -5, price: 'abc' }, { id: 'a', code: 'X' }, { id: 'a', code: 'Y' }],
    usd: Infinity, assetId: '"><b>', history: 'nope' } });
  const jh = junk.stocks.holdings;
  must(jh.length === 3 && /^[A-Za-z0-9_-]+$/.test(jh[0].id) && jh[0].id !== '"><img>' && jh[0].code === '2330', '壞 id 換掉、數字代號收成字串');
  must(jh[0].shares === 0 && jh[0].cost === 0 && jh[0].price === 0 && junk.stocks.usd === 0 && junk.stocks.assetId === '', '非有限值/負數歸 0、壞 assetId 不收');
  must(jh[1].id !== jh[2].id, 'id 重複的換新');
  must(JSON.stringify(A.normalize({}).stocks) === JSON.stringify(A.emptyState().stocks), '舊資料沒有 stocks 欄位');

  console.log('舊版分頁寫回來沒有 stocks');
  const prev = A.normalize(A.sampleData());
  const raw = JSON.parse(JSON.stringify(prev)); delete raw.stocks;
  const next = A.normalize(raw);
  must(A.keepFieldsOldVersionsDrop(prev, raw, next) && next.stocks.holdings.length === 2, '補回本機的股票');
  const raw2 = JSON.parse(JSON.stringify(prev)); raw2.stocks.holdings = [];
  const next2 = A.normalize(raw2);
  A.keepFieldsOldVersionsDrop(prev, raw2, next2);
  must(next2.stocks.holdings.length === 0, '新版刪光的不能被補回');

  console.log('刪除紀錄');
  must(A.keySets(prev).get('stocks') && A.keySets(prev).get('stocks').size === 2, '股票清單要記刪除');

  console.log('前一天的總值用收盤價定案(早上 6 點以後)');
  const utc = d => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 1000;
  const hist = rows => ({ ok: true, status: 200, json: async () => ({ statusCode: 200, data: { s: 'ok', t: rows.map(r => utc(r[0])).reverse(), c: rows.map(r => r[1]).reverse() } }) });
  // 台股 10/23、10/26 沒開盤;美股每天;匯率跟台股同一天休
  const SERIES = {
    'TWS:2330:STOCK': [['2026-10-22', 2300], ['2026-10-27', 2400]],
    'USS:AAPL:STOCK': [['2026-10-22', 340], ['2026-10-23', 344], ['2026-10-26', 345], ['2026-10-27', 347]],
    'FX:USDTWD:FOREX': [['2026-10-22', 32.5], ['2026-10-27', 32.4]]
  };
  let histCalls = [];
  fetchImpl = async url => {
    const m = /symbol=([^&]+)/.exec(String(url));
    if (!m || !String(url).includes('charting/history')) throw new Error('不該抓別的:' + url);
    const sym = decodeURIComponent(m[1]); histCalls.push(sym);
    return hist(SERIES[sym] || []);
  };
  const fresh = () => {
    localStorage.removeItem('financeStockFinalTry');
    A.state = A.normalize({ stocks: { holdings: [{ id:'a', code:'2330', shares:1000, cost:1000, price:2410 }, { id:'b', code:'AAPL', shares:10, cost:200, price:350 }],
      usd: 32, history: [{ d:'2026-10-26', v:111, c:1 }, { d:'2026-10-27', v:222, c:1 }, { d:'2026-10-28', v:333, c:1 }] } });
  };
  fresh();
  simNow = new RealDate('2026-10-28T05:00:00').getTime();
  must(JSON.stringify(A.stockDaysToFinalize()) === '["2026-10-26"]', '6 點以前只定案到前天:' + JSON.stringify(A.stockDaysToFinalize()));
  await A.finalizeStockHistory();
  const h26 = S().history.find(h => h.d === '2026-10-26');
  // 10/26 台股沒開 → 用 10/22 的 2300;美股 10/26 收 345;匯率用 10/22 的 32.5
  must(h26.f === true && h26.v === 1000 * 2300 + 10 * 345 * 32.5 && h26.c === 1000 * 1000 + 10 * 200 * 32.5, '10/26 用收盤價:' + JSON.stringify(h26));
  must(!S().history.find(h => h.d === '2026-10-27').f, '10/27 6 點以前還不能定案');
  simNow = new RealDate('2026-10-28T10:30:00').getTime();   // 10 點半才打開,台股已經開盤
  histCalls = [];
  await A.finalizeStockHistory();
  const h27 = S().history.find(h => h.d === '2026-10-27');
  must(h27.f === true && h27.v === 1000 * 2400 + 10 * 347 * 32.4, '10/27 用收盤價(不是盤中):' + JSON.stringify(h27));
  must(histCalls.length === 3, '每檔一個請求 + 匯率:' + histCalls.join(' '));
  must(S().history.find(h => h.d === '2026-10-28').v === 333 && !S().history.find(h => h.d === '2026-10-28').f, '今天的不動');
  histCalls = [];
  await A.finalizeStockHistory();
  must(histCalls.length === 0, '都定案了就不再抓');
  // 定案過的不能被當天的更新蓋掉(手機時間被往回調的情況)
  simNow = new RealDate('2026-10-27T20:00:00').getTime();
  A.onField('sk-shares-a', { value: '5' });
  must(S().history.find(h => h.d === '2026-10-27').v === h27.v, '定案的那天不被蓋');
  simNow = new RealDate('2026-10-28T10:30:00').getTime();
  must(A.normalize(JSON.parse(JSON.stringify(A.state))).stocks.history.find(h => h.d === '2026-10-27').f === true, 'f 存檔讀回來還在');

  console.log('幾天沒開:補回來,週末不畫點,不早於第一筆');
  fresh();
  A.state.stocks.history = [{ d:'2026-10-21', v:1, c:1, f:false }];
  simNow = new RealDate('2026-10-28T07:00:00').getTime();
  await A.finalizeStockHistory();
  const ds = S().history.map(h => h.d).join(',');
  // 10/24、10/25 週末兩邊都沒開盤 → 不寫;10/23 台股休但美股有開 → 寫
  must(ds === '2026-10-21,2026-10-22,2026-10-23,2026-10-26,2026-10-27', '補的日期:' + ds);
  // 10/21 那天以前沒有收盤資料(假資料從 10/22 開始):不能定案,保留原本的
  must(!S().history[0].f && S().history[0].v === 1, '10/21 沒有收盤資料,保留原本的:' + JSON.stringify(S().history[0]));
  must(S().history.slice(1).every(h => h.f), '補的都是定案的');

  console.log('抓不到時不寫、30 分鐘內不重試');
  fresh();
  fetchImpl = async () => { throw new Error('offline'); };
  histCalls = [];
  await A.finalizeStockHistory();
  must(S().history.every(h => !h.f), '抓不到不寫');
  let tried = 0; fetchImpl = async () => { tried++; throw new Error('offline'); };
  await A.finalizeStockHistory();
  must(tried === 0, '30 分鐘內不重試');
  simNow += 31 * 60000;
  await A.finalizeStockHistory();
  must(tried > 0, '過 30 分鐘再試');
  console.log('某一檔查不到收盤:那天不定案');
  fresh();
  fetchImpl = async url => /AAPL/.test(decodeURIComponent(String(url))) ? hist([]) : hist(SERIES[decodeURIComponent(/symbol=([^&]+)/.exec(String(url))[1])] || []);
  await A.finalizeStockHistory();
  must(S().history.every(h => !h.f), '缺一檔就不定案(不然總值少一截)');
  fresh();
  A.state.stocks.holdings.push({ id:'z', code:'NOPEX', name:'', shares:5, cost:1, price:0, chg:0, qt:'' });
  fetchImpl = async url => hist(SERIES[decodeURIComponent(/symbol=([^&]+)/.exec(String(url))[1])] || []);
  await A.finalizeStockHistory();
  must(S().history.find(h => h.d === '2026-10-27').f, '打錯、從來沒抓到報價的代號不能卡住定案');

  if (bugs.length){ console.log('發現 ' + bugs.length + ' 個問題:'); bugs.forEach(b => console.log('  ✗ ' + b)); process.exitCode = 1; }
  else console.log('股票分頁:沒有發現問題');
});
function await_(f){ f().catch(e => { console.log('✗ 例外:', e && e.stack || e); process.exitCode = 1; }); }

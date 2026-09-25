/* 均線趨勢訊號(computeTrend)的迴歸測試。
   重點測 pyramidCount 有沒有真的遞增/歸零 —— 這正是原本參考實作那個 bug 的位置
   (只在訊息字串裡 +1,實際回傳值從沒更新或在 RECOVER/EXIT 時歸零)。
   純函式測試,不用連網、不用真的跑 app,直接餵手刻的 priceHistory 陣列。 */
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;} });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };

const fs = require('fs');
const src = fs.readFileSync('/ssd1/finance/docs/index.html', 'utf8');
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appJs = blocks.sort((a, b) => b.length - a.length)[0];
eval(appJs + `globalThis.A = { computeTrend, defaultTrendParams, mergeHistory, normalize,
  computeExposurePlan, renderExposurePlanCard, onClick, renderAll, trendChanges, renderTrendTab, sampleData, adjustForSplits, applyKnownSplitRatios, get state(){return state}, set state(v){state=v}, emptyState };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };

function mkHist(prices){
  const d0 = new Date('2020-01-01');
  return prices.map((c, i) => {
    const d = new Date(d0); d.setDate(d0.getDate() + i);
    return { d: d.toISOString().slice(0, 10), c };
  });
}

// 一段刻意設計過的價格路徑(用 maFast:5/maSlow:10 這種短週期,方便少量資料就能跑完整個循環):
// 先漲(進 HOLD)→ 急跌(EXIT)→ 緩跌兩段(各觸發一次 ADD,共兩層,達 pyramidLevels 上限後不再加碼)
// → 強力反彈(RECOVER,應該歸零)→ 再急跌(第二次 EXIT,應該再歸零)→ 緩跌(第二輪 ADD,應該從 1 開始不是接著 2)
const prices = [];
for (let i = 0; i < 40; i++) prices.push(80 + i * 1.25);        // 上漲進場
for (let i = 0; i < 5; i++) prices.push(130 - i * 8);           // 急跌 → EXIT
for (let i = 0; i < 10; i++) prices.push(98 - i * 1.2);         // 緩跌 → ADD #1
for (let i = 0; i < 5; i++) prices.push(86 - i * 3);
for (let i = 0; i < 10; i++) prices.push(74 - i * 0.5);         // 緩跌 → ADD #2(觸頂 pyramidLevels）
for (let i = 0; i < 5; i++) prices.push(69 - i * 3);
for (let i = 0; i < 15; i++) prices.push(57 + i * 3.5);         // 強力反彈 → RECOVER
for (let i = 0; i < 6; i++) prices.push(109 - i * 8);           // 再急跌 → 第二次 EXIT
for (let i = 0; i < 3; i++) prices.push(69 - i * 3);            // 再緩跌一步 → 第二輪 ADD #1

const trend = { maFast:5, maSlow:10, exitBuffer:0.9, recoverSlopeThreshold:1.0,
                recoverStrongRebound:1.05, pyramidGap:0.10, pyramidLevels:2 };
function trendAt(n){
  return A.computeTrend({ key:'t', id:'TEST', leverage:2, trend, priceHistory: mkHist(prices.slice(0, n)) });
}

console.log('資料不足時的形狀');
const insufficient = trendAt(10);   // barsNeeded = maSlow+1 = 11,只給 10 筆
must(insufficient.status === 'WATCH', '資料不足時 status 應該是 WATCH,實際是 ' + insufficient.status);
must(insufficient.maFast === null && insufficient.maSlow === null, '資料不足時均線應該是 null,不能讓 NaN 流出去');
must(insufficient.barsAvailable === 10 && insufficient.barsNeeded === 11, 'barsAvailable/barsNeeded 沒算對');
console.log('  ok');

console.log('狀態機與 pyramidCount 全流程(迴歸測試:原本那個 bug 的位置)');
const checkpoints = [
  [11, 'HOLD', 0],   // 一開始就處在上漲段,足夠資料後直接判定 HOLD
  [44, 'WAIT_RECOVER', 0],   // 急跌跌破出場線 → 第一次 EXIT,pyramidCount 歸零
  [49, 'WAIT_RECOVER', 1],   // 緩跌觸發第一層加碼
  [59, 'WAIT_RECOVER', 2],   // 緩跌觸發第二層加碼(達 pyramidLevels 上限)
  [78, 'HOLD', 0],           // 強力反彈 → RECOVER,狀態轉 HOLD 且 pyramidCount 真的歸零(不是還停在 2)
  [94, 'WAIT_RECOVER', 0],   // 再次急跌 → 第二次 EXIT,pyramidCount 再次歸零
  [99, 'WAIT_RECOVER', 1],   // 第二輪加碼從 1 開始,不是接著上一輪的 2
];
for (const [n, expStatus, expPyr] of checkpoints){
  const t = trendAt(n);
  console.log(`  n=${n} price=${prices[n-1].toFixed(1)} → status=${t.status} pyramidCount=${t.pyramidCount}`);
  must(t.status === expStatus, `n=${n} 狀態應為 ${expStatus},實際是 ${t.status}`);
  must(t.pyramidCount === expPyr, `n=${n} pyramidCount 應為 ${expPyr},實際是 ${t.pyramidCount}(這正是原本那個 bug 會出現的位置)`);
}

console.log('第二層之後不會再繼續加碼(即使繼續下跌)');
const capA = trendAt(59), capB = trendAt(70);   // 59 之後到 78(RECOVER)之前都應該卡在 pyramidLevels
must(capA.pyramidCount === 2 && capB.pyramidCount === 2 && capB.status === 'WAIT_RECOVER',
     '超過 pyramidLevels 之後 pyramidCount 不該再增加(得到 n=70 → ' + capB.pyramidCount + ')');
console.log('  ok');

console.log('cushionPct:只有 HOLD 時才有意義');
const holdPoint = trendAt(20);
must(holdPoint.status === 'HOLD' && typeof holdPoint.cushionPct === 'number' && holdPoint.cushionPct > 0,
     'HOLD 時 cushionPct 應該是正數,實際是 ' + holdPoint.cushionPct);
const waitPoint = trendAt(50);
must(waitPoint.status === 'WAIT_RECOVER' && waitPoint.cushionPct === null,
     'WAIT_RECOVER 時 cushionPct 應該是 null,實際是 ' + waitPoint.cushionPct);
console.log('  ok');

console.log('defaultTrendParams:槓桿 >=2 用較慢的組合,1x 用較快的組合');
const p2 = A.defaultTrendParams(2), p1 = A.defaultTrendParams(1);
must(p2.maSlow > p1.maSlow, '正2 的慢線應該比 1x 慢(較不容易被洗出場)');
must(p2.pyramidLevels >= p1.pyramidLevels, '正2 的加碼層數不該比 1x 少');
console.log('  ok');

console.log('mergeHistory:分割造成的假斷崖要被還原成連續序列(迴歸測試:00631L 2026-03 真實發生過)');
(function testSplitAdjust(){
  // 模擬 TWSE STOCK_DAY 的原始列格式:[ROC日期,量,額,開,高,低,收,漲跌,筆數]
  const rocRow = (rocDate, close) => [rocDate, '0', '0', '0', '0', '0', String(close), '0', '0'];
  // 分割前:緩緩上漲到 443 附近;分割後(比例 0.0435,近似 00631L 實際發生的那次):接著從 19 附近開始
  const before = [];
  for (let i = 0; i < 10; i++) before.push(rocRow(`115/03/${String(10+i).padStart(2,'0')}`, 420 + i * 2.5));
  const after = [];
  for (let i = 0; i < 5; i++) after.push(rocRow(`115/04/${String(1+i).padStart(2,'0')}`, 19 + i * 0.3));

  let hist = A.mergeHistory([], before);
  must(hist.length === 10, '分割前的資料筆數不對(得到 ' + hist.length + ')');
  hist = A.mergeHistory(hist, after);   // 模擬回補時逐月合併,分割後的資料在下一次合併才進來
  must(hist.length === 15, '合併後總筆數不對(得到 ' + hist.length + ')');

  let maxJump = 0;
  for (let i = 1; i < hist.length; i++){
    const ratio = hist[i].c / hist[i - 1].c;
    maxJump = Math.max(maxJump, Math.abs(ratio - 1));
  }
  console.log('  還原後最大單日變動幅度:', (maxJump * 100).toFixed(1) + '%');
  must(maxJump < 0.4, '分割斷崖沒有被還原,均線會被這個假訊號帶歪(最大單日變動 ' + (maxJump*100).toFixed(1) + '%)');

  const oldPrice = hist[0].c;
  console.log('  分割前第一筆原始收盤 420,還原後變成', oldPrice.toFixed(2), '(應該跟分割後的價格尺度接近,不是 420)');
  must(oldPrice < 30, '分割前的價格沒有被換算到跟分割後同一個尺度(得到 ' + oldPrice.toFixed(2) + ')');
})();
console.log('  ok');

console.log('mergeHistory:從最新月份往回逐月合併時,分割前每個月的交界不能被誤判成分割(迴歸測試:抹掉 130 幾天漲跌、回測數字失真)');
(function testBackwardMergeKeepsReturns(){
  // 每天漲 1%,分割(1 拆 20)發生在 4 月第一個交易日。照回補的順序從新到舊逐月合併:
  // 4 月 → 3 月 → 2 月 → 1 月。正確的還原結果,每一天對前一天都應該是 +1%——
  // 只有分割當天會被偵測時的比例吃掉(那天漲跌變 0),其他月份交界不能再被抹掉。
  const rocRow = (iso, close) => [(Number(iso.slice(0,4)) - 1911) + '/' + iso.slice(5,7) + '/' + iso.slice(8), '0','0','0','0','0', close.toFixed(4), '0','0'];
  const days = [];
  for (let d = new Date('2026-01-05'); d <= new Date('2026-04-30'); d.setDate(d.getDate() + 1)){
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    days.push(d.toISOString().slice(0, 10));
  }
  let p = 100;
  const raw = days.map(d => { p *= 1.01; return { d, c: d >= '2026-04-01' ? p / 20 : p }; });
  const splits = [];
  let hist = [];
  for (const m of ['2026-04', '2026-03', '2026-02', '2026-01']){
    hist = A.mergeHistory(hist, raw.filter(r => r.d.startsWith(m)).map(r => rocRow(r.d, r.c)), Infinity, splits);
  }
  must(hist.length === days.length, `合併後筆數不對:${hist.length} vs ${days.length}`);
  must(splits.length === 1 && splits[0].d === days.find(d => d >= '2026-04-01'),
       `應該只記到一次分割(在 4 月第一個交易日),得到 ${JSON.stringify(splits)}`);
  const flat = [];
  for (let i = 1; i < hist.length; i++){
    if (Math.abs(hist[i].c / hist[i - 1].c - 1.01) > 0.001) flat.push(hist[i].d);
  }
  must(flat.length <= 1, `除了分割當天,每天都應該是 +1%,但這些天的漲跌被改掉了:${flat.join(', ')}`);
  // 之後再重抓一次 2 月(模擬補缺口/重按回補),已記錄的分割要直接套用,不能再動到其他天
  hist = A.mergeHistory(hist, raw.filter(r => r.d.startsWith('2026-02')).map(r => rocRow(r.d, r.c)), Infinity, splits);
  const flat2 = [];
  for (let i = 1; i < hist.length; i++){
    if (Math.abs(hist[i].c / hist[i - 1].c - 1.01) > 0.001) flat2.push(hist[i].d);
  }
  must(splits.length === 1 && flat2.length <= 1, `重抓已有的月份後資料被改掉了:${flat2.join(', ')} / ${JSON.stringify(splits)}`);
})();
console.log('  ok');

console.log('normalize():舊版存下來、沒有 splits 欄位的自動報價歷史要清掉重抓(已經被假分割抹過,無從還原)');
(function testSplitMigration(){
  const ph = [{ d:'2026-01-02', c:10 }, { d:'2026-01-05', c:11 }];
  const s = A.normalize({ instruments: [
    { key:'a', id:'00631L', leverage:2, auto:true, priceHistory: ph },
    { key:'b', id:'00675L', leverage:2, auto:true, priceHistory: ph, splits: [] },
    { key:'c', id:'MYFUND', leverage:1, auto:false, priceHistory: ph }
  ]});
  must(s.instruments[0].priceHistory.length === 0, '舊版(沒有 splits)的自動報價歷史應該被清掉');
  must(s.instruments[1].priceHistory.length === 2, '新版(有 splits)的歷史不該被清掉');
  must(s.instruments[2].priceHistory.length === 2, '手動(不自動抓報價)標的的歷史不是從證交所回補的,不該被清掉');
  must(s.instruments.every(it => Array.isArray(it.splits)), 'normalize 之後每個標的都要有 splits 陣列');
})();
console.log('  ok');

console.log('00631L 分割用公告比例 1 拆 22,分割當天的真實漲跌要保留(反推比例會把那天吃掉)');
(function testKnownSplitRatio(){
  const rocRow = (iso, close) => [(Number(iso.slice(0,4)) - 1911) + '/' + iso.slice(5,7) + '/' + iso.slice(8), '0','0','0','0','0', close.toFixed(4), '0','0'];
  // 分割前 440 → 分割當天大盤跌,淨值跌 5%:440/22*0.95 = 19
  const pre  = [['2026-03-12', 430], ['2026-03-13', 440]];
  const post = [['2026-03-16', 19], ['2026-03-17', 19.19]];
  for (const [id, expectRatio] of [['00631L', 1 / 22], ['XXXX', 19 / 440]]){
    const splits = [];
    let hist = A.mergeHistory([], post.map(r => rocRow(...r)), Infinity, splits, id);
    hist = A.mergeHistory(hist, pre.map(r => rocRow(...r)), Infinity, splits, id);   // 跟回補一樣從新到舊
    must(splits.length === 1 && Math.abs(splits[0].ratio - expectRatio) < 1e-12,
         `${id} 記錄的分割比例應該是 ${expectRatio},得到 ${JSON.stringify(splits)}`);
    if (id === '00631L'){
      const day = hist[2].c / hist[1].c - 1;
      must(Math.abs(day - (-0.05)) < 0.001, `00631L 分割當天應該保留 -5% 的真實漲跌,得到 ${(day * 100).toFixed(2)}%`);
    }
  }
  // 已經用反推比例存下來的歷史:換成公告比例,分割前的價格整段跟著校正,再跑一次不會再動
  const obs = 19 / 440;
  const old = [{ d:'2026-03-13', c: 440 * obs }, { d:'2026-03-16', c: 19 }];
  const sp = [{ d:'2026-03-16', ratio: obs }];
  must(A.applyKnownSplitRatios('00631L', old, sp) === true, '反推比例應該被校正');
  must(Math.abs(old[0].c - 20) < 1e-3 && sp[0].ratio === 1 / 22, `校正後分割前一天應該是 440/22=20,得到 ${old[0].c} / ${sp[0].ratio}`);
  must(A.applyKnownSplitRatios('00631L', old, sp) === false && Math.abs(old[0].c - 20) < 1e-3, '已經是公告比例時再呼叫不該再改');
  // normalize 載入時就會校正(使用者已經抓好的資料不用重抓)
  const s = A.normalize({ instruments: [{ key:'k', id:'00631L', leverage:2, auto:true,
    priceHistory: [{ d:'2026-03-13', c: 440 * obs }, { d:'2026-03-16', c: 19 }], splits: [{ d:'2026-03-16', ratio: obs }] }] });
  must(Math.abs(s.instruments[0].priceHistory[0].c - 20) < 1e-3, `normalize 應該把舊的反推比例校正成 1/22,得到 ${s.instruments[0].priceHistory[0].c}`);
})();
console.log('  ok');

console.log('mergeHistory:證交所回「--」或欄位不齊的列要略過,不能蓋掉已經存好的收盤價(迴歸測試:壓測看到歷史被刪)');
(function testBadRowsDontOverwrite(){
  // 價格放在同一個價位(1,2xx),才不會被分割偵測當成一天漲 12 倍的反向分割
  const good = [['115/09/01','0','0','0','0','0','1,200.50','0','0'], ['115/09/02','0','0','0','0','0','1,201.00','0','0']];
  let hist = A.mergeHistory([], good, Infinity, []);
  hist = A.mergeHistory(hist, [['115/09/01','','','','','','--','',''], ['115/09/02','0','0','0','0'], null, 'oops', ['115/9/3','0','0','0','0','0','1,234.00','0','0']], Infinity, []);
  must(hist.length === 3 && hist[0].c === 1200.5 && hist[1].c === 1201, `壞列不該蓋掉好資料:${JSON.stringify(hist)}`);
  must(hist[2].d === '2026-09-03' && hist[2].c === 1234, `沒補零的日期、千分位逗號應該照樣解析:${JSON.stringify(hist[2])}`);
})();
console.log('  ok');

console.log('adjustForSplits:資料缺口造成的真實累積漲跌,不該被誤判成分割(迴歸測試:實際發生過,把 2015 年的資料錯誤打折)');
(function testGapNotSplit(){
  // 模擬回補時中間漏了好幾個月:前段資料在 2015-06 附近,下一筆卻直接跳到 2016-01——
  // 兩倍槓桿股價半年內腰斬超過一半很正常(尤其一路下跌的行情),換算成單日比例
  // (10/22.95≈0.436)會落在舊版「< 0.6 就當分割」的誤判區間,不該被打折更早的資料。
  const before = [{ d:'2015-06-01', c:23.07 }, { d:'2015-06-02', c:22.95 }];
  const afterGap = [{ d:'2016-01-04', c:10.00 }, { d:'2016-01-05', c:10.30 }];
  const hist = A.adjustForSplits([...before, ...afterGap]);
  must(hist[0].c === 23.07 && hist[1].c === 22.95,
       `資料缺口(隔了超過 16 天)不該被當成分割,更早的資料不該被打折,得到 ${JSON.stringify(hist.slice(0,2))}`);
})();
console.log('  ok');

console.log('快線設得比慢線長:需要的天數要看比較長的那條,不能算出 null 讓訊號分頁壞掉(迴歸測試:隨機壓測抓到)');
(function testFastLongerThanSlow(){
  const p = Object.assign({}, trend, { maFast: 20, maSlow: 10 });
  const short = A.computeTrend({ key:'t', id:'T', leverage:2, trend: p, priceHistory: mkHist(prices.slice(0, 15)) });
  must(short.barsNeeded === 21 && short.status === 'WATCH', `快線 20、慢線 10 時至少要 21 天,15 天應該是 WATCH,得到 need=${short.barsNeeded} ${short.status}`);
  const full = A.computeTrend({ key:'t', id:'T', leverage:2, trend: p, priceHistory: mkHist(prices) });
  must(full.maFast != null && full.maSlow != null, '資料夠長時快慢線都要算得出來');
})();
console.log('  ok');

console.log('狀態改變提醒:第一次算得出訊號時要安靜記下基準,之後狀態改變才提醒(迴歸測試:以前基準永遠是空的,提醒從沒出現過)');
(function(){
  A.state = A.sampleData();
  A.state.instruments.forEach(it => { it.trend.lastSeenStatus = ''; });
  A.renderAll();
  must(A.state.instruments.every(it => it.trend.lastSeenStatus), '重畫之後每檔都應該記下基準狀態');
  must(A.trendChanges().length === 0, '剛記下基準時不該跳提醒');
  const it = A.state.instruments[0];
  const was = it.trend.lastSeenStatus;
  it.trend.lastSeenStatus = was === 'HOLD' ? 'WAIT_RECOVER' : 'HOLD';   // 模擬:上次看到的是別的狀態,現在變了
  A.renderAll();
  must(A.trendChanges().length === 1, `狀態跟上次看到的不一樣時應該提醒,得到 ${A.trendChanges().length} 則`);
  must(it.trend.lastSeenStatus !== was, '已經有基準的不該被自動覆蓋(要等使用者按知道了)');
})();
console.log('  ok');

console.log('接刀加碼(狀態還是 WAIT_RECOVER、只有層數變)也要跳提醒(迴歸測試:以前只比狀態,兩次加碼都不會提醒)');
(function(){
  // 找一段隨機路徑:某天剛出場(接刀 0 層),之後某天加碼到第 1 層
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let found = null;
  for (let k = 0; k < 200 && !found; k++){
    const hist = []; let p = 50; const d = new Date(2016, 0, 4);
    while (hist.length < 900){ d.setDate(d.getDate() + 1); if (d.getDay() % 6 === 0) continue;
      p *= 1 + (rnd() - 0.5) * 0.05 + (hist.length > 500 ? -0.004 : 0.002);
      hist.push({ d: d.toISOString().slice(0, 10), c: Math.round(p * 100) / 100 }); }
    const it = { key:'k', id:'00631L', leverage:2, trend: A.defaultTrendParams(2), priceHistory: [] };
    let exitAt = -1;
    for (let n = 260; n <= hist.length; n++){
      it.priceHistory = hist.slice(0, n);
      const t = A.computeTrend(it);
      if (exitAt < 0 && t.status === 'WAIT_RECOVER' && t.pyramidCount === 0) exitAt = n;
      if (exitAt > 0 && t.status === 'WAIT_RECOVER' && t.pyramidCount === 1){ found = { hist, exitAt, addAt: n }; break; }
      if (exitAt > 0 && t.status === 'HOLD') exitAt = -1;
    }
  }
  must(found, '找不到「出場後接刀第 1 層」的路徑,這個測試沒測到東西');
  if (!found) return;
  A.state = A.emptyState();
  A.state.instruments = A.state.instruments.filter(x => x.id === '00631L');
  const it = A.state.instruments[0];
  it.priceHistory = found.hist.slice(0, found.exitAt); it.splits = [];
  it.trend.lastSeenStatus = 'HOLD'; it.trend.lastSeenLayers = 0;
  must(A.trendChanges().length === 1, '剛跌破出場線應該提醒');
  A.onClick({ dataset:{ act:'ack-trend', id: it.key } });        // 看過了:WAIT_RECOVER、0 層
  must(A.trendChanges().length === 0, '按了知道了之後不該再提醒');
  it.priceHistory = found.hist.slice(0, found.addAt);           // 過了幾天,加碼到第 1 層
  const ch = A.trendChanges();
  must(ch.length === 1, `接刀加碼第 1 層沒有提醒(狀態還是 WAIT_RECOVER,只有層數變了)`);
  const html = A.renderTrendTab();
  must(/接刀加碼第 1 層/.test(html), '提醒文字沒寫出接刀加碼第幾層');
  A.onClick({ dataset:{ act:'ack-trend', id: it.key } });
  must(A.trendChanges().length === 0, '加碼後按知道了還在提醒');
  // 舊資料只記了狀態、沒記層數:不能因此跳假提醒,要安靜補上
  it.trend.lastSeenLayers = -1;
  A.renderAll();
  must(it.trend.lastSeenLayers === 1 && A.trendChanges().length === 0, `舊資料沒有層數時要安靜補上現在的層數(得到 ${it.trend.lastSeenLayers})`);
})();
console.log('  ok');

console.log('一檔出場、兩檔市值不一樣:減碼金額照市值比例分,不能叫小的那檔賣超過自己的市值(迴歸測試:以前寫各半)');
(function(){
  const mk = (fallDays) => { const h = []; let c = 20; const d = new Date(2023, 0, 2);
    for (let i = 0; h.length < 320 + fallDays; i++){ d.setDate(d.getDate() + 1); if (d.getDay() % 6 === 0) continue;
      c *= h.length < 320 ? 1.002 : 0.985; h.push({ d: d.toISOString().slice(0, 10), c: Math.round(c * 1000) / 1000 }); }
    return h; };
  A.state = A.emptyState();
  const [a, b] = A.state.instruments;   // 00631L 出場、00675L 續抱
  b.priceHistory = mk(0); b.splits = [];
  let fall = 0;
  for (let f = 5; f < 60; f++){ a.priceHistory = mk(f); const t = A.computeTrend(a); if (t.status === 'WAIT_RECOVER' && t.pyramidCount === 0){ fall = f; break; } }
  must(fall > 0, '造不出「剛出場還沒接刀」的路徑');
  a.priceHistory = mk(fall); a.splits = [];
  a.price = 10; a.shares = 70000;   // 市值 70 萬
  b.price = 10; b.shares = 30000;   // 市值 30 萬
  A.state.trades = [];
  const plan = A.computeExposurePlan();
  must(plan && plan.progress === 0 && plan.deltaLoan < 0, `應該是目標 0%、要減碼:${JSON.stringify(plan && { progress: plan.progress, deltaLoan: plan.deltaLoan })}`);
  const txt = A.renderExposurePlanCard().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const m675 = /00675L 約 NT\$ ([\d,]+)/.exec(txt), m631 = /00631L 約 NT\$ ([\d,]+)/.exec(txt);
  must(m675 && m631, '減碼沒有逐檔寫金額:' + txt.slice(0, 200));
  if (m675) must(Number(m675[1].replace(/,/g, '')) <= 300000, `叫 00675L 賣 ${m675[1]},超過它的市值 30 萬`);
  must(!/各半/.test(txt.split('可考慮減碼')[1] || ''), '減碼還寫各半');
})();
console.log('  ok');

console.log('normalize():Infinity 混進趨勢參數/歷史收盤價不能悄悄溜過去(迴歸測試:壓測抓到的 bug)');
(function testInfinityGuard(){
  // num() 只擋 NaN,擋不住 Infinity(parseFloat('Infinity') 是合法的);
  // 這些欄位後面會拿去做除法、比大小,混進 Infinity 會讓 computeTrend 整個壞掉。
  const s = A.normalize({ instruments: [{
    key:'k1', id:'00631L', name:'測試', leverage:2, price:10, shares:0, auto:true,
    trend: { maFast:Infinity, maSlow:-Infinity, exitBuffer:Infinity, recoverSlopeThreshold:Infinity,
             recoverStrongRebound:Infinity, pyramidGap:Infinity, pyramidLevels:Infinity },
    priceHistory: [{ d:'2026-01-01', c:Infinity }, { d:'2026-01-02', c:50 }], splits: []
  }]});
  const t = s.instruments[0].trend;
  ['maFast','maSlow','exitBuffer','recoverSlopeThreshold','recoverStrongRebound','pyramidGap','pyramidLevels']
    .forEach(k => must(Number.isFinite(t[k]), 'trend.' + k + ' 沒有擋掉 Infinity,得到 ' + t[k]));
  must(s.instruments[0].priceHistory.every(h => Number.isFinite(h.c)),
       'priceHistory 裡的 Infinity 收盤價沒有被濾掉');
  must(s.instruments[0].priceHistory.length === 1, 'Infinity 那筆應該被濾掉,只剩合法的那一筆(得到 ' + s.instruments[0].priceHistory.length + ' 筆)');
})();
console.log('  ok');

console.log('normalize():舊資料沒有 exposureTargets 欄位時,要救回預設值 130,不能救成 0(迴歸測試)');
(function testExposureTargetsMissingField(){
  // num() 把缺值收斂成 0,如果防呆邏輯沒有先判斷「欄位根本不存在」,
  // 會把「沒填」誤判成「填了 0」,導致 HOLD 目標曝險變成 0%(這正是使用者回報的 bug)。
  const s1 = A.normalize({ leverage: { creditLimit: 8000000 } });   // 完全沒有 exposureTargets
  must(s1.leverage.exposureTargets.hold === 130, 'hold 沒填時應該救回預設 130,得到 ' + s1.leverage.exposureTargets.hold);
  must(JSON.stringify(s1.leverage.exposureTargets.byLayer) === '[65,130]',
       'byLayer 沒填時應該救回預設 [65,130],得到 ' + JSON.stringify(s1.leverage.exposureTargets.byLayer));

  const s2 = A.normalize({ leverage: { exposureTargets: { byLayer: [50], hold: 200 } } });   // 使用者真的自己改過
  must(s2.leverage.exposureTargets.hold === 200, '使用者自己設的 200 不該被蓋掉,得到 ' + s2.leverage.exposureTargets.hold);
  must(s2.leverage.exposureTargets.byLayer[0] === 50, '使用者自己設的 byLayer[0]=50 不該被蓋掉,得到 ' + s2.leverage.exposureTargets.byLayer[0]);
})();
console.log('  ok');

console.log('computeExposurePlan():正2 曝險目標的代數解');
(function testExposurePlan(){
  function setupState(n631, n675, equityValue){
    const s = A.emptyState();
    s.leverage.creditLimit = 8000000;
    s.leverage.exposureTargets = { byLayer:[65, 130], hold:130 };
    const i631 = s.instruments.find(x => x.id === '00631L');
    const i675 = s.instruments.find(x => x.id === '00675L');
    [ [i631, n631], [i675, n675] ].forEach(([it, n]) => {
      it.trend = Object.assign({}, trend, { lastSeenStatus:'', lastSeenDate:'' });
      it.priceHistory = mkHist(prices.slice(0, n));
    });
    // 用股數*股價模擬目前市值(部位淨值),不透過 priceHistory(那個只管均線)
    if (equityValue > 0){
      i631.price = 1; i631.shares = equityValue / 2;
      i675.price = 1; i675.shares = equityValue / 2;
    }
    return s;
  }

  // 兩檔都在 n=49(WAIT_RECOVER, pyramidCount=1)→ progress=1 → 目標 65%,equity=0(剛開始)
  A.state = setupState(49, 49, 0);
  let p = A.computeExposurePlan();
  console.log(`  兩檔都加碼第1層,equity=0: progress=${p.progress} target=${p.targetRatio}% deltaCash=${Math.round(p.deltaCash)}`);
  must(p.progress === 1, '兩檔都在第1層,progress 應該是 1,得到 ' + p.progress);
  must(p.targetRatio === 65, 'target 應該是 byLayer[0]=65,得到 ' + p.targetRatio);
  must(Math.abs(p.deltaCash - 3851852) < 5000, 'equity=0、目標65%、槓桿2倍時 deltaCash 應該 ≈385萬,得到 ' + Math.round(p.deltaCash));

  // 兩檔都到 n=78(HOLD)→ progress = N+1 = 3 → 目標 130%,equity 承接上一階算出的 385萬(全現金投入後)
  A.state = setupState(78, 78, 3851852);
  p = A.computeExposurePlan();
  console.log(`  兩檔都 HOLD,equity≈385萬: progress=${p.progress} target=${p.targetRatio}% deltaCash=${p.deltaCash} deltaLoan=${Math.round(p.deltaLoan)}`);
  must(p.progress === 3, '兩檔都 HOLD,progress 應該是 layerCount+1=3,得到 ' + p.progress);
  must(p.targetRatio === 130, 'target 應該是 hold=130,得到 ' + p.targetRatio);
  must(p.deltaCash === null || p.deltaCash > 10000000, '這個目標純現金到不了(需要的現金遠超過已有的385萬),deltaCash 應該是 null 或很大的數字,得到 ' + p.deltaCash);
  must(Math.abs(p.deltaLoan - 3851852) < 5000, '全部用房貸的邊界值應該 ≈385萬(跟 deltaCash 那組不同,是另一個邊界),得到 ' + Math.round(p.deltaLoan));

  // HOLD 的 130% 只在剛轉成 HOLD 時調整一次:還沒確認時給調整建議,確認之後續抱期間不再平衡——
  // 就算漲上去曝險超過 130%,也不能出現「可考慮減碼」(使用者的策略設計,不是漏算)
  A.state = setupState(78, 78, 20000000);   // equity 2000 萬、額度 800 萬 → 曝險 ≈143%,超過 130%
  p = A.computeExposurePlan();
  must(p.currentRatio > 130, `這組設定曝險應該超過 130%,得到 ${p.currentRatio}`);
  must(p.holdAdjustPending === true, '剛轉成 HOLD、還沒確認過,應該要提示調整');
  let card = A.renderExposurePlanCard();
  must(card.includes('已調整完成') && card.includes('已超過目標'), '剛轉成 HOLD 時卡片要給調整建議跟「已調整完成」按鈕');
  A.onClick({ dataset: { act: 'ack-hold' } });
  p = A.computeExposurePlan();
  must(p.holdAdjustPending === false, '按了「已調整完成」之後就不該再提示');
  card = A.renderExposurePlanCard();
  must(!card.includes('已超過目標') && !card.includes('方案A') && card.includes('續抱期間不做再平衡'),
       '續抱期間曝險超過 130% 也不該提示減碼,只顯示目前曝險:' + card.replace(/\s+/g, ' ').slice(0, 200));
  A.state.instruments.find(x => x.id === '00675L').trend.lastSeenStatus = 'WAIT_RECOVER';   // 只有一檔確認過也還算「剛轉成」
  must(A.computeExposurePlan().holdAdjustPending === true, '兩檔要都確認過 HOLD 才算調整完');

  // 兩檔進度不同:00631L 在 n=78(HOLD),00675L 在 n=49(第1層)→ 取較小的 progress=1
  A.state = setupState(78, 49, 0);
  p = A.computeExposurePlan();
  console.log(`  兩檔進度不同(HOLD vs 第1層): progress=${p.progress}(應為1,不是HOLD那檔的3)`);
  must(p.progress === 1, '兩檔進度不同時應該取較保守(較小)的那個,得到 ' + p.progress);

  // 目前曝險已經超過目標:equity 給很大,目標卻只要 65%
  A.state = setupState(49, 49, 20000000);   // equity 2000萬,遠超過目標需要的量
  p = A.computeExposurePlan();
  console.log(`  已超過目標: deltaLoan=${Math.round(p.deltaLoan)}(應為負值,代表該減碼)`);
  must(p.deltaLoan < 0, '曝險已經超過目標時 deltaLoan 應該是負值(代表該減碼),得到 ' + p.deltaLoan);
})();
console.log('  ok');

console.log();
console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n') : '沒有發現問題');
process.exit(bugs.length ? 1 : 0);

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
  computeExposurePlan, get state(){return state}, set state(v){state=v}, emptyState };`);

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

console.log('normalize():Infinity 混進趨勢參數/歷史收盤價不能悄悄溜過去(迴歸測試:壓測抓到的 bug)');
(function testInfinityGuard(){
  // num() 只擋 NaN,擋不住 Infinity(parseFloat('Infinity') 是合法的);
  // 這些欄位後面會拿去做除法、比大小,混進 Infinity 會讓 computeTrend 整個壞掉。
  const s = A.normalize({ instruments: [{
    key:'k1', id:'00631L', name:'測試', leverage:2, price:10, shares:0, auto:true,
    trend: { maFast:Infinity, maSlow:-Infinity, exitBuffer:Infinity, recoverSlopeThreshold:Infinity,
             recoverStrongRebound:Infinity, pyramidGap:Infinity, pyramidLevels:Infinity },
    priceHistory: [{ d:'2026-01-01', c:Infinity }, { d:'2026-01-02', c:50 }]
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

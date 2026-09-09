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
eval(appJs + `globalThis.A = { computeTrend, defaultTrendParams };`);

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

console.log();
console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n') : '沒有發現問題');
process.exit(bugs.length ? 1 : 0);

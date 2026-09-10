/* 策略回測引擎(walkTrend/simulateLeveragedPath/runSignalBacktest/blockBootstrapSample/
   runMonteCarlo)的迴歸測試。純函式測試,不用連網、不用真的跑 app。 */
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
eval(appJs + `globalThis.A = { computeTrend, walkTrend, simulateLeveragedPath, investedFraction,
  runSignalBacktest, mulberry32, blockBootstrapSample, runMonteCarlo, defaultTrendParams };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };

function mkHist(prices){
  const d0 = new Date('2020-01-01');
  return prices.map((c, i) => {
    const d = new Date(d0); d.setDate(d0.getDate() + i);
    return { d: d.toISOString().slice(0, 10), c };
  });
}

// 跟 tests/trend.js 同一段刻意設計過的價格路徑(涵蓋 WATCH/HOLD/EXIT/ADD/RECOVER 全流程)
const prices = [];
for (let i = 0; i < 40; i++) prices.push(80 + i * 1.25);
for (let i = 0; i < 5; i++) prices.push(130 - i * 8);
for (let i = 0; i < 10; i++) prices.push(98 - i * 1.2);
for (let i = 0; i < 5; i++) prices.push(86 - i * 3);
for (let i = 0; i < 10; i++) prices.push(74 - i * 0.5);
for (let i = 0; i < 5; i++) prices.push(69 - i * 3);
for (let i = 0; i < 15; i++) prices.push(57 + i * 3.5);
for (let i = 0; i < 6; i++) prices.push(109 - i * 8);
for (let i = 0; i < 3; i++) prices.push(69 - i * 3);

const trend = { maFast:5, maSlow:10, exitBuffer:0.9, recoverSlopeThreshold:1.0,
                recoverStrongRebound:1.05, pyramidGap:0.10, pyramidLevels:2 };

console.log('walkTrend() 逐日狀態要跟 computeTrend() 的最後一天完全一致(重構等價性迴歸測試)');
for (let n = 11; n <= prices.length; n++){
  const sub = prices.slice(0, n);
  const viaCompute = A.computeTrend({ key:'t', id:'TEST', leverage:2, trend, priceHistory: mkHist(sub) });
  const steps = A.walkTrend(sub, trend);
  const last = steps[steps.length - 1];
  must(last.status === viaCompute.status,
    `n=${n} walkTrend 最後一天 status=${last.status} 應該等於 computeTrend 的 ${viaCompute.status}`);
  must(last.pyramidCount === viaCompute.pyramidCount,
    `n=${n} walkTrend pyramidCount=${last.pyramidCount} 應該等於 computeTrend 的 ${viaCompute.pyramidCount}`);
  must(last.basePrice === viaCompute.basePrice,
    `n=${n} walkTrend basePrice=${last.basePrice} 應該等於 computeTrend 的 ${viaCompute.basePrice}`);
}
console.log(bugs.length ? '  發現不一致' : '  ok');

console.log('simulateLeveragedPath():固定報酬率時,槓桿倍數要正確複利');
{
  const r = 0.01, n = 30, lev = 2;
  const path = A.simulateLeveragedPath(new Array(n).fill(r), lev);
  const expected = 100 * Math.pow(1 + lev * r, n);
  must(path.length === n + 1, `長度應為 n+1=${n+1},實際 ${path.length}`);
  must(Math.abs(path[n] - expected) < 1e-6,
    `path[${n}]=${path[n]} 應該等於 100*(1+lev*r)^n=${expected}`);
  must(path[0] === 100, 'path[0] 應該是基準值 100');
}
console.log(bugs.length ? '  發現不一致' : '  ok');

console.log('investedFraction():狀態換算成投入比例');
{
  must(A.investedFraction({status:'HOLD', pyramidCount:0}, 2) === 1, 'HOLD 應該是滿倉 1');
  must(A.investedFraction({status:'WATCH', pyramidCount:0}, 2) === 0, 'WATCH 應該是空手 0');
  must(A.investedFraction({status:'WAIT_RECOVER', pyramidCount:1}, 2) === 0.5, 'WAIT_RECOVER 第1/2層應該是 0.5');
  must(A.investedFraction({status:'WAIT_RECOVER', pyramidCount:2}, 2) === 1, 'WAIT_RECOVER 第2/2層應該是 1(頂格)');
}
console.log(bugs.length ? '  發現不一致' : '  ok');

console.log('runSignalBacktest():不會用到未來的狀態做決策(用前一天的狀態決定當天倉位)');
{
  // 全程下跌:一旦第一次 EXIT 之後訊號應該空手或部分倉位,虧損幅度不該跟「買進不動」一樣慘
  const crashReturns = new Array(300).fill(-0.004);
  const r = A.runSignalBacktest(crashReturns, trend, 2);
  must(r.signalFinal > r.holdFinal, `持續下跌時訊號應該比死抱少賠:signal=${r.signalFinal} hold=${r.holdFinal}`);
  must(r.signalMDD >= r.holdMDD - 1e-9, `訊號的最大回落不該比死抱更深:signal=${r.signalMDD} hold=${r.holdMDD}`);
}
console.log(bugs.length ? '  發現不一致' : '  ok');

console.log('mulberry32() + blockBootstrapSample():固定種子要能重現,區塊要連續不能被打散');
{
  const pool = Array.from({length: 50}, (_, i) => i);   // 用索引本身當「報酬」,方便驗證連續性
  const s1 = A.blockBootstrapSample(pool, 5, 30, A.mulberry32(42));
  const s2 = A.blockBootstrapSample(pool, 5, 30, A.mulberry32(42));
  must(JSON.stringify(s1) === JSON.stringify(s2), '同一個種子應該產生一模一樣的路徑');
  must(s1.length === 30, `長度應為 30,實際 ${s1.length}`);
  let brokenAtBoundary = 0, brokenInBlock = false;
  for (let i = 1; i < s1.length; i++){
    const expected = (s1[i - 1] + 1) % pool.length;
    if (s1[i] !== expected){
      if (i % 5 === 0) brokenAtBoundary++;
      else brokenInBlock = true;
    }
  }
  must(!brokenInBlock, '區塊內部不該斷開(block bootstrap 要保留連續段落,不是逐點打散)');
  must(brokenAtBoundary > 0, '這麼多區塊邊界,應該至少有幾處真的換了新的起點(不然抽樣失去隨機性)');
}
console.log(bugs.length ? '  發現不一致' : '  ok');

console.log('runMonteCarlo():勝率/正報酬比例要落在 [0,1],短路徑/少路徑數不會炸掉');
{
  const pool = Array.from({length: 300}, () => (Math.random() - 0.48) * 0.02);
  const mc = A.runMonteCarlo(pool, trend, 2, { paths: 20, pathLen: 100, blockLen: 5, seed: 7 });
  must(mc.winRate >= 0 && mc.winRate <= 1, `winRate 應在 [0,1],實際 ${mc.winRate}`);
  must(mc.positiveRate >= 0 && mc.positiveRate <= 1, `positiveRate 應在 [0,1],實際 ${mc.positiveRate}`);
  // 邊界情況:pathLen/paths 給極小值
  const tiny = A.runMonteCarlo(pool, trend, 2, { paths: 1, pathLen: 1, blockLen: 21, seed: 1 });
  must(Number.isFinite(tiny.winRate), 'paths=1/pathLen=1 時 winRate 不該是 NaN/Infinity');
  const mc2 = A.runMonteCarlo(pool, trend, 2, { paths: 20, pathLen: 100, blockLen: 5, seed: 7 });
  must(mc2.winRate === mc.winRate, '同樣的種子跑兩次蒙地卡羅,勝率應該完全一樣(可重現)');
}
console.log(bugs.length ? '  發現不一致' : '  ok');

if (bugs.length){
  console.log('\n=== 發現問題 ===');
  bugs.forEach(b => console.log('- ' + b));
  process.exit(1);
}else{
  console.log('\n沒有發現問題');
}

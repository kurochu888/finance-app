/* 均線策略回測(runBacktest)的迴歸測試。
   重點測兩件事:(1) 回測的狀態機判斷跟 computeTrend 是否真的逐行一致——這兩個函式
   故意各自維護同一套規則,只要哪天改了一邊忘了改另一邊,這裡就該炸開;(2) 現金/股數
   簿記有沒有基本的算術錯誤(不會出現負現金、MDD 不會是正數、手續費真的扣了)。
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

// 開 app 時會自動抓一次報價;先把證交所冷卻設成還沒到期,讓 app 啟動時不發請求,
// 後面節流測試才能從乾淨的狀態開始(測試自己會清掉這個 key)。
global.localStorage.setItem('financeTwseCooldownUntil', String(Date.now() + 3600000));

const fs = require('fs');
const src = fs.readFileSync('/ssd1/finance/docs/index.html', 'utf8');
const blocks = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const appJs = blocks.sort((a, b) => b.length - a.length)[0];
eval(appJs + `globalThis.A = { computeTrend, runBacktest, monthEndSample, defaultFee, findHistoryGap, completeHistoryMonths,
  twseJson, twseCooldownLeft, TwseBlocked, TWSE_GAP_MS, TWSE_FAIL_LIMIT };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };

function mkHist(prices){
  const d0 = new Date('2020-01-01');
  return prices.map((c, i) => {
    const d = new Date(d0); d.setDate(d0.getDate() + i);
    return { d: d.toISOString().slice(0, 10), c };
  });
}

// 跟 trend.js 同一段合成價格路徑:上漲進場→急跌 EXIT→兩段緩跌各加碼一層→強力反彈 RECOVER
// →再急跌第二次 EXIT→緩跌第二輪加碼。用短週期均線(5/10 日)方便少量資料就跑完整個循環。
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

console.log('資料不足時回傳 null(不能算出慢線就不該硬跑)');
must(A.runBacktest(mkHist(prices.slice(0, 5)), trend) === null, '資料不足時應該回傳 null');
console.log('  ok');

console.log('回測的狀態機判斷要跟 computeTrend 逐行一致(同一段價格路徑,結果必須相同)');
const hist = mkHist(prices);
const trendResult = A.computeTrend({ key:'t', id:'TEST', leverage:2, trend, priceHistory: hist });
const btResult = A.runBacktest(hist, trend);
must(btResult.status === trendResult.status,
     `computeTrend 說 status=${trendResult.status},runBacktest 卻算成 ${btResult.status}——兩邊規則分岔了`);
must(btResult.pyramidCount === trendResult.pyramidCount,
     `computeTrend 說 pyramidCount=${trendResult.pyramidCount},runBacktest 卻算成 ${btResult.pyramidCount}`);
console.log(`  最終 status=${btResult.status} pyramidCount=${btResult.pyramidCount},兩邊一致`);
console.log('  ok');

console.log('淨值曲線基本檢查:天數對得上、起點正確、現金/股數不會算出負值、MDD 不會是正數');
must(btResult.curve.length === hist.length - (trend.maSlow - 1),
     `曲線長度應該是 ${hist.length - (trend.maSlow - 1)},得到 ${btResult.curve.length}`);
must(btResult.curve[0].strat === 1000000, `曲線第一天策略淨值應該是初始資金 1000000,得到 ${btResult.curve[0].strat}`);
const negative = btResult.curve.find(c => c.strat < 0 || c.bh < 0);
must(!negative, `曲線裡出現負的淨值(${negative ? JSON.stringify(negative) : ''}),簿記一定算錯了`);
must(btResult.mddStrat <= 0 && btResult.mddBh <= 0,
     `MDD 定義上不會是正數,得到 strat=${btResult.mddStrat} bh=${btResult.mddBh}`);
console.log(`  策略總報酬 ${btResult.returnStrat.toFixed(1)}% / MDD ${btResult.mddStrat.toFixed(1)}%`);
console.log(`  買進持有總報酬 ${btResult.returnBh.toFixed(1)}% / MDD ${btResult.mddBh.toFixed(1)}%`);
console.log('  ok');

console.log('全押進場真的扣了手續費(第一次 RECOVER 那天,淨值要比前一天的純現金少一點)');
// curve[0] 是暖身結束那天(純現金,還沒進場);checkpoint 顯示 n=11(陣列索引 10)已經是 HOLD,
// 對照 maSlow=10 → start=9,那正好是 curve[1](i=10=start+1)——回測第一次全押買進的那一天。
// 同一天的收盤價估值,買進前後唯一的差異就是手續費,所以 curve[1] 應該嚴格小於 curve[0]。
must(btResult.curve[1].strat < btResult.curve[0].strat,
     `第一次全押買進當天淨值(${btResult.curve[1].strat})應該比前一天純現金(${btResult.curve[0].strat})少,手續費才是真的被扣了`);
console.log(`  買進前 ${btResult.curve[0].strat} → 買進後 ${btResult.curve[1].strat.toFixed(0)}`);
console.log('  ok');

console.log('monthEndSample:每個月只留最後一個交易日,首尾一定保留');
(function testMonthEndSample(){
  const c = [
    { d:'2020-01-05', strat:1, bh:1 }, { d:'2020-01-20', strat:2, bh:2 },
    { d:'2020-02-03', strat:3, bh:3 }, { d:'2020-02-28', strat:4, bh:4 },
    { d:'2020-03-02', strat:5, bh:5 },
  ];
  const s = A.monthEndSample(c);
  must(s.length === 3, `三個月份應該取樣成 3 筆,得到 ${s.length}`);
  must(s[0].d === '2020-01-20' && s[1].d === '2020-02-28' && s[2].d === '2020-03-02',
       `取樣結果不對:${JSON.stringify(s.map(x => x.d))}`);
})();
console.log('  ok');

console.log('findHistoryGap:抓到真的漏資料的大缺口,不誤判週末/國定假日/農曆年這種正常間斷');
(function testFindHistoryGap(){
  const daily = (dates) => dates.map(d => ({ d, c: 100 }));

  const clean = daily(['2024-01-01','2024-01-02','2024-01-03','2024-01-04','2024-01-05']);
  must(A.findHistoryGap(clean) === null, '連續交易日不該被誤判成缺口');

  const weekend = daily(['2024-01-05','2024-01-08']);   // 週五→下週一,隔 3 天
  must(A.findHistoryGap(weekend) === null, '正常週末間隔不該被誤判成缺口');

  const cny = daily(['2024-02-06','2024-02-16']);   // 模擬農曆年封關,隔 10 天
  must(A.findHistoryGap(cny) === null, '農曆年這種長假(10 天)不該被誤判成缺口');

  const realGap = daily(['2020-05-01','2020-05-04','2020-08-10','2020-08-11']);   // 中間憑空少了三個多月
  const gap = A.findHistoryGap(realGap);
  must(gap && gap.from === '2020-05-04' && gap.to === '2020-08-10',
       `應該抓到 2020-05-04 ~ 2020-08-10 這段缺口,得到 ${JSON.stringify(gap)}`);
  console.log(`  抓到缺口:${gap.from} ~ ${gap.to},約 ${gap.days} 天`);
})();
console.log('  ok');

console.log('RECOVER 全押時,加碼已經買進的張數不能再被當成重買一次、多扣一次手續費');
(function testRecoverFee(){
  // 價格固定 100、手續費固定:先 ADD 一層(用掉一半現金),再 RECOVER 把剩下的現金買滿。
  // 兩次買進的總手續費應該就是「第一次買的金額的手續費 + 第二次買的金額的手續費」,
  // 淨值 = 初始資金 − 這兩筆手續費。舊版 RECOVER 會把手上全部張數當成重買一次再扣一次。
  const p = { maFast:2, maSlow:3, exitBuffer:0.5, recoverSlopeThreshold:1.0,
              recoverStrongRebound:1.05, pyramidGap:0.10, pyramidLevels:2 };
  const r = A.runBacktest(mkHist([100, 100, 100, 85, 100, 100]), p);
  const qty1 = Math.floor(500000 / (85 * 1.001425) / 1000) * 1000;
  const cash1 = 1000000 - qty1 * 85 - A.defaultFee('buy', qty1 * 85);
  const qty2 = Math.floor(cash1 / (100 * 1.001425) / 1000) * 1000;
  const expected = cash1 - qty2 * 100 - A.defaultFee('buy', qty2 * 100) + (qty1 + qty2) * 100;
  const last = r.curve[r.curve.length - 1].strat;
  must(r.status === 'HOLD', `這段價格最後應該是 HOLD,得到 ${r.status}`);
  must(Math.abs(last - expected) < 1e-6, `RECOVER 後淨值應該是 ${expected},得到 ${last}`);
})();
console.log('  ok');

console.log('高檔處理實驗(只在回測):實驗1 高點回落出場、實驗2 高檔減半+創新高買回');
(function testExitExperiments(){
  // exitBuffer 設 0.7 讓原本的出場線離遠一點,才分得出「回落出場」跟「原本的出場」
  const p = { maFast:5, maSlow:10, exitBuffer:0.7, recoverSlopeThreshold:1.0,
              recoverStrongRebound:1.05, pyramidGap:0.10, pyramidLevels:2 };
  const base = [];
  for (let i = 0; i < 12; i++) base.push(100);
  for (let i = 1; i <= 10; i++) base.push(100 * Math.pow(1.01, i));   // 緩漲 → HOLD
  const climb = base.slice();
  for (let i = 1; i <= 13; i++) climb.push(climb[climb.length - 1] * 1.03);
  const peak = climb[climb.length - 1];
  const trail = { kind:'trail', drop:0.20 };

  // 實驗1-a:從高點回落 >20% 出場,之後創新高 → 全押再進場
  const a = A.runBacktest(mkHist(climb.concat([150, 140, 128, 140, 155, peak + 5])), p, trail);
  must(a.outs === 1 && a.status === 'HOLD', `回落出場後創新高應該再進場回 HOLD,得到 outs=${a.outs} status=${a.status}`);
  must(a.events.length === 2 && a.events[0].type === 'out' && a.events[0].price === 128 && a.events[1].type === 'in' && Math.abs(a.events[1].price - (peak + 5)) < 1e-9,
       `出場應該在 128(第一個跌破高點 ×0.8 的收盤),再進場在創新高那天:${JSON.stringify(a.events)}`);
  // 實驗1-b:回落出場後繼續崩到原本的出場線以下 → 接回原本的 WAIT_RECOVER(已經空手,不用再賣)
  const b = A.runBacktest(mkHist(climb.concat([150, 140, 128, 100, 80, 60])), p, trail);
  // (跌到 60 時比出場那天的 80 又跌了 10% 以上,照原本的規則會加碼一層,所以手上有股票是對的)
  must(b.status === 'WAIT_RECOVER' && b.pyramidCount === 1 && b.events[b.events.length - 1].type === 'exit' && b.events[b.events.length - 1].price === 80,
       `回落出場後跌破出場線應該接回 WAIT_RECOVER,之後照原本規則加碼:status=${b.status} pyramid=${b.pyramidCount} ${JSON.stringify(b.events)}`);

  // 實驗2:急漲到快線 1.3 倍以上賣一半
  const oh = { kind:'overheat', trigger:1.3, reentry:1.1 };
  const spikeUp = base.concat([160, 165]);          // 隔天又漲過賣出價 → 行情沒回頭,馬上買回
  const c = A.runBacktest(mkHist(spikeUp), p, oh), cBase = A.runBacktest(mkHist(spikeUp), p);
  must(c.outs === 1 && c.status === 'HOLD' && c.shares === cBase.shares,
       `減半後隔天創新高應該買回原股數:outs=${c.outs} status=${c.status} shares=${c.shares} vs ${cBase.shares}`);
  must(c.cash < cBase.cash, '賣 160 買回 165,現金應該比一直抱著少');
  const spikeFlat = base.concat([160, 158, 158, 158, 158, 158]);   // 沒再創新高,快線追上來 → 在 158 買回
  const d = A.runBacktest(mkHist(spikeFlat), p, oh), dBase = A.runBacktest(mkHist(spikeFlat), p);
  must(d.outs === 1 && d.status === 'HOLD' && d.shares === dBase.shares && d.cash > dBase.cash,
       `回到快線 1.1 倍以內應該用 158 買回、賺到價差:outs=${d.outs} status=${d.status} cash ${d.cash} vs ${dBase.cash}`);

  // 沒觸發的路徑,開不開實驗結果要完全一樣
  for (const e of [trail, oh]){
    const x = A.runBacktest(mkHist(base), p, e), y = A.runBacktest(mkHist(base), p);
    must(x.outs === 0 && x.curve[x.curve.length - 1].strat === y.curve[y.curve.length - 1].strat, `${e.kind} 沒觸發時應該跟原策略完全一樣`);
  }
  // 對照組:只投入 80%。進場後股票市值應該約佔總資產 80%;同一段下跌,回撤約是全押的 0.8 倍
  const part = { kind:'partial', invest:0.8 };
  const up = A.runBacktest(mkHist(climb), p, part);
  const last = up.curve[up.curve.length - 1].strat, lastClose = climb[climb.length - 1];
  const w0 = A.runBacktest(mkHist(base), p, part);
  const w0Close = base[base.length - 1];
  const weight = w0.shares * w0Close / w0.curve[w0.curve.length - 1].strat;
  // 這組測試價格一張(1000 股)就值總資產一成左右,整張買會往下取整,所以容許少到一張的價值
  const lotShare = 1000 * w0Close / w0.curve[w0.curve.length - 1].strat;
  must(weight <= 0.85 && weight > 0.8 - lotShare, `只投入 80% 時股票應該約佔總資產 80%(整張買最多少一張),得到 ${(weight * 100).toFixed(1)}%`);
  const crash = climb.concat([150, 130, 115]);
  const full = A.runBacktest(mkHist(crash), p), part80 = A.runBacktest(mkHist(crash), p, part);
  const ratio = part80.mddStrat / full.mddStrat;
  must(ratio > 0.7 && ratio < 0.85, `同一段下跌,只投入 80% 的回撤應該約是全押的 0.8 倍,得到 ${part80.mddStrat.toFixed(1)}% vs ${full.mddStrat.toFixed(1)}%`);
  must(last > 0 && lastClose > 0, 'sanity');

  // 年化÷MDD 的算法
  must(a.calmar === null || Math.abs(a.calmar - a.cagr / -a.mddStrat) < 1e-9, '年化÷MDD 應該等於年化報酬 ÷ |MDD|');
})();
console.log('  ok');

console.log('completeHistoryMonths:上次只抓到一半的月份不能被當成已經抓齊而永遠跳過');
(function testCompleteMonths(){
  const daily = (dates) => dates.map(d => ({ d, c: 100 }));
  // 上次在 2026-07-10 按過:7 月只有前半,最新一筆在 7 月 → 7 月不算抓齊,要重抓
  const h1 = daily(['2026-05-29','2026-06-01','2026-06-15','2026-06-30','2026-07-01','2026-07-10']);
  const d1 = A.completeHistoryMonths(h1);
  must(!d1.has('2026-07'), '最新資料所在的月份(可能只抓到一半)不該算抓齊');
  must(d1.has('2026-06') && d1.has('2026-05'), '更早、沒有缺口的月份應該算抓齊');
  // 舊版已經留下的半個月:7 月停在 07-10,接著直接跳到 8 月 → 缺口兩端的 7、8 月都要重抓
  const h2 = daily(['2026-06-30','2026-07-01','2026-07-10','2026-08-03','2026-08-17','2026-08-31','2026-09-01']);
  const d2 = A.completeHistoryMonths(h2);
  must(!d2.has('2026-07') && !d2.has('2026-08'), `缺口兩端的月份不該算抓齊,得到 ${JSON.stringify([...d2])}`);
  must(d2.has('2026-06'), '缺口以外的月份應該還是算抓齊');
  must(A.completeHistoryMonths([]).size === 0, '沒有資料時沒有任何月份算抓齊');
})();
console.log('  ok');

(async () => {
console.log('twseJson:對證交所的請求要排隊、間隔至少 TWSE_GAP_MS;連續失敗要停下來冷卻,冷卻期間不能再發請求');
await (async function testTwseThrottle(){
  // 假時鐘:sleep() 走 setTimeout,讓它直接把時間往前推,不用真的等
  const realST = global.setTimeout, realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  global.setTimeout = (f, ms) => { now += (ms || 0); return realST(f, 0); };
  try{
    localStorage.removeItem('financeTwseCooldownUntil');
    const times = [];
    let fail = false;
    global.fetch = async () => { times.push(now); if (fail) throw new Error('blocked');
                                 return { ok: true, json: async () => ({ stat: 'OK', data: [] }) }; };
    // 同時丟 4 個請求(像更新報價那樣 Promise.all),實際送出去的時間要依序隔開
    await Promise.all([1, 2, 3, 4].map(() => A.twseJson('x')));
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    must(times.length === 4, `應該送出 4 個請求,得到 ${times.length}`);
    must(gaps.every(g => g >= A.TWSE_GAP_MS), `請求間隔應該至少 ${A.TWSE_GAP_MS}ms,得到 ${JSON.stringify(gaps)}`);

    fail = true;
    times.length = 0;
    let blockedErr = null;
    for (let i = 0; i < A.TWSE_FAIL_LIMIT + 3; i++){
      try{ await A.twseJson('x'); }catch(e){ if (e instanceof A.TwseBlocked){ blockedErr = e; break; } }
    }
    must(blockedErr, '連續失敗應該丟出 TwseBlocked,讓呼叫端停下來');
    must(times.length === A.TWSE_FAIL_LIMIT, `連續失敗 ${A.TWSE_FAIL_LIMIT} 次就該停,實際發了 ${times.length} 個`);
    must(A.twseCooldownLeft() > 0, '被擋之後應該進入冷卻');
    const before = times.length;
    let rejected = false;
    try{ await A.twseJson('x'); }catch(e){ rejected = e instanceof A.TwseBlocked; }
    must(rejected && times.length === before, '冷卻期間應該直接拒絕,不能再對證交所發請求');
    now += A.twseCooldownLeft() + 1;
    fail = false;
    await A.twseJson('x');
    must(times.length === before + 1, '冷卻到期後應該恢復正常送出請求');
  }finally{
    global.setTimeout = realST;
    Date.now = realNow;
  }
})();
console.log('  ok');

console.log();
console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n') : '沒有發現問題');
process.exit(bugs.length ? 1 : 0);
})();

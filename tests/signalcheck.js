/* 收盤後自動檢查(scripts/signal-check.js)的判斷,不連網:餵一段假的價格歷史,一天一天往後推,
   看通知發的時機——快到出場線先預警一次、跌破出場線發 🔔、同一段不重複預警。 */
const { evaluate, A, WARN_PCT } = require('../scripts/signal-check.js');

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };

// 平日的日期
const days = [];
for (const d = new Date('2025-01-02T00:00:00'); days.length < 420; d.setDate(d.getDate() + 1)){
  if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'));
}
// 300 天緩漲,之後每天跌 0.6%,中間反彈一段(離開預警範圍再回來,要再發一次)
const closes = [];
let px = 10;
for (let i = 0; i < 420; i++){
  if (i < 300) px *= 1.004;
  else if (i >= 318 && i < 326) px *= 1.012;
  else px *= 0.994;
  closes.push(Math.round(px * 100) / 100);
}
const it = A.emptyState().instruments.find(x => x.id === '00631L');
const sent = [];
const log = console.log; console.log = () => {};   // evaluate 每天會印一行狀態,這裡不需要
for (let n = 250; n <= 420; n++){
  it.priceHistory = days.slice(0, n).map((d, i) => ({ d, c: closes[i] }));
  it.trend.lastSeenStatus = ''; it.trend.lastSeenLayers = -1;
  const r = evaluate(it);
  if (r.problem) bugs.push('不該有問題:' + r.problem);
  r.alerts.forEach(a => sent.push({ n, title: a.title }));
}
console.log = log;
sent.forEach(x => console.log('  ' + x.title));
const warns = sent.filter(x => x.title.startsWith('⚠️')), exits = sent.filter(x => /跌破出場線/.test(x.title));
must(exits.length >= 1, '要發跌破出場線的 🔔');
must(warns.length >= 1 && warns[0].n < exits[0].n, '預警要在跌破之前');
must(warns.every(w => { const m = w.title.match(/再跌 ([\d.]+)%/); return m && Number(m[1]) < WARN_PCT; }), `預警時要在 ${WARN_PCT}% 以內`);
// 每一次預警的前一天都不在範圍內(同一段不天天發)
const warnDays = new Set(warns.map(w => w.n));
must(![...warnDays].some(n => warnDays.has(n - 1)), '連續兩天都預警了');
must(new Set(sent.map(x => x.title)).size === sent.length, '標題重複(同一天同一件事只能一個標題)');

if (bugs.length){
  console.log('\n發現 ' + bugs.length + ' 個問題:');
  bugs.forEach(b => console.log('  ✗ ' + b));
  process.exitCode = 1;
}else console.log('\n沒有發現問題');

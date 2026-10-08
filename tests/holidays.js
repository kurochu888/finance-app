/* 證交所休市日:交割日 T+2 跳過國定假日、「收盤價停在…」扣掉本來就沒開盤的日子;還沒公布的年份退回只看週末。
   休市日資料是證交所 2026 年的真實公告(holidaySchedule),fetch 用假的。 */
const RealDate = Date;
let simNow = new RealDate('2026-10-08T09:00:00').getTime();
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
global.localStorage = { _d:{ financeQuoteFetchedAt: String(simNow) }, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };

const H2026 = [["2026-01-01","中華民國開國紀念日"],["2026-01-02","國曆新年開始交易日"],["2026-02-11","農曆春節前最後交易日"],
  ["2026-02-12","市場無交易，僅辦理結算交割作業"],["2026-02-13","市場無交易，僅辦理結算交割作業"],["2026-02-15","農曆除夕及春節"],
  ["2026-02-16","農曆除夕及春節"],["2026-02-17","農曆除夕及春節"],["2026-02-18","農曆除夕及春節"],["2026-02-19","農曆除夕及春節"],
  ["2026-02-20","農曆除夕及春節"],["2026-02-23","農曆春節後開始交易日"],["2026-02-27","和平紀念日"],["2026-02-28","和平紀念日"],
  ["2026-04-03","兒童節及民族掃墓節"],["2026-04-04","兒童節及民族掃墓節"],["2026-04-05","兒童節及民族掃墓節"],["2026-04-06","兒童節及民族掃墓節"],
  ["2026-05-01","勞動節"],["2026-06-19","端午節"],["2026-09-25","中秋節"],["2026-09-28","孔子誕辰紀念日/ 教師節"],["2026-10-09","國慶日"],
  ["2026-10-10","國慶日"],["2026-10-25","臺灣光復暨金門古寧頭大捷紀念日"],["2026-10-26","臺灣光復暨金門古寧頭大捷紀念日"],["2026-12-25","行憲紀念日"]]
  .map(r => [...r, '']);
const asked = [];
global.fetch = async (url) => {
  const y = (String(url).match(/holidaySchedule.*date=(\d{4})/) || [])[1];
  if (!y) throw new Error('offline');
  asked.push(y);
  const data = y === '2026' ? H2026 : [];   // 2027 還沒公布:證交所回 stat ok、data 空的
  return { ok: true, json: async () => ({ stat: 'ok', data }) };
};
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, settleDate, parseHolidays,
  holidayYear, marketClosed, refreshHolidays, signalStaleness, todoItems, renderStaleSignalAlert, set holidayCache(v){holidayCache=v},
  HOLIDAY_KEY };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };
const lastClose = d => A.state.instruments.forEach(it => { if (it.auto) it.priceHistory = [{ d: '2026-01-05', c: 10 }, { d, c: 10 }]; });

(async () => {
  console.log('清單怎麼分');
  const p = A.parseHolidays(H2026);
  must(p.settleOnly.join() === '2026-02-12,2026-02-13', '「僅辦理結算交割」那兩天要分開:' + p.settleOnly.join());
  must(!p.closed.includes('2026-01-02') && !p.closed.includes('2026-02-11') && !p.closed.includes('2026-02-23'), '開始/最後交易日照常開盤');
  must(p.closed.includes('2026-10-09') && p.closed.includes('2026-02-16'), '國慶、春節要算休市');
  must(A.parseHolidays([null, 'x', [], ['2026-13-40', '壞日期'], [{}, 1]]).closed.length === 0, '壞資料不能丟例外、不能進清單');

  console.log('還不知道休市日:照舊只看週末');
  A.state = A.normalize(A.emptyState());
  must(A.settleDate('2026-10-08') === '2026-10-12', '週四 → 下週一(不知道國慶):' + A.settleDate('2026-10-08'));
  lastClose('2026-02-11');
  const old = A.signalStaleness('2026-02-23');
  must(old && old.days === 12 && !old.missed, '春節後照舊規則會警告(12 天前):' + JSON.stringify(old));
  lastClose('2026-10-08');
  must(!A.signalStaleness('2026-10-12'), '4 天前照舊不警告');

  console.log('抓休市日');
  await Promise.all([A.refreshHolidays(), A.refreshHolidays()]);   // 抓報價跟別的地方同時叫
  must(asked.join() === '2026', '10 月只問今年、同時叫兩次只問一次:' + asked.join());
  must(A.holidayYear(2026) && JSON.parse(localStorage.getItem(A.HOLIDAY_KEY))['2026'], '存進 localStorage');
  await A.refreshHolidays();
  must(asked.length === 1, '30 天內不重問');

  console.log('交割日跳過國定假日');
  [['2026-10-08', '2026-10-13', '週四 → 國慶 + 週末 → 下週二'],
   ['2026-10-07', '2026-10-12', '週三 → 週四、(國慶)、下週一'],
   ['2026-02-10', '2026-02-12', '春節前:週二 → 僅交割日 02-12 照算'],
   ['2026-02-11', '2026-02-13', '春節前最後交易日 → 02-13'],
   ['2026-09-24', '2026-09-30', '中秋 + 週末 + 教師節:週四 → 下週二、週三'],
   ['2026-04-01', '2026-04-07', '清明連假'],
  ].forEach(([d, want, why]) => must(A.settleDate(d) === want, why + ':得到 ' + A.settleDate(d) + ',應為 ' + want));
  must(A.marketClosed('2026-02-12') && !A.marketClosed('2026-02-12', true), '02-12 不交易、照常交割');

  console.log('收盤價停在…:扣掉本來沒開盤的日子');
  lastClose('2026-02-11');
  must(!A.signalStaleness('2026-02-23'), '春節期間沒開盤,開市當天早上不該警告:' + JSON.stringify(A.signalStaleness('2026-02-23')));
  const feb = A.signalStaleness('2026-02-25');
  must(feb && feb.missed === 2, '02-23、02-24 有開盤沒抓到 = 少 2 個交易日:' + JSON.stringify(feb));
  lastClose('2026-10-08');
  must(!A.signalStaleness('2026-10-09') && !A.signalStaleness('2026-10-12'), '國慶連假後週一早上不警告');
  const oct = A.signalStaleness('2026-10-13');
  must(oct && oct.missed === 1, '週二還停在 10-08:少了 10-12 一個交易日:' + JSON.stringify(oct));
  lastClose('2026-10-06');
  must(A.signalStaleness('2026-10-08') && A.signalStaleness('2026-10-08').missed === 1, '只差一天也要警告(以前要 4 天後)');
  simNow = new RealDate('2026-10-13T09:00:00').getTime();
  lastClose('2026-10-08');
  const todo = A.todoItems().find(t => t.icon === '🕘');
  must(todo && /少了 1 個交易日/.test(todo.text), '今天要做什麼:' + (todo && todo.text));
  must(/少了 1 個交易日/.test(A.renderStaleSignalAlert()) && /休市日/.test(A.renderStaleSignalAlert()), '訊號分頁的提醒文字');

  console.log('跨到還沒公布的年份');
  simNow = new RealDate('2026-12-20T09:00:00').getTime();
  await A.refreshHolidays();
  const n27 = () => asked.filter(y => y === '2027').length;
  must(n27() === 1, '12 月要問明年:' + asked.join());
  must(asked.filter(y => y === '2026').length === 2, '今年的清單過 30 天重問一次:' + asked.join());
  must(!A.holidayYear(2027), '2027 還沒公布 = 不知道');
  must(A.settleDate('2026-12-31') === '2027-01-04', '跨年只跳週末:' + A.settleDate('2026-12-31'));
  lastClose('2026-12-30');
  const ny = A.signalStaleness('2027-01-04');
  must(ny && !ny.missed && ny.days === 5, '有一年不知道就照舊規則:' + JSON.stringify(ny));
  simNow = new RealDate('2026-12-22T09:00:00').getTime();
  await A.refreshHolidays();
  must(n27() === 1, '還沒公布的 3 天內不重問:' + asked.join());
  simNow = new RealDate('2026-12-24T09:00:00').getTime();
  await A.refreshHolidays();
  must(n27() === 2, '還沒公布的過 3 天再問:' + asked.join());

  console.log('localStorage 壞掉');
  localStorage.setItem(A.HOLIDAY_KEY, '[1,2');
  A.holidayCache = null;
  must(!A.holidayYear(2026) && A.settleDate('2026-10-08') === '2026-10-12', '壞掉就當不知道');
  localStorage.setItem(A.HOLIDAY_KEY, JSON.stringify({ 2026: { closed: 'x' } }));
  A.holidayCache = null;
  must(!A.holidayYear(2026), '格式不對當不知道');

  if (bugs.length){
    console.log('\n發現 ' + bugs.length + ' 個問題:');
    bugs.forEach(b => console.log('  ✗ ' + b));
    process.exitCode = 1;
  }else console.log('\n沒有發現問題');
})();

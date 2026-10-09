/* 槓桿頁「今天要做什麼」:各種待辦有出現、沒事時說不用動、按鈕帶到對的分頁。 */
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
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{ financeTwseCooldownUntil: String(simNow + 3600000 * 24 * 365) }, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, sampleData,
  todoItems, renderTodo, renderLeverage, onClick, set levTab(v){ levTab = v; }, get levTab(){ return levTab; },
  get currentTab(){ return currentTab; }, openFolds, set healthCache(v){ healthCache = v; } };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };
const icons = () => A.todoItems().map(x => x.icon).join('');
const plain = t => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

console.log('沒事的時候');
A.state = A.normalize(A.emptyState());
must(A.todoItems().length === 0, '空的資料不該有待辦:' + JSON.stringify(A.todoItems()));
must(plain(A.renderTodo()).includes('今天不用動'), '沒事要說今天不用動');
A.levTab = 'overview';
must(A.renderLeverage().includes('今天要做什麼'), '槓桿頁概況要有這張卡');

console.log('範例資料、上次看過的狀態跟現在一樣:不用動');
A.state = A.sampleData();
A.state.instruments.forEach(it => { it.trend.lastSeenStatus = 'HOLD'; });
must(!/🔔|⚖️/.test(icons()), '狀態沒變、續抱中不該叫你調整:' + JSON.stringify(A.todoItems()));

console.log('狀態剛改變:提醒 + 曝險要調整');
A.state.instruments.forEach(it => { it.trend.lastSeenStatus = 'WAIT_RECOVER'; });
const items = A.todoItems();
must(items.some(x => x.icon === '🔔' && /轉回續抱/.test(x.text)), '要列出轉回續抱的提醒:' + JSON.stringify(items));
must(items.some(x => x.icon === '⚖️' && x.tab === 'signal'), '剛轉成續抱、曝險不在目標要列調整:' + JSON.stringify(items));
must(!plain(A.renderTodo()).includes('&amp;'), '標題不能被跳脫兩次');

console.log('用房貸買進但沒有動用紀錄 / 金額對不起來');
A.state = A.sampleData();
A.state.instruments.forEach(it => { it.trend.lastSeenStatus = 'HOLD'; });
const drawAmt = A.state.leverage.draws[0].amount;
A.state.leverage.draws[0].amount = drawAmt * 3;
must(A.todoItems().some(x => x.icon === '📒' && /對不起來/.test(x.text) && x.tab === 'setup'), '動用跟買進差很多要列出來');
A.state.leverage.draws = [];
must(A.todoItems().some(x => x.icon === '📒' && /還沒有/.test(x.text) && x.tab === 'log'), '沒有動用紀錄要列出來');

console.log('一週內的扣款、預定動用');
A.state = A.normalize(A.emptyState());
A.state.leverage.payDay = 10;
A.state.leverage.draws = [
  { id:'d1', label:'', amount:1000000, useDate:'2026-08-01', note:'', repayments:[] },
  { id:'d2', label:'', amount:300000, useDate:'2026-10-10', note:'', repayments:[] },
  { id:'d3', label:'', amount:300000, useDate:'2026-11-30', note:'', repayments:[] }];
A.state = A.normalize(A.state);
const it2 = A.todoItems();
must(it2.some(x => x.icon === '🏦' && /10\/10/.test(x.text) && /2 天後/.test(x.sub)), '10/10 繳款日要提醒:' + JSON.stringify(it2));
must(it2.filter(x => x.icon === '💳').length === 1 && it2.some(x => x.icon === '💳' && /10\/10/.test(x.text)), '一週內的預定動用才列:' + JSON.stringify(it2));
A.state.leverage.payDay = 1;
must(!A.todoItems().some(x => x.icon === '🏦'), '本月繳款日過了不用提醒');

console.log('按鈕帶到對的分頁');
A.onClick({ dataset:{ act:'lev-tab', v:'log' } });
must(A.levTab === 'log', '「去紀錄」要切到紀錄分頁');

console.log('健康檢查有 ⚠ 就列進今天要做什麼(已經另外列的不重複)');
{
  const s = A.normalize(A.emptyState());
  s.leverage.draws = [{ id:'d1', label:'九月', amount:500000, useDate:'2026-09-03', note:'', repayments:[{ id:'r1', date:'2026-09-01', amount:1000 }] }];
  s.trades = [{ id:'b1', date:'2026-09-01', symbol:'00631L', action:'buy', source:'loan', shares:1000, price:40, amount:0, fee:0, note:'' }];
  A.state = s; A.healthCache = { at: 0, warns: [] };
  const items = A.todoItems(), hw = items.filter(x => x.icon === '🩺');
  must(hw.length === 1 && /健康檢查有 1 項要注意/.test(hw[0].text) && /早於動用日/.test(hw[0].sub), '還款早於動用日要列進今天要做什麼:' + JSON.stringify(hw));
  must(items.some(x => x.icon === '📒'), '動用對不起來照舊由 📒 列');
  must(!/對不起來|合計差/.test(hw[0].sub), '📒 已經列的不能在 🩺 再算一次');
  must(A.renderTodo().includes('data-act="diag-open"'), '要有「看診斷」按鈕');
  A.onClick({ dataset:{ act:'diag-open' } });
  must(A.currentTab === 'overview' && A.openFolds.has('diag'), '「看診斷」要到總覽、展開診斷紀錄');
  A.state = A.normalize(A.emptyState()); A.healthCache = { at: 0, warns: [] };
  must(!A.todoItems().some(x => x.icon === '🩺'), '沒有問題時不列');
}

if (bugs.length){
  console.log('\n發現 ' + bugs.length + ' 個問題:');
  bugs.forEach(b => console.log('  ✗ ' + b));
  process.exitCode = 1;
}else console.log('\n沒有發現問題');

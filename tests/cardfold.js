/* 整張卡片收合(cardOpen):點標題收起/展開、記在這台裝置、預設收著的清單、填到一半/待確認時一定打開、
   收著時標題旁的摘要、每一頁每張卡片都畫得出來。真的瀏覽器裡收著有沒有漏出東西是用 puppeteer 手動看的(見 CLAUDE.md)。 */
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
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };

const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../docs/index.html', 'utf8');
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, normalize, sampleData, onClick, renderAll, switchTab,
  renderTrades, renderDrawRecords, renderRepayments, renderOverview, renderLeverage, set levTab(v){levTab=v}, get tradeDraft(){return tradeDraft},
  get cardFolds(){return cardFolds}, set pendingConfirm(v){pendingConfirm=v} };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };
const closed = (html, key) => new RegExp('class="card cf-closed" data-cf="' + key + '"').test(html);
const open_ = (html, key) => new RegExp('class="card" data-cf="' + key + '"').test(html);
const click = key => A.onClick({ dataset:{ act:'cfold', v:key } });

console.log('預設:記錄頁的清單收著、記一筆買賣攤開');
A.state = A.normalize(A.sampleData());
A.levTab = 'log';
let h = A.renderLeverage();
must(open_(h, 'lv-addtrade'), '記一筆買賣預設攤開');
must(closed(h, 'lv-trades') && closed(h, 'lv-draws') && closed(h, 'lv-addrepay') && closed(h, 'lv-repays'), '買賣紀錄、動用、記還款、還款紀錄預設收著');
must(/買賣紀錄<\/span><span class="cf-sub">\d+ 筆 · 最近 \d\d\/\d\d\/\d\d [買賣]/.test(h), '買賣紀錄收著時摘要有筆數、最近一筆:' + (h.match(/買賣紀錄<\/span>[^\n]*?<\/span>/) || [''])[0]);
must(/房貸動用記錄<\/span><span class="cf-sub">\d+ 筆 · 借款餘額 NT\$ [\d,]+/.test(h), '動用記錄摘要有借款餘額');
must(h.includes('data-act="del-trade"') || h.includes('data-act="edit-trade"'), '收著的卡片內容照樣畫(只用 CSS 藏),局部更新的 id 才找得到');

console.log('點標題切換、記在 localStorage');
click('lv-trades');
must(open_(A.renderLeverage(), 'lv-trades'), '點一下展開');
must(JSON.parse(localStorage.getItem('financeCardFolds_v1'))['lv-trades'] === 0, '展開記在 localStorage');
click('lv-addtrade');
must(closed(A.renderLeverage(), 'lv-addtrade'), '預設攤開的也能收');
must(JSON.parse(localStorage.getItem('financeCardFolds_v1'))['lv-addtrade'] === 1, '收起記在 localStorage');

console.log('一定要看到的時候打開');
A.tradeDraft.shares = '1000';
must(open_(A.renderLeverage(), 'lv-addtrade'), '記一筆買賣填到一半:收著也打開');
A.tradeDraft.shares = '';
A.state.leverage.draws.push({ id:'dnew', label:'', amount:0, useDate:'', note:'', repayments:[] });
must(open_(A.renderLeverage(), 'lv-draws'), '動用記錄有沒填完的:打開');
A.state.leverage.draws.pop();
must(closed(A.renderLeverage(), 'lv-draws'), '填完就照原本收著');

console.log('每一頁都畫得出來、沒有 NaN/undefined');
for (const tab of ['overview', 'assets', 'stocks', 'ledger', 'leverage']){
  A.switchTab(tab);
  const subs = tab === 'leverage' ? ['overview', 'signal', 'log', 'setup'] : [null];
  for (const s of subs){
    if (s){ A.levTab = s; A.renderAll(); }
    const html = store.content.innerHTML;
    must(!/NaN|undefined/.test(html), `${tab}/${s || ''} 不能有 NaN/undefined`);
    must(/data-act="cfold"/.test(html), `${tab}/${s || ''} 有可以收合的卡片`);
  }
}

console.log('壞掉的 localStorage 不影響');
localStorage.setItem('financeCardFolds_v1', '[1,2');
must(typeof A.cardFolds === 'object', '讀檔失敗也有預設');

if (bugs.length){ console.log('發現 ' + bugs.length + ' 個問題:'); bugs.forEach(b => console.log('  ✗ ' + b)); process.exitCode = 1; }
else console.log('卡片收合:沒有發現問題');

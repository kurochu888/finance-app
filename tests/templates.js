/* 固定收支範本:存範本、一個月只記一次、記到正在看的月份、刪除要確認,
   存檔往返、舊版分頁丟掉 templates 欄位時補回、刪掉的範本兩台同步不會又出現。 */
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
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, emptyState, normalize, onField, onClick,
  renderLedger, keepFieldsOldVersionsDrop, keySets, get draft(){return draft}, set draft(v){draft=v},
  get draftError(){return draftError}, set viewMonth(v){viewMonth=v} };`);

const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };
const tx = () => A.state.transactions;

console.log('存成固定收支');
A.state = A.normalize(A.emptyState());
A.viewMonth = '2026-10';
A.draft = { date:'2026-10-08', type:'income', cat:'薪資', desc:'月薪', amount:'120000', newCat:false };
A.onClick({ dataset:{ act:'save-tpl' } });
A.draft = { date:'2026-10-08', type:'expense', cat:'其他', desc:'保險費', amount:'19000', newCat:false };
A.onClick({ dataset:{ act:'save-tpl' } });
must(A.state.templates.length === 2, '應該有 2 個範本,得到 ' + A.state.templates.length);
must(A.state.templates[0].amount === 120000 && A.state.templates[1].amount === -19000, '收入正、支出負');
must(tx().length === 0, '存範本不該記帳');
A.onClick({ dataset:{ act:'save-tpl' } });
must(A.state.templates.length === 2 && /一樣/.test(A.draftError), '一樣的範本不能存兩次');
A.draft = { date:'2026-10-08', type:'expense', cat:'其他', desc:'', amount:'', newCat:false };
A.onClick({ dataset:{ act:'save-tpl' } });
must(A.state.templates.length === 2 && /金額/.test(A.draftError), '沒填金額不能存');

console.log('記到本月,一個月一次');
const [sal, ins] = A.state.templates;
A.onClick({ dataset:{ act:'use-tpl', id: sal.id } });
A.onClick({ dataset:{ act:'use-tpl', id: sal.id } });
must(tx().length === 1, '同一個月按兩次只記一筆,得到 ' + tx().length);
must(tx()[0].date === '2026-10-08' && tx()[0].amount === 120000 && tx()[0].cat === '薪資' && tx()[0].desc === '月薪', '本月記在今天、內容照範本');
must(A.renderLedger().includes('10月已記'), '記過的要顯示已記');

console.log('記到正在看的過去月份');
A.viewMonth = '2026-09';
A.onClick({ dataset:{ act:'use-tpl', id: ins.id } });
must(tx().some(t => t.date === '2026-09-01' && t.amount === -19000), '看 9 月時記到 9 月');
must(A.renderLedger().includes('記到9月'), '9 月的月薪還沒記,要有按鈕');
A.viewMonth = '2026-10';

console.log('刪掉那筆交易之後可以再記');
A.state.transactions = tx().filter(t => t.amount !== 120000);
A.onClick({ dataset:{ act:'use-tpl', id: sal.id } });
must(tx().filter(t => t.amount === 120000).length === 1, '刪掉後再按要能記回來');

console.log('刪除範本要按兩次,記過的交易不動');
const n = tx().length;
A.onClick({ dataset:{ act:'del-tpl', id: ins.id } });
must(A.state.templates.length === 2, '按一次不刪');
A.onClick({ dataset:{ act:'del-tpl', id: ins.id } });
must(A.state.templates.length === 1 && tx().length === n, '按兩次刪掉範本,交易留著');

console.log('修改範本(調薪):之後記的用新金額,已經記過的不動');
{
  const t = A.state.templates[0];   // 月薪 120000,10 月已記
  A.onClick({ dataset:{ act:'edit-tpl', id: t.id } });
  must(A.renderLedger().includes('tpl-amt-' + t.id), '點範本要展開修改欄位');
  A.onField('tpl-amt-' + t.id, { value: '' });
  must(t.amount === 120000, '清空準備重打的那一下不算');
  A.onField('tpl-amt-' + t.id, { value: '125000' });
  A.onField('tpl-desc-' + t.id, { value: '月薪(調薪後)' });
  A.onField('tpl-cat-' + t.id, { value: '其他' });
  must(t.amount === 125000 && t.desc === '月薪(調薪後)' && t.cat === '其他', '金額、說明、類別要改到:' + JSON.stringify(t));
  must(tx().some(x => x.amount === 120000) && !tx().some(x => x.amount === 125000), '10 月已記的還是 120000');
  A.viewMonth = '2026-11';
  A.onClick({ dataset:{ act:'use-tpl', id: t.id } });
  must(tx().some(x => x.date === '2026-11-01' && x.amount === 125000 && x.desc === '月薪(調薪後)'), '11 月記的是新金額');
  A.state.templates.push({ id:'exp1', cat:'其他', desc:'保險費', amount:-19000 });
  A.onField('tpl-amt-exp1', { value: '20000' });
  must(A.state.templates.find(x => x.id === 'exp1').amount === -20000, '支出範本改金額還是支出');
  A.state.templates = A.state.templates.filter(x => x.id !== 'exp1');
  A.onClick({ dataset:{ act:'close-tpl' } });
  must(!A.renderLedger().includes('tpl-amt-'), '按完成收起來');
  A.viewMonth = '2026-10';
}

console.log('存檔往返、壞資料');
const back = A.normalize(JSON.parse(JSON.stringify(A.state)));
must(JSON.stringify(back.templates) === JSON.stringify(A.state.templates), '存檔再讀回來範本要一樣');
const bad = A.normalize({ templates: [null, 'x', { id:'"><img>', cat:'', amount:'abc' }, { id:'"><b>', cat:'', desc:5, amount:'500' }] });
must(bad.templates.length === 1 && bad.templates[0].cat === '其他' && /^[a-z0-9]+$/.test(bad.templates[0].id) && bad.templates[0].desc === '5', '壞資料要清乾淨,得到 ' + JSON.stringify(bad.templates));
const longId = A.normalize({ templates: [{ id: 'a'.repeat(64), cat:'x', amount: 1 }] });
A.state = longId; A.viewMonth = '2026-10';
A.onClick({ dataset:{ act:'use-tpl', id: 'a'.repeat(64) } });
const t2 = A.normalize(JSON.parse(JSON.stringify(A.state))).transactions[0];
must(t2 && t2.id === A.state.transactions[0].id, '很長的範本 id 記出來的交易 id 存檔後不能被換掉');

console.log('舊版分頁寫回來沒有 templates');
A.state = A.normalize(A.emptyState());
A.state.templates.push({ id:'t1', cat:'薪資', desc:'', amount: 100 });
const prev = JSON.parse(JSON.stringify(A.state));
const raw = JSON.parse(JSON.stringify(A.state)); delete raw.templates;
const next = A.normalize(raw);
A.keepFieldsOldVersionsDrop(prev, raw, next);
must(next.templates.length === 1, '舊版丟掉的 templates 要補回');
const raw2 = JSON.parse(JSON.stringify(A.state)); raw2.templates = [];
const next2 = A.normalize(raw2);
A.keepFieldsOldVersionsDrop(prev, raw2, next2);
must(next2.templates.length === 0, '新版刻意刪光的不能補回');
must(A.keySets(prev).get('templates').has('i:t1'), '範本要有刪除紀錄(兩台同步時刪掉的不會又出現)');

if (bugs.length){
  console.log('\n發現 ' + bugs.length + ' 個問題:');
  bugs.forEach(b => console.log('  ✗ ' + b));
  process.exitCode = 1;
}else console.log('\n沒有發現問題');

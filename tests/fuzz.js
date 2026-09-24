/* 隨機操作壓力測試:模擬使用者隨機點畫面上的按鈕、在欄位填各種怪值、偶爾讓日子往前跳(跨日/跨月),
   連續幾千步。每一步都檢查不變量:不能丟例外、畫面文字不能出現 NaN/undefined/Infinity、
   state 裡的數字都要是有限值、淨資產 = 資產 − 負債、normalize 重跑一次結果不變、
   當下的 state 跟存檔再載入後一模一樣。
   用法:node tests/fuzz.js [步數=2500] [亂數種子=1..3] */
const RealDate = Date;
let simNow = new RealDate('2026-09-20T09:00:00').getTime();
class FakeDate extends RealDate {
  constructor(...a){ super(...(a.length ? a : [simNow])); }
  static now(){ return simNow; }
}
global.Date = FakeDate;

const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0, className:'', hidden:true,
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;}, focus(){}, click(){},
  setAttribute(){}, getAttribute(){return null;}, removeAttribute(){}, querySelector(){return null;}, querySelectorAll(){return [];}, appendChild(){}, getBoundingClientRect(){return {left:0,top:0,width:320,height:130};} });
const store = {};
global.document = { activeElement:null, visibilityState:'visible', getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){}, createElement:()=>el('x'), body:{ appendChild(){}, removeChild(){} } };
global.window = { claude: undefined };
global.navigator = { clipboard: { writeText: async () => {} } };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{ financeTwseCooldownUntil: String(simNow + 1e12) },
  get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };

const fs = require('fs');
const src = fs.readFileSync(process.env.FUZZ_FILE || (__dirname + '/../docs/index.html'), 'utf8');   // 換版本:FUZZ_FILE=finance_app_artifact.html
const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
eval(appJs + `;globalThis.A = { get state(){return state}, set state(v){state=v}, normalize, onClick, onField, renderAll,
  switchTab, netWorth, totalAssets, totalLiab, computePosition, computeRisk, sampleData, emptyState };`);

const STEPS = Number(process.argv[2]) || 2500;
const SEEDS = process.argv[3] ? [Number(process.argv[3])] : [1, 2, 3];
let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const WEIRD = ['', '0', '-1', '-99999', '1', '3.14', '100000', '99999999999999', '1e309', '-1e309', 'abc', 'NaN', 'Infinity',
  '0.0000001', '2026-02-30', '2024-02-29', '1999-01-01', '2099-12-31', '2026-09-20', '<b>x</b>', 'a"b\'c', '   ', '１２３'];
const SKIP = new Set(['sign-in', 'sign-out', 'import', 'export', 'export-csv', 'copy-json', 'fetch-quotes', 'backfill-history', 'backfill-backtest-history']);

function scanUi(){
  const html = store.content ? store.content.innerHTML : '';
  const acts = [], fields = [];
  const tagRe = /<(\w+)\b([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(html))){
    const attrs = {};
    m[2].replace(/data-([\w-]+)="([^"]*)"/g, (_, k, v) => { attrs[k] = v; });
    if (attrs.act && !SKIP.has(attrs.act)) acts.push(attrs);
    if (attrs.k){
      let opts = null;
      if (m[1] === 'select'){
        const end = html.indexOf('</select>', m.index);
        opts = [...html.slice(m.index, end).matchAll(/<option[^>]*value="([^"]*)"/g)].map(x => x[1]);
      }
      fields.push({ k: attrs.k, opts });
    }
  }
  return { html, acts, fields };
}
function checkInvariants(where){
  const probs = [];
  const text = (store.content ? store.content.innerHTML : '').replace(/<[^>]*>/g, ' ');
  const bad = text.match(/.{0,20}(NaN|undefined|Infinity|\[object).{0,20}/);
  if (bad) probs.push('畫面出現怪字:' + bad[0].trim());
  const walk = (v, path) => {
    if (typeof v === 'number' && !Number.isFinite(v)) probs.push('state 有非有限數字:' + path + '=' + v);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (probs.length < 3) walk(v[k], path + '.' + k); }
  };
  walk(A.state, 'state');
  const nw = A.netWorth(), diff = A.totalAssets() - A.totalLiab();
  if (Math.abs(nw - diff) > 0.01) probs.push(`淨資產 ${nw} ≠ 資產−負債 ${diff}`);
  const p = A.computePosition(), r = A.computeRisk();
  if (!Number.isFinite(p.total) || !Number.isFinite(r.exposureRatio)) probs.push(`損益/曝險算出非有限值 total=${p.total} ratio=${r.exposureRatio}`);
  const n1 = JSON.stringify(A.normalize(JSON.parse(JSON.stringify(A.state))));
  const n2 = JSON.stringify(A.normalize(JSON.parse(n1)));
  if (n1 !== n2) probs.push('normalize 不是冪等的(重跑一次結果不同)');
  // 當下的 state 跟「存檔再載入」(normalize)後要一模一樣,不然使用者當下看到一個值、重新整理又變另一個
  // (抓到過:清空名稱變回預設名、快照的 null 損益變 0、刪光標的又冒出預設兩檔、填 0 的曝險目標)。欄位順序不算。
  const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}) : x);
  if (canon(A.state) !== canon(JSON.parse(n1))){
    const diff = [];
    const walk = (x, y, p) => { if (diff.length > 2 || canon(x) === canon(y)) return;
      if (x && y && typeof x === 'object' && typeof y === 'object'){ for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], p + '.' + k); }
      else diff.push(p + ': ' + JSON.stringify(x) + ' → ' + JSON.stringify(y)); };
    walk(JSON.parse(JSON.stringify(A.state)), JSON.parse(n1), 'state');
    probs.push('當下跟重新整理後不一致:' + diff.join(' ; '));
  }
  return probs.map(x => `[${where}] ${x}`);
}

const failures = [];
for (const s of SEEDS){
  seed = s * 7919;
  simNow = new RealDate('2026-09-20T09:00:00').getTime();
  A.state = s % 2 ? A.sampleData() : A.emptyState();
  A.switchTab('overview');
  const trail = [];
  for (let step = 0; step < STEPS && failures.length < 10; step++){
    const roll = rnd();
    let desc;
    try{
      if (roll < 0.06){
        const t = pick(['overview', 'assets', 'leverage', 'ledger', 'help']); A.switchTab(t); desc = 'tab ' + t;
      }else if (roll < 0.09){
        simNow += Math.floor(rnd() * 40) * 86400000; desc = 'time +' ; A.renderAll();
      }else{
        const ui = scanUi();
        if (roll < 0.55 && ui.acts.length){
          const a = pick(ui.acts);
          const dataset = {}; for (const k of Object.keys(a)) dataset[k.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = a[k];
          desc = 'click ' + a.act + (a.id ? ' ' + a.id : '') + (a.v ? ' v=' + a.v : '');
          A.onClick({ dataset, value: pick(WEIRD), closest(){ return null; } });
        }else if (ui.fields.length){
          const f = pick(ui.fields);
          // 文字欄位(名稱、備註…)使用者打什麼畫面就顯示什麼,不塞 NaN/Infinity 這種字,免得誤判成計算出錯
          const isText = /label|note|desc|name|cat|^an-|^ln-|^in-name|^in-id/i.test(f.k);   // 股票代號也是文字
          const pool = isText ? WEIRD.filter(x => !/NaN|Infinity/.test(x)) : WEIRD;
          const v = f.opts && f.opts.length && rnd() < 0.8 ? pick(f.opts) : pick(pool);
          desc = 'field ' + f.k + ' = ' + JSON.stringify(v);
          A.onField(f.k, { value: v, dataset: { k: f.k }, checked: rnd() < 0.5 });
        }else continue;
      }
      A.renderAll();
    }catch(e){
      failures.push(`seed ${s} step ${step}: ${desc} → 例外 ${e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e}\n    前幾步:${trail.slice(-5).join(' → ')}`);
      break;
    }
    trail.push(desc);
    const probs = checkInvariants(`seed ${s} step ${step} ${desc}`);
    if (probs.length){ failures.push(probs.join('\n') + `\n    前幾步:${trail.slice(-6).join(' → ')}`); break; }
  }
  console.log(`seed ${s}: ${failures.length ? '有問題' : 'ok'}(${STEPS} 步)`);
}
console.log();
console.log(failures.length ? '發現 ' + failures.length + ' 個問題:\n' + failures.map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
process.exit(failures.length ? 1 : 0);

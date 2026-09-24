/* 壞掉的匯入資料:拿範例資料,隨機把任意一層的值換成 null、字串、陣列、物件、極大數字、HTML、不存在的日期,
   讀進來(normalize)後畫每一頁、匯出 CSV。檢查不丟例外、normalize 冪等、畫面沒有 NaN/undefined/[object Object]、
   沒有未跳脫的 HTML、state 裡沒有非有限數字。2026-09 抓到:清單裡一筆 null 就整份讀不進來、名稱是物件顯示
   [object Object]、1e308 溢位成 Infinity%。用法:node tests/malformed.js [種子] [次數] */
const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', scrollTop:0, style:{}, dataset:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false;}}, addEventListener(){}, closest(){return null;},
  setAttribute(){}, getAttribute(){} });
const store = {};
global.document = { activeElement:null, getElementById:id=>store[id]||(store[id]=el(id)),
  querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){} };
global.window = { claude: undefined };
global.fetch = async () => { throw new Error('offline'); };
global.localStorage = { _d:{}, get length(){return Object.keys(this._d).length;},
  key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
  getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
const src = require('fs').readFileSync(__dirname + '/../docs/index.html','utf8');
eval([...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0] + `;globalThis.A={get state(){return state}, set state(v){state=v}, normalize, sampleData, canon, renderAll, stateCSV, computePosition, runAllBacktests, set tab(v){currentTab=v}, set lt(v){levTab=v}, set vm(v){viewMonth=v}, set ith(v){itemHistOpen=v}};`);
const SEEDS = process.argv[2] ? [Number(process.argv[2])] : [3, 7];
const probs = [];
for (const SEED of SEEDS){
let seed = SEED; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const odd = () => { const c = [null, undefined, '', 'abc', '12', '1e400', -5, 0, 1e308, NaN, [], {}, [1,2], { a:1 }, true, '<img src=x onerror=alert(1)>', '2026-13-45', '2026-02-30', '115/09/01', -1e9, 0.1]; return c[Math.floor(rnd() * c.length)]; };
const paths = (o, pre = []) => { const out = []; if (o && typeof o === 'object') Object.keys(o).forEach(k => { out.push(pre.concat(k)); out.push(...paths(o[k], pre.concat(k))); }); return out; };
for (let it = 0; it < Number(process.argv[3] || 150); it++){
  const raw = JSON.parse(JSON.stringify(A.sampleData()));
  const ps = paths(raw);
  const n = 1 + Math.floor(rnd() * 6);
  const muts = [];
  for (let i = 0; i < n; i++){
    const p = ps[Math.floor(rnd() * ps.length)];
    let o = raw; for (let j = 0; j < p.length - 1; j++){ o = o && o[p[j]]; }
    if (o && typeof o === 'object'){ const v = odd(); o[p[p.length - 1]] = v; muts.push(p.join('.') + '=' + JSON.stringify(v)); }
  }
  const tag = it + ' ' + muts.join(' ; ');
  try{
    const s1 = A.normalize(JSON.parse(JSON.stringify(raw)));
    const s2 = A.normalize(JSON.parse(JSON.stringify(s1)));
    if (A.canon(s1) !== A.canon(s2)){ const a = A.canon(s1), b = A.canon(s2); let i = 0; while (a[i] === b[i]) i++; probs.push(tag + ' → normalize 不冪等 ' + a.slice(i - 60, i + 40)); }
    A.state = s1;
    let html = '';
    for (const [tab, lt] of [['overview'],['assets'],['leverage','overview'],['leverage','signal'],['leverage','log'],['leverage','setup'],['ledger'],['help']]){
      A.tab = tab; if (lt) A.lt = lt; A.renderAll(); html += document.getElementById('content').innerHTML;
    }
    A.ith = (s1.assets[0] || {}).id; A.tab = 'assets'; A.renderAll(); html += document.getElementById('content').innerHTML;
    A.stateCSV();
    const bad = html.match(/.{0,30}(NaN|undefined|Infinity|\[object|<img src=x).{0,20}/g);
    if (bad) probs.push(tag + ' → 畫面 ' + bad.slice(0, 2).join(' || '));
    const nums = JSON.stringify(s1, (k, v) => (typeof v === 'number' && !Number.isFinite(v)) ? '__BAD__' : v);
    if (nums.includes('__BAD__')) probs.push(tag + ' → state 有非有限數字');
  }catch(e){ probs.push(tag + ' → 例外 ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]); }
}
}
console.log(probs.length ? probs.slice(0, 12).join('\n') + '\n共 ' + probs.length : '沒有發現問題');
if (probs.length) process.exitCode = 1;

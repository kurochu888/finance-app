/* 加權指數模擬正2(INDEX_SIM,可拆):假的證交所回應(1999 以前查無資料),檢查抓到最早月份就停、
   第二次只抓新的月份、模擬正2 每天漲跌 = 指數 ×2、回測跟「指定期間」有結果。拆掉 INDEX_SIM 時這個檔一起刪。 */
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
// 假的指數:1999~2026,2000/2001 跌 65%、2008 跌 58%
const level = (y, mo, d) => {
  const t = y + (mo - 1) / 12 + d / 365;
  if (t < 2000.1) return 6000 + (t - 1999) * 3500;
  if (t < 2001.8) return 9900 - (t - 2000.1) / 1.7 * 6500;
  if (t < 2007.8) return 3400 + (t - 2001.8) / 6 * 6400;
  if (t < 2008.9) return 9800 - (t - 2007.8) / 1.1 * 5700;
  return 4100 + (t - 2008.9) * 1100;
};
let reqs = 0;
global.fetch = async (url) => {
  reqs++;
  const m = /date=(\d{4})(\d{2})/.exec(url); const y = +m[1], mo = +m[2];
  if (!/MI_5MINS_HIST/.test(url)) return { ok: true, json: async () => ({ stat: 'no' }) };
  if (y < 1999) return { ok: true, json: async () => ({ stat: '很抱歉，沒有符合條件的資料!' }) };
  const rows = [];
  for (let d = 1; d <= 28; d++){ const dow = new Date(y, mo - 1, d).getDay(); if (dow === 0 || dow === 6) continue;
    const c = level(y, mo, d) * (1 + 0.01 * Math.sin(d * 7 + mo));
    rows.push([`${y - 1911}/${String(mo).padStart(2,'0')}/${String(d).padStart(2,'0')}`, '1', '1', '1', c.toLocaleString('en-US', { maximumFractionDigits: 2 })]); }
  return { ok: true, json: async () => ({ stat: 'OK', data: rows }) };
};
const realST = setTimeout; global.setTimeout = (f) => realST(f, 0);
const src = require('fs').readFileSync(__dirname + '/../docs/index.html','utf8');
eval([...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0] + `;globalThis.A={get state(){return state}, fetchIndexSim, runAllBacktests, renderBacktestCard, get sim(){return indexSimResults}, get hist(){return indexSimHist}, get first(){return indexSimFirst}, get msg(){return indexSimMsg}, onClick, series: indexSimSeries, reset(){ indexSimHist = []; indexSimFirst = ''; }, setHist(v){ backtestFullHistory = v; }};`);
(async () => {
  const bugs = [];
  localStorage.removeItem('financeTwseCooldownUntil');
  await new Promise(r => realST(r, 50));
  reqs = 0;
  await A.fetchIndexSim();
  console.log('第一次抓:', reqs, '個請求 |', A.msg);
  if (!A.hist.length || A.hist[0].d.slice(0, 7) !== '1999-01') bugs.push('沒有抓到 1999-01 起的資料:' + (A.hist[0] || {}).d);
  if (A.first !== '1999-01') bugs.push('連續查無資料後沒有記下最早月份(' + A.first + '),之後每次更新都會再往前問');
  if (reqs > 345) bugs.push('查無資料後沒有停下來,多發了請求(' + reqs + ')');
  reqs = 0; await A.fetchIndexSim();
  console.log('第二次更新:', reqs, '個請求');
  if (reqs > 3) bugs.push('已經抓齊的月份又重抓了(' + reqs + ' 個請求)');
  A.runAllBacktests();
  const [two, one] = A.sim;
  A.sim.forEach(r => console.log(' ', r.label, r.error || `${r.from}~${r.to} 策略 ${r.returnStrat.toFixed(0)}% / MDD ${r.mddStrat.toFixed(1)}%;買進持有 ${r.returnBh.toFixed(0)}% / MDD ${r.mddBh.toFixed(1)}%`));
  if (!two || two.error || !one || one.error) bugs.push('模擬回測沒有結果:' + (two && two.error) + ' ' + (one && one.error));
  else {
    // 模擬正2 每天漲跌要是指數的 2 倍(扣一點內扣成本)
    const s = A.series();
    for (let i = 1; i < 200; i++){
      const r1 = A.hist[i].c / A.hist[i - 1].c - 1, r2 = s.two[i].c / s.two[i - 1].c - 1;
      if (Math.abs(r2 - 2 * r1) > 0.0002){ bugs.push(`${A.hist[i].d} 模擬正2 漲跌 ${(r2*100).toFixed(3)}% 不是指數 ${(r1*100).toFixed(3)}% 的兩倍`); break; }
    }
    // 價格本身的最大回撤:正2 那條要比指數深(回測卡的正2 買進持有現在是 65% 正2 + 現金,跟 1 倍全押不能直接比)
    const mddOf = list => { let pk = -Infinity, w = 0; list.forEach(h => { pk = Math.max(pk, h.c); w = Math.min(w, h.c / pk - 1); }); return w; };
    if (!(mddOf(s.two) < mddOf(s.one))) bugs.push('模擬正2 價格的最大回撤應該比指數深');
  }
  // 證交所維護中(非 OK 但不是「查無資料」)連續好幾個月:不能被當成「更早沒資料」而永遠不再往前抓
  {
    const saved = global.fetch;
    global.fetch = async (url) => /date=2005/.test(url) ? { ok: true, json: async () => ({ stat: '系統維護中' }) } : saved(url);
    localStorage.removeItem('financeIndexSim_v1');
    A.reset();
    await A.fetchIndexSim();
    console.log('2005 整年維護中:最早', (A.hist[0] || {}).d, '| first', A.first, '|', A.msg);
    if (!A.hist.length || A.hist[0].d.slice(0, 4) !== '1999') bugs.push('碰上連續幾個月維護中,就不再抓更早的資料了(最早 ' + (A.hist[0] || {}).d + ')');
    if (!/沒抓到/.test(A.msg)) bugs.push('維護中的月份沒有回報「沒抓到」');
    global.fetch = saved;
    await A.fetchIndexSim();
    if (A.hist.some(h => h.d.slice(0, 4) === '2005') === false) bugs.push('再按一次沒有補回維護中那幾個月');
  }
  A.onClick({ dataset:{ act:'btw-preset', v:'2000-01-01|2001-12-31' } });
  const t = A.renderBacktestCard().replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (!t.includes('模擬正2(加權×2) 2 倍') || !t.includes('期初狀態')) bugs.push('指定期間沒有列出模擬的結果');
  // 真實標的(2016 起)在 2000 年沒有資料:表格寫沒資料就好,不能再列「策略動作 0 次、還沒進場」
  {
    const h = []; let c = 20;
    for (let d = new Date(2016, 0, 4); h.length < 1500; d.setDate(d.getDate() + 1)){ if (d.getDay() % 6 === 0) continue; c *= 1 + 0.02 * Math.sin(h.length); h.push({ d: d.toISOString().slice(0, 10), c: Math.round(c * 100) / 100 }); }
    A.setHist({ '00631L': h });
    A.runAllBacktests();
    const t2 = A.renderBacktestCard().replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const logPart = t2.slice(t2.indexOf('每格:期間報酬'));
    if (!t2.includes('這段期間沒有回測資料')) bugs.push('00631L 在 2000 年沒有標出沒資料');
    if (/00631L 策略動作/.test(logPart)) bugs.push('2000 年沒有資料的 00631L 還列了動作清單');
  }
  if (/NaN|undefined|Infinity/.test(t)) bugs.push('卡片出現 NaN/undefined');
  console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
  if (bugs.length) process.exitCode = 1;
})();

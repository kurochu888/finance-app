/* 照策略嚴格執行的整合模擬:隨機價格走 1000 天,每天把收盤價加進兩檔正2 的歷史、重畫畫面,
   策略狀態/加碼層數有變的那天一定要有 🔔;有 🔔 就照「正2 曝險目標」卡執行(加碼用房貸、減碼一半還房貸一半留現金),
   記買賣/動用/還款,按知道了/已調整完成。檢查:提醒沒漏、照卡片做完曝險回到目標、不會叫你賣超過持股、畫面沒有 NaN。
   2026-09 抓到:接刀加碼不跳提醒、減碼「各半」賣超過持股、減碼只給還房貸的金額(賣了留現金的話降不到目標)。
   用法:node tests/execution.js [種子] */
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
eval([...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).sort((a,b)=>b.length-a.length)[0] + `;globalThis.A={get state(){return state}, set state(v){state=v}, emptyState, renderAll, computeTrend, computeExposurePlan, computeRisk, computeLeverage, trendChanges, onClick, heldShares, renderExposurePlanCard, set tab(v){currentTab=v}, set lt(v){levTab=v}};`);
const bugs = [];
function runSeed(SEED){
let seed = SEED; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const g = () => Math.sqrt(-2*Math.log(rnd()))*Math.cos(2*Math.PI*rnd());
// 價格:兩檔同一條正2 路徑(有時候稍微不同),先有 300 天暖身歷史
const days = []; { const d = new Date(2020, 0, 2); while (days.length < 1300){ d.setDate(d.getDate() + 1); if (d.getDay() % 6) days.push(d.toISOString().slice(0,10)); } }
let p1 = 20, p2 = 30; const P1 = [], P2 = [];
let regime = 0;
for (let i = 0; i < days.length; i++){ if (i % 120 === 0) regime = (rnd() - 0.45) * 0.004; const r = regime + 0.012 * g(); p1 *= 1 + 2 * r; p2 *= 1 + 2 * r + 0.002 * g(); P1.push(Math.round(p1 * 100) / 100); P2.push(Math.round(p2 * 100) / 100); }
A.state = A.emptyState();
A.state.leverage.creditLimit = [5000000, 1500000, 500000][SEED % 3];   // 額度有時候不夠借,逼出「額度只剩」那條路
const [a, b] = A.state.instruments;
const W = 300;
a.priceHistory = days.slice(0, W).map((d, i) => ({ d, c: P1[i] })); b.priceHistory = days.slice(0, W).map((d, i) => ({ d, c: P2[i] }));
a.splits = []; b.splits = [];
// 起始:自有資金買進兩檔各 100 萬
A.state.trades = [];
const buy = (it, amt, date, src) => { const px = it.price; const sh = Math.floor(amt / px); if (sh <= 0) return 0; A.state.trades.push({ id: 't' + A.state.trades.length, date, symbol: it.id, action: 'buy', shares: sh, price: px, fee: 0, amount: 0, source: src, note: '' }); return sh * px; };
const sell = (it, amt, date) => { const px = it.price; const held = A.heldShares(it.id); const sh = Math.min(held, Math.floor(amt / px)); if (sh <= 0) return 0; A.state.trades.push({ id: 't' + A.state.trades.length, date, symbol: it.id, action: 'sell', shares: sh, price: px, fee: 0, amount: 0, source: 'cash', note: '' }); return sh * px; };
a.price = P1[W - 1]; b.price = P2[W - 1];
buy(a, 1000000, days[W - 1], 'cash'); buy(b, 1000000, days[W - 1], 'cash');
A.renderAll();   // 記下基準
const probs = []; let events = 0, alerts = 0;
let prev = { a: A.computeTrend(a), b: A.computeTrend(b) }; let skipLeft = 0;
for (let i = W; i < days.length; i++){
  const d = days[i];
  a.priceHistory.push({ d, c: P1[i] }); b.priceHistory.push({ d, c: P2[i] });
  a.price = P1[i]; b.price = P2[i];
  if (skipLeft > 0){ skipLeft--; continue; }            // 這幾天沒開 app:打開時比的是上次看過的狀態
  if (rnd() < 0.03) skipLeft = 3 + Math.floor(rnd() * 8);
  A.tab = 'overview'; A.renderAll();
  const html = document.getElementById('content').innerHTML;
  if (/NaN|undefined|Infinity/.test(html)) probs.push(d + ' 總覽出現 NaN');
  const cur = { a: A.computeTrend(a), b: A.computeTrend(b) };
  const ch = A.trendChanges().map(t => t.key);
  for (const [k, it] of [['a', a], ['b', b]]){
    const moved = cur[k].status !== prev[k].status || cur[k].pyramidCount !== prev[k].pyramidCount;
    if (moved){ events++; if (!ch.includes(it.key)) probs.push(`${d} ${it.id} ${prev[k].status}/${prev[k].pyramidCount} → ${cur[k].status}/${cur[k].pyramidCount} 沒有 🔔`); }
  }
  if (ch.length){
    alerts++;
    // 照曝險目標卡執行
    const plan = A.computeExposurePlan();
    const card = A.renderExposurePlanCard();
    if (plan && /不可靠|歷史價格還不夠|超過「部位市值/.test(card) === false){
      const cardTxt = card.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const numAfter = (re) => { const m = re.exec(cardTxt); return m ? Number(m[1].replace(/,/g, '')) : null; };
      const repayAll = amt => { let left = amt;
        for (const dr of A.state.leverage.draws){ const owe = dr.amount - (dr.repayments || []).reduce((s, r) => s + r.amount, 0); if (owe <= 0 || left <= 0) continue; const x = Math.min(owe, left); dr.repayments.push({ id: 'r' + Math.random(), date: d, amount: x }); left -= x; } };
      if (plan.deltaLoan < -1){
        // 減碼:像真人一樣只照卡片上寫的金額
        const r = A.computeLeverage(); const hv = r.holdings.filter(h => plan.instruments.includes(h.key)); const tot = hv.reduce((s, h) => s + h.value, 0);
        const amtB = numAfter(/方案B:賣掉、[^約—]*約 NT\$ ([\d,]+)/), amtA = numAfter(/方案A:賣掉、錢留著當現金 約 NT\$ ([\d,]+)/);
        const amtOne = numAfter(/可考慮減碼[^約—]*約 NT\$ ([\d,]+)/);
        const useB = amtB != null && (amtA == null || rnd() < 0.5);
        const total = useB ? amtB : amtA != null ? amtA : amtOne;
        if (total == null){ if (!/降不到目標/.test(cardTxt)) probs.push(`${d} 卡片要減碼卻讀不到金額:${cardTxt.slice(0, 120)}`); }
        else {
          let proceeds = 0;
          for (const h of hv){ const want = total * h.value / tot; if (want > h.value + 1) probs.push(`${d} 叫 ${h.id} 賣 ${Math.round(want)} 超過市值 ${Math.round(h.value)}`); proceeds += sell(h.id === a.id ? a : b, want, d); }
          if (useB || (amtOne != null && !/沒有房貸/.test(cardTxt) && rnd() < 0.5)) repayAll(proceeds);
        }
      }else if (plan.deltaLoan > 1 && (plan.progress <= plan.layerCount || plan.holdAdjustPending)){
        const amtA = numAfter(/方案A:自己拿新的錢出來買\(現金\) NT\$ ([\d,]+)/);
        const mix = /借 NT\$ ([\d,]+) \+ 現金 NT\$ ([\d,]+)/.exec(cardTxt);
        const amtB = numAfter(/方案B:直接借房貸額度買\(不拿新錢\) NT\$ ([\d,]+)/);
        const pickA = amtA != null && (rnd() < 0.5 || (amtB == null && !mix));
        const room = A.state.leverage.creditLimit - A.computeLeverage().usedAmount;
        if (pickA){ buy(a, amtA / 2, d, 'cash'); buy(b, amtA / 2, d, 'cash'); }
        else if (amtB != null || mix){
          const borrow = mix ? Number(mix[1].replace(/,/g, '')) : amtB, cash = mix ? Number(mix[2].replace(/,/g, '')) : 0;
          if (borrow > room + 1) probs.push(`${d} 卡片叫你借 ${borrow},額度只剩 ${Math.round(room)}`);
          const got = buy(a, borrow / 2, d, 'loan') + buy(b, borrow / 2, d, 'loan');
          if (got > 0) A.state.leverage.draws.push({ id: 'd' + A.state.leverage.draws.length, label: 'x', amount: got, useDate: d, note: '', repayments: [] });
          if (cash > 0){ buy(a, cash / 2, d, 'cash'); buy(b, cash / 2, d, 'cash'); }
        }
      }
      const after = A.computeExposurePlan();
      if (after && Math.abs(after.currentRatio - after.targetRatio) > 3 && !(after.progress > after.layerCount && !after.holdAdjustPending) && A.computeRisk().capacity > 0)
        probs.push(`${d} 照卡片做完,曝險 ${after.currentRatio.toFixed(1)}% 跟目標 ${after.targetRatio}% 差很多(階段 ${after.progress})`);
    }
    ch.forEach(key => A.onClick({ dataset: { act: 'ack-trend', id: key } }));
    if (A.computeExposurePlan() && A.computeExposurePlan().holdAdjustPending) A.onClick({ dataset: { act: 'ack-hold' } });
    if (A.trendChanges().length) probs.push(d + ' 按完知道了還有提醒');
  }
  prev = cur;
}
console.log(`種子 ${SEED}:${days.length - W} 天、狀態/層數變化 ${events} 次、執行 ${alerts} 天、買賣 ${A.state.trades.length} 筆` + (probs.length ? `,${probs.length} 個問題` : ''));
  return probs;
}
for (const sd of (process.argv[2] ? [Number(process.argv[2])] : [1, 2, 3, 4, 5, 6])) runSeed(sd).forEach(p => bugs.push(p));
console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.slice(0, 12).map((b, i) => '  ' + (i + 1) + '. ' + b).join('\n') : '沒有發現問題');
if (bugs.length) process.exitCode = 1;

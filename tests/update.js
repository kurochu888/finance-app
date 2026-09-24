/* 「有新版」提示(checkForUpdate)的測試。
   開著不關的舊分頁要能發現線上已經換版、在最上面跳提示;點提示要先把還沒存出去的編輯存完
   才重新整理。線上版本相同、或是單檔版/Artifact 版(沒有 version.json 可以問)都不該跳。 */
const fs = require('fs');
const bugs = [];
const must = (cond, msg) => { if (!cond) bugs.push(msg); };

function boot(file, { protocol = 'https:', onlineHash } = {}){
  const el = (id) => ({ id, innerHTML:'', textContent:'', value:'', style:{}, dataset:{}, scrollTop:0, hidden:true,
    _handlers:{}, classList:{toggle(){},add(){},remove(){},contains(){return false;}},
    addEventListener(t, f){ this._handlers[t] = f; }, closest(){return null;} });
  const store = {};
  const docHandlers = {};
  global.document = { activeElement:null, visibilityState:'visible', getElementById:id=>store[id]||(store[id]=el(id)),
    querySelectorAll:()=>[], querySelector:()=>null, addEventListener(t, f){ docHandlers[t] = f; } };
  global.window = { claude: undefined };
  const env = { reloaded: false, savedBeforeReload: null, versionRequests: 0 };
  global.location = { protocol, reload(){ env.reloaded = true; env.savedBeforeReload = global.localStorage._d.financeData_v1 !== undefined || Object.keys(global.localStorage._d).length > 0; } };
  global.fetch = async (url) => {
    if (String(url).startsWith('version.json')){
      env.versionRequests++;
      return { ok: true, json: async () => ({ hash: onlineHash }) };
    }
    throw new Error('offline');
  };
  global.localStorage = { _d:{ financeTwseCooldownUntil: String(Date.now() + 3600000) },
    get length(){return Object.keys(this._d).length;},
    key(i){const k=Object.keys(this._d);return i<k.length?k[i]:null;},
    getItem(k){return this._d[k]??null;}, setItem(k,v){this._d[k]=String(v);}, removeItem(k){delete this._d[k];} };
  const src = fs.readFileSync(file, 'utf8');
  const appJs = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).sort((a, b) => b.length - a.length)[0];
  (0, eval)(appJs.replace(/\ninit\(\);\s*$/, '\n') + `;globalThis.U = { init, BUILD_HASH, checkForUpdate, get state(){return state}, scheduleSave,
    set lastUpdateCheck(v){ lastUpdateCheck = v; } };`);
  U.init();
  return { env, banner: store.updateBanner || el('updateBanner'), docHandlers };
}
const tick = () => new Promise(r => setTimeout(r, 20));

(async () => {
  const docs = __dirname + '/../docs/index.html';

  console.log('線上已經換版:要跳出「有新版」提示');
  {
    const { env, banner } = boot(docs, { onlineHash: 'someNewHash' });
    await tick();
    must(env.versionRequests === 1, `啟動時應該問一次線上版本,實際問了 ${env.versionRequests} 次`);
    must(banner.hidden === false, '線上版本跟自己不一樣時,提示應該要顯示出來');

    console.log('點提示:先把還沒存出去的編輯存完,再重新整理');
    U.state.accounts = (U.state.accounts || []);
    U.state.__marker = 'edited-before-update';
    U.scheduleSave();                       // 模擬剛改完、還在 400ms 延遲裡沒存出去
    await banner._handlers.click();
    must(env.reloaded, '點提示應該重新整理頁面');
    const saved = Object.values(localStorage._d).some(v => String(v).includes('edited-before-update'));
    must(saved, '重新整理之前應該先把剛剛的編輯存下來,不然換版會掉資料');
  }
  console.log('  ok');

  console.log('線上版本跟自己一樣:不能跳提示');
  {
    const src = fs.readFileSync(docs, 'utf8');
    const myHash = /const BUILD_HASH = '([^']+)'/.exec(src)[1];
    const { banner } = boot(docs, { onlineHash: myHash });
    await tick();
    must(banner.hidden === true, '版本相同時不該顯示提示');
  }
  console.log('  ok');

  console.log('回到前景時會再問一次,但 10 分鐘內不重複問');
  {
    const { env, docHandlers } = boot(docs, { onlineHash: 'x' });
    await tick();
    docHandlers.visibilitychange();
    await tick();
    must(env.versionRequests === 1, `剛問過又切回前景不該再問,實際問了 ${env.versionRequests} 次`);
    U.lastUpdateCheck = 0;
    docHandlers.visibilitychange();
    await tick();
    must(env.versionRequests === 2, `隔夠久切回前景應該再問一次,實際問了 ${env.versionRequests} 次`);
  }
  console.log('  ok');

  console.log('單檔版(file://)跟 Artifact 版不檢查:沒有 version.json 可以問');
  {
    const a = boot(__dirname + '/../finance_app.html', { protocol: 'file:', onlineHash: 'x' });
    await tick();
    must(a.env.versionRequests === 0 && a.banner.hidden === true, '單檔版不該去問 version.json');
    const b = boot(__dirname + '/../finance_app_artifact.html', { onlineHash: 'x' });
    await tick();
    must(b.env.versionRequests === 0 && b.banner.hidden === true, 'Artifact 版不該去問 version.json');
  }
  console.log('  ok');

  console.log();
  console.log(bugs.length ? '發現 ' + bugs.length + ' 個問題:\n' + bugs.map((b,i)=>'  '+(i+1)+'. '+b).join('\n') : '沒有發現問題');
  process.exit(bugs.length ? 1 : 0);
})();

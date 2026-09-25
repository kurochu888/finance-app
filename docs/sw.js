/* 離線快取:換版時 CACHE 名稱會變,舊快取自動清掉。 */
const CACHE = 'finance-0e2e99bb5c';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './favicon-32.png', './firebase-sync.js', './firebase-config.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // 網頁本身:先連網拿最新版,沒網路才用快取。
  // cache:'no-cache' 要跟伺服器確認過才用瀏覽器快取——GitHub Pages 讓網頁快取 10 分鐘,
  // 直接 fetch(req) 在換版後 10 分鐘內重新整理(包括按「有新版」)還是會拿到舊版
  if (req.mode === 'navigate'){
    e.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
        if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  // 圖示等靜態檔:先用快取
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});

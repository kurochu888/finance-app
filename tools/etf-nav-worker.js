/* Cloudflare Worker:轉送證交所「ETF 即時預估淨值」給 finance-app 的股票分頁。
   證交所 mis.twse.com.tw 沒開 CORS,放在 GitHub Pages 的 app 在瀏覽器裡讀不到,所以經過這裡轉一手。
   只轉這一個網址(不是萬用代理),內容原封不動,加上 CORS 標頭;同一份 10 秒內用快取,不會一直打證交所。
   設定步驟見 tools/ETF_NAV.md。 */
const SRC = 'https://mis.twse.com.tw/stock/data/all_etf.txt';

export default {
  async fetch(request) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    try {
      const res = await fetch(SRC, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mis.twse.com.tw/stock/etf_nav.jsp' },
        cf: { cacheTtl: 10, cacheEverything: true },
      });
      return new Response(await res.text(), {
        status: res.status,
        headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'max-age=10' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 502, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
      });
    }
  },
};

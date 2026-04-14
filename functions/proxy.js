/**
 * 币安 API 代理 - Cloudflare Pages Function
 * 部署：Cloudflare Pages (免费)
 * 用法：https://你的域名/proxy?url=币安API地址
 */

const BINANCE_HOSTS = [
  'fapi.binance.com',    // 币安合约
  'api.binance.com',     // 币安现货
  'fstream.binance.com'  // 合约数据流
];

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({
      error: 'Missing url parameter',
      usage: 'GET /proxy?url=https://fapi.binance.com/fapi/v1/ticker/24hr'
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  try {
    const parsedUrl = new URL(targetUrl);

    // 只允许币安域名，防止滥用
    if (!BINANCE_HOSTS.includes(parsedUrl.host)) {
      return new Response(JSON.stringify({ error: 'Only Binance API allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }

    // 构建转发请求
    const fetchOptions = {
      method: request.method,
      headers: {}
    };

    // 透传必要请求头
    const allowedHeaders = ['content-type', 'x-mbx-apikey', 'x-trace-id'];
    for (const h of allowedHeaders) {
      const v = request.headers.get(h);
      if (v) fetchOptions.headers[h] = v;
    }

    const response = await fetch(targetUrl, fetchOptions);

    // 透传响应头
    const newHeaders = new Headers();
    const corsHeaders = [
      'content-type', 'content-length', 'cache-control',
      'strict-transport-security', 'date', 'via', 'x-cache-status'
    ];
    for (const h of corsHeaders) {
      const v = response.headers.get(h);
      if (v) newHeaders.set(h, v);
    }

    // CORS 必需头
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-MBX-APIKEY');

    return new Response(response.body, {
      status: response.status,
      headers: newHeaders
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }
}

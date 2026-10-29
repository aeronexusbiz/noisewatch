/* AeroNexus NoiseWatch — Vercel 미들웨어: 자료 요청을 맥미니(Funnel)로 넘길 때 비밀 머리글·방문자 IP 를 붙인다 (2026-10-29 · 운영자 「Funnel 직접 접속 차단」)
 * 비밀값은 Vercel 환경변수 NW_EDGE_SECRET 에만 있다(코드·저장소에 없음) — 맥미니는 config 의 edgeSecretFile 과 맞을 때만 «Vercel 을 거친 요청»으로 믿는다.
 * 이 파일이 없거나 실패하면 vercel.json rewrites 가 그대로 넘긴다(머리글 없이). */
export const config = { matcher: ['/noise/:path*', '/rwy/flow', '/partner/acft', '/vworld/:path*'] };

const ORIGIN = 'https://macmini.tail95ff38.ts.net';

export default async function middleware(request) {
  const u = new URL(request.url);
  const h = new Headers();
  for (const k of ['accept', 'accept-language', 'content-type', 'origin']) { const v = request.headers.get(k); if (v) h.set(k, v); }
  const ip = (request.headers.get('x-real-ip') || (request.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim();
  if (ip) h.set('x-nw-client', ip);
  const s = process.env.NW_EDGE_SECRET;
  if (s) h.set('x-nw-edge', s);
  const init = { method: request.method, headers: h, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer();
  const r = await fetch(ORIGIN + u.pathname + u.search, init);
  const out = new Headers(r.headers);
  out.delete('content-encoding'); out.delete('content-length');      // 본문은 이미 풀려 있다 — 원래 길이·압축 표시를 두면 브라우저가 깨진다
  return new Response(r.body, { status: r.status, headers: out });
}

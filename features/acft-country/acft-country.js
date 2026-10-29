/* ================================================================
   기체 국적 (features/acft-country) — Mode-S 주소로 «어느 나라 등록기인가»   v1 (2026-09-13 신설)
   ----------------------------------------------------------------
   사용자 제안 2026-09-13: 「콜사인별로 국기를 표기하는건 어때?」
   → 기준은 **기체 등록국**(Mode-S 대역)으로 확정. 표시는 **한글 국가명 배지**로 확정.

   ⭐ 왜 콜사인이 아니라 Mode-S 인가 (사용자 확정 2026-09-13)
     · Mode-S 주소(ICAO 24bit)는 **모든 항적에 있다**. 콜사인은 약 89%만 실려 온다
       (backend/schema_track.sql 주석) — 군용기·자가용기는 편명 자체가 없는 경우가 많다.
     · 대역 할당은 ICAO Annex 10 Vol III Ch.9 Table 9-1 의 **공식 표**다. 항공사→국가 표를
       새로 만들어 관리하는 것보다 근거가 분명하고, 저장소가 표를 두 벌 들 필요가 없다.
     ⚠ 그래서 이것은 «운항 항공사의 국적»이 **아니다**. 리스 기체는 둘이 다를 수 있다
       (예: 일본 항공사가 아일랜드 등록기를 운항). 화면 문구도 «등록»이라고 적는다.

   ⛔ 이모지 국기를 쓰지 않는다 — 실측으로 막힌 길이다 (2026-09-13, Windows Chromium)
     🇯🇵·🇰🇷·🇺🇸 를 넣으면 Windows 에서는 국기가 아니라 **「JP」「KR」「US」 두 글자**로 그려진다
     (Segoe UI Emoji 에 지역표시기호 글리프가 없다). 개발 PC·사용자 환경이 Windows 라 그대로
     드러난다. 그림 국기가 필요하면 SVG 를 features/vendor-flags/ 로 벤더링해야 하고
     (CDN 금지 — 루트 CLAUDE.md), 그때 이 모듈의 badge() 안쪽만 바꿔 끼우면 된다.

   ⛔ 모르는 대역은 **아무것도 붙이지 않는다**
     표에 없는 hex 는 null 을 돌려준다. 「미상」 배지를 달지 않는다 — 이 저장소의
     「담을 수 없는 것을 담은 척하지 않는다」 규율이고, 틀린 국적을 보이느니 안 보이는 편이 낫다.
     ⚠ 그래서 **표는 넓게가 아니라 정확하게** 만든다. 인접 대역이 다른 나라인 경우가 있다:
       사우디 71 0000–71 7FFF 바로 옆이 한국 71 8000–71 FFFF 다. 대충 「71 = 한국」으로 두면
       사우디 기체가 한국으로 나온다.

   ⚠ 실측으로 검증한 표다 (2026-09-13, 운영 DB 24시간 항적 + 콜사인 대조)
     780·781·782 → CCA·CES·CSN·CXA(중국) · 789 → CPA·AHK·HKE(홍콩) · 71B·71C → KAL·AAR·JJA(한국)
     84~86 → ANA·JAL·JTA(일본) · 899 → CAL·EVA(대만) · 888 → HVN·VJC(베트남) · 885 → THA(태국)
     76C → SIA(싱가포르) · 758 → PAL·CEB(필리핀). test.js 가 이 대조를 회귀 검사로 들고 있다.

   재사용 전제(루트 CLAUDE.md): AeroNexus 전역을 직접 참조하지 않는다.
   필요한 것은 init(opts)로 주입받고, 주입이 없으면 기본값으로 돈다.
   ================================================================ */
(function (global) {
  'use strict';

  var D = {
    label: '등록',             // 배지 앞에 붙는 말 — 「등록 일본」. 빈 문자열이면 국가명만.
    // 국기 그림이 있는 폴더. ⚠ 기본값을 **절대경로**로 둔다 — 상대경로는 «스크립트 위치»가 아니라
    //   «문서 위치» 기준이라, 다른 깊이의 페이지에서 불리면 404가 된다. 다른 배치에 옮길 때 init 로 바꾼다.
    flagBase: '/features/acft-country/flags/',
    flags: true               // false 면 글자 배지만 쓴다(그림을 못 쓰는 호스트용)
  };

  /* 국기 그림이 **있는** 나라 (flags/<iso 소문자>.svg). ⛔ 목록에 없으면 글자만 낸다 —
     없는 파일을 가리키면 깨진 이미지 아이콘이 뜨는데, 그것이 「국적 미상」으로 읽힌다.
     ⚠ 그림은 공식 규격(비율·색·요소 위치)에 맞춰 이 저장소에서 직접 그린 것이다. 정밀도가 필요한
        국기(유니언잭 계열·소욤보 등)는 **일부러 만들지 않았다** — 잘못 그린 국기를 내느니 글자가 낫다.
     ⚠ 태극기는 국기법 시행령 [별표] 규격으로 그렸다(태극 지름 = 세로 1/2 · 축 33.69° · 4괘 건감리곤).
        1차 시안은 태극 위에 원을 덧그려 S자 경계가 어긋났고 빨강·파랑이 뒤집혀 있었다 —
        확대 렌더로 잡아 고쳤다(2026-09-13). 국기를 새로 넣을 때도 **크게 렌더해 눈으로 본다.** */
  var HAS_FLAG = {};
  ['ae', 'cn', 'de', 'fr', 'hk', 'id', 'il', 'in', 'jp', 'kr',
   'my', 'nl', 'ph', 'qa', 'ru', 'sg', 'th', 'tw', 'us', 'vn'].forEach(function (k) { HAS_FLAG[k] = 1; });

  /* ICAO 24bit 주소 대역 → 국가 (Annex 10 Vol III, Ch.9 Table 9-1)
     [시작, 끝, ISO2, 한글명] — 끝은 **포함**이다. 오름차순으로 둔다(find 가 위에서 훑는다).
     ⛔ 확실하지 않은 대역은 넣지 않는다 — 없으면 안 붙지만, 틀리면 거짓을 말한다. */
  var R = [
    // ── 동아시아 (이 저장소가 보는 하늘의 대부분)
    [0x718000, 0x71FFFF, 'KR', '한국'],
    [0x710000, 0x717FFF, 'SA', '사우디'],        // ⚠ 한국 바로 아래 대역 — 함께 둬야 «71=한국» 오판을 막는다
    [0x720000, 0x727FFF, 'KP', '북한'],
    [0x840000, 0x87FFFF, 'JP', '일본'],
    [0x789000, 0x789FFF, 'HK', '홍콩'],          // ⚠ 중국 대역 **안**의 별도 할당 — 중국보다 먼저 본다
    [0x780000, 0x7BFFFF, 'CN', '중국'],
    [0x899000, 0x8993FF, 'TW', '대만'],
    [0x880000, 0x887FFF, 'TH', '태국'],
    [0x888000, 0x88FFFF, 'VN', '베트남'],
    [0x768000, 0x76FFFF, 'SG', '싱가포르'],
    [0x750000, 0x757FFF, 'MY', '말레이시아'],
    [0x758000, 0x75FFFF, 'PH', '필리핀'],
    [0x8A0000, 0x8A7FFF, 'ID', '인도네시아'],
    [0x800000, 0x83FFFF, 'IN', '인도'],
    [0x682000, 0x6827FF, 'MN', '몽골'],
    [0x708000, 0x708FFF, 'KH', '캄보디아'],
    [0x70C000, 0x70C7FF, 'LA', '라오스'],
    [0x704000, 0x7047FF, 'MM', '미얀마'],
    [0x770000, 0x7707FF, 'LK', '스리랑카'],
    [0x702000, 0x7027FF, 'BD', '방글라데시'],
    [0x760000, 0x7607FF, 'PK', '파키스탄'],
    [0x70A000, 0x70A7FF, 'NP', '네팔'],
    // ── 오세아니아·미주
    [0x7C0000, 0x7FFFFF, 'AU', '호주'],
    [0xC80000, 0xC87FFF, 'NZ', '뉴질랜드'],
    [0xA00000, 0xAFFFFF, 'US', '미국'],
    [0xC00000, 0xC3FFFF, 'CA', '캐나다'],
    [0x0D0000, 0x0D7FFF, 'MX', '멕시코'],
    [0xE40000, 0xE7FFFF, 'BR', '브라질'],
    // ── 유럽
    [0x400000, 0x43FFFF, 'GB', '영국'],
    [0x380000, 0x3BFFFF, 'FR', '프랑스'],
    [0x3C0000, 0x3FFFFF, 'DE', '독일'],
    [0x300000, 0x33FFFF, 'IT', '이탈리아'],
    [0x340000, 0x37FFFF, 'ES', '스페인'],
    [0x100000, 0x1FFFFF, 'RU', '러시아'],
    [0x484000, 0x487FFF, 'NL', '네덜란드'],
    [0x4B0000, 0x4B7FFF, 'CH', '스위스'],
    [0x440000, 0x447FFF, 'AT', '오스트리아'],
    [0x448000, 0x44FFFF, 'BE', '벨기에'],
    [0x488000, 0x48BFFF, 'PL', '폴란드'],
    [0x4A8000, 0x4AFFFF, 'SE', '스웨덴'],
    [0x478000, 0x47FFFF, 'NO', '노르웨이'],
    [0x460000, 0x4607FF, 'FI', '핀란드'],
    [0x458000, 0x45FFFF, 'DK', '덴마크'],
    [0x490000, 0x497FFF, 'PT', '포르투갈'],
    [0x468000, 0x46FFFF, 'GR', '그리스'],
    [0x4C8000, 0x4CFFFF, 'IE', '아일랜드'],
    [0x508000, 0x50FFFF, 'UA', '우크라이나'],
    // ── 중동
    [0x896000, 0x896FFF, 'AE', '아랍에미리트'],
    [0x06A000, 0x06A7FF, 'QA', '카타르'],
    [0x738000, 0x73FFFF, 'IL', '이스라엘'],
    [0x730000, 0x737FFF, 'IR', '이란'],
    [0x706000, 0x7067FF, 'KW', '쿠웨이트']
  ];

  /** hex 문자열('84b772'·'84B772') → 정수. 못 읽으면 -1. */
  function num(hex) {
    var s = String(hex == null ? '' : hex).trim();
    if (!/^[0-9a-fA-F]{1,6}$/.test(s)) return -1;
    return parseInt(s, 16);
  }

  /** Mode-S 주소 → {iso, ko} | null(모르는 대역).
   *  ⛔ 모르면 null 이다 — 「미상」을 만들지 않는다(머리말 참조). */
  function of(hex) {
    var n = num(hex);
    if (n < 0) return null;
    for (var i = 0; i < R.length; i++) {
      if (n >= R[i][0] && n <= R[i][1]) return { iso: R[i][2], ko: R[i][3] };
    }
    return null;
  }

  /** 한글 국가명만. 모르면 빈 문자열. */
  function ko(hex) {
    var c = of(hex);
    return c ? c.ko : '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** 배지 HTML. 모르는 대역이면 **빈 문자열**(호출부가 그대로 이어 붙여도 안전하다).
   *  ⚠ title 에 «등록국»임을 적는다 — 운항 항공사 국적으로 오해되지 않게(머리말 ⚠). */
  function badge(hex) {
    var c = of(hex);
    if (!c) return '';
    var t = '기체 등록국 — Mode-S 주소(' + esc(String(hex).toUpperCase()) + ') 대역으로 판정합니다.'
          + ' 운항 항공사의 국적과 다를 수 있습니다(리스 기체).';
    var iso = c.iso.toLowerCase();
    // 국기 그림은 **곁들이**다 — alt 를 비워 두어 읽기 도구가 국가명을 두 번 읽지 않게 한다.
    //   그림이 없거나 못 받아도 국가명 글자는 그대로 남는다(그림에 기대지 않는다).
    var img = (D.flags && HAS_FLAG[iso])
      ? '<img class="acc-flag" src="' + esc(D.flagBase) + iso + '.svg" alt="" width="18" height="12" loading="lazy">'
      : '';
    return '<span class="acc-badge" data-iso="' + esc(c.iso) + '" title="' + esc(t) + '">'
         + img + (D.label ? '<i>' + esc(D.label) + '</i>' : '') + esc(c.ko) + '</span>';
  }

  /** 표 칸용 — 알약·「등록」 말머리 없이 **국기 + 국가명**만. 모르는 대역이면 빈 문자열.
   *  ⭐ 2026-09-19 — 「기체 제원」 카드에서 운영사가 회사명과 같으면 「운영」 칸 자리에 등록국을
   *    넣는다(머리 배지를 카드로 옮긴다, index.html restyleAcDetail). 칸 라벨이 「등록국」이라
   *    말머리가 필요 없고, 굵은 값 글자 사이에서 알약 테두리는 튀므로 맨 글자로 낸다.
   *  ⚠ 크기는 **인라인 스타일**로 준다 — 머리 배지의 .acc-flag 규칙(shell.css)은 머리 넷에만
   *    매여 있어 카드 안에서는 걸리지 않는다. 비율은 머리와 같은 3:2다. */
  function plain(hex) {
    var c = of(hex);
    if (!c) return '';
    var iso = c.iso.toLowerCase();
    var img = (D.flags && HAS_FLAG[iso])
      ? '<img class="acc-flag" src="' + esc(D.flagBase) + iso + '.svg" alt="" width="18" height="12" loading="lazy"'
        + ' style="width:18px;height:12px;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.14);'
        + 'vertical-align:-1px;margin-right:6px">'
      : '';
    return '<span class="acc-plain" data-iso="' + esc(c.iso) + '" title="기체 등록국 — Mode-S 주소('
         + esc(String(hex).toUpperCase()) + ') 대역으로 판정합니다.">' + img + esc(c.ko) + '</span>';
  }

  /** 머리 요소에 배지를 **한 번만** 붙인다 (인스펙터는 폴링마다 다시 그려진다).
   *  ⛔ 이미 붙어 있으면 그대로 둔다 — acft-info 의 중복 방지와 같은 규약. */
  function decorate(el, hex) {
    try {
      if (!el || el.querySelector('.acc-badge')) return false;
      var h = badge(hex);
      if (!h) return false;
      el.insertAdjacentHTML('beforeend', h);
      return true;
    } catch (e) { return false; }     // ⛔ 국적 배지 때문에 화면이 멈추지 않는다
  }

  function init(opts) {
    opts = opts || {};
    if (opts.label != null) D.label = String(opts.label);
    if (opts.flagBase != null) D.flagBase = String(opts.flagBase);
    if (opts.flags != null) D.flags = !!opts.flags;
    return api;
  }

  var api = {
    init: init,
    of: of,
    ko: ko,
    badge: badge,
    plain: plain,
    decorate: decorate,
    _ranges: R,                 // 검사용 — test.js 가 겹침·정렬을 본다
    _flags: HAS_FLAG            // 검사용 — 그림이 있는 나라
  };
  global.AcftCountry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

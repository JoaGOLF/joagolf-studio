/**
 * JoaGOLF STUDIO 数値管理ダッシュボード
 * 依存ライブラリなし。グラフは素の SVG で描いています。
 */

import {
  META,
  STORES,
  WEEKS as FILE_WEEKS,
  WEEKLY as FILE_WEEKLY,
  TRIALS as FILE_TRIALS,
  CHURN as FILE_CHURN,
  classifyReason,
} from './data.js';

/**
 * 表示に使うデータ。最初は data.js に同梱したもの（前回取り込んだ内容）で描き、
 * スプレッドシートから読めたら差し替えて描き直す。
 * こうしておくと、シートが読めないときでも画面が真っ白にならない。
 */
let WEEKS = FILE_WEEKS;
let WEEKLY = FILE_WEEKLY;
let TRIALS = FILE_TRIALS;
let CHURN = FILE_CHURN;
let SNAPSHOT_DATE = META.snapshotDate;
let DATA_SOURCE = 'file'; // 'file' | 'sheet'
let LOAD_ERROR = null;
let SHEET_WARNINGS = [];

/* ==========================================================================
   小さな道具
   ========================================================================== */

const SVG_NS = 'http://www.w3.org/2000/svg';
const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== null && v !== undefined) node.setAttribute(k, String(v));
  }
  for (const c of [].concat(children)) {
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function html(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

const seriesColor = (slot) => `var(--series-${slot})`;

/**
 * グラフ内の文字は画面幅に応じて拡大している（styles.css の --chart-scale）。
 * 文字が大きくなるぶん軸まわりの余白も広げないと、目盛りが見切れる。
 */
function chartScale() {
  const v = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--chart-scale')
  );
  return Number.isFinite(v) && v > 0 ? v : 1;
}

/** 文字の大きさに合わせた余白。scale=1 のときに従来と同じ値になる */
function chartMargins(sc, { right = 96, top = 18 } = {}) {
  return {
    top,
    right: Math.round((right - 60) * sc + 60),
    bottom: Math.round(22 + 18 * sc),
    left: Math.round(20 + 24 * sc),
  };
}

const pct = (n, d) => (d > 0 ? (n / d) * 100 : null);

function fmtPct(v, digits = 1) {
  return v === null || v === undefined || Number.isNaN(v) ? '−' : `${v.toFixed(digits)}%`;
}

function fmtNum(v) {
  return v === null || v === undefined ? '−' : String(v);
}

function fmtDate(iso) {
  if (!iso) return '−';
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/** 4つ組 [枠, レッスン, 体験, 入会] を名前付きに */
function toRec(tuple) {
  if (!tuple) return null;
  const [slots, lessons, trials, joins] = tuple;
  return { slots, lessons, trials, joins };
}

/** 全店合計（記録のある店舗だけ足す。全店空欄なら null） */
function totalAt(weekIndex) {
  let any = false;
  const sum = { slots: 0, lessons: 0, trials: 0, joins: 0 };
  for (const s of STORES) {
    const rec = toRec(WEEKLY[s.id][weekIndex]);
    if (!rec) continue;
    any = true;
    sum.slots += rec.slots;
    sum.lessons += rec.lessons;
    sum.trials += rec.trials;
    sum.joins += rec.joins;
  }
  return any ? sum : null;
}

/** 表示対象の週インデックス（全店とも空欄の先頭の週は落とす） */
let ACTIVE_WEEKS = [];

function recomputeActiveWeeks() {
  ACTIVE_WEEKS = WEEKS.map((_, i) => i).filter((i) => totalAt(i) !== null);
}

/**
 * 週のラベルを読みやすく整える。
 * シートは「7/7-7/13」「14-20」のように書き方が揃っていないので、
 * 月が省略されている週には直前の週が終わった月を補う。
 */
function normalizeWeeks(rawWeeks) {
  let month = null;
  return rawWeeks.map((w) => {
    let t = String(w).trim();

    // Google スプレッドシートは「4-10」のような入力を日付（4月10日）として
    // 保存してしまう。ここは週の範囲＝「4日から10日」の意味なので書き方を戻す。
    const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) t = `${Number(iso[2])}-${Number(iso[3])}`;

    const dates = t.match(/\d{1,2}\/\d{1,2}/g);
    if (dates) {
      month = Number(dates[dates.length - 1].split('/')[0]);
      // 「7/7-7/13」→「7/7-13」（同じ月なら後ろの月は省く）
      return t.replace(
        /(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})/,
        (_m, a, b, c, d) => (a === c ? `${a}/${b}-${d}` : `${a}/${b}-${c}/${d}`)
      );
    }
    const bare = t.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (bare && month !== null) return `${month}/${bare[1]}-${bare[2]}`;
    return t;
  });
}

/** 流入経路の分類。備考の文章から、当てはまるものを全部拾う（複数回答あり） */
const CHANNEL_RULES = [
  ['HP', /\bHP\b|ホームページ/i],
  ['インスタ', /インスタ|instagram/i],
  ['紹介', /紹介/],
  ['Googleマップ', /google\s*\.?\s*(マップ|map)/i],
  ['SNS広告', /SNS\s*広告/i],
  ['飛び込み', /飛び込み/],
  ['その他', /^その他$/],
];

function channelsOf(note) {
  const t = String(note || '').trim();
  const hits = CHANNEL_RULES.filter(([, re]) => re.test(t)).map(([name]) => name);
  return hits.length ? hits : ['不明'];
}

/* ==========================================================================
   状態
   ========================================================================== */

const state = {
  store: 'all', // 'all' | store id
};

const storeById = Object.fromEntries(STORES.map((s) => [s.id, s]));
const storeName = (id) => storeById[id]?.name ?? id;

/** いま選ばれている範囲の週次データを取り出す */
function recordAt(weekIndex) {
  return state.store === 'all' ? totalAt(weekIndex) : toRec(WEEKLY[state.store][weekIndex]);
}

/* ==========================================================================
   ツールチップ
   ========================================================================== */

const tooltip = $('#tooltip');

function showTooltip(evt, contentNode) {
  tooltip.replaceChildren(contentNode);
  tooltip.classList.add('show');
  positionTooltip(evt);
}

function positionTooltip(evt) {
  const pad = 14;
  const rect = tooltip.getBoundingClientRect();
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - pad;
  tooltip.style.left = `${Math.max(8, x)}px`;
  tooltip.style.top = `${Math.max(8, y)}px`;
}

function hideTooltip() {
  tooltip.classList.remove('show');
}

function tipNode(title, rows) {
  const box = html('div');
  box.appendChild(html('div', 'tt-title', title));
  for (const r of rows) {
    const line = html('div', 'tt-row');
    const key = html('span', 'tt-key');
    if (r.color) {
      const sw = html('span', 'swatch');
      sw.style.background = r.color;
      key.appendChild(sw);
    }
    key.appendChild(document.createTextNode(r.label));
    line.appendChild(key);
    line.appendChild(html('span', 'tt-val', r.value));
    box.appendChild(line);
  }
  return box;
}

/* ==========================================================================
   グラフ 1: 稼働率の折れ線（店舗別）
   ========================================================================== */

function renderUtilChart() {
  const W = 900;
  const sc = chartScale();
  const m = chartMargins(sc, { right: 96 });
  const H = Math.round(330 + (m.bottom - 40));
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': '店舗ごとの、週別レッスン枠稼働率の折れ線グラフ',
  });

  const n = ACTIVE_WEEKS.length;
  const x = (i) => m.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => m.top + ih - (v / 100) * ih;

  // 目盛り線
  for (let v = 0; v <= 100; v += 25) {
    svg.appendChild(
      el('line', { class: 'grid-line', x1: m.left, x2: m.left + iw, y1: y(v), y2: y(v) })
    );
    svg.appendChild(
      el('text', { class: 'tick-label', x: m.left - 9, y: y(v) + 4, 'text-anchor': 'end' }, `${v}%`)
    );
  }
  svg.appendChild(
    el('line', { class: 'axis-line', x1: m.left, x2: m.left + iw, y1: y(0), y2: y(0) })
  );

  // 横軸ラベル（混み合うので1つおき＋最終週は必ず出す）
  ACTIVE_WEEKS.forEach((wi, i) => {
    const isLast = i === n - 1;
    if (i % 2 !== 0 && !isLast) return;
    svg.appendChild(
      el(
        'text',
        { class: 'tick-label', x: x(i), y: m.top + ih + 20, 'text-anchor': 'middle' },
        WEEKS[wi]
      )
    );
  });

  // 各店舗の線
  const seriesGroups = [];
  for (const s of STORES) {
    const dimmed = state.store !== 'all' && state.store !== s.id;
    const g = el('g', { class: dimmed ? 'dim-series' : null });
    const color = seriesColor(s.slot);

    const points = ACTIVE_WEEKS.map((wi, i) => {
      const rec = toRec(WEEKLY[s.id][wi]);
      const v = rec ? pct(rec.lessons, rec.slots) : null;
      return v === null ? null : { i, x: x(i), y: y(v), v };
    });

    // 欠測でつながないよう、連続する区間ごとに線を引く
    let run = [];
    const flush = () => {
      if (run.length >= 2) {
        g.appendChild(
          el('polyline', {
            points: run.map((p) => `${p.x},${p.y}`).join(' '),
            fill: 'none',
            stroke: color,
            'stroke-width': 2,
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round',
          })
        );
      } else if (run.length === 1) {
        g.appendChild(
          el('circle', {
            cx: run[0].x,
            cy: run[0].y,
            r: 4,
            fill: color,
            stroke: 'var(--surface-1)',
            'stroke-width': 2,
          })
        );
      }
      run = [];
    };
    for (const p of points) (p ? run.push(p) : flush());
    flush();

    // 点（重なりを避けるため 2px の面色リング付き）
    for (const p of points) {
      if (!p) continue;
      g.appendChild(
        el('circle', {
          cx: p.x,
          cy: p.y,
          r: 3.5,
          fill: color,
          stroke: 'var(--surface-1)',
          'stroke-width': 2,
        })
      );
    }

    // 線の右端に店舗名を直接ラベル（凡例だけに頼らない）
    const last = [...points].reverse().find(Boolean);
    if (last) {
      g.appendChild(
        el(
          'text',
          {
            class: 'series-label',
            x: last.x + 10,
            y: last.y + 4,
            fill: color,
          },
          `${s.name} ${last.v.toFixed(0)}%`
        )
      );
    }
    seriesGroups.push(g);
    svg.appendChild(g);
  }

  // ホバー: 週ごとの縦線＋全店の値
  const crosshair = el('line', {
    class: 'axis-line',
    y1: m.top,
    y2: m.top + ih,
    stroke: 'var(--text-muted)',
    'stroke-dasharray': '3 3',
    opacity: 0,
  });
  svg.appendChild(crosshair);

  ACTIVE_WEEKS.forEach((wi, i) => {
    const half = n > 1 ? iw / (n - 1) / 2 : iw / 2;
    const hit = el('rect', {
      class: 'hit',
      x: x(i) - half,
      y: m.top,
      width: half * 2,
      height: ih,
    });
    hit.addEventListener('mouseenter', (e) => {
      crosshair.setAttribute('x1', x(i));
      crosshair.setAttribute('x2', x(i));
      crosshair.setAttribute('opacity', '1');
      const rows = STORES.map((s) => {
        const rec = toRec(WEEKLY[s.id][wi]);
        const v = rec ? pct(rec.lessons, rec.slots) : null;
        return {
          color: seriesColor(s.slot),
          label: s.name,
          value:
            rec === null
              ? '記録なし'
              : `${fmtPct(v, 0)}（${rec.lessons}/${rec.slots}枠）`,
        };
      });
      showTooltip(e, tipNode(`${WEEKS[wi]} の稼働率`, rows));
    });
    hit.addEventListener('mousemove', positionTooltip);
    hit.addEventListener('mouseleave', () => {
      crosshair.setAttribute('opacity', '0');
      hideTooltip();
    });
    svg.appendChild(hit);
  });

  $('#chart-util').replaceChildren(svg);
  renderLegend('#legend-util', STORES.map((s) => ({ color: seriesColor(s.slot), label: s.name })));
}

/* ==========================================================================
   グラフ 2: レッスン数の積み上げ棒
   ========================================================================== */

function renderLessonsChart() {
  const W = 900;
  const sc = chartScale();
  const m = chartMargins(sc, { right: 76 });
  const H = Math.round(300 + (m.bottom - 40));
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': '週ごとの実施レッスン数を店舗別に積み上げた棒グラフ',
  });

  const maxTotal = Math.max(
    ...ACTIVE_WEEKS.map((wi) => {
      const t = totalAt(wi);
      return t ? t.lessons : 0;
    }),
    1
  );
  const yMax = Math.ceil(maxTotal / 20) * 20;
  const y = (v) => m.top + ih - (v / yMax) * ih;

  for (let v = 0; v <= yMax; v += yMax / 4) {
    svg.appendChild(
      el('line', { class: 'grid-line', x1: m.left, x2: m.left + iw, y1: y(v), y2: y(v) })
    );
    svg.appendChild(
      el('text', { class: 'tick-label', x: m.left - 9, y: y(v) + 4, 'text-anchor': 'end' }, String(v))
    );
  }

  const n = ACTIVE_WEEKS.length;
  const step = iw / n;
  const barW = Math.min(46, step * 0.62);

  ACTIVE_WEEKS.forEach((wi, i) => {
    const cx = m.left + step * (i + 0.5);
    let cursor = 0;

    for (const s of STORES) {
      const rec = toRec(WEEKLY[s.id][wi]);
      if (!rec || rec.lessons <= 0) continue;
      const dimmed = state.store !== 'all' && state.store !== s.id;
      const yTop = y(cursor + rec.lessons);
      const yBottom = y(cursor);
      // 隣り合う面のあいだに 2px の面色の隙間をあける
      const h = Math.max(1, yBottom - yTop - 2);
      svg.appendChild(
        el('rect', {
          x: cx - barW / 2,
          y: yTop,
          width: barW,
          height: h,
          rx: 3,
          fill: seriesColor(s.slot),
          class: dimmed ? 'dim-series' : null,
        })
      );
      cursor += rec.lessons;
    }

    const total = totalAt(wi);
    if (total && total.lessons > 0) {
      svg.appendChild(
        el(
          'text',
          { class: 'bar-value', x: cx, y: y(total.lessons) - 7, 'text-anchor': 'middle' },
          String(total.lessons)
        )
      );
    }

    svg.appendChild(
      el('text', { class: 'tick-label', x: cx, y: m.top + ih + 20, 'text-anchor': 'middle' }, WEEKS[wi])
    );

    const hit = el('rect', { class: 'hit', x: cx - step / 2, y: m.top, width: step, height: ih });
    hit.addEventListener('mouseenter', (e) => {
      const rows = STORES.map((s) => {
        const rec = toRec(WEEKLY[s.id][wi]);
        return {
          color: seriesColor(s.slot),
          label: s.name,
          value: rec ? `${rec.lessons} 回` : '記録なし',
        };
      });
      rows.push({ label: '合計', value: `${total ? total.lessons : 0} 回` });
      showTooltip(e, tipNode(`${WEEKS[wi]} のレッスン数`, rows));
    });
    hit.addEventListener('mousemove', positionTooltip);
    hit.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(hit);
  });

  svg.appendChild(
    el('line', { class: 'axis-line', x1: m.left, x2: m.left + iw, y1: y(0), y2: y(0) })
  );

  $('#chart-lessons').replaceChildren(svg);
  renderLegend(
    '#legend-lessons',
    STORES.map((s) => ({ color: seriesColor(s.slot), label: s.name }))
  );
}

/* ==========================================================================
   グラフ 3: 体験数と入会数
   ========================================================================== */

function renderTrialChart() {
  const W = 900;
  const sc = chartScale();
  const m = chartMargins(sc, { right: 76 });
  const H = Math.round(260 + (m.bottom - 40));
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': '週ごとの体験人数と、そこから入会した人数の棒グラフ',
  });

  const rows = ACTIVE_WEEKS.map((wi) => ({ wi, rec: recordAt(wi) }));
  const maxV = Math.max(...rows.map((r) => (r.rec ? r.rec.trials : 0)), 1);
  // 人数なので目盛りは必ず整数にする
  const tickStep = [1, 2, 5, 10, 20, 50].find((c) => maxV / c <= 5) ?? 100;
  const yMax = Math.max(tickStep, Math.ceil(maxV / tickStep) * tickStep);
  const y = (v) => m.top + ih - (v / yMax) * ih;

  for (let v = 0; v <= yMax; v += tickStep) {
    svg.appendChild(
      el('line', { class: 'grid-line', x1: m.left, x2: m.left + iw, y1: y(v), y2: y(v) })
    );
    svg.appendChild(
      el('text', { class: 'tick-label', x: m.left - 9, y: y(v) + 4, 'text-anchor': 'end' }, String(v))
    );
  }

  const n = rows.length;
  const step = iw / n;
  const barW = Math.min(18, step * 0.3);

  rows.forEach(({ wi, rec }, i) => {
    const cx = m.left + step * (i + 0.5);
    if (rec) {
      const pairs = [
        { v: rec.trials, color: 'var(--seq-250)', dx: -barW / 2 - 1 },
        { v: rec.joins, color: 'var(--seq-550)', dx: barW / 2 + 1 },
      ];
      for (const p of pairs) {
        if (p.v <= 0) continue;
        svg.appendChild(
          el('rect', {
            x: cx + p.dx - barW / 2,
            y: y(p.v),
            width: barW,
            height: Math.max(2, y(0) - y(p.v)),
            rx: 3,
            fill: p.color,
          })
        );
      }
    }

    svg.appendChild(
      el('text', { class: 'tick-label', x: cx, y: m.top + ih + 20, 'text-anchor': 'middle' }, WEEKS[wi])
    );

    const hit = el('rect', { class: 'hit', x: cx - step / 2, y: m.top, width: step, height: ih });
    hit.addEventListener('mouseenter', (e) => {
      if (!rec) {
        showTooltip(e, tipNode(WEEKS[wi], [{ label: '記録', value: 'なし' }]));
        return;
      }
      showTooltip(
        e,
        tipNode(`${WEEKS[wi]}（${state.store === 'all' ? '全店' : storeName(state.store)}）`, [
          { color: 'var(--seq-250)', label: '体験', value: `${rec.trials} 人` },
          { color: 'var(--seq-550)', label: '入会', value: `${rec.joins} 人` },
          { label: '入会率', value: fmtPct(pct(rec.joins, rec.trials), 0) },
        ])
      );
    });
    hit.addEventListener('mousemove', positionTooltip);
    hit.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(hit);
  });

  svg.appendChild(
    el('line', { class: 'axis-line', x1: m.left, x2: m.left + iw, y1: y(0), y2: y(0) })
  );

  $('#chart-trial').replaceChildren(svg);
  renderLegend('#legend-trial', [
    { color: 'var(--seq-250)', label: '体験に来た人数' },
    { color: 'var(--seq-550)', label: 'そのうち入会した人数' },
  ]);
}

/* ==========================================================================
   横棒グラフ（流入経路・プラン・退会理由）
   ========================================================================== */

/**
 * items: [{ label, value, display, segments? }]
 * segments を渡すと積み上げ横棒になる: [{ value, color, name }]
 */
function renderHBar(selector, items, opts = {}) {
  const { unit = '件', maxOverride = null } = opts;
  const rowH = 30;
  const labelW = opts.labelW ?? 132;
  const valueW = opts.valueW ?? 58;
  const W = 620;
  const H = Math.max(rowH * items.length + 8, 40);
  const barX = labelW;
  const barW = W - labelW - valueW;

  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': opts.ariaLabel ?? '横棒グラフ',
  });

  const max = maxOverride ?? Math.max(...items.map((d) => d.value), 1);

  items.forEach((d, i) => {
    const cy = i * rowH + rowH / 2 + 4;
    const bh = 15;
    const yTop = cy - bh / 2;

    svg.appendChild(
      el(
        'text',
        { class: 'bar-name', x: labelW - 10, y: cy + 4, 'text-anchor': 'end' },
        d.label
      )
    );

    // 背景トラック
    svg.appendChild(
      el('rect', {
        x: barX,
        y: yTop,
        width: barW,
        height: bh,
        rx: 4,
        fill: 'var(--grid)',
        opacity: 0.5,
      })
    );

    if (d.segments) {
      let cursor = 0;
      for (const seg of d.segments) {
        if (seg.value <= 0) continue;
        const segW = (seg.value / max) * barW;
        svg.appendChild(
          el('rect', {
            x: barX + (cursor / max) * barW,
            // 隣り合う面のあいだに 2px の隙間
            width: Math.max(2, segW - 2),
            y: yTop,
            height: bh,
            rx: 4,
            fill: seg.color,
          })
        );
        cursor += seg.value;
      }
    } else if (d.value > 0) {
      svg.appendChild(
        el('rect', {
          x: barX,
          y: yTop,
          width: Math.max(4, (d.value / max) * barW),
          height: bh,
          rx: 4,
          fill: d.color ?? 'var(--seq-450)',
        })
      );
    }

    svg.appendChild(
      el(
        'text',
        { class: 'bar-value', x: W - 6, y: cy + 4, 'text-anchor': 'end' },
        d.display ?? `${d.value}${unit}`
      )
    );

    const hit = el('rect', { class: 'hit', x: 0, y: i * rowH + 4, width: W, height: rowH });
    hit.addEventListener('mouseenter', (e) => {
      const rows = d.segments
        ? d.segments
            .filter((s) => s.value > 0)
            .map((s) => ({ color: s.color, label: s.name, value: `${s.value}${unit}` }))
        : [{ label: opts.tipLabel ?? '件数', value: d.display ?? `${d.value}${unit}` }];
      if (d.tipExtra) rows.push(...d.tipExtra);
      showTooltip(e, tipNode(d.label, rows));
    });
    hit.addEventListener('mousemove', positionTooltip);
    hit.addEventListener('mouseleave', hideTooltip);
    svg.appendChild(hit);
  });

  $(selector).replaceChildren(svg);
}

function renderLegend(selector, items) {
  const box = $(selector);
  if (!box) return;
  box.replaceChildren(
    ...items.map((it) => {
      const node = html('span', 'legend-item');
      const sw = html('span', 'swatch');
      sw.style.background = it.color;
      node.appendChild(sw);
      node.appendChild(document.createTextNode(it.label));
      return node;
    })
  );
}

/* ==========================================================================
   KPI
   ========================================================================== */

function renderKPIs() {
  // 選択中の範囲で、記録がある最後の週
  const withData = ACTIVE_WEEKS.filter((wi) => recordAt(wi) !== null);
  const latest = withData[withData.length - 1];
  const prev = withData[withData.length - 2];

  const scopeLabel = state.store === 'all' ? '4店舗の合計' : `${storeName(state.store)}店`;
  $('#summary-scope').textContent =
    latest === undefined
      ? `${scopeLabel} — 記録された週がありません`
      : `${scopeLabel} ／ ${WEEKS[latest]} の週`;

  const box = $('#kpi-row');
  if (latest === undefined) {
    box.replaceChildren(html('p', 'muted', 'この店舗の週次データはまだ入っていません。'));
    return;
  }

  const cur = recordAt(latest);
  const old = prev === undefined ? null : recordAt(prev);

  const cards = [
    { label: 'レッスン枠', value: cur.slots, unit: '枠', prev: old?.slots ?? null, betterUp: true },
    {
      label: '実施レッスン数',
      value: cur.lessons,
      unit: '回',
      prev: old?.lessons ?? null,
      betterUp: true,
    },
    {
      label: '稼働率',
      value: pct(cur.lessons, cur.slots),
      unit: '%',
      isPct: true,
      prev: old ? pct(old.lessons, old.slots) : null,
      betterUp: true,
    },
    { label: '体験に来た人数', value: cur.trials, unit: '人', prev: old?.trials ?? null, betterUp: true },
    { label: '入会した人数', value: cur.joins, unit: '人', prev: old?.joins ?? null, betterUp: true },
    {
      label: '体験からの入会率',
      value: pct(cur.joins, cur.trials),
      unit: '%',
      isPct: true,
      prev: old ? pct(old.joins, old.trials) : null,
      betterUp: true,
    },
  ];

  box.replaceChildren(
    ...cards.map((c) => {
      const node = html('div', 'kpi');
      node.appendChild(html('p', 'kpi-label', c.label));

      const val = html('p', 'kpi-value');
      if (c.value === null || Number.isNaN(c.value)) {
        val.textContent = '−';
        val.classList.add('muted');
      } else {
        val.textContent = c.isPct ? c.value.toFixed(1) : String(c.value);
        val.appendChild(html('span', 'kpi-unit', c.unit));
      }
      node.appendChild(val);

      const d =
        c.prev === null || c.prev === undefined || c.value === null || Number.isNaN(c.value)
          ? null
          : c.value - c.prev;
      const delta = html('p', 'kpi-delta');
      if (d === null) {
        delta.classList.add('flat');
        delta.textContent = '前週比 −';
      } else {
        const up = d > 0.05;
        const down = d < -0.05;
        delta.classList.add(up ? 'up' : down ? 'down' : 'flat');
        const arrow = html('span', 'arrow', up ? '▲' : down ? '▼' : '−');
        delta.appendChild(arrow);
        const mag = c.isPct ? `${Math.abs(d).toFixed(1)}pt` : `${Math.abs(d)}${c.unit}`;
        delta.appendChild(
          document.createTextNode(up || down ? `前週比 ${mag}` : '前週から変化なし')
        );
      }
      node.appendChild(delta);
      return node;
    })
  );
}

/* ==========================================================================
   週次の表
   ========================================================================== */

function renderWeeklyTable() {
  const table = $('#weekly-table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const isAll = state.store === 'all';
  const targets = isAll ? STORES : [storeById[state.store]];
  // 全店表示は列が多くなりすぎるので、店舗ごとは枠・レッスン・稼働率だけにして
  // 体験・入会は全店合計にまとめる。1店舗表示のときは全項目を出す。
  const metrics = isAll ? ['枠', 'レッスン', '稼働率'] : ['枠', 'レッスン', '稼働率', '体験', '入会', '入会率'];

  const r1 = document.createElement('tr');
  const thWeek = html('th', null, '週');
  thWeek.rowSpan = 2;
  r1.appendChild(thWeek);
  for (const s of targets) {
    const th = html('th');
    th.colSpan = metrics.length;
    const sw = html('span', 'swatch');
    sw.style.background = seriesColor(s.slot);
    sw.style.marginRight = '6px';
    th.appendChild(sw);
    th.appendChild(document.createTextNode(s.name));
    r1.appendChild(th);
  }
  if (isAll) {
    const th = html('th', null, '全店合計');
    th.colSpan = 4;
    r1.appendChild(th);
  }
  thead.appendChild(r1);

  const r2 = document.createElement('tr');
  for (const _ of targets) for (const mname of metrics) r2.appendChild(html('th', 'num', mname));
  if (isAll) for (const mname of ['稼働率', '体験', '入会', '入会率']) r2.appendChild(html('th', 'num', mname));
  thead.appendChild(r2);

  for (const wi of ACTIVE_WEEKS) {
    const tr = document.createElement('tr');
    tr.appendChild(html('td', null, WEEKS[wi]));
    for (const s of targets) {
      const rec = toRec(WEEKLY[s.id][wi]);
      if (!rec) {
        for (let k = 0; k < metrics.length; k++) tr.appendChild(html('td', 'num muted', '−'));
        continue;
      }
      tr.appendChild(html('td', 'num', fmtNum(rec.slots)));
      tr.appendChild(html('td', 'num', fmtNum(rec.lessons)));
      tr.appendChild(html('td', 'num', fmtPct(pct(rec.lessons, rec.slots), 0)));
      if (!isAll) {
        tr.appendChild(html('td', 'num', fmtNum(rec.trials)));
        tr.appendChild(html('td', 'num', fmtNum(rec.joins)));
        tr.appendChild(html('td', 'num', fmtPct(pct(rec.joins, rec.trials), 0)));
      }
    }
    if (isAll) {
      const t = totalAt(wi);
      tr.appendChild(html('td', 'num', t ? fmtPct(pct(t.lessons, t.slots), 0) : '−'));
      tr.appendChild(html('td', 'num', t ? fmtNum(t.trials) : '−'));
      tr.appendChild(html('td', 'num', t ? fmtNum(t.joins) : '−'));
      tr.appendChild(html('td', 'num', t ? fmtPct(pct(t.joins, t.trials), 0) : '−'));
    }
    tbody.appendChild(tr);
  }

  table.replaceChildren(thead, tbody);
}

/* ==========================================================================
   体験者リスト・流入経路・プラン
   ========================================================================== */

const CHANNEL_ORDER = ['HP', 'インスタ', '紹介', 'Googleマップ', 'SNS広告', '飛び込み', 'その他', '不明'];

function filteredTrials() {
  return TRIALS.filter((t) => state.store === 'all' || t.store === state.store);
}

const isJoined = (t) => t.plan !== '' && t.plan !== '未入会';
const isPending = (t) => t.plan === '';

function renderChannelCharts() {
  const rows = filteredTrials();
  const counts = new Map();
  for (const t of rows) {
    for (const ch of channelsOf(t.note)) {
      const c = counts.get(ch) ?? { total: 0, joined: 0 };
      c.total += 1;
      if (isJoined(t)) c.joined += 1;
      counts.set(ch, c);
    }
  }

  const items = CHANNEL_ORDER.filter((ch) => counts.has(ch)).map((ch) => {
    const c = counts.get(ch);
    return {
      label: ch,
      value: c.total,
      display: `${c.total}人`,
      tipExtra: [
        { label: '入会', value: `${c.joined}人` },
        { label: '入会率', value: fmtPct(pct(c.joined, c.total), 0) },
      ],
    };
  });
  items.sort((a, b) => b.value - a.value);

  renderHBar('#chart-channel', items, {
    unit: '人',
    tipLabel: '体験',
    ariaLabel: '流入経路ごとの体験人数の横棒グラフ',
  });

  // 入会率（母数が少ない経路は数字を添えて誤読を防ぐ）
  const rateItems = items
    .map((it) => {
      const c = counts.get(it.label);
      const rate = pct(c.joined, c.total);
      return {
        label: it.label,
        value: rate ?? 0,
        display: `${fmtPct(rate, 0)}（${c.joined}/${c.total}）`,
        tipExtra: [{ label: '体験', value: `${c.total}人` }],
      };
    })
    .sort((a, b) => b.value - a.value);

  renderHBar('#chart-channel-rate', rateItems, {
    unit: '%',
    maxOverride: 100,
    valueW: 108, // 「100%（1/1）」が棒に重ならない幅
    tipLabel: '入会率',
    ariaLabel: '流入経路ごとの入会率の横棒グラフ',
  });
}

function renderPlanChart() {
  const rows = filteredTrials().filter(isJoined);
  const counts = new Map();
  for (const t of rows) counts.set(t.plan, (counts.get(t.plan) ?? 0) + 1);
  const items = [...counts.entries()]
    .map(([label, value]) => ({ label, value, display: `${value}人` }))
    .sort((a, b) => b.value - a.value);

  if (items.length === 0) {
    $('#chart-plan').replaceChildren(html('p', 'muted', '入会の記録がありません。'));
    return;
  }
  renderHBar('#chart-plan', items, {
    unit: '人',
    tipLabel: '入会',
    ariaLabel: 'プランごとの入会人数の横棒グラフ',
  });
}

function renderTrialsTable() {
  const rows = [...filteredTrials()].sort((a, b) => b.date.localeCompare(a.date));
  const joined = rows.filter(isJoined).length;
  const pending = rows.filter(isPending).length;
  const decided = rows.length - pending;

  $('#trials-count').textContent =
    `${state.store === 'all' ? '全店' : storeName(state.store) + '店'} ／ 体験 ${rows.length}人・` +
    `入会 ${joined}人（入会率 ${fmtPct(pct(joined, decided), 0)}）` +
    (pending ? ` ／ プラン未記入 ${pending}人は入会率の計算から除いています` : '');

  const table = $('#trials-table');
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const cols = state.store === 'all' ? ['日付', '店舗', 'お名前', 'プラン', 'きっかけ'] : ['日付', 'お名前', 'プラン', 'きっかけ'];
  for (const c of cols) hr.appendChild(html('th', c === 'きっかけ' ? null : null, c));
  thead.appendChild(hr);

  const tbody = document.createElement('tbody');
  for (const t of rows) {
    const tr = document.createElement('tr');
    tr.appendChild(html('td', null, fmtDate(t.date)));
    if (state.store === 'all') {
      const td = html('td');
      const sw = html('span', 'swatch');
      sw.style.background = seriesColor(storeById[t.store].slot);
      sw.style.marginRight = '7px';
      td.appendChild(sw);
      td.appendChild(document.createTextNode(storeName(t.store)));
      tr.appendChild(td);
    }
    tr.appendChild(html('td', null, t.name));

    const tdPlan = html('td');
    const tag = html(
      'span',
      `tag ${isPending(t) ? 'pending' : isJoined(t) ? 'joined' : 'notjoined'}`,
      isPending(t) ? '未記入' : t.plan
    );
    tdPlan.appendChild(tag);
    tr.appendChild(tdPlan);

    tr.appendChild(html('td', 'wrap-cell', t.note || '−'));
    tbody.appendChild(tr);
  }
  table.replaceChildren(thead, tbody);
}

/* ==========================================================================
   退会・休会
   ========================================================================== */

const KIND_COLOR = { 退会: 'var(--series-1)', 休会: 'var(--series-2)', その他: 'var(--series-3)' };

function filteredChurn() {
  return CHURN.filter((c) => state.store === 'all' || c.store === state.store);
}

function renderChurn() {
  const rows = filteredChurn();
  const leave = rows.filter((r) => r.kind === '退会').length;
  const pause = rows.filter((r) => r.kind === '休会').length;
  const other = rows.length - leave - pause;

  $('#churn-count').textContent =
    `${state.store === 'all' ? '全店' : storeName(state.store) + '店'} ／ ` +
    `合計 ${rows.length}件（退会 ${leave}・休会 ${pause}${other ? `・その他 ${other}` : ''}）`;

  // 理由ごとの内訳（退会/休会/その他 の積み上げ）
  const byReason = new Map();
  for (const r of rows) {
    const key = classifyReason(r);
    const c = byReason.get(key) ?? { 退会: 0, 休会: 0, その他: 0 };
    c[r.kind] += 1;
    byReason.set(key, c);
  }
  const items = [...byReason.entries()]
    .map(([label, c]) => {
      const total = c.退会 + c.休会 + c.その他;
      return {
        label,
        value: total,
        display: `${total}件`,
        segments: [
          { name: '退会', value: c.退会, color: KIND_COLOR.退会 },
          { name: '休会', value: c.休会, color: KIND_COLOR.休会 },
          { name: 'その他', value: c.その他, color: KIND_COLOR.その他 },
        ],
      };
    })
    .sort((a, b) => b.value - a.value);

  const churnCard = $('#churn-chart-card');
  if (items.length === 0) {
    $('#chart-churn').replaceChildren(html('p', 'muted', 'この店舗の退会・休会の記録はありません。'));
    renderLegend('#legend-churn', []);
  } else {
    renderHBar('#chart-churn', items, {
      unit: '件',
      labelW: 176,
      ariaLabel: '退会・休会の理由ごとの件数の横棒グラフ',
    });
    // 色だけで区分が分かる状態にしないよう、凡例を必ず出す
    const used = ['退会', '休会', 'その他'].filter((k) => rows.some((r) => r.kind === k));
    renderLegend(
      '#legend-churn',
      used.map((k) => ({ color: KIND_COLOR[k], label: k }))
    );
  }
  if (churnCard) churnCard.hidden = false;

  const table = $('#churn-table');
  const tableCard = $('#churn-table-card');
  const emptyNote = $('#churn-empty');
  if (rows.length === 0) {
    table.replaceChildren();
    if (tableCard) tableCard.hidden = true;
    if (emptyNote) emptyNote.hidden = false;
    return;
  }
  if (tableCard) tableCard.hidden = false;
  if (emptyNote) emptyNote.hidden = true;
  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  const cols =
    state.store === 'all'
      ? ['日付', '店舗', 'お名前', '元のプラン', '区分', '担当', '対応', '理由']
      : ['日付', 'お名前', '元のプラン', '区分', '担当', '対応', '理由'];
  for (const c of cols) hr.appendChild(html('th', null, c));
  thead.appendChild(hr);

  const tbody = document.createElement('tbody');
  const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  for (const r of sorted) {
    const tr = document.createElement('tr');
    tr.appendChild(html('td', null, fmtDate(r.date)));
    if (state.store === 'all') {
      const td = html('td');
      const sw = html('span', 'swatch');
      sw.style.background = seriesColor(storeById[r.store].slot);
      sw.style.marginRight = '7px';
      td.appendChild(sw);
      td.appendChild(document.createTextNode(storeName(r.store)));
      tr.appendChild(td);
    }
    const nameTd = html('td', null, r.name);
    if (r.dupe) {
      nameTd.appendChild(html('span', 'tag pending', '同じ行が2つ'));
      nameTd.lastChild.style.marginLeft = '7px';
    }
    tr.appendChild(nameTd);
    tr.appendChild(html('td', null, r.plan));

    const kindTd = html('td');
    const kindTag = html('span', 'tag', r.kind);
    kindTag.style.borderColor = KIND_COLOR[r.kind];
    kindTd.appendChild(kindTag);
    tr.appendChild(kindTd);

    tr.appendChild(html('td', r.owner ? null : 'muted', r.owner || '−'));

    const doneTd = html('td');
    doneTd.appendChild(
      r.done === null
        ? html('span', 'muted', '−')
        : html('span', `tag ${r.done ? 'joined' : 'notjoined'}`, r.done ? '完了' : '未完了')
    );
    tr.appendChild(doneTd);

    tr.appendChild(html('td', 'wrap-cell', r.reason || '−'));
    tbody.appendChild(tr);
  }
  table.replaceChildren(thead, tbody);
}

/* ==========================================================================
   気になる点
   ========================================================================== */

function renderAlerts() {
  const alerts = [];

  // 1. 対応が未完了の退会
  for (const r of CHURN.filter((c) => c.done === false)) {
    alerts.push({
      level: 'critical',
      icon: '!',
      title: `${storeName(r.store)}・${r.name}さんの退会処理が未完了`,
      body: r.reason || '対応状況が「未完了」のままです。',
    });
  }

  // 2. 備考に「要確認」が入っている行
  for (const r of CHURN.filter((c) => c.flag && c.done !== false)) {
    alerts.push({
      level: 'warning',
      icon: '△',
      title: `${storeName(r.store)}・${r.name}さんの備考に確認事項`,
      body: r.reason,
    });
  }

  // 3. 直近週にレッスンが0だった店舗
  const last = ACTIVE_WEEKS[ACTIVE_WEEKS.length - 1];
  for (const s of STORES) {
    const rec = toRec(WEEKLY[s.id][last]);
    if (rec && rec.slots > 0 && rec.lessons === 0) {
      alerts.push({
        level: 'critical',
        icon: '!',
        title: `${s.name}は${WEEKS[last]}の週のレッスンが0回`,
        body: `${rec.slots}枠を用意しましたが、実施は0回でした。集客か枠の設定を見直す余地があります。`,
      });
    }
  }

  // 4. 稼働率が低い店舗（直近週）
  for (const s of STORES) {
    const rec = toRec(WEEKLY[s.id][last]);
    if (!rec || rec.lessons === 0) continue;
    const u = pct(rec.lessons, rec.slots);
    if (u !== null && u < 40) {
      alerts.push({
        level: 'warning',
        icon: '△',
        title: `${s.name}の稼働率が${u.toFixed(0)}%（${WEEKS[last]}）`,
        body: `${rec.slots}枠に対して${rec.lessons}回。枠が余っている状態です。`,
      });
    }
  }

  // 5. 体験が0の店舗（直近週）
  for (const s of STORES) {
    const rec = toRec(WEEKLY[s.id][last]);
    if (rec && rec.trials === 0) {
      alerts.push({
        level: 'info',
        icon: 'i',
        title: `${s.name}は${WEEKS[last]}の週の体験が0人`,
        body: '新規の体験申し込みが入っていません。',
      });
    }
  }

  // 6. 記録の抜け
  const missing = [];
  for (const s of STORES) {
    const gaps = ACTIVE_WEEKS.filter((wi) => WEEKLY[s.id][wi] === null);
    if (gaps.length) missing.push(`${s.name}（${gaps.length}週分）`);
  }
  if (missing.length) {
    alerts.push({
      level: 'info',
      icon: 'i',
      title: '週次シートに空欄の週があります',
      body: `${missing.join('、')}が未入力です。グラフではその週を線でつながず、抜けとして扱っています。`,
    });
  }

  // 7. 重複行
  const dupes = CHURN.filter((c) => c.dupe);
  if (dupes.length) {
    alerts.push({
      level: 'info',
      icon: 'i',
      title: '退会シートに、まったく同じ内容の行が重複しています',
      body:
        dupes
          .map((d) => `${storeName(d.store)}・${d.name}さん（${fmtDate(d.date)}）`)
          .join('、') + ' — 集計では2件として数えています。1件が正しければシート側を直してください。',
    });
  }

  // 8. プラン未記入の体験者
  const noPlan = TRIALS.filter(isPending);
  if (noPlan.length) {
    alerts.push({
      level: 'info',
      icon: 'i',
      title: '体験シートにプラン未記入の方がいます',
      body:
        noPlan
          .map((t) => `${storeName(t.store)}・${t.name}さん（${fmtDate(t.date)}）`)
          .join('、') + ' — 入会したかどうかが分からないため、入会率の計算から外しています。',
    });
  }

  const box = $('#alerts');
  if (alerts.length === 0) {
    box.replaceChildren(html('p', 'muted', '特に気になる点はありません。'));
    return;
  }

  const rank = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => rank[a.level] - rank[b.level]);

  box.replaceChildren(
    ...alerts.map((a) => {
      const node = html('div', `alert ${a.level}`);
      node.appendChild(html('span', 'alert-icon', a.icon));
      const body = html('div', 'alert-body');
      body.appendChild(html('h3', null, a.title));
      body.appendChild(html('p', null, a.body));
      node.appendChild(body);
      return node;
    })
  );
}

/* ==========================================================================
   フィルタ・テーマ
   ========================================================================== */

function renderStoreFilter() {
  const box = $('#store-filter');
  const options = [{ id: 'all', name: '全店', slot: null }, ...STORES];
  box.replaceChildren(
    ...options.map((o) => {
      const b = html('button', null);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state.store === o.id));
      if (o.slot) {
        const sw = html('span', 'swatch');
        sw.style.background = seriesColor(o.slot);
        b.appendChild(sw);
      }
      b.appendChild(document.createTextNode(o.name));
      b.addEventListener('click', () => {
        state.store = o.id;
        try {
          localStorage.setItem('joagolf.store', o.id);
        } catch {
          /* プライベートウィンドウなどでは保存できないので無視 */
        }
        renderAll();
      });
      return b;
    })
  );
}

/* ==========================================================================
   描画
   ========================================================================== */

function renderAll() {
  recomputeActiveWeeks();
  renderSourceNote();
  renderStoreFilter();
  renderKPIs();
  renderUtilChart();
  renderLessonsChart();
  renderTrialChart();
  renderWeeklyTable();
  renderChannelCharts();
  renderPlanChart();
  renderTrialsTable();
  renderChurn();
  renderAlerts();
}

/** ヘッダーに「いつ・どこから読んだデータか」を出す */
function renderSourceNote() {
  const box = $('#snapshot-note');
  if (!box) return;
  const [y, m, d] = String(SNAPSHOT_DATE).split('-');
  const date = `${Number(y)}年${Number(m)}月${Number(d)}日`;

  box.replaceChildren();
  const badge = html('span', `source-badge ${DATA_SOURCE}`);
  badge.textContent = DATA_SOURCE === 'sheet' ? 'シートと連動中' : '取り込み済みの内容';
  box.appendChild(badge);
  box.appendChild(
    document.createTextNode(
      DATA_SOURCE === 'sheet' ? ` ${date} 取得` : ` ${date} 時点`
    )
  );

  const note = $('#load-warning');
  if (!note) return;
  const msgs = [];
  if (LOAD_ERROR) msgs.push(LOAD_ERROR);
  msgs.push(...SHEET_WARNINGS);
  if (msgs.length === 0) {
    note.hidden = true;
    return;
  }
  note.hidden = false;
  note.replaceChildren(html('span', 'alert-icon', '△'), html('span', null, msgs.join(' / ')));
}

/** スプレッドシートから読み込んで、読めたら表示を差し替える */
async function loadFromSheet() {
  let res;
  try {
    // キャッシュは Cloudflare 側だけに任せる。
    // ブラウザにも溜めると、シートを直してから反映されるまでの待ち時間が二重になるため。
    res = await fetch('./api.php', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    LOAD_ERROR = 'スプレッドシートに接続できませんでした。前回取り込んだ内容を表示しています。';
    renderAll();
    return;
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* 下で扱う */
  }

  if (!res.ok || !body || body.error) {
    // 未設定のうちは静かに同梱データのままにする（毎回警告を出すとうるさいため）
    if (body && body.error === 'not_configured') return;
    LOAD_ERROR =
      (body && body.message) ||
      'スプレッドシートを読み込めませんでした。前回取り込んだ内容を表示しています。';
    renderAll();
    return;
  }

  if (!Array.isArray(body.weeks) || !body.weekly) {
    LOAD_ERROR = 'スプレッドシートの形式が想定と違いました。前回取り込んだ内容を表示しています。';
    renderAll();
    return;
  }

  WEEKS = normalizeWeeks(body.weeks);
  WEEKLY = body.weekly;
  TRIALS = Array.isArray(body.trials) ? body.trials : [];
  CHURN = Array.isArray(body.churn) ? body.churn : [];
  SNAPSHOT_DATE = body.snapshotDate || SNAPSHOT_DATE;
  SHEET_WARNINGS = Array.isArray(body.warnings) ? body.warnings : [];
  DATA_SOURCE = 'sheet';
  LOAD_ERROR = null;

  // 記録なしの店舗が抜けていても落ちないように、足りない配列を埋める
  for (const s of STORES) {
    if (!Array.isArray(WEEKLY[s.id])) WEEKLY[s.id] = [];
    while (WEEKLY[s.id].length < WEEKS.length) WEEKLY[s.id].push(null);
  }

  renderAll();
}

function init() {
  $('#source-link').href = META.sourceUrl;
  $('#source-link-2').href = META.sourceUrl;

  try {
    const saved = localStorage.getItem('joagolf.store');
    if (saved === 'all' || storeById[saved]) state.store = saved;
  } catch {
    /* 無視 */
  }

  renderAll();
  window.addEventListener('scroll', hideTooltip, { passive: true });

  // 画面幅が変わると文字の拡大率も変わるので、余白を取り直すために描き直す
  let resizeTimer = null;
  let lastScale = chartScale();
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const now = chartScale();
      if (now !== lastScale) {
        lastScale = now;
        renderAll();
      }
    }, 200);
  });

  loadFromSheet();
}

init();

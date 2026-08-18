#!/usr/bin/env python3
"""JoaGOLF STUDIO Web ダッシュボード

サイト公開(2026-06-21)以降の全週の推移を1枚のHTMLにまとめる。
GA4は週次ディメンションで一括取得するため、APIの呼び出しは10回程度で済む。

使い方:
  python3 dashboard.py            # _reports/dashboard.html を生成
"""
import json, os, sys, warnings
from datetime import date, timedelta
warnings.filterwarnings("ignore")

CONF = os.path.expanduser("~/.config/joagolf")
TOKEN = os.path.join(CONF, "token.json")
SCOPES = ["https://www.googleapis.com/auth/analytics.readonly",
          "https://www.googleapis.com/auth/webmasters.readonly"]
PROP = "541403482"
SITE = "https://joagolfstudio.jp/"
LAUNCH = date(2026, 6, 21)
BASE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE, "_reports")

RESERVE_MAP = {"schedule/3/11": "麹町店", "schedule/4/12": "西新宿店",
               "schedule/2/6": "千駄ヶ谷店", "schedule/1/5": "赤坂店",
               "8171fa84": "神戸店", "schedule/26/70": "神戸トアロード店",
               "schedule/1/1": "箕面店"}
TOKYO_STORES = ["麹町店", "西新宿店", "千駄ヶ谷店", "赤坂店"]
TOKYO_CITIES = ["Shinjuku", "Minato", "Chiyoda", "Shibuya", "Tokyo", "Chuo", "Setagaya",
                "Meguro", "Shinagawa", "Toshima", "Bunkyo", "Nakano", "Suginami",
                "Koto", "Ota", "Taito", "Sumida", "Kita", "Itabashi", "Nerima"]
KANSAI_CITIES = ["Osaka", "Kobe", "Minoh", "Mino", "Kyoto", "Nishinomiya", "Ashiya",
                 "Amagasaki", "Takarazuka", "Suita", "Toyonaka", "Sakai", "Himeji"]


def creds():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    if not os.path.exists(TOKEN):
        sys.exit("認証がありません。先に weekly_report.py を実行してください。")
    c = Credentials.from_authorized_user_file(TOKEN, SCOPES)
    if not c.valid and c.expired and c.refresh_token:
        c.refresh(Request())
        open(TOKEN, "w").write(c.to_json())
    return c


def week_key(d):
    """その日を含む週(月曜)のキー"""
    return (d - timedelta(days=d.weekday())).isoformat()


def store_of(url):
    for k, v in RESERVE_MAP.items():
        if k in url:
            return v
    return None


def fetch(c):
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.analytics.data_v1beta.types import (
        DateRange, Dimension, Metric, RunReportRequest, Filter, FilterExpression)
    from googleapiclient.discovery import build
    ga = BetaAnalyticsDataClient(credentials=c, transport="rest")
    start, end = LAUNCH.isoformat(), (date.today() - timedelta(days=1)).isoformat()

    def run(dims, mets, filt=None, limit=100000):
        req = RunReportRequest(
            property=f"properties/{PROP}",
            date_ranges=[DateRange(start_date=start, end_date=end)],
            dimensions=[Dimension(name=d) for d in dims],
            metrics=[Metric(name=m) for m in mets], limit=limit)
        if filt is not None:
            req.dimension_filter = filt
        out = []
        for r in ga.run_report(req).rows:
            vals = [d.value for d in r.dimension_values]
            nums = []
            for m in r.metric_values:
                f = float(m.value)
                nums.append(int(f) if f == int(f) else round(f, 4))
            out.append(vals + nums)
        return out

    def contains(field, value):
        return FilterExpression(filter=Filter(field_name=field, string_filter=Filter.StringFilter(
            match_type=Filter.StringFilter.MatchType.CONTAINS, value=value)))

    W = {}

    def cell(wk):
        return W.setdefault(wk, dict(users=0, sessions=0, newUsers=0, reserve=0, line=0,
                                     tokyo=0, kansai=0, lp=0, stores={}, channels={},
                                     devices={}, sc_imp=0, sc_clicks=0, sc_pos=0.0))

    # 日別の基本指標 → 週に集約
    for dt, u, s, n in run(["date"], ["activeUsers", "sessions", "newUsers"]):
        d = date(int(dt[:4]), int(dt[4:6]), int(dt[6:]))
        w = cell(week_key(d))
        w["users"] += u; w["sessions"] += s; w["newUsers"] += n

    # 外部クリック（予約・LINE）
    for dt, url, n in run(["date", "linkUrl"], ["eventCount"], contains("eventName", "click")):
        d = date(int(dt[:4]), int(dt[4:6]), int(dt[6:]))
        w = cell(week_key(d))
        if "page.line.me" in url:
            w["line"] += n
        else:
            st = store_of(url)
            if st:
                w["reserve"] += n
                w["stores"][st] = w["stores"].get(st, 0) + n

    # 地域
    for dt, city, s in run(["date", "city"], ["sessions"]):
        d = date(int(dt[:4]), int(dt[4:6]), int(dt[6:]))
        w = cell(week_key(d))
        if any(x in city for x in TOKYO_CITIES):
            w["tokyo"] += s
        elif any(x in city for x in KANSAI_CITIES):
            w["kansai"] += s

    # チャネル・端末
    for dt, ch, s in run(["date", "sessionDefaultChannelGroup"], ["sessions"]):
        d = date(int(dt[:4]), int(dt[4:6]), int(dt[6:]))
        w = cell(week_key(d))
        w["channels"][ch] = w["channels"].get(ch, 0) + s
    for dt, dev, s in run(["date", "deviceCategory"], ["sessions"]):
        d = date(int(dt[:4]), int(dt[4:6]), int(dt[6:]))
        w = cell(week_key(d))
        w["devices"][dev] = w["devices"].get(dev, 0) + s

    # キャンペーンLP
    for dt, path, v in run(["date", "pagePath"], ["screenPageViews"],
                           contains("pagePath", "/campaign/")):
        d = date(int(dt[:4]), int(dt[4:6]), int(dt[6:]))
        cell(week_key(d))["lp"] += v

    # Search Console（日別 → 週集約）
    try:
        sc = build("searchconsole", "v1", credentials=c, cache_discovery=False)
        rows = sc.searchanalytics().query(siteUrl=SITE, body={
            "startDate": start, "endDate": end,
            "dimensions": ["date"], "rowLimit": 500}).execute().get("rows", [])
        acc = {}
        for r in rows:
            d = date.fromisoformat(r["keys"][0])
            k = week_key(d)
            a = acc.setdefault(k, [0, 0, 0.0, 0])
            a[0] += int(r["impressions"]); a[1] += int(r["clicks"])
            a[2] += r["position"] * r["impressions"]; a[3] += int(r["impressions"])
        for k, a in acc.items():
            w = cell(k)
            w["sc_imp"], w["sc_clicks"] = a[0], a[1]
            w["sc_pos"] = round(a[2] / a[3], 1) if a[3] else 0
    except Exception as e:
        print(f"  ※Search Console取得失敗: {e}", file=sys.stderr)

    # 進行中の週(まだ日曜まで終わっていない週)は比較を歪めるので除外
    yesterday = date.today() - timedelta(days=1)
    done = {}
    for k, v in sorted(W.items()):
        if date.fromisoformat(k) + timedelta(days=6) <= yesterday:
            done[k] = v
    return done


# ---------- SVG グラフ ----------
def line_chart(weeks, series, height=210, pad=34):
    """series = [(ラベル, [値...], 色)]"""
    n = len(weeks)
    if n < 2:
        return "<p>データが不足しています</p>"
    width = max(560, n * 66)
    mx = max([max(s[1]) for s in series] + [1])
    step = (width - pad * 2) / (n - 1)
    def x(i): return pad + i * step
    def y(v): return height - pad - (v / mx) * (height - pad * 2)
    out = [f'<svg viewBox="0 0 {width} {height}" class="chart" preserveAspectRatio="xMidYMid meet">']
    for g in range(5):
        gy = pad + (height - pad * 2) * g / 4
        val = mx * (4 - g) / 4
        out.append(f'<line x1="{pad}" y1="{gy:.1f}" x2="{width-pad}" y2="{gy:.1f}" class="grid"/>')
        out.append(f'<text x="{pad-6}" y="{gy+4:.1f}" class="ylab">{val:,.0f}</text>')
    for label, vals, color in series:
        pts = " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(vals))
        out.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="2.5" '
                   'stroke-linejoin="round" stroke-linecap="round"/>')
        for i, v in enumerate(vals):
            out.append(f'<circle cx="{x(i):.1f}" cy="{y(v):.1f}" r="3.5" fill="{color}">'
                       f'<title>{label} {weeks[i]}: {v:,}</title></circle>')
    for i, w in enumerate(weeks):
        if n <= 12 or i % 2 == 0:
            out.append(f'<text x="{x(i):.1f}" y="{height-8}" class="xlab">{w[5:]}</text>')
    out.append("</svg>")
    return "".join(out)


def bars(items, color="#cc217f"):
    if not items:
        return "<p>データなし</p>"
    mx = max(v for _, v in items) or 1
    out = ['<div class="bars">']
    for name, v in items:
        out.append(f'<div class="bar-row"><span class="bar-name">{name}</span>'
                   f'<span class="bar-track"><span class="bar-fill" style="width:{v/mx*100:.1f}%;'
                   f'background:{color}"></span></span><span class="bar-val">{v:,}</span></div>')
    out.append("</div>")
    return "".join(out)


def render(W):
    ks = list(W.keys())
    labels = ks
    users = [W[k]["users"] for k in ks]
    sess = [W[k]["sessions"] for k in ks]
    res = [W[k]["reserve"] for k in ks]
    line = [W[k]["line"] for k in ks]
    tk = [W[k]["tokyo"] for k in ks]
    kn = [W[k]["kansai"] for k in ks]
    imp = [W[k]["sc_imp"] for k in ks]
    scc = [W[k]["sc_clicks"] for k in ks]
    tk_res = [sum(v for s, v in W[k]["stores"].items() if s in TOKYO_STORES) for k in ks]
    kn_res = [sum(v for s, v in W[k]["stores"].items() if s not in TOKYO_STORES) for k in ks]

    last, prev = W[ks[-1]], (W[ks[-2]] if len(ks) > 1 else None)

    def d(cur, key):
        if not prev or prev[key] == 0:
            return '<span class="flat">—</span>'
        p = (cur - prev[key]) / prev[key] * 100
        cls = "up" if p >= 0 else "down"
        return f'<span class="{cls}">{"+" if p>=0 else ""}{p:.0f}%</span>'

    def card(title, val, key, unit=""):
        return (f'<div class="kpi"><p class="kpi-t">{title}</p>'
                f'<p class="kpi-v">{val:,}<small>{unit}</small></p>'
                f'<p class="kpi-d">前週比 {d(val, key)}</p></div>')

    total_res = sum(res)
    store_tot = {}
    for k in ks:
        for s, v in W[k]["stores"].items():
            store_tot[s] = store_tot.get(s, 0) + v
    ch_tot = {}
    for k in ks:
        for cname, v in W[k]["channels"].items():
            ch_tot[cname] = ch_tot.get(cname, 0) + v

    rows = []
    for k in reversed(ks):
        w = W[k]
        e = date.fromisoformat(k) + timedelta(days=6)
        cvr = w["reserve"] / w["sessions"] * 100 if w["sessions"] else 0
        rows.append(
            f"<tr><td>{k}〜{e.strftime('%m/%d')}</td><td>{w['users']:,}</td>"
            f"<td>{w['sessions']:,}</td><td>{w['reserve']:,}</td><td>{cvr:.1f}%</td>"
            f"<td>{w['line']:,}</td><td>{w['tokyo']:,}</td><td>{w['kansai']:,}</td>"
            f"<td>{w['lp']:,}</td><td>{w['sc_imp']:,}</td><td>{w['sc_clicks']:,}</td></tr>")

    return f"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>JoaGOLF STUDIO Web ダッシュボード</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{{--pink:#cc217f;--navy:#0F182B;--gold:#B08D4F;--line:#e6e6ea;--sub:#6b6b76}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:"Outfit","Noto Sans JP",sans-serif;background:#f6f6f8;color:#1a1a1a;
 line-height:1.8;font-feature-settings:"palt";-webkit-font-smoothing:antialiased}}
.wrap{{max-width:1180px;margin:0 auto;padding:28px 20px 60px}}
header{{margin-bottom:26px}}
h1{{font-size:23px;font-weight:700;letter-spacing:.02em}}
.meta{{font-size:13px;color:var(--sub);margin-top:4px}}
h2{{font-size:16px;font-weight:700;margin:34px 0 12px;padding-left:11px;
 border-left:4px solid var(--pink)}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px}}
.kpi{{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px}}
.kpi-t{{font-size:12px;color:var(--sub);font-weight:500}}
.kpi-v{{font-size:27px;font-weight:700;line-height:1.25;letter-spacing:-.01em}}
.kpi-v small{{font-size:13px;font-weight:500;color:var(--sub);margin-left:2px}}
.kpi-d{{font-size:12px;color:var(--sub)}}
.up{{color:#12855b;font-weight:700}} .down{{color:#c8324f;font-weight:700}} .flat{{color:var(--sub)}}
.card{{background:#fff;border:1px solid var(--line);border-radius:12px;padding:18px 20px 12px;margin-bottom:14px}}
.card h3{{font-size:14px;font-weight:700;margin-bottom:4px}}
.card p.note{{font-size:12px;color:var(--sub);margin-bottom:8px}}
.legend{{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin-bottom:6px}}
.legend i{{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px}}
.scroll{{overflow-x:auto}}
.chart{{width:100%;height:auto;display:block}}
.grid{{stroke:#ececed;stroke-width:1}}
.ylab{{font-size:9px;fill:#9a9aa2;text-anchor:end}}
.xlab{{font-size:9.5px;fill:#8a8a94;text-anchor:middle}}
.two{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
@media(max-width:860px){{.two{{grid-template-columns:1fr}}}}
.bars{{margin-top:6px}}
.bar-row{{display:grid;grid-template-columns:112px 1fr 52px;align-items:center;gap:10px;margin-bottom:7px;font-size:13px}}
.bar-name{{font-weight:500}}
.bar-track{{background:#f0f0f3;border-radius:99px;height:9px;overflow:hidden}}
.bar-fill{{display:block;height:100%;border-radius:99px}}
.bar-val{{text-align:right;font-weight:700;font-size:12.5px}}
table{{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff}}
th,td{{padding:8px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}}
th{{background:#fafafb;font-weight:600;color:var(--sub);font-size:11.5px;position:sticky;top:0}}
td:first-child,th:first-child{{text-align:left;font-weight:600}}
</style></head><body><div class="wrap">
<header>
  <h1>JoaGOLF STUDIO ／ Web週次ダッシュボード</h1>
  <p class="meta">対象期間 2026-06-21（公開日）〜 {ks[-1]}週　｜　全{len(ks)}週　｜　更新 {date.today()}<br>
  <span style="font-size:12px">※ 集計が終わった週のみ表示（進行中の週は含みません）。最初の週は公開日6/21の1日分です。</span></p>
</header>

<h2>直近週のサマリー（{ks[-1]} の週）</h2>
<div class="kpis">
  {card("訪問者数", last["users"], "users")}
  {card("セッション", last["sessions"], "sessions")}
  {card("体験予約クリック", last["reserve"], "reserve")}
  {card("LINE友だち追加", last["line"], "line")}
  {card("東京エリア", last["tokyo"], "tokyo")}
  {card("関西エリア", last["kansai"], "kansai")}
</div>

<h2>アクセスの推移</h2>
<div class="card">
  <div class="legend"><span><i style="background:#cc217f"></i>訪問者</span><span><i style="background:#0F182B"></i>セッション</span></div>
  <div class="scroll">{line_chart(labels, [("訪問者", users, "#cc217f"), ("セッション", sess, "#0F182B")])}</div>
</div>

<div class="two">
  <div class="card">
    <h3>東京 vs 関西（訪問セッション）</h3>
    <p class="note">キャンペーンの主戦場である東京が伸びているか</p>
    <div class="legend"><span><i style="background:#cc217f"></i>東京</span><span><i style="background:#4a9fd8"></i>関西</span></div>
    <div class="scroll">{line_chart(labels, [("東京", tk, "#cc217f"), ("関西", kn, "#4a9fd8")])}</div>
  </div>
  <div class="card">
    <h3>体験予約クリック（東京 vs 関西）</h3>
    <p class="note">サイトが送客できた数</p>
    <div class="legend"><span><i style="background:#cc217f"></i>東京4店舗</span><span><i style="background:#4a9fd8"></i>関西3店舗</span></div>
    <div class="scroll">{line_chart(labels, [("東京", tk_res, "#cc217f"), ("関西", kn_res, "#4a9fd8")])}</div>
  </div>
</div>

<div class="two">
  <div class="card">
    <h3>検索での見え方（Search Console）</h3>
    <div class="legend"><span><i style="background:#B08D4F"></i>表示回数</span><span><i style="background:#0F182B"></i>クリック</span></div>
    <div class="scroll">{line_chart(labels, [("表示", imp, "#B08D4F"), ("クリック", scc, "#0F182B")])}</div>
  </div>
  <div class="card">
    <h3>キャンペーンLP・LINE</h3>
    <div class="legend"><span><i style="background:#06c755"></i>LINE友だち追加</span></div>
    <div class="scroll">{line_chart(labels, [("LINE", line, "#06c755")])}</div>
  </div>
</div>

<h2>累計（公開〜現在）</h2>
<div class="two">
  <div class="card"><h3>店舗別 体験予約クリック</h3>
    {bars(sorted(store_tot.items(), key=lambda x: -x[1]))}</div>
  <div class="card"><h3>流入チャネル</h3>
    {bars(sorted(ch_tot.items(), key=lambda x: -x[1])[:7], "#0F182B")}</div>
</div>

<h2>全週データ</h2>
<div class="card scroll" style="padding:0">
<table>
<thead><tr><th>週</th><th>訪問者</th><th>セッション</th><th>予約クリック</th><th>CVR</th>
<th>LINE</th><th>東京</th><th>関西</th><th>LP閲覧</th><th>検索表示</th><th>検索クリック</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table></div>

<p class="meta" style="margin-top:22px">
累計 体験予約クリック <b>{total_res:,}件</b>／
Googleマップ（MEO）の数字は週報の手入力欄をご覧ください。
</p>
</div></body></html>"""


def main():
    c = creds()
    print("データ取得中…")
    W = fetch(c)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "history.json"), "w", encoding="utf-8") as f:
        json.dump(W, f, ensure_ascii=False, indent=1)
    html = render(W)
    path = os.path.join(OUT_DIR, "dashboard.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"出力: {path}（{len(W)}週分）")


if __name__ == "__main__":
    main()

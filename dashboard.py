#!/usr/bin/env python3
"""JoaGOLF STUDIO Web ダッシュボード v2（対話型）

公開日(2026-06-21)以降の全データを取得し、タブ切替・指標切替・店舗切替が
できる1枚のHTMLを生成する。外部ライブラリ不要の自己完結ページ。

使い方: python3 dashboard.py
出力  : _reports/dashboard.html と dashboard/index.html（社内公開用）
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
STORE_PAGES = {"/store/kojimachi": "麹町店", "/store/nishi-shinjuku": "西新宿店",
               "/store/sendagaya": "千駄ヶ谷店", "/store/akasaka": "赤坂店",
               "/store/kobetorroad": "神戸トアロード店", "/store/kobe": "神戸店",
               "/store/minoh": "箕面店"}
TOKYO_STORES = ["麹町店", "西新宿店", "千駄ヶ谷店", "赤坂店"]
TOKYO_CITIES = ["Shinjuku", "Minato", "Chiyoda", "Shibuya", "Tokyo", "Chuo", "Setagaya",
                "Meguro", "Shinagawa", "Toshima", "Bunkyo", "Nakano", "Suginami",
                "Koto", "Ota", "Taito", "Sumida", "Kita", "Itabashi", "Nerima"]
KANSAI_CITIES = ["Osaka", "Kobe", "Minoh", "Mino", "Kyoto", "Nishinomiya", "Ashiya",
                 "Amagasaki", "Takarazuka", "Suita", "Toyonaka", "Sakai", "Himeji"]
AREA_WORDS = ["麹町", "西新宿", "千駄ヶ谷", "赤坂", "新宿", "半蔵門", "北参道", "渋谷",
              "神戸", "元町", "三宮", "トアロード", "箕面", "東京", "大阪"]
TOKYO_WORDS = ["麹町", "西新宿", "千駄ヶ谷", "赤坂", "新宿", "半蔵門", "北参道", "渋谷", "東京"]
CTA_MAP = {"cta-header": "ヘッダー", "cta-hero": "ファーストビュー", "cta-nav": "メニュー内",
           "cta-offer": "料金セクション", "cta-final": "最終CTA", "cta-sticky": "追従ボタン"}


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
    return (d - timedelta(days=d.weekday())).isoformat()


def to_date(s):
    return date(int(s[:4]), int(s[4:6]), int(s[6:]))


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
        return W.setdefault(wk, dict(
            users=0, sessions=0, newUsers=0, reserve=0, line=0, share=0,
            tokyo=0, kansai=0, lp=0, stores={}, storeViews={}, channels={},
            devices={}, sources={}, landings={}, pages={}, cta={},
            sc_imp=0, sc_clicks=0, sc_pos=0.0))

    print("  GA4: 基本指標…")
    for dt, u, s, n in run(["date"], ["activeUsers", "sessions", "newUsers"]):
        w = cell(week_key(to_date(dt)))
        w["users"] += u; w["sessions"] += s; w["newUsers"] += n

    print("  GA4: クリック…")
    for dt, url, lid, n in run(["date", "linkUrl", "linkId"], ["eventCount"],
                               contains("eventName", "click")):
        w = cell(week_key(to_date(dt)))
        if "page.line.me" in url:
            w["line"] += n
            name = CTA_MAP.get(lid)
            if name:
                w["cta"][name] = w["cta"].get(name, 0) + n
        elif "line.me" in url:
            w["share"] += n
        else:
            st = store_of(url)
            if st:
                w["reserve"] += n
                w["stores"][st] = w["stores"].get(st, 0) + n

    print("  GA4: 地域・チャネル・端末・参照元…")
    for dt, city, s in run(["date", "city"], ["sessions"]):
        w = cell(week_key(to_date(dt)))
        if any(x in city for x in TOKYO_CITIES):
            w["tokyo"] += s
        elif any(x in city for x in KANSAI_CITIES):
            w["kansai"] += s
    for dt, ch, s in run(["date", "sessionDefaultChannelGroup"], ["sessions"]):
        w = cell(week_key(to_date(dt)))
        w["channels"][ch] = w["channels"].get(ch, 0) + s
    for dt, dev, s in run(["date", "deviceCategory"], ["sessions"]):
        w = cell(week_key(to_date(dt)))
        w["devices"][dev] = w["devices"].get(dev, 0) + s
    for dt, src, s in run(["date", "sessionSource"], ["sessions"]):
        w = cell(week_key(to_date(dt)))
        w["sources"][src or "(直接)"] = w["sources"].get(src or "(直接)", 0) + s

    print("  GA4: ページ…")
    for dt, path, v in run(["date", "pagePath"], ["screenPageViews"]):
        w = cell(week_key(to_date(dt)))
        w["pages"][path] = w["pages"].get(path, 0) + v
        if "/campaign/" in path:
            w["lp"] += v
        for pref, name in STORE_PAGES.items():
            if path.startswith(pref):
                w["storeViews"][name] = w["storeViews"].get(name, 0) + v
                break
    for dt, lp_, s in run(["date", "landingPage"], ["sessions"]):
        w = cell(week_key(to_date(dt)))
        w["landings"][lp_ or "(不明)"] = w["landings"].get(lp_ or "(不明)", 0) + s

    print("  Search Console…")
    sc_queries, area_queries = [], []
    try:
        sc = build("searchconsole", "v1", credentials=c, cache_discovery=False)
        rows = sc.searchanalytics().query(siteUrl=SITE, body={
            "startDate": start, "endDate": end,
            "dimensions": ["date"], "rowLimit": 500}).execute().get("rows", [])
        acc = {}
        for r in rows:
            k = week_key(date.fromisoformat(r["keys"][0]))
            a = acc.setdefault(k, [0, 0, 0.0])
            a[0] += int(r["impressions"]); a[1] += int(r["clicks"])
            a[2] += r["position"] * r["impressions"]
        for k, a in acc.items():
            w = cell(k)
            w["sc_imp"], w["sc_clicks"] = a[0], a[1]
            w["sc_pos"] = round(a[2] / a[0], 1) if a[0] else 0

        qs = sc.searchanalytics().query(siteUrl=SITE, body={
            "startDate": start, "endDate": end,
            "dimensions": ["query"], "rowLimit": 400}).execute().get("rows", [])
        sc_queries = [{"q": r["keys"][0], "imp": int(r["impressions"]),
                       "clicks": int(r["clicks"]), "pos": round(r["position"], 1)}
                      for r in qs[:20]]
        area_queries = [{"q": r["keys"][0], "imp": int(r["impressions"]),
                         "clicks": int(r["clicks"]), "pos": round(r["position"], 1),
                         "tokyo": any(w_ in r["keys"][0] for w_ in TOKYO_WORDS)}
                        for r in qs if any(w_ in r["keys"][0] for w_ in AREA_WORDS)]
        area_queries.sort(key=lambda r: -r["imp"])
        area_queries = area_queries[:20]
    except Exception as e:
        print(f"  ※Search Console取得失敗: {e}", file=sys.stderr)

    # 完了週のみ・上位項目に絞ってサイズ削減
    yesterday = date.today() - timedelta(days=1)
    weeks = []
    for k in sorted(W):
        if date.fromisoformat(k) + timedelta(days=6) > yesterday:
            continue
        w = W[k]
        for key, top in [("pages", 10), ("sources", 8), ("landings", 8)]:
            w[key] = dict(sorted(w[key].items(), key=lambda x: -x[1])[:top])
        w["week"] = k
        weeks.append(w)
    return dict(weeks=weeks, scQueries=sc_queries, areaQueries=area_queries,
                updated=str(date.today()), launch=str(LAUNCH),
                tokyoStores=TOKYO_STORES,
                storeNames=list(STORE_PAGES.values()))


TEMPLATE = r"""<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow, noarchive">
<meta name="referrer" content="no-referrer">
<title>JoaGOLF STUDIO Web ダッシュボード</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{--pink:#cc217f;--navy:#0F182B;--gold:#B08D4F;--green:#06c755;--blue:#4a9fd8;
 --line:#e6e6ea;--sub:#6b6b76;--bg:#f6f6f8}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Outfit","Noto Sans JP",sans-serif;background:var(--bg);color:#1a1a1a;
 line-height:1.75;font-feature-settings:"palt";-webkit-font-smoothing:antialiased}
.wrap{max-width:1180px;margin:0 auto;padding:24px 18px 70px}
.confidential{display:inline-block;background:#fdeef4;color:var(--pink);font-size:11px;
 font-weight:700;letter-spacing:.1em;padding:3px 10px;border-radius:4px;margin-bottom:6px}
h1{font-size:22px;font-weight:700}
.meta{font-size:12.5px;color:var(--sub);margin-top:2px}
.tabs{display:flex;gap:6px;margin:20px 0 16px;overflow-x:auto;padding-bottom:4px;
 position:sticky;top:0;background:var(--bg);z-index:20;padding-top:6px}
.tab{flex:none;border:1px solid var(--line);background:#fff;border-radius:99px;
 padding:9px 20px;font-size:13.5px;font-weight:600;cursor:pointer;color:var(--sub);
 transition:.15s}
.tab:hover{border-color:var(--pink);color:var(--pink)}
.tab.on{background:var(--navy);border-color:var(--navy);color:#fff}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.kpi{background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px 16px;
 cursor:pointer;transition:.15s;position:relative}
.kpi:hover{border-color:var(--pink);transform:translateY(-2px)}
.kpi.on{border-color:var(--pink);box-shadow:0 0 0 2px #f9d4e6}
.kpi-t{font-size:11.5px;color:var(--sub);font-weight:500}
.kpi-v{font-size:25px;font-weight:700;line-height:1.3}
.kpi-v small{font-size:12px;color:var(--sub);font-weight:500;margin-left:2px}
.kpi-d{font-size:11.5px;color:var(--sub)}
.up{color:#12855b;font-weight:700}.down{color:#c8324f;font-weight:700}.flat{color:var(--sub)}
.card{background:#fff;border:1px solid var(--line);border-radius:12px;
 padding:16px 18px 12px;margin-bottom:12px}
.card h3{font-size:14px;font-weight:700;margin-bottom:2px}
.card .note{font-size:11.5px;color:var(--sub);margin-bottom:8px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 10px}
.chip{border:1px solid var(--line);background:#fff;border-radius:99px;padding:5px 14px;
 font-size:12px;font-weight:600;cursor:pointer;color:var(--sub);transition:.15s}
.chip:hover{border-color:var(--pink);color:var(--pink)}
.chip.on{background:var(--pink);border-color:var(--pink);color:#fff}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:860px){.two{grid-template-columns:1fr}}
.scroll{overflow-x:auto}
svg.chart{width:100%;height:auto;display:block}
.grid-l{stroke:#ececed;stroke-width:1}
.ylab{font-size:9px;fill:#9a9aa2;text-anchor:end}
.xlab{font-size:9.5px;fill:#8a8a94;text-anchor:middle}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;margin:2px 0 4px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px;vertical-align:-1px}
.bars{margin-top:4px}
.bar-row{display:grid;grid-template-columns:minmax(90px,150px) 1fr 54px;align-items:center;
 gap:9px;margin-bottom:6px;font-size:12.5px}
.bar-name{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{background:#f0f0f3;border-radius:99px;height:9px;overflow:hidden}
.bar-fill{display:block;height:100%;border-radius:99px;transition:width .4s}
.bar-val{text-align:right;font-weight:700;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12.5px;background:#fff}
th,td{padding:7px 9px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th{background:#fafafb;font-weight:600;color:var(--sub);font-size:11px;cursor:pointer;
 user-select:none;position:sticky;top:0}
th:hover{color:var(--pink)}
td:first-child,th:first-child{text-align:left;font-weight:600}
.warn{background:#fdf3f6}
.btn{display:inline-block;border:1px solid var(--line);background:#fff;border-radius:8px;
 padding:7px 16px;font-size:12.5px;font-weight:600;cursor:pointer;color:var(--sub)}
.btn:hover{border-color:var(--pink);color:var(--pink)}
#tip{position:fixed;pointer-events:none;background:var(--navy);color:#fff;font-size:12px;
 padding:6px 10px;border-radius:8px;opacity:0;transition:opacity .12s;z-index:99;
 white-space:nowrap;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.empty{color:var(--sub);font-size:13px;padding:8px 0}
.hint{font-size:11.5px;color:var(--sub);margin:6px 0 2px}
</style></head><body>
<div class="wrap">
  <span class="confidential">社外秘 ／ 関係者限定</span>
  <h1>JoaGOLF STUDIO ／ Web ダッシュボード</h1>
  <p class="meta">公開日 __LAUNCH__ 〜 ｜ 全__NWEEKS__週 ｜ 更新 __UPDATED__ ｜ 毎週月曜朝に自動更新</p>
  <div class="tabs" id="tabs"></div>
  <div id="view"></div>
</div>
<div id="tip"></div>
<script>
const D = __DATA__;
const W = D.weeks;
const COLORS = {pink:"#cc217f", navy:"#0F182B", gold:"#B08D4F", green:"#06c755",
  blue:"#4a9fd8", purple:"#8a63c9", orange:"#e08b3c", teal:"#2aa8a0"};
const CH_COLORS = ["#cc217f","#0F182B","#4a9fd8","#B08D4F","#8a63c9","#2aa8a0","#e08b3c"];
const METRICS = {
  users:{label:"訪問者数", color:COLORS.pink, f:w=>w.users},
  sessions:{label:"セッション", color:COLORS.navy, f:w=>w.sessions},
  reserve:{label:"体験予約クリック", color:COLORS.gold, f:w=>w.reserve},
  line:{label:"LINE友だち追加", color:COLORS.green, f:w=>w.line},
  cvr:{label:"予約クリック率(%)", color:COLORS.purple, f:w=>w.sessions?+(w.reserve/w.sessions*100).toFixed(1):0},
  lp:{label:"キャンペーンLP閲覧", color:COLORS.blue, f:w=>w.lp},
  sc_imp:{label:"検索表示回数", color:COLORS.teal, f:w=>w.sc_imp},
  sc_clicks:{label:"検索クリック", color:COLORS.orange, f:w=>w.sc_clicks},
};
const TABS = [["overview","概要"],["stores","店舗"],["traffic","集客チャネル"],
  ["search","検索"],["lp","キャンペーンLP"],["table","データ表"]];
let S = {tab:"overview", metric:"users", period:"all", store:"全店",
  sort:{key:"week", dir:-1}};

const $ = s => document.querySelector(s);
const fmt = n => (typeof n==="number") ? n.toLocaleString("ja-JP") : n;
const short = k => k.slice(5).replace("-","/");
function slice(){
  if(S.period==="all") return W;
  return W.slice(-parseInt(S.period));
}
function delta(cur, prev){
  if(prev===undefined||prev===null) return '<span class="flat">—</span>';
  if(prev===0) return cur===0?'<span class="flat">—</span>':'<span class="up">新規</span>';
  const p=(cur-prev)/prev*100, cls=p>=0?"up":"down";
  return `<span class="${cls}">${p>=0?"+":""}${p.toFixed(0)}%</span>`;
}

/* ---------- チャート ---------- */
function lineChart(labels, series, opts={}){
  const n=labels.length; if(n<2) return '<p class="empty">データが2週分たまると表示されます</p>';
  const H=opts.h||220, P=36, Wd=Math.max(560,n*64);
  const mx=Math.max(1,...series.flatMap(s=>s.vals));
  const x=i=>P+i*(Wd-P*2)/(n-1), y=v=>H-P-(v/mx)*(H-P*2);
  let o=`<svg viewBox="0 0 ${Wd} ${H}" class="chart">`;
  for(let g=0;g<5;g++){const gy=P+(H-P*2)*g/4;
    o+=`<line x1="${P}" y1="${gy}" x2="${Wd-P}" y2="${gy}" class="grid-l"/>`;
    o+=`<text x="${P-6}" y="${gy+3.5}" class="ylab">${fmt(Math.round(mx*(4-g)/4))}</text>`;}
  for(const s of series){
    const pts=s.vals.map((v,i)=>`${x(i)},${y(v)}`).join(" ");
    o+=`<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5"
        stroke-linejoin="round" stroke-linecap="round"/>`;
    s.vals.forEach((v,i)=>{o+=`<circle cx="${x(i)}" cy="${y(v)}" r="4.5" fill="${s.color}"
      data-tip="${s.label}｜${labels[i]}の週: ${fmt(v)}${opts.unit||""}"/>`;});}
  labels.forEach((l,i)=>{if(n<=13||i%2===0)o+=`<text x="${x(i)}" y="${H-9}" class="xlab">${short(l)}</text>`;});
  return o+"</svg>";
}
function hbars(items, color){
  if(!items.length) return '<p class="empty">データなし</p>';
  const mx=Math.max(...items.map(x=>x[1]),1);
  return '<div class="bars">'+items.map(([k,v])=>
    `<div class="bar-row"><span class="bar-name" title="${k}">${k}</span>
     <span class="bar-track"><span class="bar-fill" style="width:${v/mx*100}%;background:${color}"></span></span>
     <span class="bar-val">${fmt(v)}</span></div>`).join("")+"</div>";
}
function sum(rows, f){const m={};for(const w of rows){const d=f(w);for(const k in d)m[k]=(m[k]||0)+d[k];}
  return Object.entries(m).sort((a,b)=>b[1]-a[1]);}

/* ---------- タブ ---------- */
function chips(list, cur, attr){
  return `<div class="chips">`+list.map(([v,l])=>
    `<span class="chip ${v===cur?"on":""}" data-${attr}="${v}">${l}</span>`).join("")+`</div>`;
}
function periodChips(){
  return chips([["all","全期間"],["8","直近8週"],["4","直近4週"]], S.period, "period");
}

function vOverview(){
  const ws=slice(), last=W[W.length-1], prev=W[W.length-2]||{};
  const kpi=(key)=>{const m=METRICS[key],v=m.f(last),pv=prev.week?m.f(prev):undefined;
    return `<div class="kpi ${S.metric===key?"on":""}" data-metric="${key}">
      <p class="kpi-t">${m.label}</p><p class="kpi-v">${fmt(v)}</p>
      <p class="kpi-d">前週比 ${delta(v,pv)}</p></div>`;};
  const m=METRICS[S.metric];
  return `
  <div class="kpis">${Object.keys(METRICS).map(kpi).join("")}</div>
  <p class="hint">↑ カードをクリックするとグラフが切り替わります（直近週: ${last.week}〜）</p>
  <div class="card">
    <h3>${m.label} の推移</h3>${periodChips()}
    <div class="scroll">${lineChart(ws.map(w=>w.week),[{label:m.label,vals:ws.map(m.f),color:m.color}],
      {unit:S.metric==="cvr"?"%":""})}</div>
  </div>
  <div class="two">
    <div class="card"><h3>東京 vs 関西（セッション）</h3>
      <p class="note">キャンペーンの主戦場・東京が伸びているか</p>
      <div class="legend"><span><i style="background:${COLORS.pink}"></i>東京</span><span><i style="background:${COLORS.blue}"></i>関西</span></div>
      <div class="scroll">${lineChart(ws.map(w=>w.week),[
        {label:"東京",vals:ws.map(w=>w.tokyo),color:COLORS.pink},
        {label:"関西",vals:ws.map(w=>w.kansai),color:COLORS.blue}])}</div></div>
    <div class="card"><h3>体験予約クリック（東京4店 vs 関西3店）</h3>
      <p class="note">サイトが送客できた数</p>
      <div class="legend"><span><i style="background:${COLORS.pink}"></i>東京4店舗</span><span><i style="background:${COLORS.blue}"></i>関西3店舗</span></div>
      <div class="scroll">${lineChart(ws.map(w=>w.week),[
        {label:"東京4店舗",vals:ws.map(w=>D.tokyoStores.reduce((a,s)=>a+(w.stores[s]||0),0)),color:COLORS.pink},
        {label:"関西3店舗",vals:ws.map(w=>Object.entries(w.stores).reduce((a,[s,v])=>a+(D.tokyoStores.includes(s)?0:v),0)),color:COLORS.blue}])}</div></div>
  </div>`;
}

function vStores(){
  const ws=slice();
  const names=["全店",...D.storeNames];
  const get=(w,f)=>S.store==="全店"
    ? Object.values(f(w)).reduce((a,b)=>a+b,0) : (f(w)[S.store]||0);
  const rows=D.storeNames.map(nm=>{
    const v=W.reduce((a,w)=>a+(w.storeViews[nm]||0),0);
    const c=W.reduce((a,w)=>a+(w.stores[nm]||0),0);
    const lw=W[W.length-1];
    return {nm,v,c,cvr:v?+(c/v*100).toFixed(1):0,lv:lw.storeViews[nm]||0,lc:lw.stores[nm]||0,
      tokyo:D.tokyoStores.includes(nm)};});
  rows.sort((a,b)=>b.v-a.v);
  return `
  <div class="card"><h3>店舗を選ぶ</h3>
    ${chips(names.map(n=>[n,n+(D.tokyoStores.includes(n)?" ★":"")]),S.store,"store")}
    <div class="legend"><span><i style="background:${COLORS.navy}"></i>店舗ページ閲覧</span><span><i style="background:${COLORS.gold}"></i>予約クリック</span></div>
    ${periodChips()}
    <div class="scroll">${lineChart(ws.map(w=>w.week),[
      {label:"閲覧",vals:ws.map(w=>get(w,x=>x.storeViews)),color:COLORS.navy},
      {label:"予約クリック",vals:ws.map(w=>get(w,x=>x.stores)),color:COLORS.gold}])}</div>
  </div>
  <div class="card"><h3>店舗別の累計成績（公開〜現在）</h3>
    <p class="note">★=キャンペーン対象の東京4店舗 ／ 行クリックでグラフを切替</p>
    <div class="scroll"><table><thead><tr><th>店舗</th><th>ページ閲覧</th><th>予約クリック</th>
    <th>転換率</th><th>直近週の閲覧</th><th>直近週のクリック</th></tr></thead><tbody>
    ${rows.map(r=>`<tr data-store="${r.nm}" style="cursor:pointer" class="${r.v>=30&&r.c===0?"warn":""}">
      <td>${r.nm}${r.tokyo?" ★":""}</td><td>${fmt(r.v)}</td><td>${fmt(r.c)}</td>
      <td>${r.cvr}%</td><td>${fmt(r.lv)}</td><td>${fmt(r.lc)}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="hint">薄ピンクの行 = 閲覧はあるのに予約クリック0（改善の優先候補）</p>
  </div>`;
}

function vTraffic(){
  const ws=slice();
  const chTot=sum(W,w=>w.channels), top=chTot.slice(0,5).map(x=>x[0]);
  const series=top.map((c,i)=>({label:c,vals:ws.map(w=>w.channels[c]||0),color:CH_COLORS[i%CH_COLORS.length]}));
  const devTot=sum(W,w=>w.devices);
  const devJp={mobile:"スマホ",desktop:"PC",tablet:"タブレット"};
  const lw=W[W.length-1];
  return `
  <div class="card"><h3>流入チャネルの推移</h3>
    <div class="legend">${top.map((c,i)=>`<span><i style="background:${CH_COLORS[i%CH_COLORS.length]}"></i>${c}</span>`).join("")}</div>
    ${periodChips()}
    <div class="scroll">${lineChart(ws.map(w=>w.week),series)}</div></div>
  <div class="two">
    <div class="card"><h3>チャネル別 累計</h3>${hbars(chTot.slice(0,7),COLORS.navy)}</div>
    <div class="card"><h3>参照元 累計（上位）</h3>${hbars(sum(W,w=>w.sources).slice(0,8),COLORS.pink)}</div>
  </div>
  <div class="two">
    <div class="card"><h3>端末（累計）</h3>${hbars(devTot.map(([k,v])=>[devJp[k]||k,v]),COLORS.gold)}
      <p class="hint">直近週のスマホ比率:
      ${(()=>{const t=Object.values(lw.devices).reduce((a,b)=>a+b,0);
        return t?Math.round((lw.devices.mobile||0)/t*100):0})()}%</p></div>
    <div class="card"><h3>最初に着地したページ（累計）</h3>${hbars(sum(W,w=>w.landings).slice(0,8),COLORS.teal)}</div>
  </div>
  <div class="card"><h3>よく見られたページ（累計）</h3>${hbars(sum(W,w=>w.pages).slice(0,10),COLORS.purple)}</div>`;
}

function vSearch(){
  const ws=slice();
  const tkCount=D.areaQueries.filter(q=>q.tokyo).length;
  const qtable=(rows,warn)=>rows.length?`<div class="scroll"><table><thead><tr>
    <th>検索キーワード</th><th>表示</th><th>クリック</th><th>平均順位</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="${warn&&r.tokyo?"warn":""}"><td>${r.q}${r.tokyo?" 🗼":""}</td>
    <td>${fmt(r.imp)}</td><td>${fmt(r.clicks)}</td><td>${r.pos}</td></tr>`).join("")}
    </tbody></table></div>`:'<p class="empty">データなし</p>';
  return `
  <div class="card"><h3>検索での表示回数・クリックの推移</h3>
    <div class="legend"><span><i style="background:${COLORS.teal}"></i>表示回数</span><span><i style="background:${COLORS.orange}"></i>クリック</span></div>
    ${periodChips()}
    <div class="scroll">${lineChart(ws.map(w=>w.week),[
      {label:"表示回数",vals:ws.map(w=>w.sc_imp),color:COLORS.teal},
      {label:"クリック",vals:ws.map(w=>w.sc_clicks),color:COLORS.orange}])}</div></div>
  <div class="card"><h3>平均掲載順位の推移（下がるほど良い）</h3>
    <div class="scroll">${lineChart(ws.map(w=>w.week),[
      {label:"平均順位",vals:ws.map(w=>w.sc_pos),color:COLORS.navy}],{h:170,unit:"位"})}</div></div>
  <div class="two">
    <div class="card"><h3>検索キーワード 上位（累計）</h3>${qtable(D.scQueries.slice(0,15),false)}</div>
    <div class="card"><h3>地域キーワード（MEO指標）</h3>
      <p class="note">🗼=東京エリア（現在 ${tkCount}種）${tkCount<5?" ─ 東京のローカル検索での露出が課題":""}</p>
      ${qtable(D.areaQueries.slice(0,15),true)}</div>
  </div>`;
}

function vLp(){
  const ws=slice();
  const ctaTot=sum(W,w=>w.cta);
  const lpTotal=W.reduce((a,w)=>a+w.lp,0), lineTotal=W.reduce((a,w)=>a+w.line,0);
  return `
  <div class="kpis">
    <div class="kpi"><p class="kpi-t">LP閲覧（累計）</p><p class="kpi-v">${fmt(lpTotal)}</p></div>
    <div class="kpi"><p class="kpi-t">LINE友だち追加クリック（累計）</p><p class="kpi-v">${fmt(lineTotal)}</p></div>
    <div class="kpi"><p class="kpi-t">LP→LINE転換率</p><p class="kpi-v">${lpTotal?(lineTotal/lpTotal*100).toFixed(1):0}<small>%</small></p></div>
  </div>
  <div class="card"><h3>LP閲覧とLINE友だち追加の推移</h3>
    <p class="note">LPは2026-08-18公開。計測もその日からです</p>
    <div class="legend"><span><i style="background:${COLORS.blue}"></i>LP閲覧</span><span><i style="background:${COLORS.green}"></i>LINE友だち追加</span></div>
    ${periodChips()}
    <div class="scroll">${lineChart(ws.map(w=>w.week),[
      {label:"LP閲覧",vals:ws.map(w=>w.lp),color:COLORS.blue},
      {label:"LINE追加",vals:ws.map(w=>w.line),color:COLORS.green}])}</div></div>
  <div class="card"><h3>LINEボタンが押された場所（累計）</h3>
    ${ctaTot.length?hbars(ctaTot,COLORS.green):'<p class="empty">まだクリックがありません。データが入ると、LP内のどのボタンが効いているかが表示されます</p>'}</div>`;
}

function vTable(){
  const cols=[["week","週"],["users","訪問者"],["sessions","セッション"],["reserve","予約クリック"],
    ["cvr","CVR%"],["line","LINE"],["tokyo","東京"],["kansai","関西"],["lp","LP閲覧"],
    ["sc_imp","検索表示"],["sc_clicks","検索クリック"],["sc_pos","平均順位"]];
  const rows=W.map(w=>({...w,cvr:w.sessions?+(w.reserve/w.sessions*100).toFixed(1):0}));
  rows.sort((a,b)=>{const k=S.sort.key,d=S.sort.dir;
    return (a[k]>b[k]?1:a[k]<b[k]?-1:0)*d;});
  return `
  <div class="card"><h3>全週データ</h3>
    <p class="note">列見出しをクリックすると並び替え ／ CSVで会議資料にも使えます</p>
    <p style="margin-bottom:8px"><span class="btn" id="csv">CSVをダウンロード</span></p>
    <div class="scroll"><table><thead><tr>
      ${cols.map(([k,l])=>`<th data-sort="${k}">${l}${S.sort.key===k?(S.sort.dir>0?" ▲":" ▼"):""}</th>`).join("")}
    </tr></thead><tbody>
      ${rows.map(w=>`<tr><td>${w.week}</td>${cols.slice(1).map(([k])=>`<td>${fmt(w[k])}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div></div>`;
}

const VIEWS={overview:vOverview,stores:vStores,traffic:vTraffic,search:vSearch,lp:vLp,table:vTable};
function render(){
  $("#tabs").innerHTML=TABS.map(([k,l])=>`<span class="tab ${S.tab===k?"on":""}" data-tab="${k}">${l}</span>`).join("");
  $("#view").innerHTML=VIEWS[S.tab]();
}
document.addEventListener("click",e=>{
  const t=e.target.closest("[data-tab],[data-metric],[data-period],[data-store],[data-sort],#csv,tr[data-store]");
  if(!t)return;
  if(t.dataset.tab){S.tab=t.dataset.tab;render();window.scrollTo({top:0});}
  else if(t.dataset.metric){S.metric=t.dataset.metric;S.tab="overview";render();}
  else if(t.dataset.period){S.period=t.dataset.period;render();}
  else if(t.dataset.store!==undefined&&t.dataset.store){S.store=t.dataset.store;S.tab="stores";render();}
  else if(t.dataset.sort){const k=t.dataset.sort;
    S.sort=S.sort.key===k?{key:k,dir:-S.sort.dir}:{key:k,dir:-1};render();}
  else if(t.id==="csv"){
    const cols=["week","users","sessions","reserve","line","tokyo","kansai","lp","sc_imp","sc_clicks","sc_pos"];
    const head="週,訪問者,セッション,予約クリック,LINE追加,東京,関西,LP閲覧,検索表示,検索クリック,平均順位";
    const csv=[head,...W.map(w=>cols.map(k=>w[k]).join(","))].join("\n");
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob(["﻿"+csv],{type:"text/csv"}));
    a.download="joagolf_web_weekly.csv";a.click();}
});
const tip=$("#tip");
document.addEventListener("mouseover",e=>{
  const c=e.target.closest("[data-tip]");
  if(c){tip.textContent=c.dataset.tip;tip.style.opacity=1;}
  else tip.style.opacity=0;});
document.addEventListener("mousemove",e=>{
  if(tip.style.opacity==="1"){
    tip.style.left=Math.min(e.clientX+14,window.innerWidth-tip.offsetWidth-8)+"px";
    tip.style.top=(e.clientY-36)+"px";}});
render();
</script></body></html>"""


def main():
    c = creds()
    print("データ取得中…")
    data = fetch(c)
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(os.path.join(OUT_DIR, "history.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    html = (TEMPLATE
            .replace("__DATA__", json.dumps(data, ensure_ascii=False))
            .replace("__UPDATED__", data["updated"])
            .replace("__LAUNCH__", data["launch"])
            .replace("__NWEEKS__", str(len(data["weeks"]))))
    path = os.path.join(OUT_DIR, "dashboard.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"出力: {path}（{len(data['weeks'])}週分）")
    pub_dir = os.path.join(BASE, "dashboard")
    if os.path.isdir(pub_dir):
        with open(os.path.join(pub_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(html)
        print(f"社内共有用も更新: {pub_dir}/index.html")


if __name__ == "__main__":
    main()

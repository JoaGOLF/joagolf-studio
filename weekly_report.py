#!/usr/bin/env python3
"""JoaGOLF STUDIO Web週報 自動生成スクリプト

GA4 と Search Console から先週分の数値を取得し、Markdown の週報を出力する。

使い方:
  python3 weekly_report.py              # 先週(月〜日)のレポートを生成
  python3 weekly_report.py --weeks-ago 2  # 2週前
  python3 weekly_report.py --check      # 接続テストのみ

認証: 本人のGoogleアカウント(OAuth)。初回のみブラウザで許可。
"""

import argparse
import os
import sys
import warnings
from datetime import date, timedelta

warnings.filterwarnings("ignore")

CONF_DIR = os.path.expanduser("~/.config/joagolf")
CLIENT_PATH = os.path.join(CONF_DIR, "oauth-client.json")   # OAuthクライアント(初回のみ必要)
TOKEN_PATH = os.path.join(CONF_DIR, "token.json")           # 発行された利用許可(自動生成)
SCOPES = ["https://www.googleapis.com/auth/analytics.readonly",
          "https://www.googleapis.com/auth/webmasters.readonly"]
GA4_PROPERTY = "541403482"
SC_SITE = "https://joagolfstudio.jp/"
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_reports")

LP_PATH = "/campaign/tokyo-a-3months/"

# 予約リンク → 店舗名
RESERVE_MAP = {
    "schedule/3/11": "麹町店", "schedule/4/12": "西新宿店",
    "schedule/2/6": "千駄ヶ谷店", "schedule/1/5": "赤坂店",
    "8171fa84": "神戸店", "schedule/26/70": "神戸トアロード店",
    "schedule/1/1": "箕面店",
}
# LP内ボタンのid → 設置場所
CTA_MAP = {
    "cta-header": "ヘッダー", "cta-hero": "ファーストビュー", "cta-nav": "メニュー内",
    "cta-offer": "料金セクション", "cta-final": "最終CTA", "cta-sticky": "追従ボタン",
}
# LPへの入口(参照元パス) → 名前
ENTRY_MAP = {
    "/": "トップページのカード", "/store/": "店舗一覧のカード",
    "/store/kojimachi/": "麹町店バナー", "/store/nishi-shinjuku/": "西新宿店バナー",
    "/store/sendagaya/": "千駄ヶ谷店バナー", "/store/akasaka/": "赤坂店バナー",
}


def creds():
    """OAuth(本人アカウント)で認証。初回だけブラウザで許可、以降は自動。"""
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow

    c = None
    if os.path.exists(TOKEN_PATH):
        c = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
    if c and c.valid:
        return c
    if c and c.expired and c.refresh_token:
        c.refresh(Request())
    else:
        if not os.path.exists(CLIENT_PATH):
            sys.exit(f"OAuthクライアントがありません: {CLIENT_PATH}\n"
                     "Google Cloudでデスクトップアプリの認証情報を作成し、"
                     "JSONをこのパスに置いてください。")
        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_PATH, SCOPES)
        c = flow.run_local_server(port=0, prompt="consent",
                                  authorization_prompt_message="ブラウザで許可してください: {url}",
                                  success_message="認証が完了しました。この画面を閉じてください。")
    os.makedirs(CONF_DIR, exist_ok=True)
    with open(TOKEN_PATH, "w") as f:
        f.write(c.to_json())
    os.chmod(TOKEN_PATH, 0o600)
    return c


def ga4_run(client, start, end, dims, mets, dim_filter=None, limit=25, order_by_metric=None):
    from google.analytics.data_v1beta.types import (
        DateRange, Dimension, Metric, RunReportRequest, OrderBy)
    req = RunReportRequest(
        property=f"properties/{GA4_PROPERTY}",
        date_ranges=[DateRange(start_date=start, end_date=end)],
        dimensions=[Dimension(name=d) for d in dims],
        metrics=[Metric(name=m) for m in mets],
        limit=limit,
    )
    if dim_filter is not None:
        req.dimension_filter = dim_filter
    if order_by_metric:
        req.order_bys = [OrderBy(metric=OrderBy.MetricOrderBy(metric_name=order_by_metric),
                                 desc=True)]
    resp = client.run_report(req)
    rows = []
    for r in resp.rows:
        rows.append([d.value for d in r.dimension_values] +
                    [int(float(m.value)) for m in r.metric_values])
    return rows


def contains_filter(field, value):
    from google.analytics.data_v1beta.types import Filter, FilterExpression
    return FilterExpression(filter=Filter(
        field_name=field,
        string_filter=Filter.StringFilter(
            match_type=Filter.StringFilter.MatchType.CONTAINS, value=value)))


def total(rows, idx=-1):
    return sum(r[idx] for r in rows)


def delta(now, prev):
    if prev == 0:
        return "—" if now == 0 else "新規"
    d = (now - prev) / prev * 100
    return f"{'+' if d >= 0 else ''}{d:.0f}%"


def label_for(value, mapping, default=None):
    """mappingに一致すれば名称を返す。一致しなければdefault(既定はNone)。"""
    for key, name in mapping.items():
        if key in value:
            return name
    return default


def build(start, end, pstart, pend):
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from googleapiclient.discovery import build as gbuild
    c = creds()
    ga = BetaAnalyticsDataClient(credentials=c, transport="rest")

    # ① サマリー
    cur = ga4_run(ga, start, end, [], ["activeUsers", "sessions", "newUsers"])
    pre = ga4_run(ga, pstart, pend, [], ["activeUsers", "sessions", "newUsers"])
    cur = cur[0] if cur else [0, 0, 0]
    pre = pre[0] if pre else [0, 0, 0]

    # ② 流入元
    ch = ga4_run(ga, start, end, ["sessionDefaultChannelGroup"], ["sessions"],
                 limit=10, order_by_metric="sessions")

    # ③ 外部クリック（予約・LINE）
    out = ga4_run(ga, start, end, ["linkUrl"], ["eventCount"],
                  dim_filter=contains_filter("eventName", "click"),
                  limit=100, order_by_metric="eventCount")
    reserve, line_clicks, share_clicks = {}, 0, 0
    for url, n in out:
        if "page.line.me" in url:          # LINE友だち追加(キャンペーンLP)
            line_clicks += n
        elif "line.me" in url:             # 診断結果のLINEシェア
            share_clicks += n
        else:
            name = label_for(url, RESERVE_MAP)
            if name:
                reserve[name] = reserve.get(name, 0) + n
    prev_out = ga4_run(ga, pstart, pend, ["linkUrl"], ["eventCount"],
                       dim_filter=contains_filter("eventName", "click"), limit=100)
    prev_reserve = sum(n for u, n in prev_out if label_for(u, RESERVE_MAP))
    prev_line = sum(n for u, n in prev_out if "page.line.me" in u)

    # ④ LP
    lp = ga4_run(ga, start, end, ["pagePath"], ["screenPageViews", "activeUsers"],
                 dim_filter=contains_filter("pagePath", LP_PATH), limit=5)
    lp_views = total(lp, 1) if lp else 0
    entries = ga4_run(ga, start, end, ["pageReferrer"], ["sessions"],
                      dim_filter=contains_filter("landingPagePlusQueryString", LP_PATH),
                      limit=20, order_by_metric="sessions")
    cta = ga4_run(ga, start, end, ["linkId"], ["eventCount"],
                  dim_filter=contains_filter("linkUrl", "page.line.me"),
                  limit=20, order_by_metric="eventCount")

    # ⑤ 人気ページ
    pages = ga4_run(ga, start, end, ["pagePath"], ["screenPageViews"],
                    limit=8, order_by_metric="screenPageViews")

    # ⑥ Search Console
    try:
        sc = gbuild("searchconsole", "v1", credentials=c, cache_discovery=False)
        q = sc.searchanalytics().query(siteUrl=SC_SITE, body={
            "startDate": start, "endDate": end,
            "dimensions": ["query"], "rowLimit": 10,
        }).execute().get("rows", [])
        sc_tot = sc.searchanalytics().query(siteUrl=SC_SITE, body={
            "startDate": start, "endDate": end, "rowLimit": 1,
        }).execute().get("rows", [])
    except Exception as e:
        q, sc_tot = [], []
        print(f"  ※Search Consoleの取得に失敗: {e}", file=sys.stderr)

    return dict(cur=cur, pre=pre, ch=ch, reserve=reserve, line=line_clicks,
                share=share_clicks,
                prev_reserve=prev_reserve, prev_line=prev_line, lp_views=lp_views,
                entries=entries, cta=cta, pages=pages, sc_q=q, sc_tot=sc_tot)


def render(d, start, end):
    L = []
    a = L.append
    a(f"# Web週報 {start} 〜 {end}\n")
    a("## ① サマリー\n")
    a("| 指標 | 今週 | 前週比 |")
    a("|---|---:|---:|")
    a(f"| 訪問者数 | {d['cur'][0]:,} | {delta(d['cur'][0], d['pre'][0])} |")
    a(f"| セッション | {d['cur'][1]:,} | {delta(d['cur'][1], d['pre'][1])} |")
    a(f"| 新規訪問者 | {d['cur'][2]:,} | {delta(d['cur'][2], d['pre'][2])} |")
    rsum = sum(d["reserve"].values())
    a(f"| **体験予約クリック** | **{rsum:,}** | {delta(rsum, d['prev_reserve'])} |")
    a(f"| **LINE友だち追加クリック** | **{d['line']:,}** | {delta(d['line'], d['prev_line'])} |")
    a(f"| 診断結果のLINEシェア | {d['share']:,} | — |")

    a("\n## ② 流入元\n")
    if d["ch"]:
        tot = total(d["ch"])
        a("| チャネル | セッション | 構成比 |")
        a("|---|---:|---:|")
        for name, n in d["ch"]:
            a(f"| {name} | {n:,} | {n/tot*100:.0f}% |")
    else:
        a("データなし")

    a("\n## ③ 店舗別の体験予約クリック\n")
    if d["reserve"]:
        a("| 店舗 | クリック数 |")
        a("|---|---:|")
        for name, n in sorted(d["reserve"].items(), key=lambda x: -x[1]):
            a(f"| {name} | {n:,} |")
    else:
        a("クリックなし")

    a("\n## ④ キャンペーンLP\n")
    a(f"- LP閲覧数: **{d['lp_views']:,}**")
    if d["entries"]:
        a("\n**LPへの入口別**\n")
        a("| 入口 | セッション |")
        a("|---|---:|")
        for ref, n in d["entries"][:8]:
            path = ref.replace("https://joagolfstudio.jp", "") or "(直接・不明)"
            a(f"| {label_for(path, ENTRY_MAP, default=path)} | {n:,} |")
    if d["cta"]:
        a("\n**LINEボタンの押された場所**\n")
        a("| 場所 | クリック |")
        a("|---|---:|")
        for lid, n in d["cta"]:
            a(f"| {CTA_MAP.get(lid, lid or '(その他)')} | {n:,} |")

    a("\n## ⑤ よく見られたページ\n")
    if d["pages"]:
        a("| ページ | 閲覧数 |")
        a("|---|---:|")
        for p, n in d["pages"]:
            a(f"| {p} | {n:,} |")

    a("\n## ⑥ 検索での見え方（Search Console）\n")
    if d["sc_tot"]:
        t = d["sc_tot"][0]
        a(f"- 表示回数 **{int(t.get('impressions',0)):,}** ／ クリック **{int(t.get('clicks',0)):,}** "
          f"／ 平均掲載順位 **{t.get('position',0):.1f}位**")
    if d["sc_q"]:
        a("\n| 検索キーワード | 表示 | クリック | 順位 |")
        a("|---|---:|---:|---:|")
        for r in d["sc_q"]:
            a(f"| {r['keys'][0]} | {int(r['impressions']):,} | {int(r['clicks']):,} | {r['position']:.1f} |")
    else:
        a("（データ取得なし）")

    a("\n---\n")
    a("## ⑦ 会議前に手入力する数値\n")
    a("| 項目 | 今週 | メモ |")
    a("|---|---:|---|")
    a("| LINE友だち追加数 |  | LINE公式アカウント管理画面 |")
    a("| 体験予約数（実数） |  | 予約システム |")
    a("| 入会数 |  |  |")
    a("\n## ⑧ 気づき・次のアクション\n")
    a("- \n- \n")
    return "\n".join(L)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--weeks-ago", type=int, default=1)
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    if args.check:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        ga = BetaAnalyticsDataClient(credentials=creds(), transport="rest")
        rows = ga4_run(ga, "7daysAgo", "yesterday", [], ["activeUsers"])
        print(f"GA4接続OK 直近7日の訪問者: {rows[0][0] if rows else 0}")
        return

    today = date.today()
    last_mon = today - timedelta(days=today.weekday() + 7 * args.weeks_ago)
    start, end = last_mon, last_mon + timedelta(days=6)
    pstart, pend = start - timedelta(days=7), end - timedelta(days=7)

    print(f"集計期間: {start} 〜 {end}")
    d = build(str(start), str(end), str(pstart), str(pend))
    md = render(d, start, end)

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"週報_{start}.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write(md)
    print(f"出力: {path}")


if __name__ == "__main__":
    main()

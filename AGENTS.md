# JoaGOLF STUDIO Website

JoaGOLF STUDIO の公式 Web サイト。

## 技術スタック

- HTML / CSS / JavaScript（静的サイト、フレームワークなし）

## デザイン

- テーマカラー: `#cc217f`（ピンク）
- サブカラー: 白
- フォント:
  - 英字: Outfit
  - 日本語: Noto Sans JP

## レスポンシブ ブレークポイント

| デバイス   | 幅          |
| ---------- | ----------- |
| PC         | 1025px 以上 |
| タブレット | 768–1024px  |
| スマホ     | 767px 以下  |

## UI ルール

- ハンバーガーメニュー: タブレット・スマホのみ表示（PC では非表示）
- ボタンホバー: `translateY(-3px)` で浮き上がり、色を濃くする

## ページ構成

- `index.html` — トップページ
- `concept/index.html` — コンセプト
- `store/index.html` — 店舗一覧
- `store/kobe/index.html` — 神戸店
- （他店舗ページは `store/<店舗名>/index.html` の形式で追加）

## ダッシュボード（社内向け・Basic認証の下）

`/dashboard/` 配下は社内専用。会員名を含むため `robots.txt` と `noindex` で検索避けしている。

| 場所 | 中身 | データ元 |
|---|---|---|
| `dashboard/` | Web集客の数字（GA・Search Console） | `dashboard.py` が `data.json` を生成 |
| `dashboard/kpi/` | 店舗運営の数字（稼働率・体験・入会・退会） | スプレッドシート「全店舗実績」から自動取得 |

### `dashboard/kpi/` の仕組み

```
スプレッドシート「全店舗実績」
    ↓ Apps Script（_docs/apps-script/Code.gs を貼り付け済み）が JSON で返す
    ↓ dashboard/kpi/sheet.php が読みに行き、2分キャッシュ
    ├→ api.php   … 画面へ渡す（app.js が集計してグラフを描く）
    └→ chat.php  … AI相談。同じ数字を Gemini に渡して質問に答える
```

**シートを直せば最大2分ほどで反映される。デプロイ不要。**

- 接続先URLと合言葉は `dashboard/kpi/config.php`（git 管理外・FTPには上がる）
- 読めなかったときは `data.js`（前回取り込んだ内容）で描画を続け、ヘッダーのバッジが
  「シートと連動中」→「取り込み済みの内容」に変わる。画面は白くならない
- Code.gs は列の位置ではなく**見出しの文字**を探して読むので、列を挿しても壊れない。
  ただし見出しの文言そのものを変えると読めなくなる

**AI相談（右下の「💬 AIに相談」）**

- `chat.php` が質問とシートの中身をまとめて Gemini に渡す。APIキーは `dashboard/config.php`
  のものを使い回す（`/dashboard/` の AI相談と同じキー。ブラウザには出ない）
- **会員の氏名と担当者名は送っていない。** 体験者一覧・退会者一覧の `name` と `owner` を
  落としてから渡している。数字の相談に氏名は要らないため
- レポート（印刷）には出ない。`body > *:not(#report)` で隠れる

**キャッシュ対策**

サーバーは CSS を30日・JS を7日キャッシュするよう返す。そのままだと直しても画面が古いままなので、
`deploy.py` が `index.html` の読み込み先に `?v=中身の印` を付ける。**CSS/JS を足したら
`deploy.py` の `STAMPED_PAGES` にも足すこと。**

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

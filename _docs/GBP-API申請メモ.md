# Googleビジネスプロフィール API 利用申請メモ

JoaGOLF STUDIO ／ 2026年8月作成
目的: Googleマップの数字（表示回数・ルート検索・電話タップ等）をWeb週報に自動取込する

---

## 事前チェック

- [ ] 申請に使うアカウントが **Googleビジネスプロフィールのオーナー or 管理者** であること
      → **info@joagolf.jp** がその権限を持っているか要確認（重要）
- [ ] Google Cloudプロジェクトがある … ✅ 作成済み

## 申請に必要な情報（コピペ用）

| 項目 | 値 |
|---|---|
| プロジェクト名 | joagolfstudio-web-report |
| プロジェクトID | `joagolfstudio-web-report` |
| **プロジェクト番号** | `458875622035` |
| 申請アカウント | info@joagolf.jp |
| 会社サイト | https://joagolfstudio.jp/ |
| 管理店舗数 | 7店舗 |

---

## 手順

### ステップ1: APIを有効化
Cloud Console → APIとサービス → ライブラリ で以下を「有効にする」

- [ ] Google My Business Account Management API
- [ ] Google My Business Business Information API
- [ ] Business Profile Performance API

### ステップ2: 申請フォームを送信
https://support.google.com/business/contact/api_default

- 種別は「**Application for Basic API Access**」を選択
- 上の表の情報を入力
- **必ず info@joagolf.jp（GBPのオーナー/管理者）から送信**

### ステップ3: 審査を待つ
**14日以内**に回答が来る。承認メールが届いたら本部（田畑）へ連絡。

---

## 申請理由（英語欄用・コピペ可）

```
We operate 7 indoor golf studios in Japan (JoaGOLF STUDIO) and manage all of
them on Google Business Profile. We want to use the Business Profile
Performance API to automatically collect weekly performance metrics
(impressions on Maps and Search, direction requests, call clicks, website
clicks) for each of our locations, and combine them with our website
analytics in an internal weekly report for our management meeting.

This is for internal reporting only. We will not display, resell or share the
data outside our company. Read-only access is sufficient.
```

---

## 承認後にやること（担当: Claude）

- OAuthに `business.manage` スコープを追加して再認証
- weekly_report.py / dashboard.py にマップ指標を自動取込
- 週報⑦の手入力欄を自動化に置き換え

## 承認までの運用

週報⑦の手入力欄に、Googleビジネスプロフィールの「パフォーマンス」画面から
週次の数字（マップ表示・検索表示・ルート検索・電話・サイト訪問）を転記する。

参考:
- 前提条件 https://developers.google.com/my-business/content/prereqs
- 申請方法 https://support.google.com/business/answer/6333473

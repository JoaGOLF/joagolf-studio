/**
 * JoaGOLF STUDIO 数値管理ダッシュボード - データ
 *
 * 出典: Google スプレッドシート「全店舗実績」
 * https://docs.google.com/spreadsheets/d/1fiC6eJcEziG0IDEshbaZRr9dIGfyXQO-CYALx9Od8Sw/edit
 *
 * ★このファイルは「予備」です。
 *   ふだんはスプレッドシートから直接読み込んで表示します（apps-script/ と worker/）。
 *   シートが読めなかったときに、真っ白にならないよう最後に取り込んだ内容を出すために残しています。
 *   なので、シートを更新するたびにここを直す必要はありません。
 *
 * 割合（稼働率・体験率・入会率）はこのファイルには持たず、すべて画面側で計算します。
 */

export const META = {
  sourceUrl:
    'https://docs.google.com/spreadsheets/d/1fiC6eJcEziG0IDEshbaZRr9dIGfyXQO-CYALx9Od8Sw/edit',
  // シートから読み取った時点
  snapshotDate: '2026-09-07',
};

/** 店舗（表示順・色スロット順） */
export const STORES = [
  { id: 'kobe', name: '神戸', slot: 1 },
  { id: 'mino', name: '箕面', slot: 2 },
  { id: 'tor', name: 'トアロード', slot: 3 },
  { id: 'tokyo', name: '東京', slot: 4 },
];

/** 週ラベル（シートの行順） */
export const WEEKS = [
  '6/16-22',
  '6/23-29',
  '6/30-7/6',
  '7/7-13',
  '7/14-20',
  '7/21-27',
  '7/28-8/3',
  '8/4-10',
  '8/11-17',
  '8/18-24',
  '8/25-31',
  '9/1-7',
];

/**
 * 週次実績。WEEKS と同じ並び。
 * [レッスン枠, レッスン数, 体験数, 体験入会数]
 * null = シートが空欄（記録なし）。0 は「0件と記録されている」。
 */
export const WEEKLY = {
  kobe: [
    null,
    null,
    null,
    null,
    null,
    null,
    [39, 24, 4, 2],
    [29, 14, 1, 1],
    [18, 9, 2, 2],
    [36, 24, 4, 2],
    [28, 17, 2, 1],
    [37, 22, 4, 4],
  ],
  mino: [
    null,
    [69, 37, 4, 0],
    [42, 21, 3, 3],
    [72, 35, 1, 0],
    [75, 23, 1, 1],
    [72, 29, 2, 0],
    [51, 21, 4, 3],
    [75, 29, 3, 3],
    [84, 41, 5, 4],
    [63, 42, 2, 1],
    [21, 14, 0, 0],
    [27, 19, 3, 1],
  ],
  tor: [
    null,
    null,
    null,
    null,
    null,
    null,
    [42, 13, 0, 0],
    [44, 15, 1, 0],
    [44, 18, 0, 0],
    [20, 8, 0, 0],
    [20, 12, 1, 1],
    [10, 0, 0, 0],
  ],
  tokyo: [
    null,
    null,
    null,
    null,
    null,
    null,
    [6, 3, 0, 0],
    [5, 3, 0, 0],
    null,
    [9, 8, 2, 0],
    [6, 5, 1, 0],
    [10, 9, 2, 1],
  ],
};

/**
 * 体験レッスンに来た方の一覧。
 * plan: 入会したプラン。'未入会' は入会に至らなかった方。'' はシート空欄（未確定）。
 * note: シートの備考をそのまま。流入経路（HP・インスタ等）は、この文章から画面側で分類します。
 */
export const TRIALS = [
  // ---- 神戸 ----
  { store: 'kobe', date: '2026-07-29', name: '森', plan: '未入会', note: '未対応' },
  { store: 'kobe', date: '2026-07-30', name: '脇本', plan: '未入会', note: '富田さんの紹介' },
  { store: 'kobe', date: '2026-07-31', name: '釜尾', plan: '短期集中', note: 'HP' },
  { store: 'kobe', date: '2026-08-01', name: 'ニシジマ', plan: '4times', note: '西島萌杏さんの紹介' },
  { store: 'kobe', date: '2026-08-08', name: '豊嶋', plan: '4times', note: 'SNS広告' },
  { store: 'kobe', date: '2026-08-13', name: '三宅', plan: '4times', note: 'googleマップ' },
  { store: 'kobe', date: '2026-08-14', name: '西川', plan: 'レディス', note: 'その他' },
  { store: 'kobe', date: '2026-08-18', name: '溝橋', plan: '4times', note: 'HP' },
  { store: 'kobe', date: '2026-08-18', name: '小川', plan: 'スポット', note: 'HP' },
  { store: 'kobe', date: '2026-08-22', name: '大越', plan: '未入会', note: '入力なし' },
  { store: 'kobe', date: '2026-08-22', name: '木下', plan: 'レディス', note: 'その他' },
  { store: 'kobe', date: '2026-08-25', name: '吉村', plan: '4times', note: 'その他' },
  { store: 'kobe', date: '2026-08-27', name: '井上', plan: '未入会', note: '入力なし' },
  { store: 'kobe', date: '2026-09-01', name: '中村健斗', plan: '4times', note: 'HP' },
  { store: 'kobe', date: '2026-09-03', name: '杉原荒太', plan: '4times', note: 'HP .googlemap,インスタ' },
  { store: 'kobe', date: '2026-09-03', name: '宮北英心', plan: '短期集中', note: 'HP' },
  { store: 'kobe', date: '2026-09-05', name: '岡本　親羅', plan: '短期集中', note: 'HP' },

  // ---- 箕面 ----
  { store: 'mino', date: '2026-06-17', name: '上田竜也', plan: '短期集中', note: '辰巳さん紹介' },
  { store: 'mino', date: '2026-06-17', name: '坪田光平', plan: '短期集中', note: '辰巳さん紹介' },
  { store: 'mino', date: '2026-06-17', name: '小林大輔', plan: 'スポット', note: '辰巳さん紹介' },
  { store: 'mino', date: '2026-06-17', name: '秋田久美子', plan: 'スポット', note: 'インスタ' },
  { store: 'mino', date: '2026-06-24', name: '佐々木', plan: '未入会', note: 'その他' },
  { store: 'mino', date: '2026-06-27', name: '足立', plan: 'スタンダード', note: 'インスタ' },
  { store: 'mino', date: '2026-06-27', name: '古川', plan: 'スポット', note: 'インスタ' },
  { store: 'mino', date: '2026-06-27', name: '山神', plan: 'スポット', note: 'インスタ' },
  { store: 'mino', date: '2026-07-04', name: '濱', plan: '短期集中', note: '紹介（お隣不動産から）' },
  { store: 'mino', date: '2026-07-04', name: '中長', plan: 'スタンダード', note: '紹介（お隣不動産から）' },
  { store: 'mino', date: '2026-07-04', name: '井上', plan: '短期集中', note: 'その他' },
  { store: 'mino', date: '2026-07-08', name: '柏木', plan: 'スポット', note: 'インスタ' },
  { store: 'mino', date: '2026-07-18', name: '木田（飛び込み）', plan: '短期集中', note: '飛び込み' },
  { store: 'mino', date: '2026-07-26', name: '紹介', plan: '未入会', note: '紹介' },
  { store: 'mino', date: '2026-07-26', name: '紹介ユズリハ様', plan: '未入会', note: '山口ひろしさんの紹介' },
  { store: 'mino', date: '2026-07-28', name: '盛', plan: 'スタンダード', note: 'インスタ' },
  { store: 'mino', date: '2026-08-01', name: '立川', plan: '未入会', note: 'SNS広告' },
  { store: 'mino', date: '2026-08-01', name: '玉村', plan: '短期集中', note: 'SNS広告' },
  { store: 'mino', date: '2026-08-01', name: '田中', plan: 'スタンダード', note: '内山さんの紹介' },
  { store: 'mino', date: '2026-08-05', name: '峯下', plan: 'スタンダード', note: '田中さんの紹介' },
  { store: 'mino', date: '2026-08-08', name: '遠藤', plan: 'スタンダード', note: '服部さんの紹介' },
  { store: 'mino', date: '2026-08-09', name: '大達', plan: '短期集中', note: 'Googleマップ' },
  { store: 'mino', date: '2026-08-11', name: '筒井', plan: '未入会', note: 'インスタ' },
  { store: 'mino', date: '2026-08-11', name: '竹村', plan: 'スタンダード', note: 'HP、インスタ' },
  { store: 'mino', date: '2026-08-12', name: '甘利', plan: 'スタンダード', note: 'HP、インスタ（中村彩夏を知っていての来店）' },
  { store: 'mino', date: '2026-08-12', name: 'キム', plan: 'スタンダード', note: 'HP' },
  { store: 'mino', date: '2026-08-12', name: '森田', plan: '短期集中', note: 'HP' },
  { store: 'mino', date: '2026-08-19', name: '高井', plan: '短期集中', note: 'HP' },
  { store: 'mino', date: '2026-08-22', name: '青島', plan: 'スポット', note: 'インスタ' },
  { store: 'mino', date: '2026-09-04', name: '吉田篤幸', plan: 'スポット', note: 'HP' },
  { store: 'mino', date: '2026-09-05', name: '藤定太輝', plan: 'スタンダード', note: 'google map' },
  { store: 'mino', date: '2026-09-05', name: '落合友香', plan: '未入会', note: 'HP' },

  // ---- トアロード ----
  { store: 'tor', date: '2026-08-05', name: '石原', plan: 'スポット', note: 'インスタ' },

  // ---- 東京 ----
  { store: 'tokyo', date: '2026-08-22', name: '掛本（西）', plan: '短期集中', note: 'Googleマップ' },
  { store: 'tokyo', date: '2026-08-22', name: '北岡（西）', plan: 'ゴールド', note: 'HP' },
  { store: 'tokyo', date: '2026-08-27', name: '宮入（千）', plan: 'ゴールド', note: 'HP' },
  { store: 'tokyo', date: '2026-08-30', name: '中山（千）', plan: 'ゴールド', note: 'HP' },
  { store: 'tokyo', date: '2026-09-06', name: '川村（西）', plan: '短期集中', note: 'HP' },
  { store: 'tokyo', date: '2026-09-06', name: '赤間', plan: '未入会', note: 'HP' },
  { store: 'tokyo', date: '2026-09-10', name: '安田（西）', plan: '', note: '' },
  { store: 'tokyo', date: '2026-09-19', name: 'まひろ（西）', plan: '', note: '' },
];

/**
 * 退会・休会の一覧。
 * kind: '退会' | '休会' | 'その他'（短期集中プラン満了などの扱い）
 * done: 対応完了なら true、未完了なら false、シート空欄なら null。
 */
export const CHURN = [
  // ---- 神戸 ----
  { store: 'kobe', date: '2026-07-31', name: '出口', plan: 'プレミアム', kind: '休会', owner: '西脇', done: true, reason: 'トアロードに移動（休会中の退会処理ができず退会処理完了できていない）要確認', flag: true },
  { store: 'kobe', date: '2026-07-31', name: '石川', plan: '4times', kind: '退会', owner: '西脇', done: true, reason: '' },
  { store: 'kobe', date: '2026-08-31', name: '花田', plan: '4times', kind: '退会', owner: '西脇', done: true, reason: '理由不明' },
  { store: 'kobe', date: '2026-08-31', name: '山下', plan: '4times', kind: '退会', owner: '西脇', done: true, reason: 'プライベートな理由でレッスンの日程が合わない' },
  { store: 'kobe', date: '2026-08-31', name: '富田', plan: '4times', kind: '退会', owner: '西脇', done: true, reason: '転勤' },
  { store: 'kobe', date: '2026-08-31', name: '富田', plan: '4times', kind: '退会', owner: '西脇', done: true, reason: '転勤', dupe: true },
  { store: 'kobe', date: '2026-08-31', name: '松下', plan: '4times', kind: '退会', owner: '西脇', done: true, reason: '通う時間がない' },
  { store: 'kobe', date: '2026-09-30', name: '石田京', plan: 'スポット', kind: '退会', owner: '西脇', done: true, reason: '転勤' },
  { store: 'kobe', date: '2026-09-30', name: '松尾', plan: 'レディス', kind: '退会', owner: '西脇', done: true, reason: '仕事が忙しい' },
  { store: 'kobe', date: '2026-09-30', name: '石田', plan: 'スポット', kind: '退会', owner: '西脇', done: true, reason: '県外転勤' },

  // ---- 箕面 ----
  { store: 'mino', date: '2026-07-31', name: '上月', plan: 'スタンダード', kind: '退会', owner: '', done: null, reason: 'レッスンの日程が合わないため' },
  { store: 'mino', date: '2026-07-31', name: '冨岡', plan: '短期集中', kind: 'その他', owner: '', done: null, reason: '短期集中プランの仕様（短期集中適応中プラン）' },
  { store: 'mino', date: '2026-07-31', name: '坪田', plan: '短期集中', kind: 'その他', owner: '', done: null, reason: '短期集中プランの仕様（短期集中適応中プラン）' },
  { store: 'mino', date: '2026-07-31', name: '上田', plan: '短期集中', kind: 'その他', owner: '', done: null, reason: '短期集中プランの仕様（短期集中適応中プラン）' },
  { store: 'mino', date: '2026-08-01', name: '湯浅', plan: 'スタンダード', kind: '休会', owner: '西脇', done: true, reason: '設備の不備（無期限休会扱いのためスポットに変更中）' },
  { store: 'mino', date: '2026-08-01', name: '吉田', plan: 'スタンダード', kind: '休会', owner: '西脇', done: true, reason: '私用' },
  { store: 'mino', date: '2026-08-31', name: '林原', plan: 'スタンダード', kind: '退会', owner: '西脇', done: true, reason: '木曜日のレッスンがない、仕事が忙しくなった' },
  { store: 'mino', date: '2026-08-31', name: '高井', plan: 'スタンダード', kind: '退会', owner: '西脇', done: true, reason: '' },
  { store: 'mino', date: '2026-08-31', name: '川口', plan: 'スタンダード', kind: '退会', owner: '橋口', done: true, reason: '持病' },
  { store: 'mino', date: '2026-08-31', name: '澄川', plan: 'スタンダード', kind: '退会', owner: '西脇', done: true, reason: '私的理由' },
  { store: 'mino', date: '2026-09-30', name: '上田', plan: '短期集中', kind: '退会', owner: '西脇', done: true, reason: '通い放題が終わるため' },
  { store: 'mino', date: '2026-09-30', name: '坪田', plan: '短期集中', kind: '退会', owner: '西脇', done: true, reason: '通い放題が終わるため' },
  { store: 'mino', date: '2026-09-30', name: '奥田', plan: 'スタンダード', kind: '退会', owner: '西脇', done: true, reason: '' },
  { store: 'mino', date: '2026-09-30', name: '金子', plan: 'スタンダード', kind: '休会', owner: '西脇', done: true, reason: '多忙' },
  { store: 'mino', date: '2026-09-30', name: '奥田', plan: 'スタンダード', kind: '退会', owner: '西脇', done: true, reason: '多忙', dupe: true },

  // ---- トアロード ----  （シートに記録なし）

  // ---- 東京 ----
  { store: 'tokyo', date: '2026-07-31', name: '長迫', plan: 'その他', kind: '退会', owner: 'ヒューペリオン', done: true, reason: '忙しくて通う頻度が減った' },
  { store: 'tokyo', date: '2026-08-31', name: '大野', plan: 'ゴールド', kind: '退会', owner: 'ヒューペリオン', done: true, reason: '転勤' },
  { store: 'tokyo', date: '2026-08-31', name: 'マーク', plan: 'その他', kind: '退会', owner: 'ヒューペリオン', done: true, reason: '日本にいない' },
  { store: 'tokyo', date: '2026-08-31', name: 'リン', plan: 'ゴールド', kind: '退会', owner: 'ヒューペリオン', done: false, reason: '9月再入会の可能性あり（退会が8月末になるため退会処理未）', flag: true },
];

/** 退会理由のざっくり分類（表示用） */
export function classifyReason(row) {
  const r = row.reason || '';
  if (/転勤|県外|日本にいない/.test(r)) return '転勤・転居';
  if (/忙|時間がない|多忙/.test(r)) return '多忙・時間が取れない';
  if (/日程|曜日|レッスンがない/.test(r)) return 'レッスン日程が合わない';
  if (/短期集中|通い放題/.test(r)) return 'プラン満了（短期集中）';
  if (/持病|設備|私用|私的/.test(r)) return '私的理由・その他事情';
  return '理由不明・未記入';
}

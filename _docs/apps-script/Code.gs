/**
 * JoaGOLF STUDIO 数値管理ダッシュボード — スプレッドシート読み取り
 *
 * このスクリプトはスプレッドシート「全店舗実績」に付属させて使います。
 * シートの中身を JSON にして返すだけで、書き込みは一切しません。
 *
 * ▼ 設置のしかた
 *   1. スプレッドシートを開く
 *   2. メニューの「拡張機能」→「Apps Script」
 *   3. 出てきたエディタの中身を全部消して、このファイルの内容を貼り付ける
 *   4. 下の TOKEN を、自分で決めた長い文字列に書き換える（合言葉。人に見せない）
 *   5. 右上の「デプロイ」→「新しいデプロイ」
 *        種類 = ウェブアプリ
 *        次のユーザーとして実行 = 自分
 *        アクセスできるユーザー = 全員
 *      →「デプロイ」を押して、表示される URL を控える
 *
 *   「アクセスできるユーザー = 全員」でも、下の TOKEN が合わないと中身は返しません。
 *   URL と TOKEN は サイト側の dashboard/kpi/config.php にだけ書くので、
 *   ページを見た人のブラウザには渡りません。
 *
 * ▼ スクリプトを直したあと
 *   「デプロイを管理」→ 鉛筆アイコン → バージョンを「新バージョン」にして
 *   デプロイし直さないと、直した内容は反映されません（URL は変わりません）。
 */

// ★ここを自分で決めた長い文字列に変えてください（例: 英数字30文字以上）
var TOKEN = 'ここを長いランダムな文字列に置き換える';

/** 店舗の表示名 → ダッシュボード内部で使うID */
var STORE_IDS = {
  '神戸': 'kobe',
  '箕面': 'mino',
  'トアロード': 'tor',
  '東京': 'tokyo',
};

/** 週次シートの見出し */
var WEEKLY_FIELDS = ['日付', 'レッスン枠', 'レッスン数', '体験数', '体験入会数'];

// ---------------------------------------------------------------------------

function doGet(e) {
  var params = (e && e.parameter) || {};

  if (params.token !== TOKEN) {
    return json({ error: 'forbidden' });
  }

  try {
    var data = buildPayload();
    if (params.debug === '1') data.debug = describeSheets();
    return json(data);
  } catch (err) {
    return json({ error: String(err && err.message ? err.message : err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// --- 共通の読み取り ---------------------------------------------------------

/** 値を文字列にして前後の空白を落とす */
function s(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isoDate(v);
  return String(v).replace(/　/g, ' ').trim();
}

/** 数値として読む。空欄なら null */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function isoDate(d) {
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * 週のラベルを読む。
 * 「4-10」「11-17」のような書き方は、Google が日付（4月10日・11月17日）として
 * 保存してしまう。ここは週の範囲＝「4日から10日」の意味なので、元の書き方に戻す。
 */
function weekLabel(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return v.getMonth() + 1 + '-' + v.getDate();
  }
  return String(v).replace(/　/g, ' ').trim();
}

/** 日付セルを yyyy-MM-dd にする。文字列で入っていても拾う */
function toIso(v) {
  if (v === null || v === undefined || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isoDate(v);
  var t = String(v).trim();
  var m = t.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  }
  return t;
}

/**
 * 見出し行から店舗のかたまりを見つける。
 * 結合セルは左上にしか値が入らないので、次の店舗名が出るまでを1つのかたまりとする。
 * → 列を挿しても壊れない。
 */
function findStoreBlocks(row) {
  var blocks = [];
  for (var c = 0; c < row.length; c++) {
    var name = s(row[c]);
    if (STORE_IDS[name]) {
      if (blocks.length) blocks[blocks.length - 1].end = c;
      blocks.push({ name: name, id: STORE_IDS[name], start: c, end: row.length });
    }
  }
  return blocks;
}

/** かたまりの中で、見出しの文字から列番号を引く表を作る */
function mapFields(fieldRow, block) {
  var map = {};
  for (var c = block.start; c < block.end; c++) {
    var label = s(fieldRow[c]);
    if (label && map[label] === undefined) map[label] = c;
  }
  return map;
}

/** 店舗名が入っている見出し行を、上から数行のうちから探す */
function findHeaderRows(values) {
  for (var r = 0; r < Math.min(values.length, 8); r++) {
    var blocks = findStoreBlocks(values[r]);
    if (blocks.length >= 2 && r + 1 < values.length) {
      return { storeRow: r, fieldRow: r + 1, blocks: blocks };
    }
  }
  return null;
}

/** そのシートが何のシートかを、見出しの文字から判定する */
function classifySheet(fieldRow) {
  var labels = fieldRow.map(s).join('|');
  if (labels.indexOf('レッスン枠') >= 0) return 'weekly';
  if (labels.indexOf('退会 or 休会') >= 0 || labels.indexOf('元々のプラン') >= 0) return 'churn';
  if (labels.indexOf('プラン') >= 0 && labels.indexOf('備考') >= 0) return 'trials';
  return null;
}

// --- 各シートの読み取り -----------------------------------------------------

function readWeekly(values, head, out) {
  var maps = head.blocks.map(function (b) {
    return { block: b, f: mapFields(values[head.fieldRow], b) };
  });

  // 必要な見出しが1つでも欠けていたら、黙って0件にせず警告を残す
  maps.forEach(function (m) {
    WEEKLY_FIELDS.forEach(function (name) {
      if (m.f[name] === undefined) {
        out.warnings.push('週次シート: ' + m.block.name + ' に見出し「' + name + '」が見つかりません');
      }
    });
  });

  for (var r = head.fieldRow + 1; r < values.length; r++) {
    var row = values[r];

    // 週のラベルは、記入がある最初の店舗のものを採用する
    var label = '';
    for (var i = 0; i < maps.length && !label; i++) {
      var dc = maps[i].f['日付'];
      if (dc !== undefined) label = weekLabel(row[dc]);
    }
    if (!label) continue;

    out.weeks.push(label);
    var wi = out.weeks.length - 1;

    maps.forEach(function (m) {
      var slots = num(row[m.f['レッスン枠']]);
      var lessons = num(row[m.f['レッスン数']]);
      if (slots === null && lessons === null) {
        out.weekly[m.block.id][wi] = null; // シートが空欄 = 記録なし
        return;
      }
      out.weekly[m.block.id][wi] = [
        slots === null ? 0 : slots,
        lessons === null ? 0 : lessons,
        num(row[m.f['体験数']]) || 0,
        num(row[m.f['体験入会数']]) || 0,
      ];
    });
  }
}

function readTrials(values, head, out) {
  head.blocks.forEach(function (b) {
    var f = mapFields(values[head.fieldRow], b);
    if (f['名前'] === undefined) {
      out.warnings.push('体験シート: ' + b.name + ' に見出し「名前」が見つかりません');
      return;
    }
    for (var r = head.fieldRow + 1; r < values.length; r++) {
      var row = values[r];
      var name = s(row[f['名前']]);
      var date = toIso(row[f['日付']]);
      if (!name && !date) continue; // 空行
      if (!name) continue; // 日付だけ入っている行はスキップ
      out.trials.push({
        store: b.id,
        date: date,
        name: name,
        plan: f['プラン'] === undefined ? '' : s(row[f['プラン']]),
        note: f['備考'] === undefined ? '' : s(row[f['備考']]),
      });
    }
  });
}

function readChurn(values, head, out) {
  head.blocks.forEach(function (b) {
    var f = mapFields(values[head.fieldRow], b);
    if (f['名前'] === undefined) {
      out.warnings.push('退会シート: ' + b.name + ' に見出し「名前」が見つかりません');
      return;
    }
    var kindCol = f['退会 or 休会'];
    for (var r = head.fieldRow + 1; r < values.length; r++) {
      var row = values[r];
      var name = s(row[f['名前']]);
      if (!name) continue;

      var rawKind = kindCol === undefined ? '' : s(row[kindCol]);
      var kind = rawKind.indexOf('休会') >= 0 ? '休会' : rawKind.indexOf('退会') >= 0 ? '退会' : 'その他';

      var rawDone = f['対応'] === undefined ? '' : s(row[f['対応']]);
      var done = rawDone === '' ? null : rawDone.indexOf('未') < 0;

      out.churn.push({
        store: b.id,
        date: toIso(row[f['日付']]),
        name: name,
        plan: f['元々のプラン'] === undefined ? '' : s(row[f['元々のプラン']]),
        kind: kind,
        rawKind: rawKind,
        owner: f['担当者'] === undefined ? '' : s(row[f['担当者']]),
        done: done,
        reason: f['備考'] === undefined ? '' : s(row[f['備考']]),
      });
    }
  });
}

// --- 組み立て ---------------------------------------------------------------

function buildPayload() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = {
    snapshotDate: isoDate(new Date()),
    spreadsheetName: ss.getName(),
    stores: [],
    weeks: [],
    weekly: {},
    trials: [],
    churn: [],
    warnings: [],
  };

  Object.keys(STORE_IDS).forEach(function (name) {
    out.stores.push({ id: STORE_IDS[name], name: name });
    out.weekly[STORE_IDS[name]] = [];
  });

  var found = { weekly: false, trials: false, churn: false };

  ss.getSheets().forEach(function (sheet) {
    if (sheet.isSheetHidden()) return;
    var values = sheet.getDataRange().getValues();
    if (!values.length) return;

    var head = findHeaderRows(values);
    if (!head) return;

    var kind = classifySheet(values[head.fieldRow]);
    if (kind === 'weekly' && !found.weekly) {
      readWeekly(values, head, out);
      found.weekly = true;
    } else if (kind === 'trials' && !found.trials) {
      readTrials(values, head, out);
      found.trials = true;
    } else if (kind === 'churn' && !found.churn) {
      readChurn(values, head, out);
      found.churn = true;
    }
  });

  ['weekly', 'trials', 'churn'].forEach(function (k) {
    if (!found[k]) out.warnings.push(k + ' に対応するシートが見つかりませんでした');
  });

  // 記録なしの週は null で埋めて、全店舗の配列の長さを揃える
  Object.keys(out.weekly).forEach(function (id) {
    for (var i = 0; i < out.weeks.length; i++) {
      if (out.weekly[id][i] === undefined) out.weekly[id][i] = null;
    }
  });

  return out;
}

/** ?debug=1 のときに、どのシートをどう認識したかを返す */
function describeSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheets().map(function (sheet) {
    var values = sheet.getDataRange().getValues();
    var head = values.length ? findHeaderRows(values) : null;
    return {
      name: sheet.getName(),
      hidden: sheet.isSheetHidden(),
      rows: values.length,
      cols: values.length ? values[0].length : 0,
      recognizedAs: head ? classifySheet(values[head.fieldRow]) : null,
      storeRow: head ? head.storeRow + 1 : null,
      stores: head
        ? head.blocks.map(function (b) {
            return b.name + '(' + (b.start + 1) + '-' + b.end + ')';
          })
        : [],
    };
  });
}

/** エディタ上で動作確認するとき用（実行 → ログを見る） */
function testRun() {
  var d = buildPayload();
  Logger.log(
    '週: ' + d.weeks.length + ' / 体験: ' + d.trials.length + ' / 退会: ' + d.churn.length
  );
  Logger.log('警告: ' + JSON.stringify(d.warnings));
  Logger.log(JSON.stringify(describeSheets(), null, 2));
}

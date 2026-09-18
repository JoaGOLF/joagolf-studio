<?php
// JoaGOLF STUDIO 店舗数値ダッシュボード — AI相談の中継（Gemini API）
//
// このフォルダは /dashboard/ ごと Basic認証で守られているので、社内の人しか呼び出せない。
// APIキーは dashboard/config.php のものを使い回す（ブラウザには一切渡らない）。

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

require __DIR__ . '/sheet.php';           // シートの読み取り（画面用の api.php と共通）
require __DIR__ . '/../config.php';       // $GEMINI_API_KEY

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POSTのみ受け付けます'], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!isset($GEMINI_API_KEY) || $GEMINI_API_KEY === '') {
    echo json_encode(['error' => 'AIのAPIキーが未設定です。dashboard/config.php を確認してください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$question = isset($body['question']) ? trim((string)$body['question']) : '';
$scope = isset($body['scope']) ? (string)$body['scope'] : '';
$history = (isset($body['history']) && is_array($body['history'])) ? array_slice($body['history'], -8) : [];
if ($question === '' || mb_strlen($question) > 1000) {
    echo json_encode(['error' => '質問が空か、長すぎます（1000文字まで）'], JSON_UNESCAPED_UNICODE);
    exit;
}

$sheet = kpi_sheet_json();
if ($sheet['json'] === null) {
    echo json_encode(['error' => 'スプレッドシートを読めませんでした。' . $sheet['message']], JSON_UNESCAPED_UNICODE);
    exit;
}
$data = json_decode($sheet['json'], true);

/*
 * 会員の氏名は AI に渡さない。
 * 数字の相談に氏名は要らないうえ、外部のAIサービスに送る情報は少ないほどよいため。
 * （体験者一覧・退会者一覧の「名前」「担当」の欄を落とす）
 */
foreach (['trials', 'churn'] as $key) {
    if (!isset($data[$key]) || !is_array($data[$key])) continue;
    foreach ($data[$key] as $i => $row) {
        unset($data[$key][$i]['name'], $data[$key][$i]['owner']);
    }
}

$storeNames = [];
foreach (($data['stores'] ?? []) as $s) {
    $storeNames[] = $s['id'] . '=' . $s['name'];
}

$system = <<<'EOT'
あなたはインドアゴルフスクール「JoaGOLF STUDIO」の、店舗数値の相談相手です。
社内スタッフからの質問に、下記のデータ(JSON)の数字を根拠にして日本語で答えてください。

# データの読み方
- stores: 店舗の一覧。id と店名の対応は %STORES%
- weeks: 週のラベル（例 "9/8-14"）。weekly の配列は、この weeks と同じ並び順
- weekly: 店舗ID ごとの週次の記録。1週ぶんは [レッスン枠, 実施レッスン数, 体験に来た人数, 入会した人数]。
  その週の記録がまだ無い場合は null（0件と記録された 0 とは区別すること）
- 稼働率 = 実施レッスン数 ÷ レッスン枠。入会率 = 入会した人数 ÷ 体験に来た人数。
  どちらもデータには入っていないので、必要なら自分で計算する
- trials: 体験に来た方の一覧。plan が「未入会」なら体験のみ、それ以外は入会したプラン。
  note は備考で、そこから流入経路（HP・インスタ・紹介・Googleマップ など）が読み取れる
- churn: 退会・休会の一覧。kind が「退会」か「休会」、reason が理由
- tokyo: 東京4拠点のシフト表から読んだもの。sites は直近の枠数と予約数、
  monthly は月ごとの稼働率(%)、heatmap は曜日×時間帯ごとの稼働率(%)で
  days(曜日) × times(時間帯) の並びに対応する
- snapshotDate: このデータを取った日
- 個人情報のため、氏名と担当者名はあらかじめ除いてある。名前は答えられないと伝えること

# いま画面で見ている範囲
%SCOPE%

# 回答のルール
- 必ず具体的な数字を引用して根拠を示す
- 優先順位を付けて、実行できる提案まで踏み込む
- 簡潔に。長くても400字程度。箇条書きは「・」を使う。マークダウン記法(#や**)は使わない
- まだ終わっていない週は途中経過なので、直近の実績として扱わない
- データに無いことは推測と明示するか「このデータでは分からない」と答える
- 相手は数字の専門家ではないので、専門用語には短い説明を添える
EOT;
$system = str_replace(
    ['%STORES%', '%SCOPE%'],
    [implode(' / ', $storeNames), ($scope !== '' ? $scope : '（指定なし。全店として答えてよい）')],
    $system
);
$system .= "\n\n# 店舗数値データ(JSON)\n" . json_encode($data, JSON_UNESCAPED_UNICODE);

$contents = [];
foreach ($history as $h) {
    $role = (isset($h['role']) && $h['role'] === 'model') ? 'model' : 'user';
    $text = mb_substr((string)($h['text'] ?? ''), 0, 4000);
    if ($text !== '') {
        $contents[] = ['role' => $role, 'parts' => [['text' => $text]]];
    }
}
$contents[] = ['role' => 'user', 'parts' => [['text' => $question]]];

$payload = json_encode([
    'system_instruction' => ['parts' => [['text' => $system]]],
    'contents' => $contents,
    'generationConfig' => ['temperature' => 0.4, 'maxOutputTokens' => 4096],
], JSON_UNESCAPED_UNICODE);

$ch = curl_init('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent');
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-goog-api-key: ' . $GEMINI_API_KEY],
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 60,
]);
$res = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($res === false) {
    echo json_encode(['error' => '通信エラー: ' . $err], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($code === 429) {
    echo json_encode(['error' => '利用が集中しています。本日の無料枠の上限に達したか、1分あたりの回数制限です。少し待ってからもう一度お試しください。'], JSON_UNESCAPED_UNICODE);
    exit;
}

$j = json_decode($res, true);
$answer = '';
if (isset($j['candidates'][0]['content']['parts']) && is_array($j['candidates'][0]['content']['parts'])) {
    foreach ($j['candidates'][0]['content']['parts'] as $p) {
        if (!empty($p['thought'])) continue; // 思考過程は出さない
        if (isset($p['text'])) $answer .= $p['text'];
    }
}
if ($answer === '') {
    $detail = $j['error']['message'] ?? ('HTTP ' . $code);
    echo json_encode(['error' => 'AIから回答を取得できませんでした（' . $detail . '）'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['answer' => $answer], JSON_UNESCAPED_UNICODE);

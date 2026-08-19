<?php
// JoaGOLF STUDIO ダッシュボード AIチャット中継（Gemini API）
// このフォルダごと Basic認証で保護されているため、社内の人しか呼び出せない。
// APIキーは config.php に置く（ブラウザには一切渡らない）。

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');

require __DIR__ . '/config.php'; // $GEMINI_API_KEY を定義

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POSTのみ受け付けます']);
    exit;
}
if (!isset($GEMINI_API_KEY) || $GEMINI_API_KEY === '' || mb_strpos($GEMINI_API_KEY, 'ここに') !== false) {
    echo json_encode(['error' => 'APIキーが未設定です。dashboard/config.php にGeminiのAPIキーを設定してください。']);
    exit;
}

$body = json_decode(file_get_contents('php://input'), true);
$question = isset($body['question']) ? trim((string)$body['question']) : '';
$history = (isset($body['history']) && is_array($body['history'])) ? array_slice($body['history'], -8) : [];
if ($question === '' || mb_strlen($question) > 1000) {
    echo json_encode(['error' => '質問が空か、長すぎます（1000文字まで）']);
    exit;
}

$data = @file_get_contents(__DIR__ . '/data.json');
if ($data === false) {
    echo json_encode(['error' => 'データファイル(data.json)が見つかりません']);
    exit;
}

$system = <<<EOT
あなたはインドアゴルフスクール「JoaGOLF STUDIO」のWeb分析アシスタントです。
社内スタッフからの質問に、下記の週次データ(JSON)の数字を根拠にして日本語で答えてください。

# 事業の背景
- 全7店舗。東京4店舗=麹町店・西新宿店・千駄ヶ谷店・赤坂店、関西3店舗=神戸店・神戸トアロード店・箕面店
- 東京4店舗では「3ヶ月レッスン受け放題キャンペーン」を実施中。専用LP(/campaign/tokyo-a-3months/、2026-08-18公開)の成約導線はLINE友だち追加
- サイトの主要コンバージョンは「体験予約クリック」(店舗の予約ページへのクリック)と「LINE友だち追加」
- サイト公開日は2026-06-21

# データの読み方
- weeks: 週ごとの集計。week=週の月曜日。users=訪問者、sessions=セッション、reserve=体験予約クリック、line=LINE友だち追加クリック、tokyo/kansai=地域別セッション、lp=キャンペーンLP閲覧、stores=店舗別予約クリック、storeViews=店舗ページ閲覧、channels=流入チャネル、devices=端末、sources=参照元、landings=着地ページ、pages=閲覧ページ、cta=LP内ボタン別クリック、sc_imp=検索表示回数、sc_clicks=検索クリック、sc_pos=平均掲載順位(小さいほど上位)
- scQueries: 全期間の検索キーワード上位。areaQueries: 地域キーワード(tokyo=trueは東京系)

# 回答のルール
- 必ず具体的な数字を引用して根拠を示す
- 優先順位を付けて、実行できる提案まで踏み込む
- 簡潔に。長くても400字程度。箇条書きは「・」を使う。マークダウン記法(#や**)は使わない
- データに無いことは推測と明示するか「このデータでは分からない」と答える
- 相手はWeb分析の専門家ではないので、専門用語には短い説明を添える
EOT;
$system .= "\n\n# 週次データ(JSON)\n" . $data;

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
    'generationConfig' => [
        'temperature' => 0.4,
        'maxOutputTokens' => 2048,
        'thinkingConfig' => ['thinkingBudget' => 0],
    ],
], JSON_UNESCAPED_UNICODE);

$ch = curl_init('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
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
    echo json_encode(['error' => '通信エラー: ' . $err]);
    exit;
}
if ($code === 429) {
    echo json_encode(['error' => '利用が集中しています。本日の無料枠上限に達したか、1分あたりの回数制限です。少し待ってからもう一度お試しください。']);
    exit;
}

$j = json_decode($res, true);
$answer = '';
if (isset($j['candidates'][0]['content']['parts']) && is_array($j['candidates'][0]['content']['parts'])) {
    foreach ($j['candidates'][0]['content']['parts'] as $p) {
        if (!empty($p['thought'])) continue; // 思考過程は除外
        if (isset($p['text'])) $answer .= $p['text'];
    }
}
if ($answer === '') {
    $detail = $j['error']['message'] ?? ('HTTP ' . $code);
    echo json_encode(['error' => 'AIから回答を取得できませんでした（' . $detail . '）'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['answer' => $answer], JSON_UNESCAPED_UNICODE);

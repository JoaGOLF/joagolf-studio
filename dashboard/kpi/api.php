<?php
// JoaGOLF STUDIO 店舗数値ダッシュボード — スプレッドシート読み取り中継
//
// スプレッドシート（Apps Script）を読みに行き、その結果を返すだけ。書き込みはしない。
// このフォルダは /dashboard/ ごと Basic認証で守られているので、社内の人しか呼び出せない。
// 接続先URLと合言葉は config.php に置く（ブラウザには一切渡らない）。

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

require __DIR__ . '/config.php'; // $SHEET_API_URL, $SHEET_API_TOKEN

// 何秒キャッシュするか。シートを直してから画面に出るまでの最大待ち時間になる。
$CACHE_SECONDS = 120;
$cacheFile = sys_get_temp_dir() . '/joagolf_kpi_cache.json';

function fail($error, $message, $status = 502) {
    http_response_code($status);
    echo json_encode(['error' => $error, 'message' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!isset($SHEET_API_URL) || $SHEET_API_URL === '' || !isset($SHEET_API_TOKEN) || $SHEET_API_TOKEN === '') {
    fail('not_configured', 'スプレッドシートの接続先が未設定です。dashboard/kpi/config.php を設定してください。', 503);
}

$refresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';

// 新しいキャッシュがあればそれを返す
if (!$refresh && is_readable($cacheFile) && (time() - filemtime($cacheFile)) < $CACHE_SECONDS) {
    header('X-Data-Cache: hit');
    echo file_get_contents($cacheFile);
    exit;
}

$url = $SHEET_API_URL . (strpos($SHEET_API_URL, '?') === false ? '?' : '&')
     . 'token=' . rawurlencode($SHEET_API_TOKEN);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true, // Apps Script は script.google.com へ転送する
    CURLOPT_MAXREDIRS      => 5,
    CURLOPT_TIMEOUT        => 25,
]);
$res  = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err  = curl_error($ch);
curl_close($ch);

// 読めなかったときは、古くてもキャッシュがあればそれを返す（画面を空にしないため）
function fallbackOrFail($cacheFile, $error, $message) {
    if (is_readable($cacheFile)) {
        header('X-Data-Cache: stale');
        echo file_get_contents($cacheFile);
        exit;
    }
    fail($error, $message);
}

if ($res === false || $code !== 200) {
    fallbackOrFail($cacheFile, 'fetch_failed',
        'スプレッドシートに接続できませんでした。前回取り込んだ内容を表示しています。');
}

$json = json_decode($res, true);
if (!is_array($json)) {
    fallbackOrFail($cacheFile, 'bad_response',
        'スプレッドシートから正しい形の応答が返りませんでした。Apps Script の公開設定を確認してください。');
}
if (isset($json['error'])) {
    $msg = ($json['error'] === 'forbidden')
        ? '合言葉が Apps Script 側の TOKEN と一致していません。'
        : 'スプレッドシート側でエラーが起きました。';
    fallbackOrFail($cacheFile, 'upstream_error', $msg);
}

$json['fetchedAt'] = gmdate('c');
$out = json_encode($json, JSON_UNESCAPED_UNICODE);

@file_put_contents($cacheFile, $out, LOCK_EX);
header('X-Data-Cache: miss');
echo $out;

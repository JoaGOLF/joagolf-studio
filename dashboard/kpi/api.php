<?php
// JoaGOLF STUDIO 店舗数値ダッシュボード — 画面へシートの中身を渡す窓口
//
// 読み取りそのものは sheet.php が受け持つ（AI相談の chat.php と共通）。
// このフォルダは /dashboard/ ごと Basic認証で守られているので、社内の人しか呼び出せない。

header('Content-Type: application/json; charset=utf-8');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

require __DIR__ . '/sheet.php';

$refresh = isset($_GET['refresh']) && $_GET['refresh'] === '1';
$r = kpi_sheet_json($refresh);

if ($r['json'] === null) {
    http_response_code($r['error'] === 'not_configured' ? 503 : 502);
    echo json_encode(['error' => $r['error'], 'message' => $r['message']], JSON_UNESCAPED_UNICODE);
    exit;
}

header('X-Data-Cache: ' . $r['source']);
echo $r['json'];

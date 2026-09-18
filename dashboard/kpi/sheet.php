<?php
// JoaGOLF STUDIO 店舗数値ダッシュボード — スプレッドシート読み取り（共通部分）
//
// スプレッドシート（Apps Script）を読みに行って、その中身を返すだけ。書き込みはしない。
// 画面用の api.php と、AI相談用の chat.php の両方から使う。
// 接続先URLと合言葉は config.php に置く（ブラウザには一切渡らない）。

require_once __DIR__ . '/config.php'; // $SHEET_API_URL, $SHEET_API_TOKEN

// 何秒キャッシュするか。シートを直してから画面に出るまでの最大待ち時間になる。
define('KPI_CACHE_SECONDS', 120);

function kpi_cache_file() {
    return sys_get_temp_dir() . '/joagolf_kpi_cache.json';
}

/**
 * シートの中身を取ってくる。
 *
 * 戻り値: [
 *   'json'    => JSON文字列（取れなかったときは null）
 *   'source'  => 'hit'（キャッシュ）| 'miss'（取り直した）| 'stale'（古いキャッシュで代用）
 *   'error'   => 失敗の種類（成功時は null）
 *   'message' => 画面に出す日本語（成功時は null）
 * ]
 */
function kpi_sheet_json($refresh = false) {
    global $SHEET_API_URL, $SHEET_API_TOKEN;

    $cacheFile = kpi_cache_file();

    if (!isset($SHEET_API_URL) || $SHEET_API_URL === '' || !isset($SHEET_API_TOKEN) || $SHEET_API_TOKEN === '') {
        return [
            'json' => null, 'source' => null, 'error' => 'not_configured',
            'message' => 'スプレッドシートの接続先が未設定です。dashboard/kpi/config.php を設定してください。',
        ];
    }

    // 新しいキャッシュがあればそれを使う
    if (!$refresh && is_readable($cacheFile) && (time() - filemtime($cacheFile)) < KPI_CACHE_SECONDS) {
        return ['json' => file_get_contents($cacheFile), 'source' => 'hit', 'error' => null, 'message' => null];
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
    curl_close($ch);

    // 読めなかったときは、古くてもキャッシュがあればそれを使う（画面を空にしないため）
    $fallback = function ($error, $message) use ($cacheFile) {
        if (is_readable($cacheFile)) {
            return ['json' => file_get_contents($cacheFile), 'source' => 'stale', 'error' => null, 'message' => null];
        }
        return ['json' => null, 'source' => null, 'error' => $error, 'message' => $message];
    };

    if ($res === false || $code !== 200) {
        return $fallback('fetch_failed',
            'スプレッドシートに接続できませんでした。前回取り込んだ内容を表示しています。');
    }

    $json = json_decode($res, true);
    if (!is_array($json)) {
        return $fallback('bad_response',
            'スプレッドシートから正しい形の応答が返りませんでした。Apps Script の公開設定を確認してください。');
    }
    if (isset($json['error'])) {
        $msg = ($json['error'] === 'forbidden')
            ? '合言葉が Apps Script 側の TOKEN と一致していません。'
            : 'スプレッドシート側でエラーが起きました。';
        return $fallback('upstream_error', $msg);
    }

    $json['fetchedAt'] = gmdate('c');
    $out = json_encode($json, JSON_UNESCAPED_UNICODE);
    @file_put_contents($cacheFile, $out, LOCK_EX);

    return ['json' => $out, 'source' => 'miss', 'error' => null, 'message' => null];
}

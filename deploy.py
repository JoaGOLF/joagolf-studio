#!/usr/bin/env python3
"""JoaGOLF STUDIO 本番デプロイスクリプト

前回デプロイ時から変更のあったファイルだけを、ロリポップの
/joagolfstudio に FTPS でアップロードする。

使い方:
  python3 deploy.py            # 変更ファイルをアップロード
  python3 deploy.py --dry-run  # 何が上がるか確認だけ(転送しない)
  python3 deploy.py --full     # 全ファイルを強制アップロード
  python3 deploy.py --init     # 現状を「デプロイ済み」として記録だけする

認証情報は ~/.netrc の ftp.lolipop.jp エントリを使う(このリポジトリには置かない)。
"""

import argparse
import hashlib
import json
import netrc
import os
import posixpath
import sys
from ftplib import FTP_TLS, error_perm

HOST = "ftp.lolipop.jp"
REMOTE_ROOT = "/joagolfstudio"
STATE_FILE = ".deploy-state.json"

# サイトの一部ではないもの(アップロードしない)
EXCLUDE_DIRS = {".git", ".claude", "__pycache__"}
EXCLUDE_FILES = {STATE_FILE, "deploy.py", "weekly_report.py", "dashboard.py",
                 "CLAUDE.md", "AGENTS.md", "STATUS.md", "TODO.md",
                 "README.md", ".gitignore", ".DS_Store"}
EXCLUDE_PREFIXES = ("_",)  # _bg-options.html などの作業用ファイル


def site_files():
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith("_")]
        for f in files:
            if f in EXCLUDE_FILES or f.startswith(EXCLUDE_PREFIXES) or f == ".DS_Store":
                continue
            path = os.path.normpath(os.path.join(root, f))
            yield path.replace(os.sep, "/")


def sha1(path):
    h = hashlib.sha1()
    with open(path, "rb") as fp:
        for chunk in iter(lambda: fp.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as fp:
            return json.load(fp)
    return {}


def save_state(state):
    with open(STATE_FILE, "w") as fp:
        json.dump(state, fp, indent=1, ensure_ascii=False, sort_keys=True)


def connect():
    auth = netrc.netrc().authenticators(HOST)
    if not auth:
        sys.exit("~/.netrc に ftp.lolipop.jp の設定がありません")
    user, _, pw = auth
    ftp = FTP_TLS(HOST, timeout=60)
    ftp.login(user, pw)
    ftp.prot_p()
    return ftp


def ensure_dirs(ftp, made, remote_dir):
    if remote_dir in made or remote_dir == REMOTE_ROOT:
        return
    parent = posixpath.dirname(remote_dir)
    ensure_dirs(ftp, made, parent)
    try:
        ftp.mkd(remote_dir)
    except error_perm:
        pass  # 既に存在
    made.add(remote_dir)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--init", action="store_true")
    args = ap.parse_args()

    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    current = {p: sha1(p) for p in sorted(site_files())}

    if args.init:
        save_state(current)
        print(f"現状 {len(current)} ファイルをデプロイ済みとして記録しました(転送なし)")
        return

    state = {} if args.full else load_state()
    changed = [p for p, h in current.items() if state.get(p) != h]

    if not changed:
        print("変更はありません。アップロード不要です。")
        return

    print(f"アップロード対象: {len(changed)} ファイル")
    for p in changed:
        print(f"  {p}")

    if args.dry_run:
        print("(--dry-run のため転送していません)")
        return

    ftp = connect()
    made = set()
    for p in changed:
        remote = posixpath.join(REMOTE_ROOT, p)
        ensure_dirs(ftp, made, posixpath.dirname(remote))
        with open(p, "rb") as fp:
            ftp.storbinary(f"STOR {remote}", fp)
        state[p] = current[p]
        print(f"  ✓ {remote}")
    ftp.quit()

    # サーバーから消えたローカル削除分は追跡だけ更新(リモート削除はしない)
    for gone in set(state) - set(current):
        del state[gone]
    save_state(state)
    print(f"完了: {len(changed)} ファイルを {REMOTE_ROOT} にアップロードしました")


if __name__ == "__main__":
    main()

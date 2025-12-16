import base64
import ctypes
import ctypes.wintypes
import json
import os
import re
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class _DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", ctypes.wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


crypt32 = ctypes.windll.crypt32
kernel32 = ctypes.windll.kernel32


def _bytes_to_blob(data: bytes) -> _DATA_BLOB:
    buf = (ctypes.c_byte * len(data)).from_buffer_copy(data)
    return _DATA_BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_byte)))


def _blob_to_bytes(blob: _DATA_BLOB) -> bytes:
    if not blob.pbData or blob.cbData == 0:
        return b""
    out = ctypes.string_at(blob.pbData, blob.cbData)
    kernel32.LocalFree(blob.pbData)
    return out


def dpapi_unprotect(data: bytes) -> bytes:
    in_blob = _bytes_to_blob(data)
    out_blob = _DATA_BLOB()
    if crypt32.CryptUnprotectData(
        ctypes.byref(in_blob),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(out_blob),
    ) == 0:
        raise OSError("CryptUnprotectData failed")
    return _blob_to_bytes(out_blob)


DEBUG = False



def chromium_master_key(local_state_path: Path) -> bytes:
    raw = local_state_path.read_bytes()
    data = json.loads(raw.decode("utf-8"))
    enc_key_b64 = data.get("os_crypt", {}).get("encrypted_key")
    if not enc_key_b64:
        raise RuntimeError("Local State has no os_crypt.encrypted_key")
    enc = base64.b64decode(enc_key_b64)
    if enc.startswith(b"DPAPI"):
        enc = enc[5:]
    return dpapi_unprotect(enc)


@dataclass
class Candidate:
    cookies_path: Path
    local_state_path: Path


def _find_candidates() -> list[Candidate]:
    roots = [
        Path(os.environ.get("LOCALAPPDATA", "")),
        Path(os.environ.get("APPDATA", "")),
        Path(os.environ.get("PROGRAMDATA", "")),
    ]
    roots = [p for p in roots if str(p) and p.exists()]

    candidates: list[Candidate] = []

    for root in roots:
        for p in root.glob("DingTalk_*/*"):
            if not p.is_dir():
                continue

        for d in root.glob("DingTalk_*" ):
            if not d.is_dir():
                continue

            local_state = d / "Local State"
            if not local_state.exists():
                continue

            cookies = list(d.rglob("Network/Cookies"))
            cookies += list(d.rglob("*/Cookies"))
            for c in cookies:
                if c.name != "Cookies":
                    continue
                candidates.append(Candidate(cookies_path=c, local_state_path=local_state))

    uniq: dict[tuple[str, str], Candidate] = {}
    for c in candidates:
        uniq[(str(c.cookies_path), str(c.local_state_path))] = c
    return list(uniq.values())


def _iter_rows(db_path: Path) -> Iterable[tuple]:
    conn = sqlite3.connect(str(db_path), timeout=5)
    try:
        conn.execute("PRAGMA busy_timeout=5000")
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT host_key, name, value, encrypted_value, path, expires_utc, last_access_utc "
                "FROM cookies WHERE name=? AND (host_key LIKE ? OR host_key LIKE ?) "
                "ORDER BY last_access_utc DESC LIMIT 50",
                ("JSESSIONID", "%dkykt.info.bit.edu.cn%", "%.info.bit.edu.cn%"),
            )
        except sqlite3.OperationalError:
            cur.execute(
                "SELECT host_key, name, value, encrypted_value, path, expires_utc "
                "FROM cookies WHERE name=? AND (host_key LIKE ? OR host_key LIKE ?) "
                "ORDER BY expires_utc DESC LIMIT 50",
                ("JSESSIONID", "%dkykt.info.bit.edu.cn%", "%.info.bit.edu.cn%"),
            )
        for row in cur.fetchall():
            yield row
    finally:
        conn.close()


def _decrypt_cookie_value(master_key: bytes, value: str, encrypted_value: bytes) -> str:
    if value:
        return value
    if not encrypted_value:
        return ""

    ev = encrypted_value
    if ev.startswith(b"v10") or ev.startswith(b"v11"):
        nonce = ev[3:15]
        ct_tag = ev[15:]
        try:
            pt = AESGCM(master_key).decrypt(nonce, ct_tag, None)
            if DEBUG:
                print("[debug] 使用 cryptography.AESGCM 解密成功")
            # JSESSIONID 理论上应为 32 位十六进制串，但有些应用会在明文里附带额外字节。
            m = re.findall(rb"[0-9A-F]{32}", pt)
            if m:
                token = m[-1].decode("ascii")
                if DEBUG:
                    print(f"[debug] 明文长度={len(pt)} 提取到的JSESSIONID={token}")
                return token
            return pt.decode("utf-8", errors="replace")
        except Exception as e:
            # 少数情况下仍可能是 DPAPI 直接保护的 blob，这里作为兜底尝试 DPAPI 解密。
            try:
                pt2 = dpapi_unprotect(ev)
                return pt2.decode("utf-8", errors="replace")
            except Exception:
                if DEBUG:
                    print(f"[debug] v10/v11 cookie 解密失败: {e!r}")
                return ""

    pt = dpapi_unprotect(ev)
    return pt.decode("utf-8", errors="replace")


def main(argv: list[str]) -> int:
    cookies_arg = None
    local_state_arg = None

    for a in argv[1:]:
        if a.startswith("--cookies="):
            cookies_arg = a.split("=", 1)[1]
        elif a.startswith("--local-state="):
            local_state_arg = a.split("=", 1)[1]
        elif a == "--debug":
            global DEBUG
            DEBUG = True

    candidates: list[Candidate]
    if cookies_arg and local_state_arg:
        candidates = [Candidate(Path(cookies_arg), Path(local_state_arg))]
    else:
        candidates = _find_candidates()

    if not candidates:
        print("未找到钉钉的数据目录。你可以手动指定 --cookies=... 和 --local-state=...", file=sys.stderr)
        return 2

    for cand in sorted(candidates, key=lambda c: (str(c.local_state_path), str(c.cookies_path))):
        if not cand.cookies_path.exists() or not cand.local_state_path.exists():
            continue

        try:
            mk = chromium_master_key(cand.local_state_path)
        except Exception as e:
            print(f"[skip] 无法读取 master key: {cand.local_state_path} ({e})", file=sys.stderr)
            continue

        try:
            for row in _iter_rows(cand.cookies_path):
                host_key, name, value, encrypted_value, *_rest = row
                if isinstance(encrypted_value, memoryview):
                    encrypted_value = encrypted_value.tobytes()
                if DEBUG:
                    prefix = (encrypted_value or b"")[:3]
                    print(f"[debug] host_key={host_key!r} name={name!r} value长度={len(value or '')} enc前缀={prefix!r}")
                jsid = _decrypt_cookie_value(mk, value or "", encrypted_value or b"")
                if jsid:
                    print(jsid)
                    return 0
        except Exception as e:
            if "unable to open database file" in str(e).lower():
                print(
                    f"[skip] 读取 Cookies 失败: {cand.cookies_path} ({e})\n"
                    "提示：钉钉可能对 Cookies 数据库加了独占锁。请完全退出钉钉（包括系统托盘）后重试。",
                    file=sys.stderr,
                )
            else:
                print(f"[skip] 读取 Cookies 出错: {cand.cookies_path} ({e})", file=sys.stderr)
            continue

    print("未能在钉钉 Cookies 中找到 JSESSIONID。", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

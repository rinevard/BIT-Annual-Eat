from __future__ import annotations

import base64
import ctypes
import ctypes.wintypes
import json
import os
import re
import shutil
import sqlite3
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import psutil
from cryptography.hazmat.primitives.ciphers.aead import AESGCM



class DecryptError(RuntimeError):
    def __init__(self, user_message: str, hint: str = "") -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.hint = hint


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


def _dpapi_unprotect(data: bytes) -> bytes:
    in_blob = _bytes_to_blob(data)
    out_blob = _DATA_BLOB()
    if (
        crypt32.CryptUnprotectData(
            ctypes.byref(in_blob),
            None,
            None,
            None,
            None,
            0,
            ctypes.byref(out_blob),
        )
        == 0
    ):
        raise OSError("CryptUnprotectData 调用失败")
    return _blob_to_bytes(out_blob)


def _chromium_master_key(local_state_path: Path) -> bytes:
    data = json.loads(local_state_path.read_text(encoding="utf-8"))
    enc_key_b64 = data.get("os_crypt", {}).get("encrypted_key")
    if not enc_key_b64:
        raise RuntimeError("Local State 中找不到 os_crypt.encrypted_key")
    enc = base64.b64decode(enc_key_b64)
    if enc.startswith(b"DPAPI"):
        enc = enc[5:]
    return _dpapi_unprotect(enc)


@dataclass
class Candidate:
    cookies_path: Path
    local_state_path: Path


def _copy_db(src: Path) -> Path:
    tmpdir = Path(tempfile.mkdtemp(prefix="dingtalk_cookie_"))
    dst = tmpdir / "Cookies"
    shutil.copy2(src, dst)
    return dst


def _iter_cookie_rows(db_path: Path) -> Iterable[tuple]:
    conn = sqlite3.connect(str(db_path))
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT host_key, name, value, encrypted_value, path, expires_utc, last_access_utc "
            "FROM cookies WHERE name=? AND (host_key LIKE ? OR host_key LIKE ?) "
            "ORDER BY last_access_utc DESC LIMIT 50",
            ("JSESSIONID", "%dkykt.info.bit.edu.cn%", "%.info.bit.edu.cn%"),
        )
        for row in cur.fetchall():
            yield row
    finally:
        conn.close()


def _is_dingtalk_running() -> bool:
    target_names = {
        "dingtalk.exe",
        "dingtalkapp.exe",
    }

    for p in psutil.process_iter(attrs=["name", "exe"]):
        try:
            name = (p.info.get("name") or "").lower()
            if name in target_names:
                return True

            exe = (p.info.get("exe") or "").lower()
            if exe and exe.endswith("\\dingtalk.exe"):
                return True
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue

    return False


def extract_jsessionid_from_dingtalk() -> str:
    if _is_dingtalk_running():
        raise DecryptError(
            user_message="检测到钉钉正在运行，无法推断 JSESSIONID",
            hint="请完全退出钉钉（包括系统托盘）后重试，或尝试手动输入 JSESSIONID。",
        )

    local = Path(os.environ.get("LOCALAPPDATA", ""))
    if not local.exists():
        raise DecryptError(
            user_message="未找到环境变量 LOCALAPPDATA，无法自动读取钉钉数据。",
            hint="请手动输入 JSESSIONID。",
        )

    candidates: list[Candidate] = []
    for d in local.glob("DingTalk_*"):
        if not d.is_dir():
            continue
        local_state = d / "Local State"
        if not local_state.exists():
            continue
        for c in d.rglob("Network/Cookies"):
            if c.name == "Cookies":
                candidates.append(Candidate(cookies_path=c, local_state_path=local_state))

    if not candidates:
        raise DecryptError(
            user_message="在本机未找到钉钉的 Cookie 数据库。",
            hint="请确认已安装并登录钉钉，或尝试手动输入 JSESSIONID。",
        )

    for cand in candidates:
        try:
            mk = _chromium_master_key(cand.local_state_path)
            db_copy = _copy_db(cand.cookies_path)
        except Exception:
            continue

        for row in _iter_cookie_rows(db_copy):
            _host_key, _name, value, encrypted_value, *_rest = row
            if value:
                return value
            if isinstance(encrypted_value, memoryview):
                encrypted_value = encrypted_value.tobytes()
            if not encrypted_value:
                continue

            ev = encrypted_value
            if ev.startswith(b"v10") or ev.startswith(b"v11"):
                nonce = ev[3:15]
                ct_tag = ev[15:]
                try:
                    pt = AESGCM(mk).decrypt(nonce, ct_tag, None)
                except Exception:
                    continue

                m = re.findall(rb"[0-9A-F]{32}", pt)
                if m:
                    return m[-1].decode("ascii")

                s = pt.decode("utf-8", errors="ignore")
                if s:
                    return s
            else:
                try:
                    pt = _dpapi_unprotect(ev)
                except Exception:
                    continue
                s = pt.decode("utf-8", errors="ignore")
                if s:
                    return s

    raise DecryptError(
        user_message="未能得到 JSESSIONID。",
        hint="请手动输入 JSESSIONID。若钉钉正在运行，请从托盘完全退出后重试。",
    )

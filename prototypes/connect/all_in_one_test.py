# 解密

# 发请求

# 拿数据

import base64
import ctypes
import ctypes.wintypes
import json
import os
import re
import shutil
import sqlite3
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import parse_qs, urlparse

import requests


BASE = "https://dkykt.info.bit.edu.cn"

PROXIES = {
    "http": None,
    "https": None,
}

DINGTALK_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/133.0.6943.142 Safari/537.36 "
    "dingtalk-win/1.0.0 nw(0.14.7) DingTalk(8.1.10-Release.251202013) "
    "Mojo/1.0.0 Native AppType(release) Channel/201200 Architecture/x86_64"
)


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


def chromium_master_key(local_state_path: Path) -> bytes:
    data = json.loads(local_state_path.read_text(encoding="utf-8"))
    enc_key_b64 = data.get("os_crypt", {}).get("encrypted_key")
    if not enc_key_b64:
        raise RuntimeError("Local State 中找不到 os_crypt.encrypted_key")
    enc = base64.b64decode(enc_key_b64)
    if enc.startswith(b"DPAPI"):
        enc = enc[5:]
    return dpapi_unprotect(enc)


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


def extract_jsessionid_from_dingtalk() -> str:
    # 在 LOCALAPPDATA 下查找 DingTalk_* 的用户数据目录。
    local = Path(os.environ.get("LOCALAPPDATA", ""))
    if not local.exists():
        raise RuntimeError("未找到环境变量 LOCALAPPDATA")

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
        raise RuntimeError("在 LOCALAPPDATA 下未找到钉钉的 Cookie 数据库")

    for cand in candidates:
        try:
            mk = chromium_master_key(cand.local_state_path)
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
            # Chromium v10/v11: b"v10" + 12 字节 nonce + 密文 + 16 字节 tag
            if ev.startswith(b"v10") or ev.startswith(b"v11"):
                nonce = ev[3:15]
                ct_tag = ev[15:]
                from cryptography.hazmat.primitives.ciphers.aead import AESGCM

                pt = AESGCM(mk).decrypt(nonce, ct_tag, None)
                m = re.findall(rb"[0-9A-F]{32}", pt)
                if m:
                    return m[-1].decode("ascii")
                # 兜底：尽力解码
                s = pt.decode("utf-8", errors="ignore")
                if s:
                    return s
            else:
                # 更旧的 DPAPI 直接加密格式。
                pt = dpapi_unprotect(ev)
                s = pt.decode("utf-8", errors="ignore")
                if s:
                    return s

    raise RuntimeError("未能在钉钉 Cookies 中找到或解密出 JSESSIONID")


def get_openid(session: requests.Session, idserial: str) -> str:
    headers = {
        "User-Agent": DINGTALK_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Upgrade-Insecure-Requests": "1",
        "Referer": f"{BASE}/home/openDingtalkLoginNew",
    }

    resp = session.get(
        f"{BASE}/home/openDingTalkHomePage",
        params={"idserial": idserial},
        headers=headers,
        timeout=15,
        allow_redirects=False,
        proxies=PROXIES,
    )
    loc = resp.headers.get("location", "")
    if not loc:
        raise RuntimeError(f"无法推断 openid：HTTP 状态码={resp.status_code}，响应头中没有 Location")

    qs = parse_qs(urlparse(loc).query)
    openid = (qs.get("openid") or [""])[0]
    if not openid:
        raise RuntimeError(f"无法从重定向地址中解析 openid：{loc}")
    return openid


def query_trades(
    session: requests.Session,
    openid: str,
    begin_date: str,
    end_date: str,
) -> list[dict]:
    url = f"{BASE}/selftrade/queryCardSelfTradeList"
    headers = {
        "User-Agent": DINGTALK_UA,
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": BASE,
        "Referer": f"{BASE}/selftrade/openQueryCardSelfTrade?openid={openid}&displayflag=1&id=19",
    }

    payload = {
        "beginDate": begin_date,
        "endDate": end_date,
        "tradeType": "-1",
        "openid": openid,
        "idserialOther": "",
        "chooseZH": "1",
    }

    resp = session.post(
        url,
        params={"openid": openid},
        json=payload,
        headers=headers,
        timeout=20,
        proxies=PROXIES,
    )
    resp.raise_for_status()
    data = resp.json()
    result = data.get("resultData")
    if not isinstance(result, list):
        raise RuntimeError(f"接口返回结构异常：{data!r}")
    return result


def filter_meals(trades: list[dict]) -> list[dict]:
    out: list[dict] = []
    for t in trades:
        if not isinstance(t, dict):
            continue
        txname = str(t.get("txname") or "")
        mername = str(t.get("mername") or "")
        txamt_s = str(t.get("txamt") or "")
        txcode = str(t.get("txcode") or "")

        try:
            amt = float(txamt_s)
        except ValueError:
            continue

        # 食堂消费的粗略筛选规则：
        # - 金额为负
        # - txname 包含“消费”或 txcode=1210
        # - 商户名包含“食堂”（对“吃饭”最稳）
        if amt < 0 and ("消费" in txname or txcode == "1210") and ("食堂" in mername):
            out.append(t)

    return out


def main() -> None:
    idserial = input("请输入学号: ").strip()
    if not idserial:
        raise SystemExit(2)

    jsessionid = extract_jsessionid_from_dingtalk()

    s = requests.Session()
    s.cookies.set("JSESSIONID", jsessionid, domain="dkykt.info.bit.edu.cn", path="/")

    openid = get_openid(s, idserial)

    begin_date = "2025-12-01"
    end_date = "2025-12-16"
    trades = query_trades(s, openid, begin_date, end_date)
    meals = filter_meals(trades)

    total = 0.0
    for t in meals:
        txdate = t.get("txdate")
        mername = t.get("mername")
        txamt = t.get("txamt")
        print(f"{txdate}  {mername}  {txamt}")
        try:
            total += float(str(txamt))
        except ValueError:
            pass

    print(f"\n共 {len(meals)} 笔食堂消费，合计 {total:.2f}")


if __name__ == "__main__":
    main()
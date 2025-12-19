from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

import requests



class DkyktError(RuntimeError):
    def __init__(self, user_message: str, hint: str = "", evidence: str = "") -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.hint = hint
        self.evidence = evidence


BASE = "https://dkykt.info.bit.edu.cn"

PROXIES = {
    "http": None,
    "https": None,
}


def get_openid(session: requests.Session, idserial: str, dingtalk_ua: str) -> str:
    headers = {
        "User-Agent": dingtalk_ua,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Upgrade-Insecure-Requests": "1",
        "Referer": f"{BASE}/home/openDingtalkLoginNew",
    }

    try:
        resp = session.get(
            f"{BASE}/home/openDingTalkHomePage",
            params={"idserial": idserial},
            headers=headers,
            timeout=15,
            allow_redirects=False,
            proxies=PROXIES,
        )
    except requests.RequestException as exc:
        raise DkyktError(
            user_message="网络连接异常。",
            hint="请检查网络连接（如是否已关闭代理）；若仍失败，可以来 https://github.com/rinevard/BIT-Annual-Eat 提 issue。",
            evidence=repr(exc),
        )

    loc = resp.headers.get("location", "")
    if not loc:
        raise DkyktError(
            user_message="无法推断 openid（可能登录态已过期）。",
            hint="尝试打开钉钉、查询一次消费记录，然后从托盘退出钉钉，再重试。",
            evidence=f"status={resp.status_code}, headers={dict(resp.headers)!r}",
        )

    qs = parse_qs(urlparse(loc).query)
    openid = (qs.get("openid") or [""])[0]
    if not openid:
        raise DkyktError(
            user_message="无法解析 openid，接口可能变更。",
            hint="可以来 https://github.com/rinevard/BIT-Annual-Eat 提 issue。",
            evidence=loc,
        )

    return openid


def query_trades(
    session: requests.Session,
    openid: str,
    begin_date: str,
    end_date: str,
    dingtalk_ua: str,
) -> list[dict]:
    url = f"{BASE}/selftrade/queryCardSelfTradeList"
    headers = {
        "User-Agent": dingtalk_ua,
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

    try:
        resp = session.post(
            url,
            params={"openid": openid},
            json=payload,
            headers=headers,
            timeout=20,
            proxies=PROXIES,
        )
    except requests.RequestException as exc:
        raise DkyktError(
            user_message="网络连接异常。",
            hint="请检查网络连接（如是否已关闭代理）；若仍失败，可以来 https://github.com/rinevard/BIT-Annual-Eat 提 issue。",
            evidence=repr(exc),
        )

    if resp.status_code != 200:
        raise DkyktError(
            user_message=f"查询请求失败，HTTP 状态码 {resp.status_code}。",
            hint="尝试打开钉钉、查询一次消费记录，然后从托盘退出钉钉，再重试；若仍失败，可以来 https://github.com/rinevard/BIT-Annual-Eat 提 issue。",
            evidence=resp.text[:2000],
        )

    try:
        data = resp.json()
    except json.JSONDecodeError:
        raise DkyktError(
            user_message="查询接口返回的不是 JSON（可能登录失效或接口变更）。",
            hint="尝试打开钉钉、查询一次消费记录，然后从托盘退出钉钉，再重试；若仍失败，可以来 https://github.com/rinevard/BIT-Annual-Eat 提 issue。",
            evidence=resp.text[:2000],
        )

    result = data.get("resultData")
    if not isinstance(result, list):
        raise DkyktError(
            user_message="接口返回结构异常。",
            hint="可以来 https://github.com/rinevard/BIT-Annual-Eat 提 issue。",
            evidence=repr(data)[:2000],
        )

    return result

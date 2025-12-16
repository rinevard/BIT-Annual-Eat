import requests
from urllib.parse import parse_qs, urlparse


BASE = "https://dkykt.info.bit.edu.cn"
JSESSIONID = "在这里填写有效的JSESSIONID"
IDSERIAL = "在这里填写学号"

DINGTALK_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/133.0.6943.142 Safari/537.36 "
    "dingtalk-win/1.0.0 nw(0.14.7) DingTalk(8.1.10-Release.251202013) "
    "Mojo/1.0.0 Native AppType(release) Channel/201200 Architecture/x86_64"
)


def main() -> None:
    s = requests.Session()
    s.cookies.set("JSESSIONID", JSESSIONID, domain="dkykt.info.bit.edu.cn", path="/")

    headers = {
        "User-Agent": DINGTALK_UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Upgrade-Insecure-Requests": "1",
        "Referer": f"{BASE}/home/openDingtalkLoginNew",
    }

    resp = s.get(
        f"{BASE}/home/openDingTalkHomePage",
        params={"idserial": IDSERIAL},
        headers=headers,
        timeout=15,
        allow_redirects=False,
    )

    print(f"status={resp.status_code}")
    loc = resp.headers.get("location", "")
    if not loc:
        print("no location header; cannot infer openid")
        return

    print(f"location={loc}")
    qs = parse_qs(urlparse(loc).query)
    openid = (qs.get("openid") or [""])[0]
    if openid:
        print(f"openid={openid}")
    else:
        print("location has no openid parameter")


if __name__ == "__main__":
    main()
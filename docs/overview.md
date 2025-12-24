# 开发者说明

本文将介绍这套代码的工作方式，读完以后你应该会对整个代码库有个大概了解。

main.py 大致分为三步，登录并查询消费记录，生成并保存文件，将文件上传到服务器（可选）。我们将简单介绍一下。

```py

def main() -> None:
    # 从钉钉缓存获取登录凭证并查询记录
    jsessionid = extract_jsessionid_from_dingtalk()
    session = requests.Session()
    session.cookies.set("JSESSIONID", jsessionid, domain="dkykt.info.bit.edu.cn")
    openid = get_openid(session, idserial, DINGTALK_UA)
    
    all_trades: list[dict] = []
    for sub_begin, sub_end in split_date_range(begin_date, end_date):
        sub_trades = query_trades(session, openid, sub_begin, sub_end, DINGTALK_UA)
        all_trades.extend(sub_trades)

    # 生成并保存文件
    records = to_spend_records(all_trades)
    save_csv(records, csv_path)
    save_html_report(records, html_report_path, student_id=idserial)

    # 上传到服务器（可选）
    student_key = make_student_key(idserial)
    url = upload_with_progress(daily_stats, ach_state, edit_pw, student_key=student_key)
```

首先程序获取登录凭证后调用校园卡系统 API 查询消费记录（相关文件：dingtalk_decrypt.py、dkykt_api.py）。

有了记录以后工作就比较朴素了，主要是生成并保存 csv 文件、柱状图、网页报告。为了减小包体体积，我们用 Pillow 生成柱状图而不是 matplotlib。

我们的 html 报告模板存在 templates 文件夹中，生成报告时会做占位符字符串替换从而把 CSS、JS、消费记录、成就数据嵌入 html 文件得到 output/report.html.

成就系统可以看 achievements.py 里的 evaluate_achievements 函数，每个成就有解锁条件，所以我们把判断是否解锁成就需要的所有数据定义为 AchContext 类，这样每个成就可以写成形如 `ach_name(ctx: AchContext) -> AchievementResult` 的函数，我们只要传入 AchContext 就知道这个成就是否解锁了。

在 evaluate_achievements 里，我们会遍历 CHECKERS 里的所有成就并判断其是否解锁。AchievementResult 里的 id 则是每个成就的标识，report_script.js 根据这个 id 在 ACH_META 里找到对应的成就描述等信息并显示出来。

最后，用户可以选择将数据传到服务器。服务器用类似键值对的 key-val 方式存储数据。我们把每天的吃饭数据等信息作为 val，将 `report:id` 作为 key，这里的 id 是 `hash(secret:hash(学号))` 的前 8 位。服务端收到请求后保存数据，用户访问报告链接时再动态生成 HTML 页面。最后用户可以在 `https://r.eatbit.top/r/{id}` 访问报告。具体可以看 main.py 的 upload_report 函数和 cloudflare_worker/worker_template.js.

我们用 `pyinstaller --onefile main.py` 对代码进行打包，这样用户就不用配 python 环境了。打包生成的 exe 在 dist 文件夹下，我们还要把 templates 文件夹复制进去，不然它找不到前端模板。
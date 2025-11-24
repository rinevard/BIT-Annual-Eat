# 开发者说明

本文将介绍这套代码的工作方式，读完以后你应该会对整个代码库有个大概了解，然后就能试着加成就/改前端/适配自己学校了。

main.py 大致分为三步，登录并查询消费记录，生成并保存文件，将文件上传到服务器（可选）。我们将简单介绍一下。

```py

def main() -> None:
    # 登录并查询记录
    session, openid = login_with_card(idserial, cardpwd)
    all_trades: list[dict] = []
    for sub_begin, sub_end in split_date_range(begin_date, end_date):
        print(f"  查询区间: {sub_begin} ~ {sub_end} ...")
        sub_trades = fetch_trades(session, openid, sub_begin, sub_end)
        all_trades.extend(sub_trades)
        time.sleep(0.5)

    # 生成并保存文件
    records = to_spend_records(all_trades)
    save_csv(records, csv_path)
    save_bar_chart(records, img_amount_path)
    save_count_chart(records, img_count_path)
    save_html_report(
        records,
        html_report_path,
        student_id=idserial,
        used_default_password=used_default_password,
    )

    # 上传到服务器
    student_key = make_student_key(idserial)
    url = upload_report(html_report_path, student_key=student_key)
```

首先看看我们如何登录并查询消费记录。我们用 Fiddler 得知了校园卡系统登录、查流水的请求格式，然后根据请求格式模拟请求完成登录并查到记录。

有了记录以后工作就比较朴素了，我们这里只介绍 html 报告的生成。我们的 html 报告模板存在 templates 文件夹中，生成报告时会做占位符字符串替换从而把 CSS、JS、消费记录、成就数据嵌入 html 文件得到 output/report.html.

成就系统可以看 achievements.py 里的 evaluate_achievements 函数，我们这里讲讲这个系统是怎么设计的。每个成就有解锁条件，所以我们把判断是否解锁成就需要的所有数据定义为 AchContext 类，这样每个成就可以写成形如 `ach_name(ctx: AchContext) -> AchievementResult` 的函数，我们只要传入 AchContext 就知道这个成就是否解锁了。

在 evaluate_achievements 里，我们会遍历 CHECKERS 里的所有成就并判断其是否解锁。AchievementResult 里的 id 则是每个成就的标识，report_script.js 根据这个 id 在 ACH_META 里找到对应的成就描述等信息并显示出来。

最后，用户可以选择将数据传到服务器。服务器用类似键值对的 key-val 方式存储数据。我们简单地把整个 html 文件作为 val，将 `report:id` 作为 key，这里的 id 是 `hash(secret:hash(学号))`. 最后用户可以在 `https://eatbit.top/r/{id}` 访问这个 html 网页. 具体可以看 main.py 的 upload_report 函数和放在服务器端的 cloudflare_worker/worker.js.
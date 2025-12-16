from __future__ import annotations


def is_dingtalk_running() -> bool:
    try:
        import psutil
    except ModuleNotFoundError:
        raise RuntimeError("未安装 psutil。请先执行：pip install psutil")

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


def main() -> int:
    try:
        running = is_dingtalk_running()
    except RuntimeError as e:
        print(str(e))
        return 2

    if running:
        print("检测到钉钉正在运行。请完全退出钉钉（包括系统托盘）后再继续。")
        return 1

    print("未检测到钉钉进程。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
(function () {
    // EAT_DATA: { "2025": { "2025-03-01": { count, amount, merchants, txs } } }

    const yearSwitcher = document.getElementById("year-switcher");
    const heatmap = document.getElementById("heatmap");
    const detail = document.getElementById("day-detail");

    const IS_CLOUD = window.location.hostname === "eatbit.top";
    const HAS_PW_HASH = (window.location.hash || "").toLowerCase().includes("#pw=");

    // 标志 1：是否允许在页面上编辑（头像、标题、pin 等）
    // - 本地 HTML：始终可编辑但不可保存
    // - 云端无 #pw：只读
    // - 云端带 #pw：可编辑且可保存
    const IS_EDIT_MODE = !IS_CLOUD || HAS_PW_HASH;

    // 标志 2：是否允许“保存到链接”（向服务器发送 PUT 请求）
    // 仅当运行在 eatbit.top 且带有 #pw=... 时才允许
    const IS_SAVABLE = IS_CLOUD && HAS_PW_HASH;

    const years = Object.keys(EAT_DATA).sort();
    if (years.length === 0) {
        heatmap.textContent = "没有可用数据";
        return;
    }

    let currentYear = years[years.length - 1];

    function buildYearButtons() {
        yearSwitcher.innerHTML = "";
        years.forEach((year) => {
            const btn = document.createElement("button");
            btn.textContent = year;
            btn.className = "year-button" + (year === currentYear ? " active" : "");
            btn.onclick = () => {
                currentYear = year;
                buildYearButtons();
                renderYear(year);
            };
            yearSwitcher.appendChild(btn);
        });
    }

    // === 饭力图 ===

    function getDateRangeForYear(year) {
        const start = new Date(Number(year), 0, 1); // Jan 1
        const end = new Date(Number(year), 11, 31); // Dec 31
        return { start, end };
    }

    function buildDailyArrayForYear(year) {
        const stats = EAT_DATA[year] || {};
        const { start, end } = getDateRangeForYear(year);
        const days = [];
        const firstDayOfWeek = (start.getDay() + 6) % 7; // 以周一为 0
        let index = 0;

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1), index++) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const key = `${yyyy}-${mm}-${dd}`;
            const dayStats = stats[key] || { count: 0, amount: 0, merchants: [] };

            const weekday = (d.getDay() + 6) % 7; // 周一映射为 0
            const weekIndex = Math.floor((index + firstDayOfWeek) / 7);

            days.push({ date: key, weekday, weekIndex, ...dayStats });
        }
        return days;
    }

    function renderSummaryFromDays(year, days) {
        const cards = document.getElementById("summary-cards");
        const highlight = document.getElementById("summary-highlight");
        if (!cards || !highlight) return;

        let eatDays = 0;
        let totalCount = 0;
        let totalAmount = 0;
        let maxDay = null;
        let maxStreak = 0;
        let currentStreak = 0;

        days.forEach((d) => {
            const count = d.count || 0;
            const amount =
                typeof d.amount === "number" ? d.amount : Number(d.amount || 0);

            if (count > 0) {
                eatDays += 1;
                currentStreak += 1;
                if (currentStreak > maxStreak) {
                    maxStreak = currentStreak;
                }
            } else {
                currentStreak = 0;
            }

            totalCount += count;
            totalAmount += amount;

            if (count > 0) {
                if (
                    !maxDay ||
                    count > maxDay.count ||
                    (count === maxDay.count && amount > maxDay.amount)
                ) {
                    maxDay = { date: d.date, count, amount };
                }
            }
        });

        const avgPerMeal = totalCount > 0 ? totalAmount / totalCount : 0;

        cards.innerHTML = "";

        function addCard(label, value) {
            const card = document.createElement("div");
            card.className = "summary-card";

            const labelEl = document.createElement("div");
            labelEl.className = "summary-card-label";
            labelEl.textContent = label;

            const valueEl = document.createElement("div");
            valueEl.className = "summary-card-value";
            valueEl.textContent = value;

            card.appendChild(labelEl);
            card.appendChild(valueEl);
            cards.appendChild(card);
        }

        addCard("全年就餐天数", `${eatDays} 天`);
        addCard("总用餐次数", `${totalCount} 次`);
        addCard("总消费金额", `${totalAmount.toFixed(2)} 元`);
        addCard(
            "平均每餐消费",
            totalCount > 0 ? `${avgPerMeal.toFixed(2)} 元` : "—"
        );

        if (!maxDay) {
            highlight.textContent = `${year} 年在食堂没有消费记录。`;
        } else {
            highlight.textContent = `吃得最多的一天是 ${maxDay.date}：共 ${maxDay.count} 次，消费 ${maxDay.amount.toFixed(
                2
            )} 元；最长连续吃饭天数为 ${maxStreak} 天。`;
        }
    }

    function countWeeks(days) {
        if (days.length === 0) return 0;
        return days[days.length - 1].weekIndex + 1;
    }

    function computeMaxCount(days) {
        let max = 0;
        days.forEach((d) => {
            if (d.count > max) max = d.count;
        });
        return max;
    }

    function levelForCount(count, max) {
        if (count === 0) return 0;
        if (max <= 1) return 2;
        const ratio = count / max;
        if (ratio <= 0.25) return 1;
        if (ratio <= 0.5) return 2;
        if (ratio <= 0.75) return 3;
        return 4;
    }

    function renderYear(year) {
        const days = buildDailyArrayForYear(year);
        renderSummaryFromDays(year, days);
        const weekCount = countWeeks(days);
        const maxCount = computeMaxCount(days);

        heatmap.innerHTML = "";

        const scroll = document.createElement("div");
        scroll.className = "heatmap-scroll";

        const container = document.createElement("div");
        container.style.display = "flex";

        // Weekday labels (一三五七)
        const weekdayLabels = document.createElement("div");
        weekdayLabels.className = "weekday-labels";
        const weekdayTexts = ["一", "三", "五", "七"];
        const weekdayRows = [1, 3, 5, 7]; // 对应周一、周三、周五、周日
        weekdayTexts.forEach((label, idx) => {
            const div = document.createElement("div");
            div.textContent = label;
            div.style.gridRowStart = weekdayRows[idx];
            weekdayLabels.appendChild(div);
        });

        const main = document.createElement("div");

        // Month labels (top)
        const monthLabels = document.createElement("div");
        monthLabels.className = "month-labels";
        let lastMonth = null;
        for (let w = 0; w < weekCount; w++) {
            const monthDiv = document.createElement("div");
            // 找出这一列对应周的第一天作为代表
            const weekDay = days.find((d) => d.weekIndex === w);
            if (weekDay) {
                const dObj = new Date(weekDay.date);
                const month = dObj.getMonth() + 1;
                if (month !== lastMonth) {
                    monthDiv.textContent = month + "月";
                    lastMonth = month;
                }
            }
            monthLabels.appendChild(monthDiv);
        }

        const grid = document.createElement("div");
        grid.className = "heatmap-grid";

        days.forEach((day) => {
            const cell = document.createElement("div");
            const weekday = day.weekday; // 0 = 周一
            const weekIndex = day.weekIndex;

            cell.className = "day-cell";
            cell.dataset.date = day.date;
            const level = levelForCount(day.count, maxCount);
            cell.classList.add(`level-${level}`);

            cell.style.gridRowStart = weekday + 1;
            cell.style.gridColumnStart = weekIndex + 1;

            cell.title = `${day.date}：${day.count} 次用餐`;
            cell.onclick = () => showDayDetail(year, day);

            grid.appendChild(cell);
        });

        main.appendChild(monthLabels);
        main.appendChild(grid);

        container.appendChild(weekdayLabels);
        container.appendChild(main);

        scroll.appendChild(container);
        heatmap.appendChild(scroll);
    }

    function showDayDetail(year, day) {
        detail.innerHTML = "";
        if (!day || !day.count) {
            return;
        }
        const h2 = document.createElement("h2");
        h2.textContent = day.date;
        detail.appendChild(h2);

        const p1 = document.createElement("p");
        p1.textContent = `当天在食堂吃了 ${day.count} 次，共消费 ${day.amount.toFixed(2)} 元。`;
        detail.appendChild(p1);

        if (day.txs && day.txs.length > 0) {
            const ul = document.createElement("ul");
            day.txs.forEach((tx) => {
                const li = document.createElement("li");
                const time = tx.time || "";
                const mer = tx.mername || tx.name || "";
                const amtNum = typeof tx.amount === "number" ? tx.amount : Number(tx.amount || 0);
                li.textContent = `${time} ${mer}：${amtNum.toFixed(2)} 元`;
                ul.appendChild(li);
            });
            detail.appendChild(ul);
        } else if (day.merchants && day.merchants.length > 0) {
            const ul = document.createElement("ul");
            day.merchants.slice(0, 5).forEach((m) => {
                const li = document.createElement("li");
                li.textContent = `${m.name}：${m.amount.toFixed(2)} 元`;
                ul.appendChild(li);
            });
            detail.appendChild(ul);
        }
    }

    function setupAvatarUpload() {
        const avatar = document.querySelector(".avatar");
        const fileInput = document.getElementById("avatar-input");
        if (!avatar || !fileInput) {
            return;
        }

        if (!IS_EDIT_MODE) {
            avatar.style.cursor = "default";
            return;
        }

        avatar.style.cursor = "pointer";

        avatar.addEventListener("click", () => {
            fileInput.click();
        });

        fileInput.addEventListener("change", () => {
            const files = fileInput.files;
            if (!files || files.length === 0) {
                return;
            }
            const file = files[0];
            if (!file.type || !file.type.startsWith("image/")) {
                alert("请选择图片文件作为头像");
                fileInput.value = "";
                return;
            }
            if (file.size && file.size > 300 * 1024) {
                alert("头像图片大小不能超过 300 KB。你可以到 https://squoosh.app 压缩图片后再上传。");
                fileInput.value = "";
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target && e.target.result;
                if (!result) return;
                avatar.style.backgroundImage = `url(${result})`;
                avatar.style.backgroundSize = "cover";
                avatar.style.backgroundPosition = "center";
                avatar.textContent = "";
            };
            reader.readAsDataURL(file);
        });
    }

    // === 成就系统 ===

    // 静态成就元数据（根据 achievements.md）
    const ACH_META = {
        early_bird: {
            title: "早八人",
            desc: "你见过早上八点的百丽宫吗",
            rarity: 3,
            condition: "06:00-08:00间消费过5次",
            emoji: "⏰",
        },
        night_owl: {
            title: "守夜人",
            desc: "据说只要不计算晚上的卡路里，它们就不存在",
            rarity: 3,
            condition: "21:00以后消费过5次",
            emoji: "🌙",
        },
        make_it_round: {
            title: "凑单领域大神",
            desc: "学校也有满减吗",
            rarity: 3,
            condition: "单日消费总金额不小于20且为10的倍数",
            emoji: "⚖️",
        },
        big_meal: {
            title: "加个鸡腿",
            desc: "吃点好的！",
            rarity: 2,
            condition: "单笔消费金额大于25元",
            emoji: "🍗",
        },
        minimalist: {
            title: "极限生存",
            desc: "极简主义饮食践行者",
            rarity: 3,
            condition: "单笔消费金额小于1元",
            emoji: "🥛",
        },
        lost_kid: {
            title: "迷途之子",
            desc: "你迷路了吗",
            rarity: 4,
            condition: "全年就餐天数小于50天",
            emoji: "❔",
        },
        eater: {
            title: "干饭人",
            desc: "至少你找到了食堂",
            rarity: 1,
            condition: "全年就餐天数大于等于1天",
            emoji: "🍽️",
        },
        hundred_days: {
            title: "百日烟火",
            desc: "食堂阿姨可能都认识你了",
            rarity: 2,
            condition: "全年就餐天数大于等于100天",
            emoji: "🍲",
        },
        full_timer: {
            title: "全勤奖",
            desc: "一瞬一瞬累积起来就会变成一辈子",
            rarity: 3,
            condition: "全年就餐天数大于等于200天",
            emoji: "🏅",
        },
        default_setting: {
            title: "西西弗斯",
            desc: "我们必须想象你是幸福的",
            rarity: 2,
            condition: "在同一个商家消费次数大于20次",
            emoji: "🔁",
        },
        story_start: {
            title: "故事的开始",
            desc: "其实味道和去年没区别",
            rarity: 4,
            condition: "在本年第一天吃饭",
            emoji: "📅",
        },
        another_year: {
            title: "又一年",
            desc: "明年见",
            rarity: 4,
            condition: "在本年最后一天吃饭",
            emoji: "👋",
        },
        missing_breakfast: {
            title: "消失的早餐",
            desc: "那些从来不吃早饭的人，现在都怎么样了？",
            rarity: 3,
            condition: "9点前消费次数小于10次",
            emoji: "👻",
        },
        good_meals: {
            title: "好好吃饭",
            desc: "你拥有令人羡慕的健康作息",
            rarity: 3,
            condition: "单日内同时有早、中、晚三餐记录",
            emoji: "🥗",
        },
        my_turn: {
            title: "我的回合",
            desc: "我的回合之后——还是我的回合！",
            rarity: 3,
            condition: "2分钟内连续刷卡2次",
            emoji: "🃏",
        },
        error_404: {
            title: "Error 404",
            desc: "404 Not Found",
            rarity: 3,
            condition: "单笔消费金额恰为4.04/40.4/404元",
            emoji: "❌",
        },
        hello_world: {
            title: "Hello World",
            desc: "你好，食堂！",
            rarity: 1,
            condition: "在今年进行过消费",
            emoji: "👋",
        },
        pi: {
            title: "PI",
            desc: "圆食，启动！",
            rarity: 3,
            condition: "单笔消费金额恰为3.14/31.4/314元",
            emoji: "🥧",
        },
        secure_call: {
            title: "加密通话",
            desc: "你的账户安全系数击败了99％的同学",
            rarity: 3,
            condition: "密码不是默认值 123456",
            emoji: "🔐",
        },
        noticed: {
            title: "注意到",
            desc: "注意力惊人",
            rarity: 4,
            condition: "全年消费总金额恰为学号后四位的倍数",
            emoji: "🧐",
        },
        perfect_week: {
            title: "完美一周",
            desc: "医生看了都说好",
            rarity: 3,
            condition: "连续七天一日三餐",
            emoji: "👨‍⚕",
        },
        cosmic_meal: {
            title: "宇宙饭",
            desc: "如果你的商家里没有相同的商家，获得本成就",
            rarity: 3,
            condition: "连续五天每天在不一样的商家吃饭",
            emoji: "🌌",
        },
        edge_runner: {
            title: "边缘行者",
            desc: "百丽宫有活着的传奇",
            rarity: 4,
            condition: "在任意小时的第59分59秒完成交易",
            emoji: "⚡",
        },
    };

    const MAX_PINS = 6;

    function loadInitialPinnedIds() {
        const body = document.body;
        if (!body || !body.dataset) return [];
        const raw = body.dataset.pinnedIds;
        if (!raw) return [];
        return raw
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
    }

    let pinnedIdsState = loadInitialPinnedIds();

    function isHiddenAchievement(a) {
        return a && a.rarity === 4;
    }

    function buildMergedAchievements() {
        const merged = [];
        const state = typeof ACH_STATE === "object" ? ACH_STATE : {};
        for (const [id, meta] of Object.entries(ACH_META)) {
            const st = state[id] || { unlocked: false, unlocked_at: null, extra: {} };
            merged.push({ id, ...meta, ...st });
        }
        return merged;
    }

    function updateAchievementsSummary(allAchievements) {
        const el = document.getElementById("achievements-summary");
        if (!el) return;
        const base = allAchievements.filter((a) => !isHiddenAchievement(a));
        const total = base.length;
        const unlocked = allAchievements.filter((a) => a.unlocked).length;
        const hiddenUnlocked = allAchievements.filter(
            (a) => isHiddenAchievement(a) && a.unlocked
        ).length;

        el.innerHTML = "";
        const baseText = document.createTextNode(`已解锁 ${unlocked}/${total}`);
        el.appendChild(baseText);

        if (hiddenUnlocked > 0) {
            const hint = document.createElement("span");
            hint.className = "hidden-achievements-hint";
            hint.textContent = `（包含 ${hiddenUnlocked} 个隐藏成就！）`;
            el.appendChild(hint);
        }
    }

    function loadPinnedIds(allAchievements) {
        const validIds = new Set(allAchievements.map((a) => a.id));
        return pinnedIdsState.filter((id) => validIds.has(id));
    }

    function savePinnedIds(ids) {
        pinnedIdsState = [...ids];
        const body = document.body;
        if (body && body.dataset) {
            body.dataset.pinnedIds = ids.join(",");
        }
    }

    function renderPinnedAchievements(allAchievements) {
        const container = document.getElementById("pinned-achievements");
        if (!container) return;
        container.innerHTML = "";

        const pinnedIds = loadPinnedIds(allAchievements);
        let pinned;
        if (pinnedIds.length === 0) {
            pinned = allAchievements
                .filter((a) => a.unlocked)
                .sort((a, b) => b.rarity - a.rarity)
                .slice(0, MAX_PINS);
            savePinnedIds(pinned.map((a) => a.id));
        } else {
            const map = new Map(allAchievements.map((a) => [a.id, a]));
            pinned = pinnedIds.map((id) => map.get(id)).filter((a) => a && a.unlocked);
        }

        pinned = pinned.filter((a) => a && a.unlocked);

        if (pinned.length === 0) {
            const empty = document.createElement("div");
            empty.className = "achievement-desc";
            empty.textContent = "当前还没有已解锁的成就";
            container.appendChild(empty);
            return;
        }

        pinned.forEach((a) => {
            const card = document.createElement("div");
            card.className = "achievement-card";

            const icon = document.createElement("div");
            icon.className = "achievement-icon"; // 目前为灰色方块占位
            if (a.emoji) {
                icon.textContent = a.emoji;
            }

            const text = document.createElement("div");
            text.className = "achievement-text";

            const titleEl = document.createElement("div");
            titleEl.className = "achievement-title";
            titleEl.textContent = a.title;

            const descEl = document.createElement("div");
            descEl.className = "achievement-desc";
            descEl.textContent = a.condition || a.desc || "";

            text.appendChild(titleEl);
            text.appendChild(descEl);

            card.appendChild(icon);
            card.appendChild(text);

            const timeEl = document.createElement("div");
            timeEl.className = "achievement-time";
            timeEl.textContent = a.unlocked_at || "";

            card.appendChild(timeEl);

            container.appendChild(card);
        });
    }

    function renderAllAchievementsModal(allAchievements) {
        const listEl = document.getElementById("all-achievements-list");
        if (!listEl) return;
        listEl.innerHTML = "";

        const pinnedIds = new Set(loadPinnedIds(allAchievements));

        const visible = allAchievements.filter(
            (a) => !(isHiddenAchievement(a) && !a.unlocked)
        );

        const sorted = visible
            .map((a, index) => ({
                data: a,
                index,
                isPinned: pinnedIds.has(a.id),
                isUnlocked: !!a.unlocked,
            }))
            .sort((x, y) => {
                if (x.isPinned !== y.isPinned) {
                    return x.isPinned ? -1 : 1;
                }
                if (x.isUnlocked !== y.isUnlocked) {
                    return x.isUnlocked ? -1 : 1;
                }
                return x.index - y.index;
            });

        sorted.forEach((wrapper) => {
            const a = wrapper.data;

            const row = document.createElement("div");
            row.className = "all-achievement-row";

            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.className = "pin-checkbox";
            checkbox.checked = pinnedIds.has(a.id);

            const icon = document.createElement("div");
            icon.className = "achievement-icon";
            if (a.emoji) {
                icon.textContent = a.emoji;
            }

            const info = document.createElement("div");
            info.className = "all-achievement-info";

            const meta = document.createElement("div");
            meta.className = "all-achievement-meta";

            const titleEl = document.createElement("div");
            titleEl.className = "achievement-title";
            titleEl.textContent = a.title;

            const descEl = document.createElement("div");
            descEl.className = "achievement-desc";
            descEl.textContent = a.desc;

            meta.appendChild(titleEl);

            if (a.condition) {
                const condEl = document.createElement("div");
                condEl.className = "achievement-desc";
                condEl.textContent = a.condition;
                meta.appendChild(condEl);
            }

            meta.appendChild(descEl);

            info.appendChild(meta);

            const timeEl = document.createElement("div");
            timeEl.className = "all-achievement-unlock-time";
            timeEl.textContent = a.unlocked_at ? a.unlocked_at : "未解锁";

            row.appendChild(checkbox);
            row.appendChild(icon);
            row.appendChild(info);
            row.appendChild(timeEl);

            if (!a.unlocked) {
                checkbox.disabled = true;
                row.classList.add("locked");
            } else if (!IS_EDIT_MODE) {
                checkbox.disabled = true;
            } else {
                const applyPinState = (nextChecked) => {
                    const current = new Set(loadPinnedIds(allAchievements));
                    if (nextChecked) {
                        if (current.size >= MAX_PINS && !current.has(a.id)) {
                            alert(`最多只能固定 ${MAX_PINS} 个成就`);
                            checkbox.checked = false;
                            return;
                        }
                        current.add(a.id);
                    } else {
                        current.delete(a.id);
                    }
                    const arr = Array.from(current);
                    savePinnedIds(arr);
                    renderPinnedAchievements(allAchievements);
                };

                checkbox.onchange = () => {
                    applyPinState(checkbox.checked);
                };

                row.onclick = (e) => {
                    if (e.target === checkbox) return;
                    const nextChecked = !checkbox.checked;
                    checkbox.checked = nextChecked;
                    applyPinState(nextChecked);
                };
            }

            listEl.appendChild(row);
        });
    }

    function setupSaveButton() {
        const existing = document.getElementById("save-to-link");

        if (!IS_SAVABLE) {
            if (existing && existing.parentNode) {
                existing.parentNode.removeChild(existing);
            }
            return;
        }

        const header = document.querySelector(".page-header");
        if (!header) return;

        const btn = existing || document.createElement("button");
        if (!existing) {
            btn.id = "save-to-link";
            btn.textContent = "保存";
            header.appendChild(btn);
        }

        btn.onclick = async () => {
            const originalText = btn.textContent || "保存";
            btn.disabled = true;
            btn.textContent = "保存中...";

            const path = window.location.pathname || "";
            const parts = path.split("/").filter(Boolean);
            if (parts.length < 2 || parts[0] !== "r") {
                alert("无法解析报告 ID，保存失败。");
                btn.disabled = false;
                btn.textContent = originalText;
                return;
            }
            const currentId = parts[1];
            const html = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;

            try {
                const resp = await fetch(`/api/reports/${encodeURIComponent(currentId)}`, {
                    method: "PUT",
                    headers: { "Content-Type": "text/html" },
                    body: html,
                });
                if (resp.ok) {
                    btn.textContent = "已保存";
                    setTimeout(() => {
                        btn.disabled = false;
                        btn.textContent = originalText;
                    }, 1500);
                } else {
                    alert(`保存失败：HTTP ${resp.status}`);
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            } catch (e) {
                alert("保存失败，请检查网络连接。");
                btn.disabled = false;
                btn.textContent = originalText;
            }
        };
    }

    function setupAchievementsUI() {
        const allAchievements = buildMergedAchievements();

        const userTitle = document.getElementById("user-title");
        if (userTitle) {
            userTitle.contentEditable = IS_EDIT_MODE ? "true" : "false";
        }
        renderPinnedAchievements(allAchievements);
        updateAchievementsSummary(allAchievements);

        setupSaveButton();

        const modal = document.getElementById("achievements-modal");
        const openBtn = document.getElementById("view-all-achievements");
        const closeBtn = document.getElementById("close-achievements-modal");

        if (openBtn && modal) {
            openBtn.onclick = () => {
                renderAllAchievementsModal(allAchievements);
                modal.classList.remove("hidden");
            };
        }

        if (closeBtn && modal) {
            closeBtn.onclick = () => {
                modal.classList.add("hidden");
            };
        }

        if (modal) {
            modal.addEventListener("click", (e) => {
                if (e.target === modal) {
                    modal.classList.add("hidden");
                }
            });
        }

    }

    buildYearButtons();
    renderYear(currentYear);
    setupAchievementsUI();
    setupAvatarUpload();
})();

(function () {
    // EAT_DATA: { "2025": { "2025-03-01": { count, amount, merchants, txs } } }

    const yearSwitcher = document.getElementById("year-switcher");
    const heatmap = document.getElementById("heatmap");
    const detail = document.getElementById("day-detail");

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
            rarity: 2,
            condition: "21:00以后消费过5次",
            emoji: "🌙",
        },
        make_it_round: {
            title: "凑单领域大神",
            desc: "学校也有满减吗",
            rarity: 4,
            condition: "某日消费总金额不小于20且为10的倍数",
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
            desc: "恭喜你找到了食堂",
            rarity: 1,
            condition: "全年就餐天数大于1天",
            emoji: "🍽️",
        },
        hundred_days: {
            title: "百日烟火",
            desc: "100个日日夜夜的烟火",
            rarity: 2,
            condition: "全年就餐天数大于100天",
            emoji: "🍲",
        },
        regular: {
            title: "老主顾",
            desc: "食堂阿姨可能都认识你了",
            rarity: 3,
            condition: "全年就餐天数大于150天",
            emoji: "🤝",
        },
        full_timer: {
            title: "全勤奖",
            desc: "感谢你对食堂的支持",
            rarity: 4,
            condition: "全年就餐天数大于200天",
            emoji: "🏅",
        },
        default_setting: {
            title: "默认设置",
            desc: "人类的本质是复读机，口味也是",
            rarity: 3,
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
            rarity: 2,
            condition: "9点前消费次数小于10次",
            emoji: "👻",
        },
        good_meals: {
            title: "好好吃饭",
            desc: "你拥有令人羡慕的健康作息",
            rarity: 2,
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
            rarity: 4,
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
            rarity: 4,
            condition: "单笔消费金额恰为3.14/31.4/314元",
            emoji: "🥧",
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
            rarity: 4,
            condition: "连续七天一日三餐",
            emoji: "👨‍⚕",
        },
        cosmic_meal: {
            title: "宇宙饭",
            desc: "对战开始时：如果你的商家里没有相同的商家，获得本成就",
            rarity: 4,
            condition: "连续五天每天在不一样的商家吃饭",
            emoji: "🌌",
        },
    };

    const MAX_PINS = 6;
    let pinnedIdsState = [];

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
        const total = allAchievements.length;
        const unlocked = allAchievements.filter((a) => a.unlocked).length;
        el.textContent = `您已解锁 ${unlocked}/${total}`;
    }

    function loadPinnedIds(allAchievements) {
        const validIds = new Set(allAchievements.map((a) => a.id));
        return pinnedIdsState.filter((id) => validIds.has(id));
    }

    function savePinnedIds(ids) {
        pinnedIdsState = [...ids];
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

        const sorted = allAchievements
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

    function setupAchievementsUI() {
        const allAchievements = buildMergedAchievements();
        renderPinnedAchievements(allAchievements);
        updateAchievementsSummary(allAchievements);

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
})();

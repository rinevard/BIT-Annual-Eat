(function () {
    // EAT_DATA: { "2025": { "2025-03-01": { count, amount, merchants: [{name, amount}] } } }

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

    function getDateRangeForYear(year) {
        const start = new Date(Number(year), 0, 1); // Jan 1
        const end = new Date(Number(year), 11, 31); // Dec 31
        return { start, end };
    }

    function buildDailyArrayForYear(year) {
        const stats = EAT_DATA[year] || {};
        const { start, end } = getDateRangeForYear(year);
        const days = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const dd = String(d.getDate()).padStart(2, "0");
            const key = `${yyyy}-${mm}-${dd}`;
            const dayStats = stats[key] || { count: 0, amount: 0, merchants: [] };
            days.push({ date: key, weekday: d.getDay(), ...dayStats });
        }
        return days;
    }

    function countWeeks(days) {
        return Math.ceil(days.length / 7);
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

        const container = document.createElement("div");
        container.style.display = "flex";

        // Weekday labels (一三五)
        const weekdayLabels = document.createElement("div");
        weekdayLabels.className = "weekday-labels";
        ["一", "三", "五"].forEach((label) => {
            const div = document.createElement("div");
            div.textContent = label;
            weekdayLabels.appendChild(div);
        });

        const main = document.createElement("div");

        // Month labels (top)
        const monthLabels = document.createElement("div");
        monthLabels.className = "month-labels";
        for (let w = 0; w < weekCount; w++) {
            const monthDiv = document.createElement("div");
            // 取这一周的第一天作为代表
            const idx = w * 7;
            if (idx < days.length) {
                const d = new Date(days[idx].date);
                const month = d.getMonth() + 1;
                if (w === 0 || d.getDate() <= 7) {
                    monthDiv.textContent = month + "月";
                } else {
                    monthDiv.textContent = "";
                }
            }
            monthLabels.appendChild(monthDiv);
        }

        const grid = document.createElement("div");
        grid.className = "heatmap-grid";

        days.forEach((day, index) => {
            const cell = document.createElement("div");
            const weekday = (day.weekday + 6) % 7; // 把周一映射为 0
            const weekIndex = Math.floor(index / 7);

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

        heatmap.appendChild(container);
    }

    function showDayDetail(year, day) {
        detail.innerHTML = "";
        const h2 = document.createElement("h2");
        h2.textContent = `${day.date}（${year}）`;
        detail.appendChild(h2);

        const p1 = document.createElement("p");
        p1.textContent = `当天在食堂吃了 ${day.count} 次，共消费 ${day.amount.toFixed(2)} 元。`;
        detail.appendChild(p1);

        if (day.merchants && day.merchants.length > 0) {
            const ul = document.createElement("ul");
            day.merchants.slice(0, 5).forEach((m) => {
                const li = document.createElement("li");
                li.textContent = `${m.name}：${m.amount.toFixed(2)} 元`;
                ul.appendChild(li);
            });
            detail.appendChild(ul);
        }
    }

    buildYearButtons();
    renderYear(currentYear);
})();

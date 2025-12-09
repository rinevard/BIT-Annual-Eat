// EAT_DATA and ACH_STATE are injected by the HTML template

/* --- Stat Logic --- */
let totalAmount = 0;
let totalMeals = 0;
let totalDays = 0;

if (typeof EAT_DATA !== 'undefined') {
    Object.values(EAT_DATA).forEach(yearData => {
        Object.values(yearData).forEach(day => {
            totalMeals += day.count || 0;
            totalAmount += day.amount || 0;
            totalDays += 1;
        });
    });
}

// Format Amount (e.g. 3.1k)
function formatAmount(num) {
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return Math.round(num).toString();
}

const stats = [
    { title: "开销", value: formatAmount(totalAmount), desc: "在学校花了这么多元钱" },
    { title: "用餐", value: String(totalMeals), desc: "在学校吃了这么多顿饭" },
    { title: "日常", value: String(totalDays), desc: "在学校里吃饭的日子" },
];

const stackContainer = document.getElementById('card-stack');

function renderStack() {
    stackContainer.innerHTML = '';
    stats.forEach((stat, index) => {
        const card = document.createElement('div');

        // 基于初始 index 分配颜色
        let colorClass = '';
        if (index === 0) colorClass = 'color-cyan';
        else if (index === 1) colorClass = 'color-pink';
        else colorClass = 'color-white';

        card.className = `stat-card ${colorClass}`;

        card.innerHTML = `
                    <div class="stat-label">
                        <span>${stat.title}</span>
                    </div>
                    <div class="stat-value">${stat.value}</div>
                    <div class="stat-desc">${stat.desc}</div>
                `;

        card.onclick = () => {
            const cards = stackContainer.querySelectorAll('.stat-card');
            const isTop = card === cards[cards.length - 1];

            if (isTop) {
                // 如果是最上层，播放动画然后移到最底层
                card.classList.add('flying-out');
                setTimeout(() => {
                    stackContainer.prepend(card);
                    card.classList.remove('flying-out');
                    reassignClasses();
                }, 300);
            }
        };

        stackContainer.appendChild(card);
    });
}

function reassignClasses() {
    const cards = document.querySelectorAll('.stat-card');
    const total = cards.length;

    cards.forEach((card, i) => {
        // 移除所有旧的位置类
        card.classList.remove('pos-top', 'pos-mid', 'pos-bot');

        // 重新分配位置类 (基于当前 DOM 顺序)
        // DOM 最后一个元素在最上层
        if (i === total - 1) card.classList.add('pos-top');
        else if (i === total - 2) card.classList.add('pos-mid');
        else card.classList.add('pos-bot');
    });
}

// 2. 徽章逻辑
// 徽章的渲染和交互逻辑

// 完整成就数据（用于打印机显示及徽章生成）
// ID 对应 images/ 下的文件名
// 完整成就配置
const ACH_CONFIG = [
    { id: "lost_kid", name: "迷途之子", rarity: 4, condition: "全年就餐天数 < 50 天", desc: "你迷路了吗", time: "2025-03-15" },
    { id: "noticed", name: "注意到", rarity: 4, condition: "消费总金额恰为学号后四位的倍数", desc: "注意力惊人", time: "2025-04-22" },
    { id: "edge_runner", name: "边缘行者", rarity: 4, condition: "在任意小时的第59分59秒完成交易", desc: "百丽宫有活着的传奇", time: "2025-05-08" },
    { id: "early_bird", name: "早八人", rarity: 3, condition: "06:00-08:00间消费过5次", desc: "你见过早上八点的百丽宫吗", time: "2025-02-28" },
    { id: "my_turn", name: "我的回合", rarity: 3, condition: "2分钟内连续刷卡 2 次", desc: "我的回合之后——还是我的回合！", time: "2025-03-10" },
    { id: "pi", name: "PI", rarity: 3, condition: "单笔消费金额恰为 3.14 元", desc: "圆食，启动！", time: "2025-03-14" },
    { id: "cosmic_meal", name: "宇宙饭", rarity: 3, condition: "连续五天每天在不一样的商家吃饭", desc: "如果你的商家里没有相同的商家，获得本成就", time: "2025-04-01" },
    { id: "full_timer", name: "全勤奖", rarity: 3, condition: "全年就餐天数 >= 200 天", desc: "一瞬一瞬累积起来就会变成一辈子", time: "2025-11-20" },
    { id: "default_setting", name: "西西弗斯", rarity: 2, condition: "在同一个商家消费次数大于20次", desc: "我们必须想象你是幸福的", time: "2025-04-15" },
    { id: "hello_world", name: "Hello World", rarity: 1, condition: "本年有消费过", desc: "你好，食堂！", time: "2025-01-02" },
    { id: "story_start", name: "故事的开始", rarity: 4, condition: "在本年第一天吃饭", desc: "其实味道和去年没区别", time: "2025-01-01" },
    { id: "another_year", name: "又一年", rarity: 4, condition: "在本年最后一天吃饭", desc: "明年见", time: "2025-12-31" },
    { id: "night_owl", name: "守夜人", rarity: 3, condition: "21:00以后消费过5次", desc: "据说只要不计算晚上的卡路里，它们就不存在", time: "2025-03-20" },
    { id: "big_meal", name: "加个鸡腿", rarity: 3, condition: "单笔消费金额 > 25元", desc: "吃点好的！", time: "2025-02-14" },
    { id: "minimalist", name: "极限生存", rarity: 3, condition: "单笔消费金额 < 1元", desc: "极简主义饮食践行者", time: "2025-05-01" },
    { id: "missing_breakfast", name: "消失的早餐", rarity: 3, condition: "全年9点前消费次数 < 10 次", desc: "那些从来不吃早饭的人，现在都怎么样了？", time: "2025-06-15" },
    { id: "good_meals", name: "好好吃饭", rarity: 3, condition: "单日内同时有早、中、晚三餐记录", desc: "你拥有令人羡慕的健康作息", time: "2025-03-05" },
    { id: "make_it_round", name: "凑单领域大神", rarity: 3, condition: "单日消费总金额>=20且为10的倍数", desc: "学校也有满减吗", time: "2025-04-10" },
    { id: "error_404", name: "Error 404", rarity: 3, condition: "单笔消费金额恰为 4.04 元", desc: "404 Not Found", time: "2025-04-04" },
    { id: "secure_call", name: "加密通话", rarity: 3, condition: "密码不是默认值 123456", desc: "你的账户安全系数击败了99％的同学", time: "2025-01-15" },
    { id: "perfect_week", name: "完美一周", rarity: 3, condition: "连续七天一日三餐", desc: "医生看了都说好", time: "2025-05-20" },
    { id: "hundred_days", name: "百日烟火", rarity: 2, condition: "全年就餐天数 >= 100 天", desc: "食堂阿姨可能都认识你了", time: "2025-07-10" },
    { id: "eater", name: "干饭人", rarity: 1, condition: "全年就餐天数 >= 1 天", desc: "至少你找到了食堂", time: "2025-01-02" },
];

let ACHIEVEMENTS_DATA = [];

if (typeof ACH_STATE !== 'undefined') {
    ACH_CONFIG.forEach(item => {
        const s = ACH_STATE[item.id];
        if (s && s.unlocked) {
            // Unlocked: add to list, update time
            const newItem = Object.assign({}, item);
            if (s.unlocked_at) {
                // Split date from datetime string if needed
                // Backend: "YYYY-MM-DD HH:MM", Frontend expects "YYYY-MM-DD" mostly for display
                newItem.time = s.unlocked_at.split(' ')[0];
            }
            ACHIEVEMENTS_DATA.push(newItem);
        }
    });
} else {
    // Fallback for independent viewing (keep all or random?)
    // Keep all for debugging if ACH_STATE is missing
    ACHIEVEMENTS_DATA = ACH_CONFIG;
}

// 由文件名生成徽章数据
const badges = ACHIEVEMENTS_DATA.map((item) => ({
    src: `images/${item.id}.png`,
    name: item.name,
}));

// 随机打乱顺序（后续主卡片与成就墙都基于这一顺序）
badges.sort(() => Math.random() - 0.5);
// 主卡片左侧 rack：只展示至多 6 个成就
const MAX_MAIN_BADGES = 6;
const mainBadges = badges.slice(0, MAX_MAIN_BADGES);

const badgeRack = document.getElementById('badges-rack');
mainBadges.forEach(b => {
    const el = document.createElement('div');
    el.className = 'badge-item';
    const img = document.createElement('img');
    img.src = b.src;
    img.alt = b.name;

    el.title = b.name;
    el.appendChild(img);
    badgeRack.appendChild(el);
});

const badgeItems = badgeRack.querySelectorAll('.badge-item');

badgeItems.forEach(el => {
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        // 统一行为：点击徽章也切换到成就模式
        updatePrinterMode('achievement');
    });
});

// 3. Rhythm 区域（真实数据驱动）
// Rhythm 区域的渲染和交互逻辑

let RHYTHM_CHUNKS = []; // 全局存储节奏块数据

function renderRhythm() {
    const rhythmContainer = document.getElementById('rhythm-container');
    rhythmContainer.innerHTML = ''; // 清空已有内容
    RHYTHM_CHUNKS = []; // 重置全局数据

    // 处理数据
    let dailyRecords = [];

    // 1. 将 EAT_DATA 展平成按日期排序的对象数组
    const years = Object.keys(EAT_DATA).sort();
    if (years.length === 0) {
        console.warn("没有找到 EAT_DATA，使用随机值进行预览。");
        // 构造假日期
        let startDate = new Date("2025-01-01");
        for (let i = 0; i < 365; i++) {
            let d = new Date(startDate);
            d.setDate(d.getDate() + i);
            dailyRecords.push({
                date: d.toISOString().split('T')[0],
                count: Math.floor(Math.random() * 4),
                amount: (Math.random() * 30).toFixed(1)
            });
        }
    } else {
        const year = years[years.length - 1];
        const yearData = EAT_DATA[year];
        const start = new Date(`${year}-01-01`);
        const end = new Date(`${year}-12-31`);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayData = yearData[dateStr];
            dailyRecords.push({
                date: dateStr,
                count: dayData ? dayData.count : 0,
                amount: dayData ? dayData.amount : 0,
                merchants: dayData ? dayData.merchants : []
            });
        }
    }

    // 2. 每 6 天聚合一次
    const CHUNK_SIZE = 6;

    for (let i = 0; i < dailyRecords.length; i += CHUNK_SIZE) {
        const chunkRecords = dailyRecords.slice(i, i + CHUNK_SIZE);
        // 计算该时间段内的日均用餐次数
        const totalCount = chunkRecords.reduce((a, b) => a + b.count, 0);
        const avg = totalCount / chunkRecords.length;

        // 存入全局结构
        RHYTHM_CHUNKS.push({
            index: i / CHUNK_SIZE,
            avg: avg,
            records: chunkRecords,
            startDate: chunkRecords[0].date,
            endDate: chunkRecords[chunkRecords.length - 1].date
        });
    }

    // 3. 归一化并渲染
    const MAX_VAL = 4;

    RHYTHM_CHUNKS.forEach((chunk, index) => {
        const val = chunk.avg;
        const bar = document.createElement('div');
        bar.className = 'rhythm-bar';

        let hPercent = (val / MAX_VAL) * 100;
        hPercent = Math.min(100, Math.max(0, hPercent));

        if (val > 3.0) bar.classList.add('l5');
        else if (val > 2.2) bar.classList.add('l4');
        else if (val > 1.5) bar.classList.add('l3');
        else if (val > 0.5) bar.classList.add('l2');
        else bar.classList.add('l1');

        bar.style.height = Math.max(5, hPercent) + '%';
        bar.title = `${chunk.startDate} ~ ${chunk.endDate}\nAvg: ${val.toFixed(1)} meals`;

        // === 交互绑定 ===
        bar.onclick = (e) => {
            e.stopPropagation();
            // 切换到节奏态
            updatePrinterMode('rhythm', index);
        };

        rhythmContainer.appendChild(bar);
    });
}

// 4. 头像上传
// 头像上传的逻辑

const fileInput = document.getElementById('file-upload');
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            document.getElementById('avatar-img').src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }
});

// 6. 条形码生成器（零依赖手写版）
// 条形码生成器的逻辑

const CODE128 = {
    // 根据标准 CODE128 BandCode 转换的二进制编码表 (ID 0-106)
    PATTERNS: [
        '11011001100', '11001101100', '11001100110', '10010011000', '10010001100', // 0-4
        '10001001100', '10011001000', '10011000100', '10001100100', '11001001000', // 5-9
        '11001000100', '11000100100', '10110011100', '10011011100', '10011001110', // 10-14
        '10111001100', '10011101100', '10011100110', '11001110010', '11001011100', // 15-19
        '11001001110', '11011100100', '11001110100', '11101101110', '11101001100', // 20-24
        '11100101100', '11100100110', '11101100100', '11100110100', '11100110010', // 25-29
        '11011011000', '11011000110', '11000110110', '10100011000', '10001011000', // 30-34
        '10001000110', '10110001000', '10001101000', '10001100010', '11010001000', // 35-39
        '11000101000', '11000100010', '10110111000', '10110001110', '10001101110', // 40-44
        '10111011000', '10111000110', '10001110110', '11101110110', '11010001110', // 45-49
        '11000101110', '11011101000', '11011100010', '11011101110', '11101011000', // 50-54
        '11101000110', '11100010110', '11101101000', '11101100010', '11100011010', // 55-59
        '11101111010', '11001000010', '11110001010', '10100110000', '10100001100', // 60-64
        '10010110000', '10010000110', '10000101100', '10000100110', '10110010000', // 65-69
        '10110000100', '10011010000', '10011000010', '10000110100', '10000110010', // 70-74
        '11000010010', '11001010000', '11110111010', '11000010100', '10001111010', // 75-79
        '10100111100', '10010111100', '10010011110', '10111100100', '10011110100', // 80-84
        '10011110010', '11110100100', '11110010100', '11110010010', '11011011110', // 85-89
        '11011110110', '11110110110', '10101111000', '10100011110', '10001011110', // 90-94
        '10111101000', '10111100010', '11110101000', '11110100010', '10111011110', // 95-99
        '10111101110', '11101011110', '11110101110',                             // 100-102
        '11010000100', '11010010000', '11010011100', '1100011101011'              // 103-106 (StartA/B/C, Stop)
    ],
    START_B: 104,
    STOP: 106,

    encode(text) {
        let codes = [this.START_B];
        let checksum = this.START_B;

        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i) - 32; // Code128B：字符编码减 32

            codes.push(code);
            checksum += code * (i + 1); // 位置从1开始
        }

        codes.push(checksum % 103); // 校验位
        codes.push(this.STOP);

        return codes.map(c => this.PATTERNS[c]).join('');
    },

    render(container, text) {
        const pattern = this.encode(text);
        const canvas = document.createElement('canvas');
        const scale = 2; // 放大2倍，更清晰
        const quietZone = 20; // 静区：两侧各留 20px 空白
        canvas.width = pattern.length * scale + quietZone * 2;
        canvas.height = 50;

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false; // 禁用抗锯齿，纯黑白边缘
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000';

        for (let i = 0; i < pattern.length; i++) {
            if (pattern[i] === '1') {
                ctx.fillRect(quietZone + i * scale, 0, scale, canvas.height);
            }
        }

        container.appendChild(canvas);
    }
};

// 生成条形码
function renderBarcode() {
    const container = document.getElementById('barcode-container');
    const textEl = document.getElementById('barcode-text');
    const code = 'F35EEE4E'; // 8位

    CODE128.render(container, code);
    textEl.textContent = code;
}

// 初始化入口
// 替换原来的初始化调用，改到底部，或者保留在底部（这里不需要删，只需确保 renderRhythm 能够被调用）
// 这里其实没改动逻辑，只是因为上面覆盖了 renderRhythm，避免 duplicate definition 报错，
// 我选择只替换 renderRhythm 函数体，不移动这些初始化调用。
// 所以这个 Chunk 可以省略，只要 Ensure 之前的 chunk 结束位置正确即可。
// 由于上面 chunk endLine 是 215，这里逻辑不变。
renderStack();
reassignClasses();
renderRhythm();
renderBarcode();

/* --- 新的左右卡片动画逻辑 --- */
// 左右卡片动画的逻辑

const rig = document.getElementById('cameraRig');
const cardLeft = document.getElementById('cardLeft');
const cardRight = document.getElementById('cardRight');
const mainCard = document.getElementById('mainCard');

// ===== 打印机成就列表逻辑 =====

const ITEMS_PER_PAGE = 6; // 每页显示的成就数量
const achievementSlot = document.getElementById('achievement-slot');

// 全局状态
let printerMode = 'achievement'; // 'achievement' | 'rhythm'
let currentAchievementPage = 0;
let currentRhythmIndex = 0;

// 分页数据
function getAchievementPages() {
    const pages = [];
    for (let i = 0; i < ACHIEVEMENTS_DATA.length; i += ITEMS_PER_PAGE) {
        pages.push(ACHIEVEMENTS_DATA.slice(i, i + ITEMS_PER_PAGE));
    }
    return pages;
}

const achievementPages = getAchievementPages();
const totalPages = achievementPages.length;

// 创建成就纸张
function createAchievementReceipt(pageIndex, state) {
    const el = document.createElement('div');
    el.className = `receipt ${state}`;

    const pageData = achievementPages[pageIndex];
    const pageNum = pageIndex + 1;

    // 构建成就行
    let rowsHTML = '';
    pageData.forEach(ach => {
        // 查找对应图片
        const imgSrc = `images/${ach.id}.png`;

        rowsHTML += `
                <div class="achievement-row">
                    <img class="ach-icon" src="${imgSrc}">
                    <div class="ach-content">
                        <div class="ach-header">
                            <span class="ach-name">${ach.name}</span>
                            <span class="ach-time">${ach.time}</span>
                        </div>
                        <div class="ach-condition">${ach.condition}</div>
                        <div class="ach-desc">${ach.desc}</div>
                    </div>
                </div>
            `;
    });

    el.innerHTML = `
        <div class="receipt-title">
            <span>PAGE ${pageNum}/${totalPages}</span>
        </div>
        ${rowsHTML}
    `;

    return el;
}

// 创建节奏纸张
function createRhythmReceipt(index, state) {
    const el = document.createElement('div');
    el.className = `receipt ${state}`;

    const chunk = RHYTHM_CHUNKS[index];
    if (!chunk) {
        el.innerHTML = `<div class="receipt-title">DATA ERROR</div>`;
        return el;
    }

    const { records } = chunk;

    // 构建每日记录行
    let rowsHTML = '';

    // 使用简单的日期格式化器
    const getDayStr = (isoDate) => {
        const d = new Date(isoDate);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    records.forEach(day => {
        if (day.count === 0) {
            // 空记录
            rowsHTML += `
            <div class="achievement-row" style="opacity: 0.3; gap: 10px; padding: 10px 0;">
                <div style="font-family: 'JetBrains Mono'; font-weight: 700;">${getDayStr(day.date)}</div>
                <div style="font-size: 12px; color: #000;">NO RECORD</div>
                <div style="margin-left: auto; font-family: 'JetBrains Mono'">---</div>
            </div>
           `;
            return;
        }

        // 提取商家名称及价格
        const details = day.merchants.map(m => `${m.name} (¥${Number(m.amount).toFixed(1)})`).join(', ');
        const amtStr = `¥${Number(day.amount).toFixed(1)}`;

        rowsHTML += `
            <div class="achievement-row" style="display: flex; flex-direction: column; align-items: stretch; gap: 5px; padding: 12px 0;">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <div style="font-family: 'JetBrains Mono'; font-weight: 800; font-size: 16px;">${getDayStr(day.date)}</div>
                    <div style="font-family: 'JetBrains Mono'; font-weight: 600; font-size: 16px; color: #999;">${amtStr}</div>
                </div>
                <div style="font-size: 14px; font-weight: 500; color: #333; line-height: 1.5;">
                    ${details || 'Unknown Merchant'}
                </div>
            </div>
        `;
    });

    el.innerHTML = `
        <div class="receipt-title">
            <span>WEEK ${String(index + 1).padStart(2, '0')}</span>
        </div>
        ${rowsHTML}
    `;
    return el;
}

window.updatePrinterMode = function (targetMode, targetIndex) {
    updateFocus(cardRight);

    if (currentState !== 'right') {
        handleRight();
    }

    const slot = document.getElementById('achievement-slot');
    const currentPaper = slot.querySelector('.receipt.current');

    let needsReprint = false;

    if (targetMode !== printerMode) {
        needsReprint = true;
    } else {
        if (targetMode === 'achievement') {
            if (currentAchievementPage === 0) needsReprint = false;
            else {
                currentAchievementPage = 0; // 重置到第一页
                needsReprint = true;
            }
        } else {
            // 节奏模式
            if (targetIndex !== currentRhythmIndex) {
                currentRhythmIndex = targetIndex;
                needsReprint = true;
            } else {
                needsReprint = false;
            }
        }
    }

    if (needsReprint) {
        // 更新模式状态
        printerMode = targetMode;
        if (targetMode === 'rhythm' && typeof targetIndex === 'number') {
            currentRhythmIndex = targetIndex;
        }
        if (targetMode === 'achievement') {
            currentAchievementPage = 0;
        }

        // 同步视觉状态（标题、高亮）
        syncPrinterVisuals();

        tearAndPrint(currentPaper);
    } else {
        // 抖动当前页
        triggerShake(currentPaper);
    }
};

// 新增：同步打印机外部视觉状态（Header + Rhythm Bar高亮）
function syncPrinterVisuals() {
    // 修复：HTML中没有 printer-title ID，而是 class="printer-header"
    const headerTitle = document.querySelector('.printer-header');
    const container = document.getElementById('rhythm-container');

    if (printerMode === 'achievement') {
        // Update Header
        const total = totalPages;
        if (headerTitle) headerTitle.textContent = `ACHIEVEMENTS`;

        // Clear Rhythm Highlights
        if (container) {
            container.classList.remove('state-active');
            const bars = container.querySelectorAll('.rhythm-bar');
            bars.forEach(b => b.classList.remove('active'));
        }
    } else {
        // Update Header
        if (headerTitle) headerTitle.textContent = `ANNUAL-EAT`;

        // Set Rhythm Highlights
        if (container) {
            container.classList.add('state-active');
            const bars = container.querySelectorAll('.rhythm-bar');
            bars.forEach((b, idx) => {
                if (idx === currentRhythmIndex) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
        }
    }
}

function updateHeader(text) {
    const header = document.querySelector('.printer-header');
    if (header) header.innerText = text;
}

// 核心翻页/打印逻辑
function tearAndPrint(oldPaper) {
    if (oldPaper && !oldPaper.classList.contains('ripped')) {
        oldPaper.classList.remove('current');
        oldPaper.classList.add('ripped');

        // 垃圾回收
        setTimeout(() => oldPaper.remove(), 800);
    }

    achievementSlot.classList.add('printing-active');

    // 生成新页
    let next;
    if (printerMode === 'achievement') {
        next = createAchievementReceipt(currentAchievementPage, 'printing');
    } else {
        next = createRhythmReceipt(currentRhythmIndex, 'printing');
    }

    achievementSlot.appendChild(next);

    setTimeout(() => {
        next.classList.remove('printing');
        next.classList.add('current');
        achievementSlot.classList.remove('printing-active');
        bindReceiptClick(next); // 绑定点击翻页
    }, 400);
}

// 绑定翻页点击事件
function bindReceiptClick(el) {
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.classList.contains('ripped')) return;

        // 计算下一页索引
        if (printerMode === 'achievement') {
            currentAchievementPage = (currentAchievementPage + 1) % totalPages;
        } else {
            // 节奏模式下翻到下一个 chunk
            currentRhythmIndex = (currentRhythmIndex + 1) % RHYTHM_CHUNKS.length;
        }

        // 立即同步视觉状态（高亮跟着翻页变）
        syncPrinterVisuals();

        tearAndPrint(el);
    });
}

// 初始化第一页
function initAchievementPrinter() {
    achievementSlot.innerHTML = '';
    currentAchievementPage = 0;
    const first = createAchievementReceipt(0, 'current');
    achievementSlot.appendChild(first);
    bindReceiptClick(first);
}

// 延迟初始化（确保 DOM 就绪）
setTimeout(initAchievementPrinter, 100);

let currentState = 'none'; // 'none'、'left'、'right' 表示当前侧边卡状态
const interactiveCards = [cardLeft, mainCard, cardRight];

function updateFocus(target) {
    if (currentState === 'none') {
        interactiveCards.forEach(c => {
            c.classList.remove('focused');
            c.classList.remove('unfocused');
        });
        return;
    }

    interactiveCards.forEach(c => {
        if (c === target) {
            c.classList.add('focused');
            c.classList.remove('unfocused');
        } else {
            c.classList.add('unfocused');
            c.classList.remove('focused');
        }
    });
}

interactiveCards.forEach(card => {
    card.addEventListener('mouseenter', () => {
        if (currentState !== 'none') {
            updateFocus(card);
        }
    });
});

function triggerSlam(el) {
    if (!el) return;
    el.classList.remove('anim-exit');
    el.classList.remove('anim-shake');
    el.classList.add('card-active');
    void el.offsetWidth; // 强制重排以重新触发动画
    el.classList.add('anim-slam');
}

function triggerExit(el) {
    if (!el) return;
    el.classList.remove('anim-slam');
    el.classList.remove('anim-shake');
    el.classList.remove('card-active');
    void el.offsetWidth;
    el.classList.add('anim-exit');
}

function triggerShake(el) {
    if (!el) return;
    // 确保抖动时卡片保持在激活且可见的状态
    el.classList.add('card-active');
    el.classList.remove('anim-slam');
    el.classList.remove('anim-shake');
    void el.offsetWidth;
    el.classList.add('anim-shake');
}

window.handleLeft = function () {
    if (currentState === 'left') {
        triggerShake(cardLeft);
        updateFocus(cardLeft);
    } else if (currentState === 'right') {
        // 状态切换：先收回右卡，再砸入左卡
        triggerExit(cardRight);
        rig.classList.remove('pan-right');

        setTimeout(() => triggerSlam(cardLeft), 200);
        currentState = 'left';
        document.body.classList.add('has-active-card');
        updateFocus(cardLeft);
    } else {
        // 从无卡状态切换到左卡
        triggerSlam(cardLeft);
        currentState = 'left';
        document.body.classList.add('has-active-card');
        updateFocus(cardLeft);
    }
};

window.handleRight = function () {
    if (currentState === 'right') {
        triggerShake(cardRight);
        updateFocus(cardRight);
    } else if (currentState === 'left') {
        // 状态切换：先收回左卡，再砸入右卡
        triggerExit(cardLeft);
        rig.classList.add('pan-right');

        setTimeout(() => triggerSlam(cardRight), 200);
        currentState = 'right';
        document.body.classList.add('has-active-card');
        updateFocus(cardRight);
    } else {
        // 从无卡状态切换到右卡
        rig.classList.add('pan-right');
        triggerSlam(cardRight);
        currentState = 'right';
        document.body.classList.add('has-active-card');
        updateFocus(cardRight);
    }
};

window.handleMainClick = function () {
    if (currentState !== 'none') {
        updateFocus(mainCard);
    }
};

window.handleCloseLeft = function (e) {
    if (e) e.stopPropagation();
    if (currentState === 'left') {
        triggerExit(cardLeft);
        rig.classList.remove('pan-right');
        currentState = 'none';
        document.body.classList.remove('has-active-card');
        updateFocus(null);
    }
};

window.handleCloseRight = function (e) {
    if (e) e.stopPropagation();
    if (currentState === 'right') {
        triggerExit(cardRight);
        rig.classList.remove('pan-right');
        currentState = 'none';
        document.body.classList.remove('has-active-card');
        updateFocus(null);
    }
};

// 为“查看全部”贴纸动态绑定点击事件
setTimeout(() => {
    const viewAllBtn = document.querySelector('.profile-section > div[style*="rotate(15deg)"]');
    if (viewAllBtn) {
        viewAllBtn.style.cursor = 'pointer';
        viewAllBtn.onclick = (e) => {
            e.stopPropagation();
            // 切换回成就模式
            updatePrinterMode('achievement');
        };
    }
}, 100);
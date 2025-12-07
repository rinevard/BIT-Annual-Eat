/* --- 数据占位 --- */
const EAT_DATA = { "2025": { "2025-03-03": { "count": 4, "amount": 24.0, "merchants": [{ "name": "良乡第二食堂", "amount": 16.5 }, { "name": "良乡二食堂1212", "amount": 7.5 }], "txs": [{ "time": "07:08:03", "mername": "良乡二食堂1212", "amount": 4.0 }, { "time": "07:08:19", "mername": "良乡二食堂1212", "amount": 2.5 }, { "time": "07:09:15", "mername": "良乡二食堂1212", "amount": 1.0 }, { "time": "17:35:34", "mername": "良乡第二食堂", "amount": 16.5 }] }, "2025-03-02": { "count": 1, "amount": 15.0, "merchants": [{ "name": "良四二层9-10号", "amount": 15.0 }], "txs": [{ "time": "11:46:03", "mername": "良四二层9-10号", "amount": 15.0 }] } } };
// 格式: { "2025": { "2025-01-01": { count: 3, ... }, ... } }

/* --- 主逻辑 --- */

// 1. 右侧统计卡片堆栈逻辑
// 卡片堆栈的渲染和交互逻辑

const stats = [
    { title: "开销", value: "3.1k", desc: "在学校花了这么多元钱" },
    { title: "用餐", value: "487", desc: "在学校吃了这么多顿饭" },
    { title: "日常", value: "166", desc: "在学校里吃饭的日子" },
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

// 文件名（不含扩展名） -> 展示名称的映射表
// 未出现在此表中的 key 直接使用文件名本身作为展示名称
const BADGE_NAME_MAP = {
    badge_01: "西西弗斯",
    badge_02: "守夜人",
    badge_03: "不知道",
    badge_04: "干饭人",
    badge_05: "百日烟火",
    badge_06: "早八人",
    badge_07: "加个鸡腿",
    badge_08: "极限生存",
    badge_09: "消失的早餐",
    badge_10: "一日三餐",
    badge_11: "凑单领域大神",
    badge_12: "我全都要",
    badge_13: "404",
    badge_14: "PI",
    badge_15: "加密通话",
    badge_16: "完美一周",
    badge_17: "我的回合",
    badge_18: "全勤奖",
    badge_19: "迷途之羊",
    badge_20: "故事的开始",
    badge_21: "又一年",
    badge_22: "注意到",
    badge_23: "边缘行者",
};

// 完整成就数据（用于打印机显示）
const ACHIEVEMENTS_DATA = [
    { id: 1, name: "迷途之子", rarity: 4, condition: "全年就餐天数 < 50 天", desc: "你迷路了吗", time: "2025-03-15" },
    { id: 2, name: "注意到", rarity: 4, condition: "消费总金额恰为学号后四位的倍数", desc: "注意力惊人", time: "2025-04-22" },
    { id: 3, name: "边缘行者", rarity: 4, condition: "在任意小时的第59分59秒完成交易", desc: "百丽宫有活着的传奇", time: "2025-05-08" },
    { id: 4, name: "早八人", rarity: 3, condition: "06:00-08:00间消费过5次", desc: "你见过早上八点的百丽宫吗", time: "2025-02-28" },
    { id: 5, name: "我的回合", rarity: 3, condition: "2分钟内连续刷卡 2 次", desc: "我的回合之后——还是我的回合！", time: "2025-03-10" },
    { id: 6, name: "PI", rarity: 3, condition: "单笔消费金额恰为 3.14 元", desc: "圆食，启动！", time: "2025-03-14" },
    { id: 7, name: "宇宙饭", rarity: 3, condition: "连续五天每天在不一样的商家吃饭", desc: "如果你的商家里没有相同的商家，获得本成就", time: "2025-04-01" },
    { id: 8, name: "全勤奖", rarity: 3, condition: "全年就餐天数 >= 200 天", desc: "一瞬一瞬累积起来就会变成一辈子", time: "2025-11-20" },
    { id: 9, name: "西西弗斯", rarity: 2, condition: "在同一个商家消费次数大于20次", desc: "我们必须想象你是幸福的", time: "2025-04-15" },
    { id: 10, name: "Hello World", rarity: 1, condition: "本年有消费过", desc: "你好，食堂！", time: "2025-01-02" },
    { id: 11, name: "故事的开始", rarity: 4, condition: "在本年第一天吃饭", desc: "其实味道和去年没区别", time: "2025-01-01" },
    { id: 12, name: "又一年", rarity: 4, condition: "在本年最后一天吃饭", desc: "明年见", time: "2025-12-31" },
    { id: 13, name: "守夜人", rarity: 3, condition: "21:00以后消费过5次", desc: "据说只要不计算晚上的卡路里，它们就不存在", time: "2025-03-20" },
    { id: 14, name: "加个鸡腿", rarity: 3, condition: "单笔消费金额 > 25元", desc: "吃点好的！", time: "2025-02-14" },
    { id: 15, name: "极限生存", rarity: 3, condition: "单笔消费金额 < 1元", desc: "极简主义饮食践行者", time: "2025-05-01" },
    { id: 16, name: "消失的早餐", rarity: 3, condition: "全年9点前消费次数 < 10 次", desc: "那些从来不吃早饭的人，现在都怎么样了？", time: "2025-06-15" },
    { id: 17, name: "好好吃饭", rarity: 3, condition: "单日内同时有早、中、晚三餐记录", desc: "你拥有令人羡慕的健康作息", time: "2025-03-05" },
    { id: 18, name: "凑单领域大神", rarity: 3, condition: "单日消费总金额>=20且为10的倍数", desc: "学校也有满减吗", time: "2025-04-10" },
    { id: 19, name: "Error 404", rarity: 3, condition: "单笔消费金额恰为 4.04 元", desc: "404 Not Found", time: "2025-04-04" },
    { id: 20, name: "加密通话", rarity: 3, condition: "密码不是默认值 123456", desc: "你的账户安全系数击败了99％的同学", time: "2025-01-15" },
    { id: 21, name: "完美一周", rarity: 3, condition: "连续七天一日三餐", desc: "医生看了都说好", time: "2025-05-20" },
    { id: 22, name: "百日烟火", rarity: 2, condition: "全年就餐天数 >= 100 天", desc: "食堂阿姨可能都认识你了", time: "2025-07-10" },
    { id: 23, name: "干饭人", rarity: 1, condition: "全年就餐天数 >= 1 天", desc: "至少你找到了食堂", time: "2025-01-02" },
];

// 当前已存在的 PNG 文件名（仅文件名，包含扩展名）
// 受限于纯前端环境，无法直接遍历文件夹，因此这里作为“可编辑清单”存在：
// 把 images 目录中的 png 文件名补充到此数组即可被自动加载。
const BADGE_FILES = [
    "badge_01.png",
    "badge_02.png",
    "badge_03.png",
    "badge_04.png",
    "badge_05.png",
    "badge_06.png",
    "badge_07.png",
    "badge_08.png",
    "badge_09.png",
    "badge_10.png",
    "badge_11.png",
    "badge_12.png",
    "badge_13.png",
    "badge_14.png",
    "badge_15.png",
    "badge_16.png",
    "badge_17.png",
    "badge_18.png",
    "badge_19.png",
    "badge_20.png",
    "badge_21.png",
    "badge_22.png",
    "badge_23.png",
];

// 将文件名转换成展示名称
function resolveBadgeName(fileName) {
    const base = fileName.replace(/\.png$/i, "");
    return BADGE_NAME_MAP[base] || base;
}

// 由文件名生成徽章数据
const badges = BADGE_FILES.map((file) => ({
    src: `images/${file}`,
    name: resolveBadgeName(file),
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
        handleRight();
    });
});

// 3. Rhythm 区域（真实数据驱动）
// Rhythm 区域的渲染和交互逻辑

function renderRhythm() {
    const rhythmContainer = document.getElementById('rhythm-container');
    rhythmContainer.innerHTML = ''; // 清空已有内容

    // 处理数据
    let dailyCounts = [];

    // 1. 将 EAT_DATA 展平成按日期排序的每日就餐次数数组
    // 假设 EAT_DATA 的第一层键是年份
    const years = Object.keys(EAT_DATA).sort();
    if (years.length === 0) {
        console.warn("没有找到 EAT_DATA，使用随机值进行预览。");
        dailyCounts = Array(365).fill(0).map(() => Math.random() * 4);
    } else {
        // 使用最新的年份
        const year = years[years.length - 1];
        const yearData = EAT_DATA[year];

        // 构造完整的一年数据（处理缺失日期）
        const start = new Date(`${year}-01-01`);
        const end = new Date(`${year}-12-31`);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayData = yearData[dateStr];
            dailyCounts.push(dayData ? dayData.count : 0);
        }
    }

    // 2. 每 6 天聚合一次（取平均值）
    const CHUNK_SIZE = 6;
    const aggregatedData = [];

    for (let i = 0; i < dailyCounts.length; i += CHUNK_SIZE) {
        const chunk = dailyCounts.slice(i, i + CHUNK_SIZE);
        // 计算该时间段内的日均用餐次数
        const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;

        aggregatedData.push(avg);
    }

    // 3. 归一化到高度百分比和颜色等级
    // 合理的日均用餐次数大约在 3~4 之间，这里以 4 次作为 100% 高度上限。
    const MAX_VAL = 4;

    aggregatedData.forEach(val => {
        const bar = document.createElement('div');
        bar.className = 'rhythm-bar';

        // 计算高度百分比
        // 也可以用非线性缩放让低值更明显，但这里保持线性更直观，
        // 再通过最小高度避免 0 完全不可见。
        let hPercent = (val / MAX_VAL) * 100;
        hPercent = Math.min(100, Math.max(0, hPercent)); // Clamp 0-100

        // 根据强度分配颜色等级
        // 0       -> l1（几乎没吃）
        // > 0.5  -> l2
        // > 1.5  -> l3（正常）
        // > 2.5  -> l4（偏多）
        // > 3.5  -> l5（爆吃）
        if (val > 3.0) bar.classList.add('l5');
        else if (val > 2.2) bar.classList.add('l4');
        else if (val > 1.5) bar.classList.add('l3');
        else if (val > 0.5) bar.classList.add('l2');
        else bar.classList.add('l1'); // Mostly empty

        bar.style.height = Math.max(5, hPercent) + '%'; // Min 5% for visual

        // 添加 tooltip 以便查看具体数值
        bar.title = `Avg: ${val.toFixed(1)} meals`;

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
let currentAchievementPage = 0;

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
        let imgSrc = 'images/badge_01.png'; // Default
        for (const [key, val] of Object.entries(BADGE_NAME_MAP)) {
            if (val === ach.name) {
                imgSrc = `images/${key}.png`;
                break;
            }
        }

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

// 绑定翻页点击事件
function bindReceiptClick(el) {
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (el.classList.contains('ripped')) return;

        // 1. 旧纸撕掉
        el.classList.remove('current');
        el.classList.add('ripped');

        // 2. 容器进入打印保护模式
        achievementSlot.classList.add('printing-active');

        // 3. 切换到下一页（循环）
        currentAchievementPage = (currentAchievementPage + 1) % totalPages;
        const next = createAchievementReceipt(currentAchievementPage, 'printing');
        achievementSlot.appendChild(next);

        // 4. 打印动画结束后切换状态
        setTimeout(() => {
            next.classList.remove('printing');
            next.classList.add('current');
            achievementSlot.classList.remove('printing-active');
            bindReceiptClick(next);
        }, 400);

        // 5. 垃圾回收
        setTimeout(() => {
            el.remove();
        }, 800);
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
            handleRight();
        };
    }
}, 100);
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

const badges = [
    { src: "images/2.png", name: "早八人" },
    { src: "images/1.png", name: "加个鸡腿" },
    { src: "images/3.png", name: "百日烟火" },
    { src: "images/4.png", name: "西西弗斯" }
];

const badgeRack = document.getElementById('badges-rack');
badges.forEach(b => {
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

// 为右侧成就卡片填充更多徽章
// 复制徽章以填满成就网格

const fullBadgesGrid = document.getElementById('badges-grid-full');
const allBadges = [...badges, ...badges, ...badges, ...badges];
allBadges.forEach(b => {
    const el = document.createElement('div');
    el.className = 'badge-item';
    el.style.transform = 'scale(0.8)';
    const img = document.createElement('img');
    img.src = b.src;
    el.appendChild(img);
    fullBadgesGrid.appendChild(el);
});

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
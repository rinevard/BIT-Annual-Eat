// EAT_DATA and ACH_STATE are injected by the HTML template

// 图片路径常量（本地使用路径，Python 脚本会替换为 Base64）
const IMG_AVATAR_DEFAULT = "images/eatbit.jpg";
const IMG_ACH_SPRITE = "images/ach.jpg";

// --- Stats ---
function pickLatestYear(eatData) {
    if (!eatData || typeof eatData !== 'object') return null;
    const years = Object.keys(eatData).sort();
    return years.length ? years[years.length - 1] : null;
}

function formatAmount(num) {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return Math.round(num).toString();
}

function computeTotals(eatData) {
    let totalAmount = 0;
    let totalDays = 0;

    if (eatData && typeof eatData === 'object') {
        Object.values(eatData).forEach(yearData => {
            if (!yearData) return;
            Object.values(yearData).forEach(day => {
                if (!day) return;
                totalAmount += Number(day.amount || 0);
                totalDays += 1;
            });
        });
    }

    return { totalAmount, totalDays };
}

function applyProfile() {
    if (typeof PROFILE === 'undefined' || !PROFILE) return;

    const nameEl = document.getElementById('mobile-user-name');
    if (nameEl && PROFILE.userName) {
        nameEl.textContent = String(PROFILE.userName).trim();
    }

    // 应用头像（优先使用已保存的，否则用默认常量）
    const avatarImg = document.getElementById('mobile-avatar-img');
    if (avatarImg) {
        if (PROFILE.avatar) {
            avatarImg.src = PROFILE.avatar;
        } else {
            avatarImg.src = IMG_AVATAR_DEFAULT;
        }
    }
}

function renderStats() {
    const { totalAmount, totalDays } = computeTotals(typeof EAT_DATA !== 'undefined' ? EAT_DATA : null);

    const daysEl = document.getElementById('stat-days');
    if (daysEl) daysEl.textContent = String(totalDays);

    const amountEl = document.getElementById('stat-amount');
    if (amountEl) amountEl.textContent = formatAmount(totalAmount);
}

// --- Sprite Logic ---
const SPRITE_CONFIG = {
    src: IMG_ACH_SPRITE,
    cols: 6,
    rows: 4,
    iconWidth: 222,
    iconHeight: 222,
    gapX: 149,
    gapY: 74,
    startX: 139,
    startY: 77,
    imgWidth: 2360,
    imgHeight: 1640,
    displaySize: 60
};

const SPRITE_SCALE = SPRITE_CONFIG.displaySize / SPRITE_CONFIG.iconWidth;

const SPRITE_ORDER = [
    "hello_world", "eater", "hundred_days", "default_setting", "early_bird", "night_owl",
    "big_meal", "minimalist", "missing_breakfast", "good_meals", "make_it_round", "cosmic_meal",
    "error_404", "pi", "secure_call", "perfect_week", "my_turn", "full_timer",
    "lost_kid", "story_start", "another_year", "noticed", "edge_runner"
];

function getSpritePosition(index) {
    const row = Math.floor(index / SPRITE_CONFIG.cols);
    const col = index % SPRITE_CONFIG.cols;
    const x = SPRITE_CONFIG.startX + col * (SPRITE_CONFIG.iconWidth + SPRITE_CONFIG.gapX);
    const y = SPRITE_CONFIG.startY + row * (SPRITE_CONFIG.iconHeight + SPRITE_CONFIG.gapY);
    return { x: Math.round(-x * SPRITE_SCALE), y: Math.round(-y * SPRITE_SCALE) };
}

function getSpriteBackgroundSize() {
    return `${Math.round(SPRITE_CONFIG.imgWidth * SPRITE_SCALE)}px ${Math.round(SPRITE_CONFIG.imgHeight * SPRITE_SCALE)}px`;
}

function getSpriteIndexById(achId) {
    const idx = SPRITE_ORDER.indexOf(achId);
    return idx >= 0 ? idx : 0;
}

// --- Achievements ---
const ACH_CONFIG = [
    { id: "lost_kid", name: "迷途之羊", rarity: 4, condition: "全年就餐天数 < 50 天" },
    { id: "noticed", name: "注意到", rarity: 4, condition: "消费总金额恰为学号后四位的倍数" },
    { id: "edge_runner", name: "边缘行者", rarity: 4, condition: "在任意小时的第59分59秒完成交易" },
    { id: "early_bird", name: "早八人", rarity: 3, condition: "06:00-08:00间消费过5次" },
    { id: "my_turn", name: "我的回合", rarity: 3, condition: "2分钟内连续刷卡 2 次" },
    { id: "pi", name: "PI", rarity: 3, condition: "单笔消费金额恰为 3.14/31.4/314 元" },
    { id: "cosmic_meal", name: "我全都要", rarity: 3, condition: "连续五天每天在不一样的商家吃饭" },
    { id: "full_timer", name: "全勤奖", rarity: 3, condition: "全年就餐天数 >= 200 天" },
    { id: "default_setting", name: "西西弗斯", rarity: 2, condition: "在同一个商家消费次数大于20次" },
    { id: "hello_world", name: "Hello World", rarity: 1, condition: "在这一年消费过" },
    { id: "story_start", name: "故事的开始", rarity: 4, condition: "在第一天吃饭" },
    { id: "another_year", name: "又一年", rarity: 4, condition: "在最后一天吃饭" },
    { id: "night_owl", name: "守夜人", rarity: 3, condition: "21:00以后消费过5次" },
    { id: "big_meal", name: "加个鸡腿", rarity: 3, condition: "单笔消费金额 > 25元" },
    { id: "minimalist", name: "极限生存", rarity: 3, condition: "单笔消费金额 < 1元" },
    { id: "missing_breakfast", name: "消失的早餐", rarity: 3, condition: "全年9点前消费次数 < 10 次" },
    { id: "good_meals", name: "好好吃饭", rarity: 3, condition: "单日内同时有早、中、晚三餐记录" },
    { id: "make_it_round", name: "凑单领域大神", rarity: 3, condition: "单日消费总金额>=20且为10的倍数" },
    { id: "error_404", name: "Error 404", rarity: 4, condition: "单笔消费金额恰为 4.04/40.4/404 元" },
    { id: "secure_call", name: "加密通话", rarity: 4, condition: "密码不是默认值 123456" },
    { id: "perfect_week", name: "完美一周", rarity: 3, condition: "连续七天一日三餐" },
    { id: "hundred_days", name: "百日烟火", rarity: 2, condition: "全年就餐天数 >= 100 天" },
    { id: "eater", name: "干饭人", rarity: 1, condition: "全年就餐天数 >= 1 天" }
];

function buildAchievementsData() {
    const MAX_MOBILE_BADGES = 6;

    // 1) Determine selected badge ids (from saved profile)
    const selectedFromProfile = (
        typeof PROFILE !== 'undefined'
        && PROFILE
        && Array.isArray(PROFILE.selectedBadges)
    ) ? PROFILE.selectedBadges.filter(id => typeof id === 'string') : [];

    // 2) Build a map of id -> meta (and locked state) using ACH_STATE
    const byId = new Map();
    ACH_CONFIG.forEach(item => {
        const meta = Object.assign({}, item);

        if (typeof ACH_STATE !== 'undefined' && ACH_STATE) {
            const s = ACH_STATE[item.id];
            meta.locked = !(s && s.unlocked);
        } else {
            // No state injected: treat as unlocked for local preview
            meta.locked = false;
        }

        byId.set(item.id, meta);
    });

    // 3) Choose ids to display
    let idsToShow = [];
    if (selectedFromProfile.length > 0) {
        // Keep only ids we know about AND unlocked, preserve order
        idsToShow = selectedFromProfile.filter(id => byId.has(id) && !byId.get(id).locked);
    }

    if (idsToShow.length === 0) {
        // Fallback: show unlocked achievements first (rarer first)
        const unlocked = Array.from(byId.values())
            .filter(x => !x.locked)
            .sort((a, b) => (b.rarity || 0) - (a.rarity || 0))
            .slice(0, MAX_MOBILE_BADGES)
            .map(x => x.id);

        idsToShow = unlocked;
    }

    // Last resort: if still empty, just show first few from config
    if (idsToShow.length === 0) {
        idsToShow = ACH_CONFIG.slice(0, MAX_MOBILE_BADGES).map(x => x.id);
    }

    return idsToShow
        .map(id => byId.get(id))
        .filter(Boolean);
}

function renderFocusCard(ach, gridBgSize) {
    const focusArea = document.getElementById('focus-area');
    if (!focusArea) return;

    const idx = getSpriteIndexById(ach.id);
    const pos = getSpritePosition(idx);

    const nextHtml = `
        <div class="trophy-card is-entering">
            <div class="trophy-icon-frame">
                <div class="badge-sprite" style="
                    background-image: url('${SPRITE_CONFIG.src}');
                    background-position: ${pos.x}px ${pos.y}px;
                    background-size: ${gridBgSize};
                    transform: translate(-50%, -50%) scale(1.17);
                "></div>
            </div>
            <div class="trophy-info">
                <div class="trophy-name">${ach.name}</div>
                <div class="trophy-cond">${ach.condition}</div>
            </div>
        </div>
    `;

    const currentCard = focusArea.querySelector('.trophy-card');
    if (currentCard) {
        currentCard.classList.add('is-leaving');
        window.setTimeout(() => {
            focusArea.innerHTML = nextHtml;
            const nextCard = focusArea.querySelector('.trophy-card');
            if (!nextCard) return;
            requestAnimationFrame(() => {
                nextCard.classList.remove('is-entering');
            });
        }, 100);
        return;
    }

    focusArea.innerHTML = nextHtml;
    const nextCard = focusArea.querySelector('.trophy-card');
    if (!nextCard) return;
    requestAnimationFrame(() => {
        nextCard.classList.remove('is-entering');
    });
}

function renderAchievements() {
    const trophyGrid = document.getElementById('trophy-grid');
    const focusArea = document.getElementById('focus-area');
    if (!trophyGrid || !focusArea) return;

    const achievements = buildAchievementsData();

    trophyGrid.innerHTML = '';
    focusArea.innerHTML = '';

    const gridBgSize = getSpriteBackgroundSize();

    achievements.forEach((ach, index) => {
        const btn = document.createElement('div');
        btn.className = 'trophy-icon-btn';
        btn.dataset.id = ach.id;

        const idx = getSpriteIndexById(ach.id);
        const pos = getSpritePosition(idx);

        const sprite = document.createElement('div');
        sprite.className = 'badge-sprite';
        sprite.style.backgroundImage = `url('${SPRITE_CONFIG.src}')`;
        sprite.style.backgroundPosition = `${pos.x}px ${pos.y}px`;
        sprite.style.backgroundSize = gridBgSize;
        sprite.style.transform = 'translate(-50%, -50%) scale(0.8)';

        if (ach.locked) {
            sprite.style.filter = 'grayscale(100%)';
            sprite.style.opacity = '0.4';
        }

        btn.appendChild(sprite);

        btn.onclick = () => {
            renderFocusCard(ach, gridBgSize);
            document.querySelectorAll('.trophy-icon-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        };

        trophyGrid.appendChild(btn);

        if (index === 0) {
            btn.click();
        }
    });
}

// --- Heatmap (12 months) ---
function renderMonthBars() {
    const container = document.getElementById('art-heatmap');
    if (!container) return;

    container.innerHTML = '';

    const eatData = typeof EAT_DATA !== 'undefined' ? EAT_DATA : null;
    const year = pickLatestYear(eatData);

    const monthly = new Array(12).fill(0);

    if (year && eatData && eatData[year]) {
        Object.entries(eatData[year]).forEach(([dateStr, day]) => {
            if (!day) return;
            const m = new Date(dateStr).getMonth();
            monthly[m] += Number(day.count || 0);
        });
    } else {
        for (let i = 0; i < 12; i++) monthly[i] = 20 + Math.random() * 80;
    }

    const maxVal = Math.max(...monthly, 1);

    for (let i = 0; i < 12; i++) {
        const line = document.createElement('div');
        line.className = 'line';

        const normalized = monthly[i] / maxVal;
        line.style.height = (20 + 80 * Math.pow(normalized, 1.2)) + '%';

        if (monthly[i] > 0) {
            line.classList.add('active');
            line.style.opacity = String(0.45 + normalized * 0.55);
        }

        container.appendChild(line);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applyProfile();
    renderStats();
    renderAchievements();
    renderMonthBars();
});

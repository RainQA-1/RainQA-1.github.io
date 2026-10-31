/* 菜篮子 · 食堂买菜账本
 * 纯前端、本地存储，无任何外部依赖。
 */
(function () {
  'use strict';

  const Parser = window.CanteenParser;
  if (!Parser) {
    document.body.innerHTML = '<div class="noscript">识别模块没有加载成功，请确认 parser.js 与 index.html 在同一个文件夹。</div>';
    return;
  }

  const STORAGE_KEY = 'canteen-ledger:v1';
  const VERSION = 1;
  const DEFAULT_TITLE = '菜篮子';
  const CATEGORY_NAMES = Parser.CATEGORY_NAMES.slice();
  const CATEGORY_COLORS = {
    '蔬菜': '#7d9b69',
    '肉禽': '#b77963',
    '水产': '#6f96a2',
    '蛋奶': '#d0a04e',
    '豆制品': '#b29a68',
    '粮油': '#a4855e',
    '调味': '#9b7060',
    '水果': '#c1846e',
    '其他': '#8d9081'
  };
  const VIEW_TITLES = {
    home: '总览',
    records: '账单明细',
    paste: '粘贴识别',
    calc: '算钱',
    balance: '结余盘点'
  };
  const VIEW_IDS = {
    home: 'view-home',
    records: 'view-records',
    paste: 'view-paste',
    calc: 'view-calc',
    balance: 'view-balance'
  };
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const SAMPLE_TEXT = [
    '今天',
    '土豆 20斤 3元/斤',
    '白菜 5斤 2.5元/斤',
    '五花肉 6斤 18元/斤 共108元',
    '鸡蛋 2箱 180元'
  ].join('\n');
  const ENTITY_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  const $ = function (id) { return document.getElementById(id); };
  const numberFormat = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 });
  const moneyFormat = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  let startupMessage = '';
  let saveWarned = false;
  let toastTimer = null;
  let calcSaveTimer = null;
  let deferredPrompt = null;
  let lastAutoAmount = null;
  let currentRoute = 'home';
  let parseItems = [];
  let parseWarnings = [];
  let parseRun = false;
  let parseDirty = false;
  let uidCounter = 0;

  const state = loadState();

  /* =========================================================
   * 基础工具
   * ========================================================= */

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function todayISO() {
    const date = new Date();
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function normalizeTitle(value) {
    const title = String(value === null || value === undefined ? '' : value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24);
    return title || DEFAULT_TITLE;
  }

  function titleForFile() {
    return normalizeTitle(state.title)
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40) || DEFAULT_TITLE;
  }

  function normalizeDateValue(value) {
    const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(String(value || '').trim());
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return '';
    }
    return year + '-' + pad2(month) + '-' + pad2(day);
  }

  function parseISODate(value) {
    const normalized = normalizeDateValue(value);
    if (!normalized) return null;
    const parts = normalized.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function weekdayLabel(value) {
    const date = parseISODate(value);
    return date ? WEEKDAYS[date.getDay()] : '';
  }

  function formatDateAuto(value, forceYear) {
    const date = parseISODate(value);
    if (!date) return '—';
    const base = (date.getMonth() + 1) + '月' + date.getDate() + '日';
    const withYear = forceYear || date.getFullYear() !== new Date().getFullYear();
    return withYear ? date.getFullYear() + '年' + base : base;
  }

  function formatFullDate(value) {
    const date = parseISODate(value);
    if (!date) return '—';
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日 ' + WEEKDAYS[date.getDay()];
  }

  function monthLabel(monthKey) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
    if (!match) return '本月';
    return match[1] + '年' + Number(match[2]) + '月';
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value).replace(/[&<>"']/g, function (character) {
      return ENTITY_MAP[character];
    });
  }

  function icon(name) {
    return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"></use></svg>';
  }

  function uid() {
    uidCounter += 1;
    try {
      if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (error) {
      /* 某些 file:// 环境可能没有 randomUUID，使用下面的回退。 */
    }
    return 'id-' + Date.now().toString(36) + '-' + uidCounter.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function sanitizeId(value) {
    const cleaned = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    return cleaned || uid();
  }

  function uniqueId(value, used) {
    let candidate = sanitizeId(value);
    if (used.has(candidate)) candidate = uid();
    used.add(candidate);
    return candidate;
  }

  function round2(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round((number + Number.EPSILON) * 100) / 100;
  }

  function readNumberInput(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim().replace(/,/g, '');
    if (!text) return null;
    const number = Number(text);
    if (!Number.isFinite(number) || number < 0) return NaN;
    return round2(number);
  }

  function storedNumber(value) {
    const number = readNumberInput(value);
    return Number.isNaN(number) ? null : number;
  }

  function formatInput(value) {
    const number = readNumberInput(value);
    if (number === null || Number.isNaN(number)) return '';
    return String(number);
  }

  function formatMoney(value) {
    if (value === null || value === undefined || value === '') return '—';
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return '¥' + moneyFormat.format(number);
  }

  function formatQuantity(quantity, unit) {
    const qty = quantity === null || quantity === undefined || quantity === ''
      ? ''
      : numberFormat.format(Number(quantity));
    const suffix = String(unit || '').trim();
    if (!qty && !suffix) return '';
    return [qty, suffix].filter(Boolean).join(' ');
  }

  function sumAmounts(list) {
    return round2(list.reduce(function (total, item) {
      return total + (Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0);
    }, 0));
  }

  function sortRecordsDesc(a, b) {
    return String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  }

  function sortRecordsAsc(a, b) {
    return String(a.date || '').localeCompare(String(b.date || '')) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  }

  function sortBalancesDesc(a, b) {
    return String(b.date || '').localeCompare(String(a.date || '')) ||
      String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  }

  function isFiniteNumber(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function timestampOrNow(value) {
    const text = String(value || '');
    return Number.isNaN(Date.parse(text)) ? nowISO() : text;
  }

  /* =========================================================
   * 数据层
   * ========================================================= */

  function createDefaultState() {
    return {
      version: VERSION,
      title: DEFAULT_TITLE,
      records: [],
      balances: [],
      calc: { date: todayISO(), rows: defaultCalcRows() }
    };
  }

  function defaultCalcRows() {
    return [blankCalcRow(), blankCalcRow(), blankCalcRow()];
  }

  function blankCalcRow() {
    return {
      id: uid(),
      name: '',
      quantity: '',
      unit: '',
      unitPrice: '',
      amount: '',
      amountTouched: false
    };
  }

  function normalizeRecord(raw, used) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim().slice(0, 40);
    if (!name) return null;
    const quantity = storedNumber(raw.quantity);
    const unitPrice = storedNumber(raw.unitPrice);
    const amount = storedNumber(raw.amount);
    const category = CATEGORY_NAMES.indexOf(raw.category) !== -1
      ? raw.category
      : Parser.detectCategory(name);
    return {
      id: uniqueId(raw.id, used),
      date: normalizeDateValue(raw.date) || todayISO(),
      name: name,
      category: category,
      quantity: quantity,
      unit: String(raw.unit || '').trim().slice(0, 6),
      unitPrice: unitPrice,
      amount: amount,
      note: String(raw.note || '').trim().slice(0, 80),
      raw: String(raw.raw || '').trim().slice(0, 300),
      createdAt: timestampOrNow(raw.createdAt),
      updatedAt: timestampOrNow(raw.updatedAt)
    };
  }

  function normalizeBalance(raw, used) {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '').trim().slice(0, 40);
    if (!name) return null;
    return {
      id: uniqueId(raw.id, used),
      date: normalizeDateValue(raw.date) || todayISO(),
      name: name,
      quantity: storedNumber(raw.quantity),
      unit: String(raw.unit || '').trim().slice(0, 6),
      amount: storedNumber(raw.amount),
      note: String(raw.note || '').trim().slice(0, 80),
      createdAt: timestampOrNow(raw.createdAt),
      updatedAt: timestampOrNow(raw.updatedAt)
    };
  }

  function normalizeCalcRow(raw, used) {
    if (!raw || typeof raw !== 'object') return null;
    const row = {
      id: uniqueId(raw.id, used),
      name: String(raw.name || '').slice(0, 40),
      quantity: raw.quantity === null || raw.quantity === undefined ? '' : String(raw.quantity),
      unit: String(raw.unit || '').slice(0, 6),
      unitPrice: raw.unitPrice === null || raw.unitPrice === undefined ? '' : String(raw.unitPrice),
      amount: raw.amount === null || raw.amount === undefined ? '' : String(raw.amount),
      amountTouched: Boolean(raw.amountTouched)
    };
    return row;
  }

  function sanitizeState(raw) {
    const source = raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object'
      ? raw.data
      : (raw && typeof raw === 'object' ? raw : {});
    const used = new Set();
    const records = [];
    const balances = [];

    if (Array.isArray(source.records)) {
      source.records.forEach(function (item) {
        const normalized = normalizeRecord(item, used);
        if (normalized) records.push(normalized);
      });
    }
    if (Array.isArray(source.balances)) {
      source.balances.forEach(function (item) {
        const normalized = normalizeBalance(item, used);
        if (normalized) balances.push(normalized);
      });
    }

    const calcSource = source.calc && typeof source.calc === 'object' ? source.calc : {};
    const calcRows = [];
    if (Array.isArray(calcSource.rows)) {
      calcSource.rows.slice(0, 100).forEach(function (item) {
        const normalized = normalizeCalcRow(item, used);
        if (normalized) calcRows.push(normalized);
      });
    }

    return {
      version: VERSION,
      title: normalizeTitle(source.title),
      records: records,
      balances: balances,
      calc: {
        date: normalizeDateValue(calcSource.date) || todayISO(),
        rows: calcRows.length ? calcRows : defaultCalcRows()
      }
    };
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return createDefaultState();
      return sanitizeState(JSON.parse(raw));
    } catch (error) {
      console.warn('读取本地账本失败：', error);
      startupMessage = '读取本地数据失败，已先打开一个空白账本。';
      return createDefaultState();
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (error) {
      console.warn('保存本地账本失败：', error);
      if (!saveWarned) {
        saveWarned = true;
        showToast('保存失败：浏览器存储可能已满或被禁用，请先导出备份。', 'error');
      }
      return false;
    }
  }

  function resetFilters() {
    const search = $('recordSearch');
    const month = $('filterMonth');
    const category = $('filterCategory');
    if (search) search.value = '';
    if (month) month.value = '';
    if (category) category.value = '';
  }

  /* =========================================================
   * 提示 / 弹窗 / 路由
   * ========================================================= */

  function showToast(message, type) {
    const toast = $('toast');
    const text = $('toastText');
    if (!toast || !text) return;
    window.clearTimeout(toastTimer);
    text.textContent = String(message || '');
    toast.classList.toggle('is-error', type === 'error');
    const use = toast.querySelector('use');
    if (use) use.setAttribute('href', type === 'error' ? '#i-alert' : '#i-check');
    toast.hidden = false;
    toastTimer = window.setTimeout(function () {
      toast.hidden = true;
    }, 3200);
  }

  function syncModalState() {
    const open = Array.prototype.some.call(document.querySelectorAll('dialog'), function (dialog) {
      return Boolean(dialog.open);
    });
    document.body.classList.toggle('modal-open', open);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    document.body.classList.add('modal-open');
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
    syncModalState();
  }

  function getRouteFromHash() {
    const route = String(window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
    return Object.prototype.hasOwnProperty.call(VIEW_TITLES, route) ? route : 'home';
  }

  function navigate(route) {
    const target = Object.prototype.hasOwnProperty.call(VIEW_TITLES, route) ? route : 'home';
    if (window.location.hash === '#/' + target) {
      showRoute(target);
      return;
    }
    window.location.hash = '#/' + target;
  }

  function applyLedgerTitle() {
    state.title = normalizeTitle(state.title);
    document.querySelectorAll('[data-ledger-title]').forEach(function (element) {
      element.textContent = state.title;
    });
    const mobileBrand = document.querySelector('.mobile-brand');
    if (mobileBrand) mobileBrand.setAttribute('aria-label', state.title + '首页');
    const input = $('ledgerTitleInput');
    if (input) input.value = state.title;
    document.title = (VIEW_TITLES[currentRoute] || VIEW_TITLES.home) + ' · ' + state.title;
  }

  function saveLedgerTitle() {
    const input = $('ledgerTitleInput');
    if (!input) return;
    const raw = String(input.value || '').trim();
    if (!raw) {
      showToast('账本标题不能为空。', 'error');
      input.focus();
      return;
    }
    state.title = normalizeTitle(raw);
    input.value = state.title;
    applyLedgerTitle();
    saveState();
    showToast('账本标题已保存。');
  }

  function showRoute(route) {
    const target = Object.prototype.hasOwnProperty.call(VIEW_TITLES, route) ? route : 'home';
    currentRoute = target;

    document.querySelectorAll('[data-view-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-view-panel') !== target;
    });

    document.querySelectorAll('[data-nav]').forEach(function (button) {
      const active = button.getAttribute('data-nav') === target;
      button.classList.toggle('is-active', active);
      if (active) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });

    const title = VIEW_TITLES[target];
    const titleElement = $('topbarTitle');
    if (titleElement) titleElement.textContent = title;
    applyLedgerTitle();

    if (target === 'home') renderHome();
    if (target === 'records') renderRecords();
    if (target === 'calc') renderCalc();
    if (target === 'balance') renderBalance();
    updateTodayChip();

    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function updateTodayChip() {
    const chip = $('todayChip');
    if (chip) chip.textContent = formatFullDate(todayISO());
  }

  /* =========================================================
   * 总览
   * ========================================================= */

  function renderHome() {
    const today = todayISO();
    const month = today.slice(0, 7);
    const monthRecords = state.records.filter(function (record) {
      return String(record.date || '').startsWith(month);
    });
    const monthTotal = sumAmounts(monthRecords);
    const uniqueNames = new Set(monthRecords.map(function (record) {
      return String(record.name || '').trim();
    }).filter(Boolean));
    const activeDays = new Set(monthRecords.map(function (record) {
      return record.date;
    }));
    const balanceNames = new Set(state.balances.map(function (item) {
      return String(item.name || '').trim();
    }).filter(Boolean));

    const hour = new Date().getHours();
    let greeting = '今天的菜，也要记清楚';
    if (hour < 5) greeting = '夜深了，账本也歇一歇';
    else if (hour < 11) greeting = '早上好，今天的菜也要记清楚';
    else if (hour < 14) greeting = '中午好，看看今天买了什么';
    else if (hour < 18) greeting = '下午好，把账理一理';
    else greeting = '晚上好，今天的账收个尾';

    $('homeGreeting').textContent = greeting;
    $('homeMonthSpend').textContent = formatMoney(monthTotal);
    $('homeMonthCount').textContent = monthRecords.length + ' 笔';
    $('homeMonthCaption').textContent = monthLabel(month);
    $('statMonthCount').innerHTML = monthRecords.length + '<small> 笔</small>';
    $('statItemCount').innerHTML = uniqueNames.size + '<small> 种</small>';
    $('statDaily').textContent = formatMoney(activeDays.size ? monthTotal / activeDays.size : 0);
    $('statBalanceCount').innerHTML = balanceNames.size + '<small> 种</small>';

    const recent = state.records.slice().sort(sortRecordsDesc).slice(0, 5);
    const recentBox = $('homeRecent');
    if (!recent.length) {
      recentBox.innerHTML =
        '<div class="mini-empty">' +
          '<strong>还没有入账</strong>' +
          '粘贴一段买菜文字，或手动记下第一笔。' +
          '<div><button type="button" class="text-btn" data-action="open-record">手动记一笔' + icon('arrow') + '</button></div>' +
        '</div>';
    } else {
      recentBox.innerHTML = recent.map(function (record) {
        return entryRow(record, { showDate: true });
      }).join('');
    }

    renderCategoryBars(monthRecords);
    renderBalanceTeaser();
  }

  function renderCategoryBars(records) {
    const box = $('homeCategoryBars');
    const stats = new Map();

    records.forEach(function (record) {
      const category = CATEGORY_NAMES.indexOf(record.category) !== -1 ? record.category : '其他';
      if (!stats.has(category)) {
        stats.set(category, { category: category, count: 0, amount: 0, amountCount: 0 });
      }
      const item = stats.get(category);
      item.count += 1;
      if (isFiniteNumber(record.amount)) {
        item.amount += Number(record.amount);
        item.amountCount += 1;
      }
    });

    const list = Array.from(stats.values()).sort(function (a, b) {
      return (b.amount - a.amount) || (b.count - a.count) || a.category.localeCompare(b.category);
    });

    if (!list.length) {
      box.innerHTML = '<div class="mini-empty"><strong>这个月还没买什么</strong>记下第一笔，就能看到买菜结构。</div>';
      return;
    }

    const metrics = list.map(function (item) {
      return item.amount > 0 ? item.amount : item.count;
    });
    const max = Math.max.apply(null, metrics.concat([1]));

    box.innerHTML = list.map(function (item) {
      const color = CATEGORY_COLORS[item.category] || CATEGORY_COLORS['其他'];
      const metric = item.amount > 0 ? item.amount : item.count;
      const width = Math.max(3, Math.round((metric / max) * 100));
      const value = item.amountCount ? formatMoney(round2(item.amount)) : item.count + ' 笔';
      return '<div class="category-row" style="--cat:' + color + '">' +
        '<span class="category-name"><i></i>' + escapeHtml(item.category) + '</span>' +
        '<span class="category-track"><span class="category-fill" style="--w:' + width + '%"></span></span>' +
        '<span class="category-value"><strong>' + value + '</strong></span>' +
      '</div>';
    }).join('');
  }

  function renderBalanceTeaser() {
    const box = $('homeBalanceTeaser');
    const latest = state.balances.slice().sort(sortBalancesDesc).slice(0, 3);
    if (!latest.length) {
      box.innerHTML = '<div class="mini-empty"><strong>还没有盘点</strong>把剩下的菜和钱记下来，心里就有底。</div>';
      return;
    }
    box.innerHTML = '<div class="balance-mini-list">' + latest.map(function (item) {
      const amount = isFiniteNumber(item.amount) ? formatMoney(item.amount) : '—';
      return '<div class="balance-mini-row">' +
        '<strong>' + escapeHtml(item.name) + '</strong>' +
        '<small>' + escapeHtml(formatQuantity(item.quantity, item.unit)) + '</small>' +
        '<span>' + amount + '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* =========================================================
   * 账单
   * ========================================================= */

  function entryRow(record, options) {
    const opts = options || {};
    const category = CATEGORY_NAMES.indexOf(record.category) !== -1 ? record.category : '其他';
    const color = CATEGORY_COLORS[category] || CATEGORY_COLORS['其他'];
    const amount = isFiniteNumber(record.amount) ? formatMoney(record.amount) : '未记金额';
    const meta = [];

    if (opts.showDate) {
      meta.push(formatDateAuto(record.date) + ' ' + weekdayLabel(record.date));
    }
    const quantity = formatQuantity(record.quantity, record.unit);
    if (quantity) meta.push(quantity);
    if (isFiniteNumber(record.unitPrice)) meta.push('单价 ' + formatMoney(record.unitPrice));
    if (record.note) meta.push(record.note);
    if (!meta.length) meta.push('未填写用量');

    return '<div class="entry-row">' +
      '<span class="cat-mark" style="--cat:' + color + '" aria-hidden="true"></span>' +
      '<div class="entry-main">' +
        '<div class="entry-title">' +
          '<strong title="' + escapeHtml(record.name) + '">' + escapeHtml(record.name) + '</strong>' +
          '<span class="cat-tag" style="--cat:' + color + '">' + escapeHtml(category) + '</span>' +
        '</div>' +
        '<div class="entry-meta">' + meta.map(escapeHtml).join('<span class="dot">·</span>') + '</div>' +
      '</div>' +
      '<span class="entry-amount' + (isFiniteNumber(record.amount) ? '' : ' is-muted') + '">' + amount + '</span>' +
      '<div class="entry-actions">' +
        '<button type="button" class="row-icon-btn" data-action="edit-record" data-id="' + escapeHtml(record.id) + '" aria-label="编辑 ' + escapeHtml(record.name) + '" title="编辑">' + icon('edit') + '</button>' +
        '<button type="button" class="row-icon-btn is-danger" data-action="delete-record" data-id="' + escapeHtml(record.id) + '" aria-label="删除 ' + escapeHtml(record.name) + '" title="删除">' + icon('trash') + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderRecords() {
    const search = String($('recordSearch').value || '').trim().toLowerCase();
    const month = $('filterMonth').value || '';
    const category = $('filterCategory').value || '';
    const filtered = state.records.filter(function (record) {
      if (month && !String(record.date || '').startsWith(month)) return false;
      if (category && record.category !== category) return false;
      if (!search) return true;
      return [record.name, record.note, record.raw, record.category, record.date]
        .some(function (value) {
          return String(value || '').toLowerCase().indexOf(search) !== -1;
        });
    }).sort(sortRecordsDesc);

    const total = sumAmounts(filtered);
    $('recordCountLabel').textContent = filtered.length + ' 笔';
    $('recordTotal').textContent = formatMoney(total);

    if (!filtered.length) {
      const hasRecords = state.records.length > 0;
      $('recordList').innerHTML = hasRecords
        ? emptyState('search', '没有找到匹配的账目', '换一个菜名、月份或分类试试，或者清除筛选。',
            '<button type="button" class="btn btn-outline" data-action="clear-filters">' + icon('reset') + '清除筛选</button>')
        : emptyState('basket', '账本还是空的', '从一段买菜文字开始，或者手动记下第一笔。',
            '<button type="button" class="btn btn-primary" data-action="go-paste">' + icon('paste') + '粘贴一段文字</button>' +
            '<button type="button" class="btn btn-outline" data-action="open-record">' + icon('plus') + '手动记一笔</button>');
      return;
    }

    const groups = new Map();
    filtered.forEach(function (record) {
      if (!groups.has(record.date)) groups.set(record.date, []);
      groups.get(record.date).push(record);
    });

    const html = Array.from(groups.entries()).map(function (entry) {
      const date = entry[0];
      const items = entry[1];
      const dayTotal = sumAmounts(items);
      const hasAmount = items.some(function (record) { return isFiniteNumber(record.amount); });
      return '<section class="day-group">' +
        '<div class="day-head">' +
          '<strong>' + escapeHtml(formatDateAuto(date)) + '</strong>' +
          '<span>' + escapeHtml(weekdayLabel(date)) + ' · ' + items.length + ' 笔</span>' +
          (hasAmount ? '<span class="day-total">' + formatMoney(dayTotal) + '</span>' : '') +
        '</div>' +
        '<div class="day-body">' +
          items.map(function (record) { return entryRow(record); }).join('') +
        '</div>' +
      '</section>';
    }).join('');

    $('recordList').innerHTML = html;
  }

  function emptyState(iconName, title, text, actions) {
    return '<div class="empty-state">' +
      '<div class="empty-mark">' + icon(iconName) + '</div>' +
      '<h3>' + escapeHtml(title) + '</h3>' +
      '<p>' + escapeHtml(text) + '</p>' +
      (actions ? '<div class="empty-actions">' + actions + '</div>' : '') +
    '</div>';
  }

  /* =========================================================
   * 算钱
   * ========================================================= */

  function calcAmountFromRow(row) {
    const direct = readNumberInput(row.amount);
    if (direct !== null && !Number.isNaN(direct)) return direct;
    const quantity = readNumberInput(row.quantity);
    const unitPrice = readNumberInput(row.unitPrice);
    if (quantity !== null && !Number.isNaN(quantity) && unitPrice !== null && !Number.isNaN(unitPrice)) {
      return round2(quantity * unitPrice);
    }
    return null;
  }

  function calcRowHasContent(row) {
    return ['name', 'quantity', 'unit', 'unitPrice', 'amount'].some(function (field) {
      return String(row[field] === null || row[field] === undefined ? '' : row[field]).trim() !== '';
    });
  }

  function renderCalc() {
    if (!state.calc.rows.length) state.calc.rows = defaultCalcRows();
    const dateInput = $('calcDate');
    dateInput.value = normalizeDateValue(state.calc.date) || todayISO();
    $('calcRows').innerHTML = state.calc.rows.map(calcRowHtml).join('');
    $('calcSaveState').textContent = '草稿自动保存在本机';
    updateCalcTotals();
  }

  function calcRowHtml(row) {
    return '<div class="calc-row" data-id="' + escapeHtml(row.id) + '">' +
      '<label class="calc-cell name">' +
        '<span>品名</span>' +
        '<input type="text" data-field="name" value="' + escapeHtml(row.name) + '" placeholder="品名" maxlength="40" autocomplete="off">' +
      '</label>' +
      '<label class="calc-cell qty">' +
        '<span>数量</span>' +
        '<input type="number" data-field="quantity" value="' + escapeHtml(row.quantity) + '" placeholder="0" min="0" step="0.01" inputmode="decimal">' +
      '</label>' +
      '<label class="calc-cell unit">' +
        '<span>单位</span>' +
        '<input type="text" data-field="unit" value="' + escapeHtml(row.unit) + '" placeholder="斤" maxlength="6" list="unitList" autocomplete="off">' +
      '</label>' +
      '<label class="calc-cell price">' +
        '<span>单价</span>' +
        '<input type="number" data-field="unitPrice" value="' + escapeHtml(row.unitPrice) + '" placeholder="0.00" min="0" step="0.01" inputmode="decimal">' +
      '</label>' +
      '<label class="calc-cell amount-cell calc-amount-cell">' +
        '<span>金额</span>' +
        '<span class="money-input"><em>¥</em><input type="number" data-field="amount" value="' + escapeHtml(row.amount) + '" placeholder="0.00" min="0" step="0.01" inputmode="decimal"></span>' +
      '</label>' +
      '<button type="button" class="row-icon-btn is-danger" data-action="calc-delete" data-id="' + escapeHtml(row.id) + '" aria-label="删除这一行" title="删除这一行">' + icon('trash') + '</button>' +
    '</div>';
  }

  function updateCalcTotals() {
    let total = 0;
    let count = 0;
    state.calc.rows.forEach(function (row) {
      if (calcRowHasContent(row)) count += 1;
      const amount = calcAmountFromRow(row);
      if (amount !== null) total += amount;
    });
    total = round2(total);
    $('calcTotal').textContent = formatMoney(total);
    $('calcCount').textContent = count + ' 项';
  }

  function scheduleCalcSave() {
    const stateText = $('calcSaveState');
    if (stateText) stateText.textContent = '正在保存…';
    window.clearTimeout(calcSaveTimer);
    calcSaveTimer = window.setTimeout(function () {
      calcSaveTimer = null;
      saveState();
      if ($('calcSaveState')) $('calcSaveState').textContent = '已保存到本机';
    }, 300);
  }

  function handleCalcInput(event) {
    const input = event.target.closest('input[data-field]');
    if (!input) return;
    const rowElement = input.closest('.calc-row');
    if (!rowElement) return;
    const row = state.calc.rows.find(function (item) { return item.id === rowElement.getAttribute('data-id'); });
    if (!row) return;
    const field = input.getAttribute('data-field');
    row[field] = input.value;

    if (field === 'amount') {
      row.amountTouched = input.value.trim() !== '';
    }

    if ((field === 'quantity' || field === 'unitPrice') && !row.amountTouched) {
      const quantity = readNumberInput(row.quantity);
      const unitPrice = readNumberInput(row.unitPrice);
      const amountInput = rowElement.querySelector('input[data-field="amount"]');
      if (quantity !== null && !Number.isNaN(quantity) && unitPrice !== null && !Number.isNaN(unitPrice)) {
        row.amount = formatInput(round2(quantity * unitPrice));
        if (amountInput) amountInput.value = row.amount;
      } else if (amountInput && (String(row.quantity).trim() === '' || String(row.unitPrice).trim() === '')) {
        row.amount = '';
        amountInput.value = '';
      }
    }

    updateCalcTotals();
    scheduleCalcSave();
  }

  function addCalcRow() {
    if (state.calc.rows.length >= 100) {
      showToast('最多先记 100 行，建议记入账单后再继续。', 'error');
      return;
    }
    state.calc.rows.push(blankCalcRow());
    saveState();
    renderCalc();
    requestAnimationFrame(function () {
      const rows = $('calcRows').querySelectorAll('.calc-row');
      const last = rows[rows.length - 1];
      const nameInput = last && last.querySelector('input[data-field="name"]');
      if (nameInput) nameInput.focus();
    });
    $('calcSaveState').textContent = '已保存到本机';
  }

  function deleteCalcRow(id) {
    const row = state.calc.rows.find(function (item) { return item.id === id; });
    if (!row) return;
    if (calcRowHasContent(row) && !window.confirm('删除算钱栏的这一行吗？')) return;
    state.calc.rows = state.calc.rows.filter(function (item) { return item.id !== id; });
    if (!state.calc.rows.length) state.calc.rows.push(blankCalcRow());
    saveState();
    renderCalc();
  }

  function clearCalc() {
    if (!state.calc.rows.some(calcRowHasContent)) {
      showToast('算钱草稿本来就是空的。');
      return;
    }
    if (!window.confirm('清空算钱栏里的全部草稿吗？账单里已经记入的记录不会受影响。')) return;
    window.clearTimeout(calcSaveTimer);
    calcSaveTimer = null;
    state.calc = { date: todayISO(), rows: defaultCalcRows() };
    saveState();
    renderCalc();
    showToast('算钱草稿已清空。');
  }

  function importCalc() {
    const date = normalizeDateValue($('calcDate').value) || todayISO();
    const validRows = [];
    let invalidName = '';

    for (const row of state.calc.rows) {
      const name = String(row.name || '').trim();
      if (!name) continue;
      const quantity = readNumberInput(row.quantity);
      const unitPrice = readNumberInput(row.unitPrice);
      const amountInput = readNumberInput(row.amount);
      if (Number.isNaN(quantity) || Number.isNaN(unitPrice) || Number.isNaN(amountInput)) {
        invalidName = name;
        break;
      }
      let amount = amountInput;
      if (amount === null && quantity !== null && unitPrice !== null) {
        amount = round2(quantity * unitPrice);
      }
      validRows.push({
        name: name,
        quantity: quantity,
        unitPrice: unitPrice,
        amount: amount,
        unit: String(row.unit || '').trim().slice(0, 6)
      });
    }

    if (invalidName) {
      showToast('「' + invalidName + '」的数量、单价或金额不是有效数字，请检查。', 'error');
      return;
    }
    if (!validRows.length) {
      showToast('至少填一个品名，才能记入账单。', 'error');
      return;
    }

    const createdAt = nowISO();
    const newRecords = validRows.map(function (row) {
      return {
        id: uid(),
        date: date,
        name: row.name.slice(0, 40),
        category: Parser.detectCategory(row.name),
        quantity: row.quantity,
        unit: row.unit,
        unitPrice: row.unitPrice,
        amount: row.amount,
        note: '',
        raw: '',
        createdAt: createdAt,
        updatedAt: createdAt
      };
    });

    state.records.push.apply(state.records, newRecords);
    const total = sumAmounts(newRecords);
    window.clearTimeout(calcSaveTimer);
    calcSaveTimer = null;
    state.calc = { date: todayISO(), rows: defaultCalcRows() };
    saveState();
    refreshDataViews();
    navigate('records');
    showToast('已记入 ' + newRecords.length + ' 笔 · ' + formatMoney(total));
  }

  /* =========================================================
   * 结余
   * ========================================================= */

  function balanceRow(item) {
    const quantity = formatQuantity(item.quantity, item.unit);
    const amount = isFiniteNumber(item.amount) ? formatMoney(item.amount) : '—';
    return '<div class="balance-row">' +
      '<span class="balance-icon" aria-hidden="true">' + icon('basket') + '</span>' +
      '<div class="balance-main">' +
        '<div class="balance-title"><strong>' + escapeHtml(item.name) + '</strong>' +
          (quantity ? '<span class="balance-qty">' + escapeHtml(quantity) + '</span>' : '') +
        '</div>' +
        '<div class="balance-meta">' + escapeHtml(item.note || '手工盘点') + '</div>' +
      '</div>' +
      '<span class="balance-amount' + (isFiniteNumber(item.amount) ? '' : ' is-empty') + '">' + amount + '</span>' +
      '<div class="entry-actions">' +
        '<button type="button" class="row-icon-btn" data-action="edit-balance" data-id="' + escapeHtml(item.id) + '" aria-label="编辑 ' + escapeHtml(item.name) + '" title="编辑">' + icon('edit') + '</button>' +
        '<button type="button" class="row-icon-btn is-danger" data-action="delete-balance" data-id="' + escapeHtml(item.id) + '" aria-label="删除 ' + escapeHtml(item.name) + '" title="删除">' + icon('trash') + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderBalance() {
    const latest = state.balances.slice().sort(sortBalancesDesc)[0];
    const latestDate = latest ? latest.date : '';
    const uniqueNames = new Set(state.balances.map(function (item) {
      return String(item.name || '').trim();
    }).filter(Boolean));
    const total = sumAmounts(state.balances);

    $('balanceCount').innerHTML = uniqueNames.size + '<small> 种</small>';
    $('balanceAmount').textContent = formatMoney(total);
    $('balanceLatest').textContent = latestDate ? formatDateAuto(latestDate) : '还没有';
    $('balanceLatest').title = latestDate ? formatFullDate(latestDate) : '';

    if (!state.balances.length) {
      $('balanceList').innerHTML = emptyState('basket', '还没有结余记录', '泡菜、米、现金……剩下的东西，随时手工添一笔。',
        '<button type="button" class="btn btn-primary" data-action="open-balance">' + icon('plus') + '添加结余</button>');
      return;
    }

    const groups = new Map();
    state.balances.slice().sort(sortBalancesDesc).forEach(function (item) {
      if (!groups.has(item.date)) groups.set(item.date, []);
      groups.get(item.date).push(item);
    });

    $('balanceList').innerHTML = Array.from(groups.entries()).map(function (entry) {
      const date = entry[0];
      const items = entry[1];
      const dayTotal = sumAmounts(items);
      const hasAmount = items.some(function (item) { return isFiniteNumber(item.amount); });
      return '<section class="day-group">' +
        '<div class="day-head">' +
          '<strong>' + escapeHtml(formatDateAuto(date)) + '</strong>' +
          '<span>' + escapeHtml(weekdayLabel(date)) + ' · ' + items.length + ' 项</span>' +
          (hasAmount ? '<span class="day-total">' + formatMoney(dayTotal) + '</span>' : '') +
        '</div>' +
        '<div class="day-body">' + items.map(balanceRow).join('') + '</div>' +
      '</section>';
    }).join('');
  }

  /* =========================================================
   * 粘贴识别
   * ========================================================= */

  function renderParse() {
    const wrap = $('parseResultWrap');
    if (!parseRun) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;

    const warningBox = $('parseWarnings');
    if (parseWarnings.length) {
      const shown = parseWarnings.slice(0, 6);
      warningBox.hidden = false;
      warningBox.innerHTML = '<strong>有 ' + parseWarnings.length + ' 条提示，请顺手核对</strong>' +
        '<ul>' + shown.map(function (warning) {
          const line = warning.line ? '（' + String(warning.line).slice(0, 60) + '）' : '';
          return '<li>' + escapeHtml(warning.message) + (line ? '<em>' + escapeHtml(line) + '</em>' : '') + '</li>';
        }).join('') +
        (parseWarnings.length > shown.length ? '<li>还有 ' + (parseWarnings.length - shown.length) + ' 条提示没有展开</li>' : '') +
        '</ul>';
    } else {
      warningBox.hidden = true;
      warningBox.innerHTML = '';
    }

    if (!parseItems.length) {
      $('parseRows').innerHTML = '<div class="mini-empty"><strong>没有识别出可入账的条目</strong>试试每个菜单独一行，并在前面写日期。</div>';
    } else {
      $('parseRows').innerHTML = parseItems.map(parseRowHtml).join('');
    }

    updateParseSelection();
  }

  function categoryOptions(selected) {
    const value = CATEGORY_NAMES.indexOf(selected) !== -1 ? selected : '其他';
    return CATEGORY_NAMES.map(function (category) {
      return '<option value="' + escapeHtml(category) + '"' + (category === value ? ' selected' : '') + '>' + escapeHtml(category) + '</option>';
    }).join('');
  }

  function parseRowHtml(item) {
    const include = item.include;
    const category = CATEGORY_NAMES.indexOf(item.category) !== -1 ? item.category : '其他';
    return '<div class="parse-row' + (include ? '' : ' is-off') + '" data-id="' + escapeHtml(item.id) + '">' +
      '<span class="check-wrap"><input type="checkbox" class="parse-include" aria-label="选中 ' + escapeHtml(item.name || '这一条') + '"' + (include ? ' checked' : '') + '></span>' +
      '<label class="parse-field date"><span>日期</span><input type="date" data-field="date" value="' + escapeHtml(normalizeDateValue(item.date)) + '"></label>' +
      '<label class="parse-field name"><span>菜品 / 项目</span><input type="text" data-field="name" value="' + escapeHtml(item.name) + '" placeholder="菜品或项目" maxlength="40" autocomplete="off"></label>' +
      '<label class="parse-field category"><span>分类</span><select data-field="category">' + categoryOptions(category) + '</select></label>' +
      '<label class="parse-field qty-unit"><span>数量 / 单位</span><span class="qty-unit-inner">' +
        '<input class="qty-input" type="number" data-field="quantity" value="' + escapeHtml(item.quantity) + '" placeholder="0" min="0" step="0.01" inputmode="decimal">' +
        '<input class="unit-input" type="text" data-field="unit" value="' + escapeHtml(item.unit) + '" placeholder="斤" maxlength="6" list="unitList" autocomplete="off">' +
      '</span></label>' +
      '<label class="parse-field unit-price"><span>单价</span><input type="number" data-field="unitPrice" value="' + escapeHtml(item.unitPrice) + '" placeholder="0.00" min="0" step="0.01" inputmode="decimal"></label>' +
      '<label class="parse-field amount"><span>金额</span><input type="number" data-field="amount" value="' + escapeHtml(item.amount) + '" placeholder="0.00" min="0" step="0.01" inputmode="decimal"></label>' +
      '<button type="button" class="row-icon-btn is-danger" data-action="parse-delete" data-id="' + escapeHtml(item.id) + '" aria-label="移除这条" title="移除这条">' + icon('trash') + '</button>' +
      (!String(item.name || '').trim() ? '<div class="row-warning">' + icon('alert') + '缺少品名，导入时会跳过这一条</div>' : '') +
    '</div>';
  }

  function updateParseSelection() {
    const selectAll = $('parseSelectAll');
    const selected = parseItems.filter(function (item) { return item.include; });
    const selectedAmount = sumAmounts(selected.map(function (item) {
      return { amount: readNumberInput(item.amount) };
    }));
    const allSelected = parseItems.length > 0 && selected.length === parseItems.length;

    selectAll.checked = allSelected;
    selectAll.indeterminate = selected.length > 0 && !allSelected;
    selectAll.disabled = parseItems.length === 0;

    $('parseSelectedCount').textContent = '已选 ' + selected.length + ' 条';
    $('parseTotal').textContent = formatMoney(selectedAmount);
    $('parseSummary').textContent = parseItems.length
      ? '识别到 ' + parseItems.length + ' 条，请核对后导入'
      : '没有识别出可入账的条目';
    $('btnImportParsed').disabled = selected.length === 0;
  }

  function applyParseField(item, field, value, rowElement) {
    item[field] = value;
    if (field === 'amount') {
      item._amountTouched = String(value || '').trim() !== '';
    }

    if ((field === 'quantity' || field === 'unitPrice') && !item._amountTouched) {
      const quantity = readNumberInput(item.quantity);
      const unitPrice = readNumberInput(item.unitPrice);
      const amountInput = rowElement.querySelector('input[data-field="amount"]');
      if (quantity !== null && !Number.isNaN(quantity) && unitPrice !== null && !Number.isNaN(unitPrice)) {
        item.amount = formatInput(round2(quantity * unitPrice));
        if (amountInput) amountInput.value = item.amount;
      } else if (String(item.quantity).trim() === '' || String(item.unitPrice).trim() === '') {
        item.amount = '';
        if (amountInput) amountInput.value = '';
      }
    }

    parseDirty = true;
    updateParseSelection();
  }

  function handleParseInput(event) {
    const input = event.target.closest('input[data-field], select[data-field]');
    if (!input) return;
    const rowElement = input.closest('.parse-row');
    if (!rowElement) return;
    const item = parseItems.find(function (candidate) {
      return candidate.id === rowElement.getAttribute('data-id');
    });
    if (!item) return;
    applyParseField(item, input.getAttribute('data-field'), input.value, rowElement);
  }

  function handleParseChange(event) {
    const target = event.target;
    const rowElement = target.closest('.parse-row');
    if (!rowElement) return;
    const item = parseItems.find(function (candidate) {
      return candidate.id === rowElement.getAttribute('data-id');
    });
    if (!item) return;

    if (target.classList.contains('parse-include')) {
      item.include = target.checked;
      rowElement.classList.toggle('is-off', !target.checked);
      parseDirty = true;
      updateParseSelection();
      return;
    }
    if (target.getAttribute('data-field')) {
      applyParseField(item, target.getAttribute('data-field'), target.value, rowElement);
    }
  }

  function resetParseResults() {
    parseItems = [];
    parseWarnings = [];
    parseRun = false;
    parseDirty = false;
    const wrap = $('parseResultWrap');
    if (wrap) wrap.hidden = true;
    if ($('parseRows')) $('parseRows').innerHTML = '';
    if ($('parseWarnings')) {
      $('parseWarnings').hidden = true;
      $('parseWarnings').innerHTML = '';
    }
    if ($('parseSelectAll')) {
      $('parseSelectAll').checked = false;
      $('parseSelectAll').indeterminate = false;
      $('parseSelectAll').disabled = false;
    }
    if ($('parseSummary')) $('parseSummary').textContent = '识别到 0 条';
    if ($('parseSelectedCount')) $('parseSelectedCount').textContent = '已选 0 条';
    if ($('parseTotal')) $('parseTotal').textContent = '¥0.00';
    if ($('btnImportParsed')) $('btnImportParsed').disabled = true;
  }

  function runParse() {
    const input = $('pasteText');
    const text = String(input.value || '').trim();
    if (!text) {
      showToast('先贴一段买菜文字，再开始识别。', 'error');
      input.focus();
      return;
    }
    if (parseRun && parseDirty && !window.confirm('重新识别会覆盖当前核对结果，继续吗？')) return;

    let result;
    try {
      result = Parser.parseText(text, { today: new Date() });
    } catch (error) {
      console.error(error);
      showToast('识别时出错了，请检查文字内容后重试。', 'error');
      return;
    }

    parseItems = result.items.map(function (item) {
      return {
        id: uid(),
        date: normalizeDateValue(item.date) || todayISO(),
        name: String(item.name || '').trim(),
        category: CATEGORY_NAMES.indexOf(item.category) !== -1 ? item.category : Parser.detectCategory(item.name || ''),
        quantity: item.quantity === null || item.quantity === undefined ? '' : String(item.quantity),
        unit: item.unit || '',
        unitPrice: item.unitPrice === null || item.unitPrice === undefined ? '' : String(item.unitPrice),
        amount: item.amount === null || item.amount === undefined ? '' : String(item.amount),
        raw: item.raw || '',
        include: true,
        _amountTouched: false
      };
    });
    parseWarnings = result.warnings || [];
    parseRun = true;
    parseDirty = false;
    renderParse();

    window.setTimeout(function () {
      const wrap = $('parseResultWrap');
      if (wrap && !wrap.hidden) wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function importParsed() {
    const selected = parseItems.filter(function (item) { return item.include; });
    if (!selected.length) {
      showToast('还没有选中任何条目。', 'error');
      return;
    }

    const createdAt = nowISO();
    const newRecords = [];
    let skipped = 0;

    selected.forEach(function (item) {
      const name = String(item.name || '').trim();
      if (!name) {
        skipped += 1;
        return;
      }
      const quantity = readNumberInput(item.quantity);
      const unitPrice = readNumberInput(item.unitPrice);
      let amount = readNumberInput(item.amount);
      if (Number.isNaN(quantity) || Number.isNaN(unitPrice) || Number.isNaN(amount)) {
        skipped += 1;
        return;
      }
      if (amount === null && quantity !== null && unitPrice !== null) {
        amount = round2(quantity * unitPrice);
      }
      newRecords.push({
        id: uid(),
        date: normalizeDateValue(item.date) || todayISO(),
        name: name.slice(0, 40),
        category: CATEGORY_NAMES.indexOf(item.category) !== -1 ? item.category : Parser.detectCategory(name),
        quantity: quantity,
        unit: String(item.unit || '').trim().slice(0, 6),
        unitPrice: unitPrice,
        amount: amount,
        note: '',
        raw: String(item.raw || '').trim().slice(0, 300),
        createdAt: createdAt,
        updatedAt: createdAt
      });
    });

    if (!newRecords.length) {
      showToast('选中的条目缺少品名或数字格式不对，暂时不能导入。', 'error');
      return;
    }

    const total = sumAmounts(newRecords);
    state.records.push.apply(state.records, newRecords);
    saveState();
    resetParseResults();
    refreshDataViews();
    navigate('records');

    let message = '已导入 ' + newRecords.length + ' 笔 · ' + formatMoney(total);
    if (skipped) message += '；' + skipped + ' 条缺少品名或数字无效，已跳过';
    showToast(message);
  }

  function removeParseItem(id) {
    parseItems = parseItems.filter(function (item) { return item.id !== id; });
    parseDirty = true;
    if (!parseItems.length) {
      resetParseResults();
      showToast('识别结果已全部移除。');
      return;
    }
    renderParse();
  }

  /* =========================================================
   * 手动记账 / 结余表单
   * ========================================================= */

  function showFormError(element, message) {
    element.textContent = message;
    element.hidden = false;
  }

  function openRecordDialog(record) {
    const form = $('recordForm');
    form.reset();
    $('recordError').hidden = true;
    $('recordId').value = record ? record.id : '';
    $('recordDate').value = record ? record.date : todayISO();
    $('recordCategory').value = record && CATEGORY_NAMES.indexOf(record.category) !== -1 ? record.category : '';
    $('recordName').value = record ? record.name : '';
    $('recordQuantity').value = record && record.quantity !== null ? formatInput(record.quantity) : '';
    $('recordUnit').value = record ? record.unit : '';
    $('recordUnitPrice').value = record && record.unitPrice !== null ? formatInput(record.unitPrice) : '';
    $('recordAmount').value = record && record.amount !== null ? formatInput(record.amount) : '';
    $('recordNote').value = record ? record.note : '';
    $('recordDialogTitle').textContent = record ? '编辑记录' : '记一笔';
    $('recordSubmit').textContent = record ? '保存修改' : '保存记录';
    $('btnDeleteRecord').hidden = !record;
    $('recordAmountHint').textContent = record && record.amount !== null
      ? '可直接修改金额'
      : '填数量与单价会自动算';
    lastAutoAmount = null;
    openDialog($('recordDialog'));
    window.setTimeout(function () { $('recordName').focus(); }, 80);
  }

  function updateRecordAutoAmount() {
    const quantityRaw = $('recordQuantity').value.trim();
    const priceRaw = $('recordUnitPrice').value.trim();
    const amountInput = $('recordAmount');

    if (!quantityRaw || !priceRaw) {
      if (lastAutoAmount && amountInput.value.trim() === lastAutoAmount) {
        amountInput.value = '';
        lastAutoAmount = null;
      }
      return;
    }

    const quantity = readNumberInput(quantityRaw);
    const unitPrice = readNumberInput(priceRaw);
    if (quantity === null || Number.isNaN(quantity) || unitPrice === null || Number.isNaN(unitPrice)) return;

    const current = amountInput.value.trim();
    const auto = formatInput(round2(quantity * unitPrice));
    if (!current || current === lastAutoAmount) {
      amountInput.value = auto;
    }
    lastAutoAmount = auto;
  }

  function handleRecordSubmit(event) {
    event.preventDefault();
    const errorBox = $('recordError');
    errorBox.hidden = true;

    const name = $('recordName').value.trim();
    const date = normalizeDateValue($('recordDate').value);
    if (!name) {
      showFormError(errorBox, '请填写菜品或项目名称。');
      $('recordName').focus();
      return;
    }
    if (!date) {
      showFormError(errorBox, '请选择一个有效日期。');
      $('recordDate').focus();
      return;
    }

    const quantity = readNumberInput($('recordQuantity').value);
    const unitPrice = readNumberInput($('recordUnitPrice').value);
    let amount = readNumberInput($('recordAmount').value);
    if (Number.isNaN(quantity) || Number.isNaN(unitPrice) || Number.isNaN(amount)) {
      showFormError(errorBox, '数量、单价和金额需要是非负数字。');
      return;
    }
    if (amount === null && quantity !== null && unitPrice !== null) {
      amount = round2(quantity * unitPrice);
    }

    const categoryValue = $('recordCategory').value;
    const category = CATEGORY_NAMES.indexOf(categoryValue) !== -1 ? categoryValue : Parser.detectCategory(name);
    const id = $('recordId').value;
    const existing = id ? state.records.find(function (record) { return record.id === id; }) : null;
    const timestamp = nowISO();
    const record = {
      id: existing ? existing.id : uid(),
      date: date,
      name: name.slice(0, 40),
      category: category,
      quantity: quantity,
      unit: $('recordUnit').value.trim().slice(0, 6),
      unitPrice: unitPrice,
      amount: amount,
      note: $('recordNote').value.trim().slice(0, 80),
      raw: existing ? existing.raw : '',
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: timestamp
    };

    if (existing) {
      Object.assign(existing, record);
    } else {
      state.records.push(record);
    }

    saveState();
    closeDialog($('recordDialog'));
    refreshDataViews();
    showToast(existing ? '记录已更新。' : '记下了：' + record.name);
  }

  function deleteRecord(id) {
    const record = state.records.find(function (item) { return item.id === id; });
    if (!record) return;
    if (!window.confirm('删除「' + record.name + '」（' + formatDateAuto(record.date) + '）这条记录吗？')) return;
    state.records = state.records.filter(function (item) { return item.id !== id; });
    saveState();
    if ($('recordDialog').open && $('recordId').value === id) closeDialog($('recordDialog'));
    refreshDataViews();
    showToast('记录已删除。');
  }

  function openBalanceDialog(item) {
    const form = $('balanceForm');
    form.reset();
    $('balanceError').hidden = true;
    $('balanceId').value = item ? item.id : '';
    $('balanceDate').value = item ? item.date : todayISO();
    $('balanceName').value = item ? item.name : '';
    $('balanceQuantity').value = item && item.quantity !== null ? formatInput(item.quantity) : '';
    $('balanceUnit').value = item ? item.unit : '';
    $('balanceAmount').value = item && item.amount !== null ? formatInput(item.amount) : '';
    $('balanceNote').value = item ? item.note : '';
    $('balanceDialogTitle').textContent = item ? '编辑结余' : '添加结余';
    $('balanceSubmit').textContent = item ? '保存修改' : '保存结余';
    $('btnDeleteBalance').hidden = !item;
    openDialog($('balanceDialog'));
    window.setTimeout(function () { $('balanceName').focus(); }, 80);
  }

  function handleBalanceSubmit(event) {
    event.preventDefault();
    const errorBox = $('balanceError');
    errorBox.hidden = true;

    const name = $('balanceName').value.trim();
    const date = normalizeDateValue($('balanceDate').value);
    if (!name) {
      showFormError(errorBox, '请填写结余项目。');
      $('balanceName').focus();
      return;
    }
    if (!date) {
      showFormError(errorBox, '请选择一个有效日期。');
      $('balanceDate').focus();
      return;
    }

    const quantity = readNumberInput($('balanceQuantity').value);
    const amount = readNumberInput($('balanceAmount').value);
    if (Number.isNaN(quantity) || Number.isNaN(amount)) {
      showFormError(errorBox, '数量和折合金额需要是非负数字。');
      return;
    }

    const id = $('balanceId').value;
    const existing = id ? state.balances.find(function (item) { return item.id === id; }) : null;
    const timestamp = nowISO();
    const balance = {
      id: existing ? existing.id : uid(),
      date: date,
      name: name.slice(0, 40),
      quantity: quantity,
      unit: $('balanceUnit').value.trim().slice(0, 6),
      amount: amount,
      note: $('balanceNote').value.trim().slice(0, 80),
      createdAt: existing ? existing.createdAt : timestamp,
      updatedAt: timestamp
    };

    if (existing) {
      Object.assign(existing, balance);
    } else {
      state.balances.push(balance);
    }

    saveState();
    closeDialog($('balanceDialog'));
    refreshDataViews();
    showToast(existing ? '结余已更新。' : '结余已记下。');
  }

  function deleteBalance(id) {
    const item = state.balances.find(function (balance) { return balance.id === id; });
    if (!item) return;
    if (!window.confirm('删除「' + item.name + '」这条结余记录吗？')) return;
    state.balances = state.balances.filter(function (balance) { return balance.id !== id; });
    saveState();
    if ($('balanceDialog').open && $('balanceId').value === id) closeDialog($('balanceDialog'));
    refreshDataViews();
    showToast('结余记录已删除。');
  }

  /* =========================================================
   * 数据设置 / 备份
   * ========================================================= */

  function initCategoryControls() {
    const recordCategory = $('recordCategory');
    const filterCategory = $('filterCategory');
    if (recordCategory && !recordCategory.dataset.ready) {
      recordCategory.innerHTML = '<option value="">自动分类（保存时识别）</option>' +
        CATEGORY_NAMES.map(function (category) {
          return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</option>';
        }).join('');
      recordCategory.dataset.ready = '1';
    }
    if (filterCategory && !filterCategory.dataset.ready) {
      filterCategory.innerHTML = '<option value="">全部分类</option>' +
        CATEGORY_NAMES.map(function (category) {
          return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</option>';
        }).join('');
      filterCategory.dataset.ready = '1';
    }
  }

  function renderSettingsStats() {
    if (!$('settingsRecordCount')) return;
    $('settingsRecordCount').textContent = state.records.length + ' 条';
    $('settingsBalanceCount').textContent = state.balances.length + ' 条';
    let bytes = 0;
    try {
      bytes = new Blob([JSON.stringify(state)]).size;
    } catch (error) {
      bytes = JSON.stringify(state).length * 2;
    }
    $('settingsStorage').textContent = formatByteSize(bytes);
    updateInstallUI();
  }

  function formatByteSize(bytes) {
    if (!bytes) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function updateInstallUI() {
    const button = $('btnInstall');
    const hint = $('installHint');
    if (!button || !hint) return;

    const installed = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;
    if (installed) {
      button.hidden = true;
      hint.textContent = '已经安装到桌面，可以从桌面图标打开。';
      return;
    }
    if (window.location.protocol === 'file:') {
      button.hidden = true;
      hint.textContent = '当前是直接打开文件，也能正常记账；用 start.bat 启动本地服务后可以安装成 App。';
      return;
    }
    if (!window.isSecureContext) {
      button.hidden = true;
      hint.textContent = '手机已可正常记账。局域网 HTTP 下浏览器不允许离线安装，可打开浏览器菜单选择「添加到主屏幕」当快捷方式。';
      return;
    }
    button.hidden = !deferredPrompt;
    hint.textContent = deferredPrompt
      ? '点击下面的按钮安装，之后从桌面打开更方便。'
      : '用浏览器菜单或地址栏里的安装入口，可以把它装到桌面。';
  }

  function openSettings() {
    renderSettingsStats();
    applyLedgerTitle();
    openDialog($('settingsDialog'));
  }

  function downloadFile(filename, content, mimeType) {
    try {
      const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
      return true;
    } catch (error) {
      console.error(error);
      showToast('导出失败，请换一个浏览器试试。', 'error');
      return false;
    }
  }

  function exportJSON() {
    const payload = {
      app: 'canteen-ledger',
      version: VERSION,
      title: normalizeTitle(state.title),
      exportedAt: new Date().toISOString(),
      records: state.records,
      balances: state.balances,
      calc: state.calc
    };
    if (downloadFile(titleForFile() + '-备份-' + todayISO() + '.json', JSON.stringify(payload, null, 2), 'application/json')) {
      showToast('完整备份已导出。');
    }
  }

  function csvCell(value) {
    return '"' + String(value === null || value === undefined ? '' : value).replace(/"/g, '""') + '"';
  }

  function exportCSV() {
    if (!state.records.length) {
      showToast('账本里还没有记录，先记一笔再导出。', 'error');
      return;
    }
    const header = ['日期', '菜品/项目', '分类', '数量', '单位', '单价（元）', '金额（元）', '备注'];
    const rows = state.records.slice().sort(function (a, b) {
      return String(a.date || '').localeCompare(String(b.date || '')) ||
        String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    }).map(function (record) {
      return [
        record.date,
        record.name,
        record.category,
        record.quantity === null ? '' : record.quantity,
        record.unit,
        record.unitPrice === null ? '' : record.unitPrice,
        record.amount === null ? '' : record.amount,
        record.note
      ].map(csvCell).join(',');
    });
    const content = '\uFEFF' + header.map(csvCell).join(',') + '\r\n' + rows.join('\r\n');
    if (downloadFile(titleForFile() + '-账单-' + todayISO() + '.csv', content, 'text/csv')) {
      showToast('明细 CSV 已导出。');
    }
  }

  /* =========================================================
   * 汇总报表
   * ========================================================= */

  function buildSummaryModel() {
    const records = state.records.slice().sort(sortRecordsAsc);
    const dates = Array.from(new Set(records.map(function (record) {
      return record.date;
    }))).sort();
    const categoryMap = {};
    CATEGORY_NAMES.forEach(function (name) {
      categoryMap[name] = { name: name, count: 0, amount: 0 };
    });

    const dayMap = {};
    const itemMap = {};
    let amountCount = 0;

    records.forEach(function (record) {
      const amount = isFiniteNumber(record.amount) ? Number(record.amount) : 0;
      const category = CATEGORY_NAMES.indexOf(record.category) !== -1 ? record.category : '其他';
      if (!categoryMap[category]) categoryMap[category] = { name: category, count: 0, amount: 0 };
      categoryMap[category].count += 1;
      categoryMap[category].amount = round2(categoryMap[category].amount + amount);
      if (isFiniteNumber(record.amount)) amountCount += 1;

      if (!dayMap[record.date]) dayMap[record.date] = { date: record.date, count: 0, amount: 0 };
      dayMap[record.date].count += 1;
      dayMap[record.date].amount = round2(dayMap[record.date].amount + amount);

      const unit = String(record.unit || '').trim();
      const key = String(record.name || '') + '\u0000' + unit;
      if (!itemMap[key]) {
        itemMap[key] = {
          name: record.name,
          category: category,
          unit: unit,
          quantity: 0,
          quantityCount: 0,
          amount: 0,
          count: 0
        };
      }
      const item = itemMap[key];
      item.count += 1;
      item.amount = round2(item.amount + amount);
      if (isFiniteNumber(record.quantity)) {
        item.quantity = round2(item.quantity + Number(record.quantity));
        item.quantityCount += 1;
      }
    });

    const categories = Object.keys(categoryMap).map(function (name) {
      return categoryMap[name];
    }).filter(function (item) {
      return item.count > 0;
    }).sort(function (a, b) {
      return b.amount - a.amount || CATEGORY_NAMES.indexOf(a.name) - CATEGORY_NAMES.indexOf(b.name);
    });

    const days = Object.keys(dayMap).map(function (key) {
      return dayMap[key];
    }).sort(function (a, b) {
      return b.date.localeCompare(a.date);
    });

    const items = Object.keys(itemMap).map(function (key) {
      return itemMap[key];
    }).sort(function (a, b) {
      return b.amount - a.amount || String(a.name).localeCompare(String(b.name), 'zh-CN');
    });

    const seenBalances = new Set();
    const balances = [];
    state.balances.slice().sort(sortBalancesDesc).forEach(function (balance) {
      const key = String(balance.name || '').trim();
      if (!key || seenBalances.has(key)) return;
      seenBalances.add(key);
      balances.push(balance);
    });

    const total = sumAmounts(records);
    const balanceTotal = sumAmounts(balances);
    const uniqueNames = new Set(records.map(function (record) {
      return String(record.name || '').trim();
    }).filter(Boolean));

    return {
      records: records,
      count: records.length,
      amountCount: amountCount,
      total: total,
      dayCount: dates.length,
      firstDate: dates[0] || '',
      lastDate: dates[dates.length - 1] || '',
      uniqueNames: uniqueNames.size,
      average: dates.length ? round2(total / dates.length) : 0,
      categories: categories,
      days: days,
      items: items,
      balances: balances,
      balanceTotal: balanceTotal
    };
  }

  function summaryPeriodText(model) {
    if (!model.count) return '账本里还没有记录';
    if (model.firstDate === model.lastDate) return formatFullDate(model.firstDate);
    return formatFullDate(model.firstDate) + ' — ' + formatFullDate(model.lastDate);
  }

  function percentText(value) {
    if (!Number.isFinite(value) || value <= 0) return '0%';
    if (value < 1) return '<1%';
    return Math.round(value) + '%';
  }

  function renderSummary() {
    const model = buildSummaryModel();
    const body = $('summaryBody');
    const period = $('summaryPeriod');
    const exportButton = $('btnExportSummary');
    const printButton = $('btnPrintSummary');
    if (!body) return;

    if (period) period.textContent = summaryPeriodText(model);
    if (exportButton) exportButton.disabled = !model.count;
    if (printButton) printButton.disabled = !model.count;

    if (!model.count) {
      body.innerHTML =
        '<div class="summary-empty">' +
          '<span class="summary-empty-icon">' + icon('report') + '</span>' +
          '<strong>还没有可汇总的账目</strong>' +
          '<p>先在账单里记下几笔，或从粘贴识别导入一批，再回来查看总账。</p>' +
          '<button type="button" class="btn btn-soft" data-action="summary-go-records">去记账' + icon('arrow') + '</button>' +
        '</div>';
      return;
    }

    const categoryRows = model.categories.map(function (category) {
      return '<tr>' +
        '<td><span class="summary-dot" style="background:' + CATEGORY_COLORS[category.name] + '"></span>' + escapeHtml(category.name) + '</td>' +
        '<td class="num">' + formatMoney(category.amount) + '</td>' +
        '<td class="num">' + percentText(category.amount / model.total * 100) + '</td>' +
        '<td class="num">' + category.count + ' 笔</td>' +
      '</tr>';
    }).join('');

    const dayRows = model.days.map(function (day) {
      return '<tr>' +
        '<td>' + escapeHtml(formatDateAuto(day.date, true)) + '</td>' +
        '<td class="summary-weekday">' + escapeHtml(weekdayLabel(day.date)) + '</td>' +
        '<td class="num">' + day.count + ' 笔</td>' +
        '<td class="num">' + formatMoney(day.amount) + '</td>' +
      '</tr>';
    }).join('');

    const itemRows = model.items.map(function (item) {
      const quantity = item.quantityCount ? formatQuantity(item.quantity, item.unit) : (item.unit || '—');
      return '<tr>' +
        '<td><strong>' + escapeHtml(item.name) + '</strong></td>' +
        '<td><span class="summary-category">' + escapeHtml(item.category) + '</span></td>' +
        '<td class="num">' + escapeHtml(quantity) + '</td>' +
        '<td class="num">' + formatMoney(item.amount) + '</td>' +
        '<td class="num">' + item.count + ' 次</td>' +
      '</tr>';
    }).join('');

    let balanceSection = '';
    if (model.balances.length) {
      const balanceRows = model.balances.map(function (balance) {
        return '<tr>' +
          '<td><strong>' + escapeHtml(balance.name) + '</strong></td>' +
          '<td class="num">' + escapeHtml(formatQuantity(balance.quantity, balance.unit) || '—') + '</td>' +
          '<td class="num">' + formatMoney(balance.amount) + '</td>' +
          '<td class="num">' + escapeHtml(formatDateAuto(balance.date, true)) + '</td>' +
        '</tr>';
      }).join('');
      balanceSection =
        '<section class="summary-section">' +
          '<div class="summary-section-head">' +
            '<h4>最近结余盘点</h4>' +
            '<span>合计 ' + formatMoney(model.balanceTotal) + '</span>' +
          '</div>' +
          '<div class="summary-table-wrap">' +
            '<table class="summary-table summary-table-balances">' +
              '<thead><tr><th>菜品</th><th class="num">剩余数量</th><th class="num">折合金额</th><th class="num">盘点日期</th></tr></thead>' +
              '<tbody>' + balanceRows + '</tbody>' +
            '</table>' +
          '</div>' +
          '<p class="summary-note">结余是手工盘点快照，汇总时取每种菜品最近一次记录，不会从采购里自动扣减。</p>' +
        '</section>';
    }

    body.innerHTML =
      '<div class="summary-hero">' +
        '<div class="summary-hero-copy">' +
          '<p class="summary-kicker">账本总览</p>' +
          '<h3>' + escapeHtml(state.title) + '</h3>' +
          '<p class="summary-range">' + escapeHtml(summaryPeriodText(model)) + '</p>' +
        '</div>' +
        '<div class="summary-total">' +
          '<span>总支出</span>' +
          '<strong>' + formatMoney(model.total) + '</strong>' +
          '<small>' + model.count + ' 笔记录 · ' + model.amountCount + ' 笔有金额</small>' +
        '</div>' +
      '</div>' +
      '<div class="summary-kpis">' +
        '<div><span>采购天数</span><strong>' + model.dayCount + '<small> 天</small></strong></div>' +
        '<div><span>菜品种类</span><strong>' + model.uniqueNames + '<small> 种</small></strong></div>' +
        '<div><span>日均支出</span><strong>' + formatMoney(model.average) + '</strong></div>' +
        '<div><span>最近结余</span><strong>' + formatMoney(model.balanceTotal) + '</strong></div>' +
      '</div>' +
      '<section class="summary-section">' +
        '<div class="summary-section-head"><h4>分类汇总</h4><span>看清楚钱花在哪一类</span></div>' +
        '<div class="summary-table-wrap">' +
          '<table class="summary-table summary-table-categories">' +
            '<thead><tr><th>分类</th><th class="num">金额</th><th class="num">占比</th><th class="num">记录</th></tr></thead>' +
            '<tbody>' + categoryRows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>' +
      '<section class="summary-section">' +
        '<div class="summary-section-head"><h4>按日汇总</h4><span>共 ' + model.dayCount + ' 个采购日</span></div>' +
        '<div class="summary-table-wrap">' +
          '<table class="summary-table summary-table-days">' +
            '<thead><tr><th>日期</th><th>星期</th><th class="num">记录</th><th class="num">金额</th></tr></thead>' +
            '<tbody>' + dayRows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>' +
      '<section class="summary-section">' +
        '<div class="summary-section-head"><h4>菜品汇总</h4><span>按金额从高到低</span></div>' +
        '<div class="summary-table-wrap">' +
          '<table class="summary-table summary-table-items">' +
            '<thead><tr><th>菜品</th><th>分类</th><th class="num">合计数量</th><th class="num">金额</th><th class="num">出现</th></tr></thead>' +
            '<tbody>' + itemRows + '</tbody>' +
          '</table>' +
        '</div>' +
      '</section>' +
      balanceSection +
      '<p class="summary-footnote">统计范围：' + escapeHtml(summaryPeriodText(model)) + '。金额按账单里记录的实际金额合计。</p>';
  }

  function openSummary() {
    const settings = $('settingsDialog');
    if (settings && settings.open) closeDialog(settings);
    renderSummary();
    openDialog($('summaryDialog'));
  }

  function exportSummaryCSV() {
    const model = buildSummaryModel();
    if (!model.count) {
      showToast('账本里还没有记录，先记一笔再导出。', 'error');
      return;
    }

    const rows = [];
    const push = function (cells) {
      rows.push(cells.map(csvCell).join(','));
    };
    const range = model.firstDate + ' 至 ' + model.lastDate;

    push(['账本标题', state.title]);
    push(['统计范围', range]);
    push(['导出时间', new Date().toLocaleString('zh-CN', { hour12: false })]);
    push(['账单笔数', model.count]);
    push(['采购天数', model.dayCount]);
    push(['菜品数量', model.uniqueNames]);
    push(['总支出（元）', model.total]);
    push(['日均支出（元）', model.average]);
    push(['最近结余合计（元）', model.balanceTotal]);
    rows.push('');

    push(['分类汇总']);
    push(['分类', '金额（元）', '占比', '记录笔数']);
    model.categories.forEach(function (category) {
      push([category.name, category.amount, percentText(category.amount / model.total * 100), category.count]);
    });
    push(['合计', model.total, '100%', model.count]);
    rows.push('');

    push(['按日汇总']);
    push(['日期', '星期', '记录笔数', '金额（元）']);
    model.days.forEach(function (day) {
      push([day.date, weekdayLabel(day.date), day.count, day.amount]);
    });
    rows.push('');

    push(['菜品汇总']);
    push(['菜品', '分类', '合计数量', '单位', '金额（元）', '出现次数']);
    model.items.forEach(function (item) {
      push([
        item.name,
        item.category,
        item.quantityCount ? item.quantity : '',
        item.unit,
        item.amount,
        item.count
      ]);
    });
    rows.push('');

    if (model.balances.length) {
      push(['最近结余盘点']);
      push(['菜品', '剩余数量', '单位', '折合金额（元）', '盘点日期']);
      model.balances.forEach(function (balance) {
        push([
          balance.name,
          balance.quantity === null ? '' : balance.quantity,
          balance.unit,
          balance.amount === null ? '' : balance.amount,
          balance.date
        ]);
      });
      push(['结余合计', '', '', model.balanceTotal, '']);
      rows.push('');
    }

    push(['说明', '结余为手工盘点，取每种菜品最近一次记录；金额按账单实际金额合计。']);
    const content = '\uFEFF' + rows.join('\r\n') + '\r\n';
    if (downloadFile(titleForFile() + '-汇总-' + todayISO() + '.csv', content, 'text/csv')) {
      showToast('汇总 CSV 已导出。');
    }
  }

  function printSummary() {
    if (!state.records.length) {
      showToast('账本里还没有记录，先记一笔再打印。', 'error');
      return;
    }
    let cleaned = false;
    const cleanup = function () {
      if (cleaned) return;
      cleaned = true;
      document.body.classList.remove('printing-summary');
    };
    document.body.classList.add('printing-summary');
    window.addEventListener('afterprint', cleanup, { once: true });
    try {
      window.print();
    } catch (error) {
      console.error(error);
      cleanup();
      showToast('当前浏览器不支持直接打印，请用浏览器菜单打印。', 'error');
      return;
    }
    window.setTimeout(cleanup, 1200);
  }

  function importJSONFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('备份文件太大了（超过 5MB）。', 'error');
      input.value = '';
      return;
    }

    file.text().then(function (text) {
      let payload;
      try {
        payload = JSON.parse(text);
      } catch (error) {
        throw new Error('备份文件不是有效的 JSON。');
      }
      if (!payload || typeof payload !== 'object') throw new Error('备份文件格式不正确。');
      const raw = payload.data && typeof payload.data === 'object' ? payload.data : payload;
      if (!Array.isArray(raw.records) && !Array.isArray(raw.balances)) {
        throw new Error('备份里没有找到账单或结余数据。');
      }

      const preview = sanitizeState(raw);
      const message = '导入会覆盖当前账本，替换为 ' + preview.records.length + ' 条账单、' +
        preview.balances.length + ' 条结余。确定继续吗？';
      if (!window.confirm(message)) return;

      state.records = preview.records;
      state.balances = preview.balances;
      state.calc = preview.calc;
      state.title = preview.title;
      applyLedgerTitle();
      saveState();
      resetFilters();
      resetParseResults();
      window.clearTimeout(calcSaveTimer);
      calcSaveTimer = null;
      closeDialog($('settingsDialog'));
      refreshDataViews();
      navigate('home');
      showToast('备份已导入：' + state.records.length + ' 条账单。');
    }).catch(function (error) {
      console.error(error);
      showToast(error.message || '导入失败，请检查备份文件。', 'error');
    }).finally(function () {
      input.value = '';
    });
  }

  function clearAllData() {
    const message = '确定清空这台设备上的全部数据吗？\n\n' +
      '账单 ' + state.records.length + ' 条、结余 ' + state.balances.length + ' 条，以及算钱草稿都会被删除，且无法撤销。';
    if (!window.confirm(message)) return;
    if (state.records.length + state.balances.length > 0 &&
        !window.confirm('最后确认一次：删除后无法恢复。建议先导出备份，仍要清空吗？')) {
      return;
    }

    window.clearTimeout(calcSaveTimer);
    calcSaveTimer = null;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      /* 存储不可用时仍然重置当前会话。 */
    }

    state.version = VERSION;
    state.records = [];
    state.balances = [];
    state.calc = { date: todayISO(), rows: defaultCalcRows() };

    const pasteText = $('pasteText');
    if (pasteText) pasteText.value = '';
    resetParseResults();
    resetFilters();
    saveState();

    ['recordDialog', 'balanceDialog', 'settingsDialog', 'summaryDialog'].forEach(function (id) {
      const dialog = $(id);
      if (dialog && dialog.open) closeDialog(dialog);
    });

    refreshDataViews();
    navigate('home');
    showToast('本机数据已清空。');
  }

  /* =========================================================
   * 刷新与交互
   * ========================================================= */

  function refreshDataViews() {
    renderHome();
    renderRecords();
    renderBalance();
    renderSettingsStats();
  }

  function handleAction(action, button) {
    const id = button.getAttribute('data-id');
    switch (action) {
      case 'open-record':
        openRecordDialog(null);
        break;
      case 'open-balance':
        openBalanceDialog(null);
        break;
      case 'open-settings':
        openSettings();
        break;
      case 'save-title':
        saveLedgerTitle();
        break;
      case 'open-summary':
        openSummary();
        break;
      case 'summary-go-records':
        closeDialog($('summaryDialog'));
        navigate('records');
        break;
      case 'export-summary':
        exportSummaryCSV();
        break;
      case 'print-summary':
        printSummary();
        break;
      case 'go-paste':
        navigate('paste');
        window.setTimeout(function () { $('pasteText').focus(); }, 80);
        break;
      case 'paste-sample':
        if (parseRun && parseDirty && !window.confirm('填入示例会覆盖当前核对结果，继续吗？')) return;
        resetParseResults();
        $('pasteText').value = SAMPLE_TEXT;
        $('pasteText').focus();
        showToast('示例已填入，点「开始识别」看看效果。');
        break;
      case 'paste-clear':
        resetParseResults();
        $('pasteText').value = '';
        $('pasteText').focus();
        break;
      case 'discard-parsed':
        resetParseResults();
        showToast('已放弃这次识别，原始文字还留在上面。');
        break;
      case 'clear-filters':
        resetFilters();
        renderRecords();
        break;
      case 'edit-record': {
        const record = state.records.find(function (item) { return item.id === id; });
        if (record) openRecordDialog(record);
        break;
      }
      case 'delete-record':
        deleteRecord(id);
        break;
      case 'edit-balance': {
        const item = state.balances.find(function (balance) { return balance.id === id; });
        if (item) openBalanceDialog(item);
        break;
      }
      case 'delete-balance':
        deleteBalance(id);
        break;
      case 'calc-delete':
        deleteCalcRow(id);
        break;
      case 'parse-delete':
        removeParseItem(id);
        break;
      case 'export-json':
        exportJSON();
        break;
      case 'export-csv':
        exportCSV();
        break;
      case 'import-json':
        $('importFile').click();
        break;
      case 'clear-data':
        clearAllData();
        break;
      default:
        break;
    }
  }

  function handleDocumentClick(event) {
    const closeButton = event.target.closest('[data-close]');
    if (closeButton) {
      const dialog = $(closeButton.getAttribute('data-close'));
      if (dialog) closeDialog(dialog);
      return;
    }

    const navButton = event.target.closest('[data-nav]');
    if (navButton) {
      event.preventDefault();
      navigate(navButton.getAttribute('data-nav'));
      return;
    }

    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
      event.preventDefault();
      handleAction(actionButton.getAttribute('data-action'), actionButton);
    }
  }

  function installApp() {
    if (!deferredPrompt) return;
    const prompt = deferredPrompt;
    deferredPrompt = null;
    prompt.prompt();
    prompt.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') {
        showToast('正在安装菜篮子…');
      } else {
        showToast('已取消安装。');
      }
      updateInstallUI();
    }).catch(function () {
      updateInstallUI();
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol) || !window.isSecureContext) return;
    const register = function () {
      navigator.serviceWorker.register('sw.js').catch(function (error) {
        console.warn('Service Worker 注册失败：', error);
      });
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }

  function bindEvents() {
    document.addEventListener('click', handleDocumentClick);

    $('btnParse').addEventListener('click', runParse);
    $('btnImportParsed').addEventListener('click', importParsed);
    $('parseSelectAll').addEventListener('change', function () {
      const checked = $('parseSelectAll').checked;
      parseItems.forEach(function (item) { item.include = checked; });
      parseDirty = true;
      renderParse();
    });
    $('parseRows').addEventListener('input', handleParseInput);
    $('parseRows').addEventListener('change', handleParseChange);

    $('recordForm').addEventListener('submit', handleRecordSubmit);
    $('balanceForm').addEventListener('submit', handleBalanceSubmit);
    $('btnDeleteRecord').addEventListener('click', function () { deleteRecord($('recordId').value); });
    $('btnDeleteBalance').addEventListener('click', function () { deleteBalance($('balanceId').value); });
    $('recordQuantity').addEventListener('input', updateRecordAutoAmount);
    $('recordUnitPrice').addEventListener('input', updateRecordAutoAmount);
    $('recordAmount').addEventListener('input', function () { lastAutoAmount = null; });

    $('calcRows').addEventListener('input', handleCalcInput);
    $('calcDate').addEventListener('change', function () {
      state.calc.date = normalizeDateValue($('calcDate').value) || todayISO();
      scheduleCalcSave();
    });
    $('btnCalcAdd').addEventListener('click', addCalcRow);
    $('btnCalcClear').addEventListener('click', clearCalc);
    $('btnCalcImport').addEventListener('click', importCalc);

    $('recordSearch').addEventListener('input', renderRecords);
    $('filterMonth').addEventListener('change', renderRecords);
    $('filterCategory').addEventListener('change', renderRecords);
    $('btnClearFilters').addEventListener('click', function () {
      resetFilters();
      renderRecords();
    });

    $('importFile').addEventListener('change', importJSONFile);
    $('btnInstall').addEventListener('click', installApp);

    const titleInput = $('ledgerTitleInput');
    if (titleInput) {
      titleInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          saveLedgerTitle();
        }
      });
    }

    ['recordDialog', 'balanceDialog', 'settingsDialog', 'summaryDialog'].forEach(function (id) {
      const dialog = $(id);
      if (!dialog) return;
      dialog.addEventListener('close', syncModalState);
      dialog.addEventListener('cancel', syncModalState);
      dialog.addEventListener('click', function (event) {
        if (event.target === dialog) closeDialog(dialog);
      });
    });

    window.addEventListener('hashchange', function () {
      const route = getRouteFromHash();
      if (!/^#\/(home|records|paste|calc|balance)$/.test(window.location.hash)) {
        history.replaceState(null, '', '#/' + route);
      }
      showRoute(route);
    });

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredPrompt = event;
      updateInstallUI();
    });
    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      updateInstallUI();
      showToast('菜篮子已安装到桌面。');
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden && calcSaveTimer) {
        window.clearTimeout(calcSaveTimer);
        calcSaveTimer = null;
        saveState();
      }
    });
    window.addEventListener('beforeunload', function () {
      if (calcSaveTimer) {
        window.clearTimeout(calcSaveTimer);
        calcSaveTimer = null;
        saveState();
      }
    });
  }

  function init() {
    try {
      if (!/^#\/(home|records|paste|calc|balance)$/.test(window.location.hash)) {
        history.replaceState(null, '', '#/home');
      }
      initCategoryControls();
      updateTodayChip();
      bindEvents();
      refreshDataViews();
      showRoute(getRouteFromHash());
      updateInstallUI();
      registerServiceWorker();
      if (startupMessage) showToast(startupMessage, 'error');
    } catch (error) {
      console.error(error);
      showToast('页面初始化失败，请刷新重试。', 'error');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

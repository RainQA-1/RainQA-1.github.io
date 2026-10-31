/*
 * 菜篮子 · 粘贴文字识别器
 * 纯前端、无依赖，可同时在浏览器和 Node 中运行。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CanteenParser = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATEGORY_NAMES = ['蔬菜', '肉禽', '水产', '蛋奶', '豆制品', '粮油', '调味', '水果', '其他'];

  const CATEGORY_KEYWORDS = {
    蔬菜: [
      '大白菜', '小白菜', '白菜', '上海青', '娃娃菜', '油麦菜', '生菜', '菠菜', '芹菜', '西芹', '香菜',
      '韭菜', '茼蒿', '苋菜', '空心菜', '芥菜', '包菜', '卷心菜', '紫甘蓝', '西兰花', '花菜',
      '菜花', '黄花菜', '土豆', '马铃薯', '红薯', '紫薯', '山药', '芋头', '莲藕', '莴笋',
      '芦笋', '竹笋', '冬笋', '萝卜', '胡萝卜', '白萝卜', '青萝卜', '心里美', '黄瓜', '冬瓜',
      '南瓜', '丝瓜', '苦瓜', '茄子', '西红柿', '番茄', '青椒', '尖椒', '彩椒', '辣椒',
      '洋葱', '大葱', '小葱', '香葱', '蒜苗', '蒜薹', '蒜苔', '大蒜', '生姜', '豆角', '豇豆',
      '四季豆', '荷兰豆', '毛豆', '豌豆', '蚕豆', '扁豆', '玉米', '甜玉米', '蘑菇', '香菇',
      '金针菇', '杏鲍菇', '平菇', '口蘑', '木耳', '银耳', '竹荪', '鱼腥草', '折耳根', '荠菜',
      '马齿苋', '秋葵', '茭白', '菱角', '茨菇', '魔芋', '西葫芦', '瓠子', '佛手瓜', '菜心',
      '菜苔', '红菜苔', '豆芽', '黄豆芽', '绿豆芽', '鸡腿菇', '蟹味菇', '海鲜菇', '茶树菇'
    ],
    肉禽: [
      '五花肉', '梅花肉', '里脊肉', '里脊', '前腿肉', '后腿肉', '猪蹄', '猪肘', '猪肝', '猪腰',
      '猪肚', '大肠', '排骨', '肋排', '龙骨', '肉丝', '肉片', '肉末', '肉馅', '猪肉', '牛肉',
      '牛腩', '牛腱', '牛排', '牛百叶', '羊肉', '羊排', '羊腿', '鸡肉', '鸡胸肉', '鸡胸',
      '鸡腿', '鸡翅', '鸡爪', '鸡架', '鸡胗', '鸡肝', '鸭肉', '鸭腿', '鸭翅', '鸭脖', '鸭掌',
      '鹅肉', '培根', '火腿', '香肠', '腊肠', '腊肉', '午餐肉', '肉丸', '贡丸', '肉', '猪',
      '牛', '羊', '鸡', '鸭', '鹅'
    ],
    水产: [
      '草鱼', '鲤鱼', '鲫鱼', '鲈鱼', '鲢鱼', '带鱼', '黄花鱼', '黄鱼', '黑鱼', '鲳鱼', '鳕鱼',
      '三文鱼', '龙利鱼', '巴沙鱼', '鲅鱼', '秋刀鱼', '鱼头', '鱼尾', '鱼片', '鱼腩', '鱼',
      '虾仁', '基围虾', '明虾', '对虾', '河虾', '小龙虾', '皮皮虾', '虾', '螃蟹', '大闸蟹',
      '梭子蟹', '蟹', '花甲', '蛤蜊', '蛏子', '扇贝', '生蚝', '鲍鱼', '海参', '鱿鱼', '墨鱼',
      '章鱼', '海带', '紫菜', '裙带菜', '海蜇', '泥鳅', '黄鳝', '鳝鱼', '牛蛙', '田螺',
      '螺蛳', '鱼丸', '虾滑', '鱼豆腐'
    ],
    蛋奶: [
      '鸡蛋', '鸭蛋', '鹅蛋', '鹌鹑蛋', '皮蛋', '松花蛋', '咸鸭蛋', '蛋黄', '蛋白', '牛奶',
      '纯牛奶', '鲜牛奶', '酸奶', '奶酪', '芝士', '黄油', '淡奶油', '炼乳'
    ],
    豆制品: [
      '豆腐', '豆干', '豆腐干', '香干', '千张', '百叶', '豆腐皮', '油豆腐', '冻豆腐',
      '内酯豆腐', '腐竹', '素鸡', '豆泡', '豆浆', '豆花', '豆腐脑', '臭豆腐', '豆腐丝'
    ],
    粮油: [
      '大米', '小米', '糯米', '黑米', '糙米', '香米', '面粉', '面条', '挂面', '方便面',
      '拉面', '刀削面', '馒头', '花卷', '包子', '饺子', '馄饨', '汤圆', '年糕', '食用油',
      '花生油', '菜籽油', '玉米油', '调和油', '色拉油', '香油', '芝麻油', '橄榄油', '淀粉',
      '生粉', '粉丝', '粉条', '米粉', '河粉', '燕麦', '荞麦', '红豆', '绿豆', '黄豆', '黑豆',
      '薏米', '莲子', '吐司', '面包', '米', '面', '油'
    ],
    调味: [
      '酱油', '生抽', '老抽', '味极鲜', '陈醋', '香醋', '白醋', '醋', '料酒', '黄酒', '蚝油',
      '豆瓣酱', '甜面酱', '黄豆酱', '辣椒酱', '番茄酱', '沙拉酱', '芝麻酱', '花生酱', '花椒',
      '麻椒', '八角', '桂皮', '香叶', '孜然', '胡椒粉', '胡椒', '味精', '鸡精', '十三香',
      '五香粉', '辣椒粉', '孜然粉', '咖喱', '盐', '糖', '白糖', '红糖', '冰糖', '酱'
    ],
    水果: [
      '苹果', '香蕉', '雪梨', '香梨', '梨', '橘子', '桔子', '橙子', '柚子', '葡萄', '提子',
      '西瓜', '哈密瓜', '甜瓜', '香瓜', '水蜜桃', '油桃', '桃', '李子', '杏', '草莓', '蓝莓',
      '树莓', '芒果', '猕猴桃', '奇异果', '火龙果', '柠檬', '菠萝', '凤梨', '荔枝', '龙眼',
      '桂圆', '石榴', '柿子', '冬枣', '山楂', '枇杷', '杨梅', '樱桃', '车厘子', '椰子',
      '牛油果', '百香果', '木瓜', '无花果', '甘蔗', '荸荠', '马蹄'
    ],
    其他: []
  };

  const CATEGORY_PRIORITY = {
    豆制品: 1, 蛋奶: 2, 水产: 3, 肉禽: 4, 水果: 5, 蔬菜: 6, 调味: 7, 粮油: 8, 其他: 9
  };

  const UNITS = [
    '公斤', '千克', '市斤', '斤', '克', 'kg', 'g', '两', '袋', '包', '箱', '盒', '瓶', '桶',
    '把', '捆', '个', '只', '条', '根', '颗', '棵', '头', '份', '板', '筐', '件', '提', '扎',
    '串', '罐', '筒', '卷', '朵', '张', '升', '毫升', 'L', 'ml'
  ];

  const UNIT_PATTERN = '(?:公斤|千克|市斤|斤|克|kg|g|两|袋|包|箱|盒|瓶|桶|把|捆|个|只|条|根|颗|棵|头|份|板|筐|件|提|扎|串|罐|筒|卷|朵|张|升|毫升|L|ml)';
  const PRICE_UNIT_PATTERN = '(?:块|' + UNIT_PATTERN + ')';

  const DATE_LEAD = '(?:日期|时间)?\\s*[:：]?\\s*';
  const WEEKDAY = '(?:周|星期|礼拜)[一二三四五六日天]';

  const LEADING_DATE_RE = new RegExp(
    '^' + DATE_LEAD +
    '(?:[【\\[（(]\\s*)?' +
    '(?:(\\d{4})\\s*[年\\/.\\-]\\s*)?' +
    '(\\d{1,2})\\s*(?:月\\s*(\\d{1,2})\\s*[日号]?|[\\/.\\-]\\s*(\\d{1,2})(?!\\d))' +
    '\\s*(?:[】\\]）)])?' +
    '(?:\\s*' + WEEKDAY + ')?'
  );

  const ONLY_WEEKDAY_RE = new RegExp('^' + WEEKDAY + '\\s*$');
  const WEEKDAY_START_RE = new RegExp('^(' + WEEKDAY + ')\\s*[，,、：:\\-—]?\\s*');
  const RELATIVE_DATE_RE = /^(今天|今日|昨天|昨日|前天)(?:早上|上午|中午|下午|晚上|傍晚)?\s*[，,、：:\-—]?\s*/;
  const SUMMARY_RE = /^(?:合计|总计|共计|总支出|总花费|总金额|总费用|小计|今日合计|本月合计|总共|一共)\s*[:：]?\s*[¥￥]?\s*\d/;
  const TIME_RE = /^\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\s*/;

  const CN_DIGITS = {
    '零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
  };
  const CN_CHARS = '零〇一二两三四五六七八九十百千';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function localDateString(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function parseDateValue(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) {
      return null;
    }
    return d;
  }

  function makeDate(year, month, day, today) {
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
    let y = year;
    if (!y) {
      y = today.getFullYear();
    }
    const d = new Date(y, month - 1, day);
    if (d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    if (!year) {
      const diff = d.getTime() - today.getTime();
      if (diff > 45 * 24 * 60 * 60 * 1000) {
        d.setFullYear(d.getFullYear() - 1);
      }
    }
    return d;
  }

  function cnToNumber(text) {
    if (!text) return NaN;
    if (/^\d+$/.test(text)) return Number(text);
    let total = 0;
    let number = 0;
    for (const ch of text) {
      if (Object.prototype.hasOwnProperty.call(CN_DIGITS, ch)) {
        number = CN_DIGITS[ch];
      } else if (ch === '十') {
        if (number === 0) number = 1;
        total += number * 10;
        number = 0;
      } else if (ch === '百') {
        if (number === 0) number = 1;
        total += number * 100;
        number = 0;
      } else if (ch === '千') {
        if (number === 0) number = 1;
        total += number * 1000;
        number = 0;
      } else {
        return NaN;
      }
    }
    return total + number;
  }

  function normalizeUnit(unit) {
    if (!unit) return '';
    const u = String(unit).trim();
    if (/^(公斤|千克|kg)$/i.test(u)) return '公斤';
    if (/^(克|g)$/i.test(u)) return '克';
    if (/^(市斤|斤)$/.test(u)) return '斤';
    if (/^升$|^l$/i.test(u)) return '升';
    if (/^ml$/i.test(u)) return '毫升';
    return u;
  }

  function normalizeText(input) {
    let s = String(input == null ? '' : input);
    s = s.replace(/\r\n?/g, '\n').replace(/\u00a0|\u3000/g, ' ');
    s = s.replace(/[０-９]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    });
    s = s.replace(/[Ａ-Ｚａ-ｚ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    });
    s = s.replace(/[．｡]/g, '.').replace(/／/g, '/').replace(/￥/g, '¥');
    s = s.replace(/[−–—]/g, '-');

    // 3块5一斤 / 3块5 → 3.5元/斤、3.5元
    s = s.replace(/(\d+)\s*块\s*(\d)\s*(?:一\s*)?(斤|公斤|千克|克|两)/g, function (_, a, b, unit) {
      return a + '.' + b + '元/' + unit;
    });
    s = s.replace(/(\d+)\s*块\s*(\d)\s*(?=$|[\s，,；;。])/g, function (_, a, b) {
      return a + '.' + b + '元';
    });

    // 三块五一斤 / 三块五
    s = s.replace(/([一二两三四五六七八九十百]+)\s*块\s*([一二三四五六七八九])\s*(?:一\s*)?(斤|公斤|千克|克|两)/g, function (_, a, b, unit) {
      return cnToNumber(a) + '.' + CN_DIGITS[b] + '元/' + unit;
    });
    s = s.replace(/([一二两三四五六七八九十百]+)\s*块\s*([一二三四五六七八九])\s*(?=$|[\s，,；;。])/g, function (_, a, b) {
      return cnToNumber(a) + '.' + CN_DIGITS[b] + '元';
    });

    // 1斤半 / 半斤
    s = s.replace(/(\d+)\s*(斤|公斤|千克|两)\s*半/g, '$1.5$2');
    s = s.replace(/半\s*(斤|公斤|千克|两)/g, '0.5$1');

    // 中文数字：二十八斤 → 28斤；但保留“3元一斤”里的“一”
    s = s.replace(
      new RegExp('(?<![元块钱])[' + CN_CHARS + ']+(?=\\s*(?:元|块|钱|' + UNIT_PATTERN + '|月|日|号))', 'g'),
      function (m) {
        const n = cnToNumber(m);
        return Number.isFinite(n) ? String(n) : m;
      }
    );

    s = s.replace(/[ \t]+/g, ' ');
    return s;
  }

  function detectCategory(name) {
    const text = String(name || '');
    if (!text) return '其他';
    let best = null;
    Object.keys(CATEGORY_KEYWORDS).forEach(function (category) {
      CATEGORY_KEYWORDS[category].forEach(function (word) {
        if (!text.includes(word)) return;
        const candidate = {
          category: category,
          length: word.length,
          priority: CATEGORY_PRIORITY[category] || 99
        };
        if (
          !best ||
          candidate.length > best.length ||
          (candidate.length === best.length && candidate.priority < best.priority)
        ) {
          best = candidate;
        }
      });
    });
    return best ? best.category : '其他';
  }

  function round2(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function readNumber(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function stripBullet(line) {
    return line
      .replace(/^[\s\u200b]+/, '')
      .replace(/^(?:[-*•·●○▪◦]|[①-⑳])\s*/, '')
      .replace(/^(\d{1,2})\s*[、.)）](?!\d)\s*/, '')
      .trim();
  }

  function weekdayNumber(ch) {
    if (ch === '日' || ch === '天') return 0;
    return '一二三四五六'.indexOf(ch) + 1;
  }

  function dateForWeekday(ch, today) {
    const target = weekdayNumber(ch);
    if (target < 0) return today;
    const current = today.getDay();
    const diff = (current - target + 7) % 7;
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - diff);
    return d;
  }

  function extractLeadingDate(rawLine, today) {
    let line = rawLine;
    let relative = null;

    const rel = RELATIVE_DATE_RE.exec(line);
    if (rel) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (rel[1] === '昨天' || rel[1] === '昨日') d.setDate(d.getDate() - 1);
      if (rel[1] === '前天') d.setDate(d.getDate() - 2);
      relative = { date: d, rest: line.slice(rel[0].length) };
      line = line.slice(rel[0].length);
      return finalizeDate(relative.date, line, true);
    }

    const wdOnly = ONLY_WEEKDAY_RE.exec(line);
    if (wdOnly) {
      const ch = wdOnly[0].replace(/[周星期礼拜]/g, '').trim();
      return finalizeDate(dateForWeekday(ch, today), '', true);
    }

    const wdStart = WEEKDAY_START_RE.exec(line);
    if (wdStart) {
      const ch = wdStart[1].replace(/[周星期礼拜]/g, '').trim();
      return finalizeDate(dateForWeekday(ch, today), line.slice(wdStart[0].length), true);
    }

    const match = LEADING_DATE_RE.exec(line);
    if (!match) return null;

    const full = match[0];
    const rest = line.slice(full.length);
    const year = match[1] ? Number(match[1]) : null;
    const month = Number(match[2]);
    const day = Number(match[3] || match[4]);

    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;

    // 防止把“3.5元/斤”“1.5斤土豆”误认成日期
    if (!/月/.test(full)) {
      const restLooksLikePrice = new RegExp('^\\s*(?:元|块|钱|' + UNIT_PATTERN + ')', 'i');
      if (restLooksLikePrice.test(rest)) return null;
      if (/\d/.test(rest.slice(0, 2))) return null;
    }

    const date = makeDate(year, month, day, today);
    if (!date) return null;

    let cleaned = rest;
    const time = TIME_RE.exec(cleaned);
    if (time) cleaned = cleaned.slice(time[0].length);
    cleaned = cleaned.replace(/^[\s，,、:：\-—~～]+/, '');
    cleaned = cleaned.replace(/^[（(【\[]\s*[）)】\]]\s*/, '');

    return finalizeDate(date, cleaned, true);
  }

  function finalizeDate(date, rest, explicit) {
    let cleaned = rest == null ? '' : String(rest);
    cleaned = cleaned.replace(/^[\s，,、:：\-—~～]+/, '');
    cleaned = cleaned.replace(/^(?:买了|购买|采购|购入|采购了)\s*[:：]?\s*/, '');
    cleaned = cleaned.trim();
    return {
      date: localDateString(date),
      rest: cleaned,
      explicit: explicit !== false
    };
  }

  function isPriceOnlyFragment(fragment) {
    const f = fragment.trim();
    if (!f) return true;
    if (!/\d/.test(f)) return true;
    // 去掉价格、数量、单位、连接词后还有中文，才可能是独立菜品
    const stripped = f
      .replace(/[¥￥]/g, '')
      .replace(new RegExp('\\d+(?:\\.\\d+)?\\s*' + UNIT_PATTERN, 'gi'), '')
      .replace(/\d+(?:\.\d+)?/g, '')
      .replace(new RegExp(UNIT_PATTERN, 'gi'), '')
      .replace(/(?:单价|每|一|元|块|钱|\/|共|总价|总计|合计|共计|一共|花了|消费|付款|支付|实付|左右|约|大约|大概)/g, '')
      .replace(/[\s，,、:：;；。.\-—+]/g, '');
    return !/[\u4e00-\u9fa5A-Za-z]/.test(stripped);
  }

  function splitSegments(line) {
    const pieces = [];
    line.split(/[；;。]/).forEach(function (part) {
      const fragments = part.split(/[，,]/);
      if (fragments.length <= 1) {
        if (part.trim()) pieces.push(part.trim());
        return;
      }
      let current = '';
      fragments.forEach(function (fragment) {
        const f = fragment.trim();
        if (!f) return;
        if (!current) {
          current = f;
        } else if (isPriceOnlyFragment(f)) {
          current += '，' + f;
        } else {
          pieces.push(current);
          current = f;
        }
      });
      if (current) pieces.push(current);
    });
    return pieces;
  }

  // 很多微信记账习惯会把“10月8号，一筐鸡蛋，10月10号，两袋大米”写成一行。
  // 在日期前补一个换行，让后面的逐行逻辑仍然适用。
  function expandInlineDates(text) {
    const withChineseDate = /(?:(\d{4})\s*[年\/.\-]\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/g;
    const withIsoDate = /\d{4}\s*[\/.\-]\s*\d{1,2}\s*[\/.\-]\s*\d{1,2}(?!\d)/g;
    return String(text)
      .replace(withChineseDate, function (match, year, month, day, offset, whole) {
        if (offset === 0 || whole.charAt(offset - 1) === '\n') return match;
        return '\n' + match;
      })
      .replace(withIsoDate, function (match, offset, whole) {
        if (offset === 0 || whole.charAt(offset - 1) === '\n') return match;
        return '\n' + match;
      });
  }

  function removeMatch(work, match) {
    return {
      text: work.slice(0, match.index) + ' ' + work.slice(match.index + match[0].length),
      value: match
    };
  }

  function extractUnitPrice(work) {
    const patterns = [
      new RegExp('(?:单价|每\\s*(?:一\\s*)?' + PRICE_UNIT_PATTERN + ')\\s*[:：]?\\s*[¥￥]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:元|块|钱)?', 'i'),
      new RegExp('[¥￥]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:元|块|钱)?\\s*(?:\\/|每)\\s*(' + PRICE_UNIT_PATTERN + ')', 'i'),
      new RegExp('[¥￥]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:元|块|钱)?\\s*一\\s*(' + PRICE_UNIT_PATTERN + ')', 'i'),
      new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:元|块|钱)\\s*每\\s*(' + PRICE_UNIT_PATTERN + ')', 'i'),
      new RegExp('每\\s*(' + PRICE_UNIT_PATTERN + ')\\s*[¥￥]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:元|块|钱)?', 'i'),
      new RegExp('一\\s*(' + PRICE_UNIT_PATTERN + ')\\s*[¥￥]?\\s*(\\d+(?:\\.\\d+)?)\\s*(?:元|块|钱)?', 'i')
    ];

    for (let i = 0; i < patterns.length; i += 1) {
      const m = patterns[i].exec(work);
      if (!m) continue;
      let price;
      let unit = '';
      if (i === 0) {
        price = Number(m[1]);
      } else if (i === 4 || i === 5) {
        unit = normalizeUnit(m[1]);
        price = Number(m[2]);
      } else {
        price = Number(m[1]);
        unit = normalizeUnit(m[2]);
      }
      if (!Number.isFinite(price) || price < 0) continue;
      return {
        unitPrice: price,
        unit: unit,
        text: work.slice(0, m.index) + ' ' + work.slice(m.index + m[0].length)
      };
    }
    return null;
  }

  function extractTotal(work) {
    const patterns = [
      /(?:总价|总计|共计|合计|一共|共|花了|花|消费|实付|付款|支付|付了)\s*[:：]?\s*[¥￥]?\s*(\d+(?:\.\d+)?)\s*(?:元|块|钱)?/i,
      /[¥￥]\s*(\d+(?:\.\d+)?)(?!\s*(?:\/|每|一\s*(?:斤|公斤|千克|克|两)))\s*(?:元|块|钱)?/i,
      /(\d+(?:\.\d+)?)\s*(?:元|块|钱)(?!\s*(?:\/|每|一\s*(?:斤|公斤|千克|克|两)))/i
    ];
    for (const re of patterns) {
      const m = re.exec(work);
      if (!m) continue;
      const amount = Number(m[1]);
      if (!Number.isFinite(amount)) continue;
      return {
        amount: amount,
        explicit: true,
        text: work.slice(0, m.index) + ' ' + work.slice(m.index + m[0].length)
      };
    }
    return null;
  }

  function extractBlockQuantity(work) {
    // “豆腐 10块”里的“块”是数量，不是 10 元钱。只对按块卖的豆制品启用。
    if (!/(?:豆腐|豆干|香干|素鸡|豆泡|腐竹|豆花)/.test(work)) return null;
    const m = /(\d+(?:\.\d+)?)\s*块(?!\s*(?:钱|元))/.exec(work);
    if (!m) return null;
    return {
      quantity: Number(m[1]),
      unit: '块',
      text: work.slice(0, m.index) + ' ' + work.slice(m.index + m[0].length)
    };
  }

  function extractQuantity(work) {
    const qtyRe = new RegExp('(?:约|大约|大概)?\\s*(\\d+(?:\\.\\d+)?)\\s*(' + UNIT_PATTERN + ')', 'i');
    const m = qtyRe.exec(work);
    if (m) {
      return {
        quantity: Number(m[1]),
        unit: normalizeUnit(m[2]),
        text: work.slice(0, m.index) + ' ' + work.slice(m.index + m[0].length)
      };
    }
    const labeled = /(?:数量|用量|重量)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*([^\s，,；;。]*)/.exec(work);
    if (labeled) {
      return {
        quantity: Number(labeled[1]),
        unit: normalizeUnit(labeled[2] || ''),
        text: work.slice(0, labeled.index) + ' ' + work.slice(labeled.index + labeled[0].length)
      };
    }
    return null;
  }

  function extractBareNumbers(work) {
    const results = [];
    const re = /\d+(?:\.\d+)?/g;
    let m;
    while ((m = re.exec(work))) {
      results.push({
        value: Number(m[0]),
        start: m.index,
        end: m.index + m[0].length
      });
    }
    return results;
  }

  function removeSpan(text, start, end) {
    return text.slice(0, start) + ' ' + text.slice(end);
  }

  function cleanName(raw) {
    let name = raw;
    name = name.replace(/[¥￥]/g, ' ');
    name = name.replace(/^(?:备注|品名|菜品|菜名|名称)\s*[:：]\s*/, '');
    name = name.replace(/(?:买了|购买|采购|购入|称了|要了|拿了|来了|买|约|大约|大概)\s*/g, '');
    name = name.replace(/(?:今天|今日|昨天|昨日|前天|早上|上午|中午|下午|晚上|傍晚)\s*[:：]?\s*/g, '');
    name = name.replace(/(?:新鲜|现摘|本地|农家|刚摘的|刚买的)/g, ' ');
    name = name.replace(/(?:共计|合计|总计|一共|总价|共|花了|消费|付款|支付|实付|单价|数量|用量|重量|左右)/g, ' ');
    name = name.replace(/[（(][^）)]*[）)]/g, ' ');
    name = name.replace(/[：:，,、；;。\/\\|]/g, ' ');
    name = name.replace(/\b(?:元|块|钱)\b/g, ' ');
    name = name.replace(new RegExp('(?:' + UNIT_PATTERN + ')', 'gi'), ' ');
    name = name.replace(/\s+/g, ' ').trim();
    name = name.replace(/^[-—+*·.\s]+|[-—+*·.\s]+$/g, '');
    name = name.replace(/^[和与及]\s*/, '');
    name = name.replace(/\s*[和与及]$/, '');
    name = name.replace(/^\d+(?:\.\d+)?\s*/, '').replace(/\s*\d+(?:\.\d+)?$/, '');
    name = name.replace(/\s+/g, '').trim();
    return name.slice(0, 40);
  }

  function parseItem(rawSegment, date, options) {
    const opts = options || {};
    let work = String(rawSegment || '').trim();
    if (!work) return null;
    work = work.replace(/^[\s\-—*•·]+/, '').replace(/[。；;]+$/, '').trim();
    if (!work) return null;

    const warnings = [];
    const raw = rawSegment.trim();

    let unitPrice = null;
    let priceUnit = '';
    let priceExplicit = false;
    let amount = null;
    let amountExplicit = false;
    let amountGuessed = false;
    let quantity = null;
    let unit = '';
    let qtyGuessed = false;

    const priceResult = extractUnitPrice(work);
    if (priceResult) {
      unitPrice = round2(priceResult.unitPrice);
      priceUnit = priceResult.unit;
      priceExplicit = true;
      work = priceResult.text;
    }

    const blockResult = extractBlockQuantity(work);
    if (blockResult) {
      quantity = blockResult.quantity;
      unit = blockResult.unit;
      work = blockResult.text;
    }

    const totalResult = extractTotal(work);
    if (totalResult) {
      amount = round2(totalResult.amount);
      amountExplicit = true;
      work = totalResult.text;
    }

    const qtyResult = quantity == null ? extractQuantity(work) : null;
    if (qtyResult) {
      quantity = qtyResult.quantity;
      unit = qtyResult.unit || priceUnit;
      work = qtyResult.text;
    }

    let bare = extractBareNumbers(work);

    if (quantity == null && bare.length) {
      quantity = bare[0].value;
      qtyGuessed = true;
      work = removeSpan(work, bare[0].start, bare[0].end);
      bare = extractBareNumbers(work);
    }

    if (amount == null && quantity != null && bare.length) {
      const last = bare[bare.length - 1];
      amount = round2(last.value);
      amountExplicit = true;
      amountGuessed = true;
      work = removeSpan(work, last.start, last.end);
      bare = extractBareNumbers(work);
    }

    if (!unit && priceUnit) unit = priceUnit;

    if (amount == null && quantity != null && unitPrice != null) {
      amount = round2(quantity * unitPrice);
    }

    if (unitPrice == null && quantity != null && quantity > 0 && amount != null) {
      unitPrice = round2(amount / quantity);
    }

    let name = cleanName(work);

    if (!name && raw && !quantity && amount == null) {
      return null;
    }

    if (!name) {
      if (/运费|配送|停车|包装|搬运|加工/.test(raw)) {
        name = '杂项费用';
      } else {
        return null;
      }
    }

    const category = opts.category || detectCategory(name);

    if (unitPrice == null && amount == null) warnings.push('未识别到金额');
    if (amountGuessed) warnings.push('金额按文字中的数字识别，请核对');
    if (qtyGuessed) warnings.push('数量未带单位，请核对');
    if (!priceExplicit && amount != null && quantity != null) {
      // 由总价反推单价属于正常情况，不提示
    }

    return {
      date: date,
      name: name,
      category: category,
      quantity: quantity == null ? null : Number(quantity),
      unit: unit || '',
      unitPrice: unitPrice == null ? null : Number(unitPrice),
      amount: amount == null ? null : Number(amount),
      note: '',
      raw: raw,
      warnings: warnings
    };
  }

  function parseText(input, options) {
    const opts = options || {};
    const today = opts.today instanceof Date
      ? opts.today
      : (parseDateValue(opts.today) || new Date());
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const normalized = expandInlineDates(normalizeText(input));
    const lines = normalized.split('\n');
    const items = [];
    const warnings = [];
    const seenWarnings = new Set();
    let currentDate = localDateString(todayStart);
    let explicitDateSeen = false;
    let sawAnyDate = false;

    function addWarning(message, line) {
      const key = message + '|' + (line || '');
      if (seenWarnings.has(key)) return;
      seenWarnings.add(key);
      warnings.push({ message: message, line: line || '' });
    }

    lines.forEach(function (sourceLine) {
      const original = sourceLine;
      let line = stripBullet(sourceLine);
      if (!line) return;

      const dateInfo = extractLeadingDate(line, todayStart);
      if (dateInfo) {
        sawAnyDate = true;
        explicitDateSeen = true;
        currentDate = dateInfo.date;
        line = dateInfo.rest;
        if (!line) return;
      }

      line = line.replace(/^[\s，,、:：\-—~～]+/, '').trim();
      if (!line) return;
      if (SUMMARY_RE.test(line)) return;
      if (/^(?:合计|总计|共计|总支出|总花费|总金额|总费用|小计|今日合计|本月合计)/.test(line) && !/\d/.test(line.replace(/[^\d]/g, ''))) {
        return;
      }
      if (!/\d/.test(line)) return;

      const segments = splitSegments(line);
      let parsedAny = false;

      segments.forEach(function (segment) {
        const item = parseItem(segment, currentDate, opts);
        if (!item) return;
        parsedAny = true;
        items.push(item);
        if (item.warnings && item.warnings.length) {
          item.warnings.forEach(function (msg) {
            addWarning(msg, item.raw);
          });
        }
      });

      if (!parsedAny) {
        addWarning('这一行没能识别出菜品，可改用手动添加', original.trim());
      }
    });

    if (!sawAnyDate) {
      warnings.unshift({
        message: '没有识别到日期，已默认按今天（' + localDateString(todayStart) + '）记录',
        line: ''
      });
    }

    if (!items.length && normalized.trim()) {
      warnings.push({
        message: '没有识别到菜名和数量，试试一行写一个菜品，例如：土豆 20斤 3元/斤',
        line: ''
      });
    }

    return {
      items: items,
      warnings: warnings.slice(0, 16),
      hasExplicitDate: explicitDateSeen,
      totalLines: lines.length
    };
  }

  return {
    parseText: parseText,
    detectCategory: detectCategory,
    normalizeText: normalizeText,
    CATEGORY_NAMES: CATEGORY_NAMES,
    localDateString: localDateString
  };
});

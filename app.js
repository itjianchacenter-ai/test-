/* ===========================================================================
   อาหารเหนือป้าย่า — ระบบจัดการรายรับรายจ่าย
   Vanilla JS · เก็บข้อมูลในเครื่อง (localStorage) · ไม่มี dependency ภายนอก
   รองรับ โทรศัพท์ / iPad / คอมพิวเตอร์
   =========================================================================== */
(function () {
  'use strict';

  const APP_NAME = 'อาหารเหนือป้าย่า';
  const APP_SUB = 'รายรับ · รายจ่าย · กำไร';

  // ---- ค่าคงที่ภาษาไทย ----------------------------------------------------
  const TH_DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
  const TH_MONTH_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const TH_MONTH_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  const PALETTE = ['#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#06b6d4', '#eab308'];

  // ช่องทางการเงิน
  const METHODS = {
    income: ['เงินสด', 'เงินโอน', 'รับโอนอื่นๆ'],
    expense: ['เงินสด', 'เงินโอน'],
  };
  const METHOD_ICON = { 'เงินสด': '💵', 'เงินโอน': '🏦', 'รับโอนอื่นๆ': '📲' };

  const DEFAULT_CATS = {
    income: ['ขายหน้าร้าน', 'เดลิเวอรี', 'สั่งกลับบ้าน', 'จัดเลี้ยง/ออเดอร์', 'อื่นๆ'],
    expense: ['วัตถุดิบ', 'ค่าจ้างพนักงาน', 'ค่าเช่า', 'ค่าน้ำค่าไฟ', 'แก๊ส', 'อุปกรณ์/ของใช้', 'ค่าธรรมเนียมเดลิเวอรี', 'การตลาด', 'อื่นๆ'],
  };
  const CAT_ICON = {
    'ขายหน้าร้าน': '🍽️', 'เดลิเวอรี': '🛵', 'สั่งกลับบ้าน': '🥡', 'จัดเลี้ยง/ออเดอร์': '🎉',
    'วัตถุดิบ': '🥬', 'ค่าจ้างพนักงาน': '👩‍🍳', 'ค่าเช่า': '🏠', 'ค่าน้ำค่าไฟ': '💡',
    'แก๊ส': '🔥', 'อุปกรณ์/ของใช้': '🧰', 'ค่าธรรมเนียมเดลิเวอรี': '📦', 'การตลาด': '📣',
  };

  const NAV = [
    { view: 'dashboard', ico: '🏠', label: 'ภาพรวม' },
    { view: 'transactions', ico: '📒', label: 'รายการ' },
    { view: 'reports', ico: '📈', label: 'รายงาน' },
    { view: 'settings', ico: '⚙️', label: 'ตั้งค่า' },
  ];
  const TITLES = { dashboard: 'ภาพรวม', transactions: 'รายการ', reports: 'รายงาน', settings: 'ตั้งค่า' };

  const STORE_KEY = 'rest-finance:v1';

  // ---- State --------------------------------------------------------------
  let state = {
    view: 'dashboard',
    period: 'month',
    ui: { listType: 'all', listMonth: 'all', search: '' },
    data: { transactions: [], categories: JSON.parse(JSON.stringify(DEFAULT_CATS)) },
    form: null,
    _refocus: null,
  };
  let deferredPrompt = null;

  // ---- Utilities ----------------------------------------------------------
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (dt) => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  const todayISO = () => toISO(new Date());
  function isoDaysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return toISO(d); }
  function uid() {
    try { return crypto.randomUUID(); }
    catch (e) { return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'; }
  const beYear = (y) => y + 543;

  function fmtTHB(n) {
    const neg = n < 0;
    return (neg ? '-' : '') + '฿' + Math.abs(n).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }
  function fmtSigned(type, n) { return (type === 'income' ? '+' : '-') + fmtTHB(n); }
  function fmtShort(n) {
    const a = Math.abs(n);
    if (a >= 1e6) return '฿' + (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
    if (a >= 1e3) return '฿' + (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
    return '฿' + Math.round(n);
  }
  function iconFor(cat, type) { return CAT_ICON[cat] || (type === 'income' ? '💵' : '🧾'); }
  function colorForCat(cat) {
    const i = state.data.categories.expense.indexOf(cat);
    if (i >= 0) return PALETTE[i % PALETTE.length];
    let h = 0; for (const ch of cat) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  // ---- Persistence --------------------------------------------------------
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.data)); return true; }
    catch (e) { toast('บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลอาจเต็ม'); return false; }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.transactions)) {
        state.data.transactions = d.transactions.map((t) => ({
          ...t,
          method: t.method || (METHODS[t.type] ? METHODS[t.type][0] : 'เงินสด'),
        }));
      }
      if (d && d.categories && Array.isArray(d.categories.income) && Array.isArray(d.categories.expense)) {
        state.data.categories = d.categories;
      }
    } catch (e) { /* เริ่มจากค่าว่างถ้าข้อมูลเสีย */ }
  }

  // ---- Period / aggregation ----------------------------------------------
  function inPeriod(dateStr, period) {
    if (period === 'all') return true;
    if (period === 'today') return dateStr === todayISO();
    if (period === '7d') return dateStr >= isoDaysAgo(6);
    if (period === 'month') return dateStr.slice(0, 7) === todayISO().slice(0, 7);
    return true;
  }
  function periodLabel(period) {
    if (period === 'today') return 'วันนี้';
    if (period === '7d') return '7 วันล่าสุด';
    if (period === 'all') return 'ทั้งหมด';
    const now = new Date();
    return TH_MONTH_FULL[now.getMonth()] + ' ' + beYear(now.getFullYear());
  }
  function totals(txns) {
    let income = 0, expense = 0;
    for (const t of txns) { if (t.type === 'income') income += t.amount; else expense += t.amount; }
    return { income, expense, net: income - expense };
  }
  function methodStats(txns) {
    const m = {};
    ['เงินสด', 'เงินโอน', 'รับโอนอื่นๆ'].forEach((k) => { m[k] = { in: 0, out: 0 }; });
    for (const t of txns) {
      const k = m[t.method] ? t.method : 'เงินสด';
      if (t.type === 'income') m[k].in += t.amount; else m[k].out += t.amount;
    }
    return m;
  }
  function buildSeries(period, txns) {
    const arr = [];
    if (period === 'all') {
      const now = new Date();
      for (let k = 11; k >= 0; k--) {
        const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
        arr.push({ key: d.getFullYear() + '-' + pad(d.getMonth() + 1), label: TH_MONTH_SHORT[d.getMonth()], income: 0, expense: 0 });
      }
      const map = Object.fromEntries(arr.map((a) => [a.key, a]));
      for (const t of txns) { const k = t.date.slice(0, 7); if (map[k]) map[k][t.type] += t.amount; }
      return arr;
    }
    if (period === 'month') {
      const now = new Date();
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      for (let d = 1; d <= last; d++) {
        const dt = new Date(now.getFullYear(), now.getMonth(), d);
        arr.push({ key: toISO(dt), label: String(d), income: 0, expense: 0 });
      }
    } else {
      for (let k = 6; k >= 0; k--) {
        const d = new Date(); d.setDate(d.getDate() - k);
        arr.push({ key: toISO(d), label: TH_DOW[d.getDay()], income: 0, expense: 0 });
      }
    }
    const map = Object.fromEntries(arr.map((a) => [a.key, a]));
    for (const t of txns) { if (map[t.date]) map[t.date][t.type] += t.amount; }
    return arr;
  }
  function chartTitle(period) {
    if (period === 'month') return 'รายวัน — เดือนนี้';
    if (period === 'all') return 'รายเดือน — 12 เดือน';
    return '7 วันล่าสุด';
  }

  // ---- Charts (inline SVG) ------------------------------------------------
  function barChart(series) {
    const inC = cssVar('--income'), outC = cssVar('--expense'), grid = cssVar('--border'), muted = cssVar('--muted');
    const n = series.length;
    const groupW = n > 16 ? 22 : 40;
    const barW = groupW > 30 ? 13 : 7;
    const gap = 3, padL = 8, padR = 8, padT = 14, padB = 22, h = 184;
    const innerH = h - padT - padB;
    const w = Math.max(n * groupW + padL + padR, 280);
    let maxV = 1;
    for (const d of series) maxV = Math.max(maxV, d.income, d.expense);
    const y = (v) => padT + innerH - (v / maxV) * innerH;
    const baseY = padT + innerH;
    const labelEvery = Math.ceil(n / (groupW > 30 ? 12 : 16));
    let bars = '', labels = '';
    series.forEach((d, i) => {
      const gx = padL + i * groupW + (groupW - (barW * 2 + gap)) / 2;
      const ih = (d.income / maxV) * innerH, eh = (d.expense / maxV) * innerH;
      if (ih > 0) bars += `<rect x="${gx.toFixed(1)}" y="${y(d.income).toFixed(1)}" width="${barW}" height="${ih.toFixed(1)}" rx="3" fill="${inC}"/>`;
      if (eh > 0) bars += `<rect x="${(gx + barW + gap).toFixed(1)}" y="${y(d.expense).toFixed(1)}" width="${barW}" height="${eh.toFixed(1)}" rx="3" fill="${outC}"/>`;
      if (i % labelEvery === 0 || i === n - 1) {
        labels += `<text x="${(padL + i * groupW + groupW / 2).toFixed(1)}" y="${h - 6}" font-size="10" fill="${muted}" text-anchor="middle">${d.label}</text>`;
      }
    });
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">`
      + `<line x1="${padL}" y1="${baseY}" x2="${w - padR}" y2="${baseY}" stroke="${grid}"/>${bars}${labels}</svg>`;
  }
  function donutChart(items) {
    const size = 150, cx = size / 2, cy = size / 2, r = 54, sw = 24;
    const total = items.reduce((s, i) => s + i.value, 0);
    const C = 2 * Math.PI * r;
    let offset = 0, segs = '';
    for (const it of items) {
      const len = (it.value / (total || 1)) * C;
      segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${sw}"`
        + ` stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"`
        + ` transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += len;
    }
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`
      + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cssVar('--border')}" stroke-width="${sw}"/>${segs}`
      + `<text x="${cx}" y="${cy - 2}" font-size="11" fill="${cssVar('--muted')}" text-anchor="middle">รายจ่าย</text>`
      + `<text x="${cx}" y="${cy + 17}" font-size="15" font-weight="800" fill="${cssVar('--text')}" text-anchor="middle">${fmtShort(total)}</text></svg>`;
  }

  // ---- Transaction row ----------------------------------------------------
  function txRow(t) {
    const cls = t.type === 'income' ? 'value--in' : 'value--out';
    const icoCls = t.type === 'income' ? 'tx__icon--in' : 'tx__icon--out';
    return `<button class="tx" data-action="edit" data-id="${t.id}">`
      + `<div class="tx__icon ${icoCls}">${iconFor(t.category, t.type)}</div>`
      + `<div class="tx__body"><div class="tx__cat">${esc(t.category)}</div>`
      + `<div class="tx__meta"><span class="tx__tag">${METHOD_ICON[t.method] || ''} ${esc(t.method || 'เงินสด')}</span>`
      + (t.receipt ? `<span class="tx__tag">📎</span>` : '')
      + (t.note ? `<span class="tx__note">${esc(t.note)}</span>` : '')
      + `</div></div><div class="tx__amt ${cls}">${fmtSigned(t.type, t.amount)}</div></button>`;
  }
  function sortTx(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  }
  function dayHeader(iso) {
    if (iso === todayISO()) return 'วันนี้';
    if (iso === isoDaysAgo(1)) return 'เมื่อวาน';
    const d = new Date(iso + 'T00:00:00');
    return `${TH_DOW[d.getDay()]}. ${d.getDate()} ${TH_MONTH_SHORT[d.getMonth()]} ${beYear(d.getFullYear())}`;
  }

  // ---- Shell --------------------------------------------------------------
  function navItem(n, cls) {
    return `<button class="${cls} ${state.view === n.view ? 'active' : ''}" data-action="nav" data-view="${n.view}"><span class="ico">${n.ico}</span>${n.label}</button>`;
  }
  function renderSidebar() {
    return `<aside class="sidebar">`
      + `<div class="brand"><img class="brand__logo" src="icon.svg" alt="" /><div><div class="brand__name">${APP_NAME}</div><div class="brand__sub">${APP_SUB}</div></div></div>`
      + `<button class="side-add" data-action="new"><span>＋</span> เพิ่มรายการ</button>`
      + NAV.map((n) => navItem(n, 'snav')).join('')
      + `<div class="sidebar__foot">ข้อมูลเก็บอยู่ในเครื่องนี้<br/>อย่าลืม “สำรองข้อมูล” เป็นประจำ</div></aside>`;
  }
  function renderTopbar() {
    return `<header class="topbar">`
      + `<div class="topbar__brand"><img class="brand__logo" src="icon.svg" alt="" /><div><div class="brand__name">${APP_NAME}</div><div class="brand__sub">${APP_SUB}</div></div></div>`
      + `<div class="topbar__title">${TITLES[state.view] || ''}</div></header>`;
  }
  function renderBottomNav() {
    return `<nav class="bottomnav">`
      + navItem(NAV[0], 'bnav') + navItem(NAV[1], 'bnav')
      + `<button class="bnav--fab" data-action="new" aria-label="เพิ่มรายการ">+</button>`
      + navItem(NAV[2], 'bnav') + navItem(NAV[3], 'bnav') + `</nav>`;
  }

  // ---- Dashboard ----------------------------------------------------------
  function segmented() {
    const opts = [['today', 'วันนี้'], ['7d', '7 วัน'], ['month', 'เดือนนี้'], ['all', 'ทั้งหมด']];
    return `<div class="segmented">` + opts.map(([k, l]) =>
      `<button class="${state.period === k ? 'active' : ''}" data-action="period" data-period="${k}">${l}</button>`).join('') + `</div>`;
  }
  function methodCard(name, obj, incomeOnly) {
    const net = obj.in - obj.out;
    const sub = incomeOnly ? 'รับโอนเข้า' : `รับ +${fmtTHB(obj.in)} · จ่าย −${fmtTHB(obj.out)}`;
    const val = incomeOnly ? obj.in : net;
    return `<div class="mcard"><div class="mcard__head"><span class="mcard__ico">${METHOD_ICON[name]}</span> ${name}</div>`
      + `<div class="mcard__net ${val >= 0 ? 'value--in' : 'value--out'}">${fmtTHB(val)}</div>`
      + `<div class="mcard__sub">${sub}</div></div>`;
  }
  function renderDashboard() {
    const txns = state.data.transactions;
    if (txns.length === 0) {
      return `<div class="view dash">${segmented()}`
        + `<div class="empty"><div class="empty__emoji">🍜</div>`
        + `<div class="empty__title">ยังไม่มีรายการ</div>`
        + `<div class="empty__text">เริ่มบันทึกรายรับ-รายจ่ายของร้านได้เลย</div>`
        + `<div class="btn-row" style="max-width:320px;margin:22px auto 0"><button class="btn btn--primary" data-action="new">+ เพิ่มรายการแรก</button></div>`
        + `<button class="chip" style="margin-top:14px" data-action="seed">ลองใส่ข้อมูลตัวอย่าง</button></div></div>`;
    }
    const pt = txns.filter((t) => inPeriod(t.date, state.period));
    const tt = totals(pt);
    const ms = methodStats(pt);

    const series = buildSeries(state.period, txns);
    const hasSeries = series.some((d) => d.income > 0 || d.expense > 0);
    const barCard = hasSeries ? `<div class="card chart-card">`
      + `<div class="section-title" style="margin:0 0 12px">${chartTitle(state.period)}`
      + `<span class="muted"><span class="dot dot--in"></span> รับ &nbsp;<span class="dot dot--out"></span> จ่าย</span></div>`
      + `<div class="chart-scroll">${barChart(series)}</div></div>` : '';

    const byCat = {};
    for (const t of pt) if (t.type === 'expense') byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    let items = Object.keys(byCat).map((k) => ({ label: k, value: byCat[k], color: colorForCat(k) })).sort((a, b) => b.value - a.value);
    if (items.length > 8) {
      const rest = items.slice(7).reduce((s, i) => s + i.value, 0);
      items = items.slice(0, 7).concat([{ label: 'หมวดอื่น', value: rest, color: '#9ca3af' }]);
    }
    const expTotal = items.reduce((s, i) => s + i.value, 0);
    const donutCard = expTotal > 0 ? `<div class="card chart-card">`
      + `<div class="section-title" style="margin:0 0 12px">สัดส่วนรายจ่าย</div>`
      + `<div class="donut-wrap"><div class="donut-center">${donutChart(items)}</div>`
      + `<div class="legend" style="flex:1;min-width:150px">`
      + items.map((i) => `<div class="legend__item"><span class="legend__sw" style="background:${i.color}"></span>`
        + `<span class="legend__name">${esc(i.label)}</span><span class="legend__val">${fmtTHB(i.value)}</span>`
        + `<span class="legend__pct">${Math.round((i.value / expTotal) * 100)}%</span></div>`).join('')
      + `</div></div></div>` : '';

    let methodCards = methodCard('เงินสด', ms['เงินสด'], false) + methodCard('เงินโอน', ms['เงินโอน'], false);
    if (ms['รับโอนอื่นๆ'].in > 0) methodCards += methodCard('รับโอนอื่นๆ', ms['รับโอนอื่นๆ'], true);

    const recent = txns.slice().sort(sortTx).slice(0, 6);

    return `<div class="view dash">${segmented()}`
      + `<div class="hero"><div class="hero__label">กำไรสุทธิ · ${esc(periodLabel(state.period))}</div>`
      + `<div class="hero__value">${fmtTHB(tt.net)}</div>`
      + `<div class="hero__hint">${tt.net >= 0 ? 'ร้านมีกำไรในช่วงนี้ 🎉' : 'ช่วงนี้รายจ่ายมากกว่ารายรับ'}</div></div>`
      + `<div class="kpi-grid">`
      + `<div class="stat"><div class="stat__label"><span class="dot dot--in"></span> รายรับ</div><div class="stat__value value--in">${fmtTHB(tt.income)}</div></div>`
      + `<div class="stat"><div class="stat__label"><span class="dot dot--out"></span> รายจ่าย</div><div class="stat__value value--out">${fmtTHB(tt.expense)}</div></div></div>`
      + `<div class="section-title">ช่องทางการเงิน <span class="muted">${esc(periodLabel(state.period))}</span></div>`
      + `<div class="method-row">${methodCards}</div>`
      + `<div class="chart-row">${barCard}${donutCard}</div>`
      + `<div class="section-title">รายการล่าสุด <button class="chip" data-action="nav" data-view="transactions">ดูทั้งหมด</button></div>`
      + `<div class="tx-list">${recent.map(txRow).join('')}</div></div>`;
  }

  // ---- Transactions -------------------------------------------------------
  function renderTransactions() {
    const all = state.data.transactions;
    const monthsSet = Array.from(new Set(all.map((t) => t.date.slice(0, 7)))).sort().reverse();
    const monthOpts = ['<option value="all">ทุกเดือน</option>'].concat(monthsSet.map((m) => {
      const [y, mo] = m.split('-');
      return `<option value="${m}" ${state.ui.listMonth === m ? 'selected' : ''}>${TH_MONTH_SHORT[+mo - 1]} ${beYear(+y)}</option>`;
    })).join('');

    const q = state.ui.search.trim().toLowerCase();
    const list = all.filter((t) => {
      if (state.ui.listType !== 'all' && t.type !== state.ui.listType) return false;
      if (state.ui.listMonth !== 'all' && t.date.slice(0, 7) !== state.ui.listMonth) return false;
      if (q && !((t.note || '').toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || (t.method || '').toLowerCase().includes(q))) return false;
      return true;
    }).sort(sortTx);

    const typeChips = [['all', 'ทั้งหมด'], ['income', 'รายรับ'], ['expense', 'รายจ่าย']]
      .map(([k, l]) => `<button class="chip ${state.ui.listType === k ? 'active' : ''}" data-action="list-type" data-type="${k}">${l}</button>`).join('');

    let body;
    if (all.length === 0) {
      body = `<div class="empty"><div class="empty__emoji">📒</div><div class="empty__title">ยังไม่มีรายการ</div><div class="empty__text">กดปุ่ม + เพื่อเพิ่มรายการแรก</div></div>`;
    } else if (list.length === 0) {
      body = `<div class="empty"><div class="empty__emoji">🔍</div><div class="empty__title">ไม่พบรายการ</div><div class="empty__text">ลองเปลี่ยนตัวกรองหรือคำค้นหา</div></div>`;
    } else {
      const groups = {};
      for (const t of list) (groups[t.date] = groups[t.date] || []).push(t);
      body = Object.keys(groups).sort().reverse().map((iso) => {
        const tx = groups[iso];
        const net = tx.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
        return `<div class="day-head"><span>${dayHeader(iso)}</span>`
          + `<span class="day-head__sum ${net >= 0 ? 'value--in' : 'value--out'}">${net >= 0 ? '+' : ''}${fmtTHB(net)}</span></div>`
          + `<div class="tx-list">${tx.map(txRow).join('')}</div>`;
      }).join('');
    }

    return `<div class="view narrow">`
      + `<div class="field" style="margin:8px 0 2px"><input class="search-input" id="search-input" data-input="search" placeholder="ค้นหา หมวดหมู่ / ช่องทาง / รายละเอียด…" value="${esc(state.ui.search)}" /></div>`
      + `<div class="filters"><div style="display:flex;gap:8px;flex:1;flex-wrap:wrap">${typeChips}</div>`
      + `<select class="chip" id="list-month">${monthOpts}</select></div>${body}</div>`;
  }

  // ---- Reports ------------------------------------------------------------
  function renderReports() {
    const all = state.data.transactions;
    if (all.length === 0) {
      return `<div class="view narrow"><div class="empty"><div class="empty__emoji">📈</div><div class="empty__title">ยังไม่มีข้อมูลรายงาน</div><div class="empty__text">เพิ่มรายการก่อน แล้วกลับมาดูสรุปรายเดือนได้ที่นี่</div></div></div>`;
    }
    const now = new Date();
    const rows = [];
    for (let k = 0; k < 6; k++) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const key = d.getFullYear() + '-' + pad(d.getMonth() + 1);
      const m = all.filter((t) => t.date.slice(0, 7) === key);
      const tt = totals(m); const ms = methodStats(m);
      rows.push({ label: TH_MONTH_FULL[d.getMonth()] + ' ' + beYear(d.getFullYear()), tt, ms });
    }
    return `<div class="view narrow"><div class="section-title">สรุปรายเดือน (6 เดือนล่าสุด)</div>`
      + `<div class="reports-grid">` + rows.map((r) => `<div class="month-card">`
        + `<div style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:800">${r.label}</div>`
        + `<div style="font-weight:800" class="${r.tt.net >= 0 ? 'value--in' : 'value--out'}">${fmtTHB(r.tt.net)}</div></div>`
        + `<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:.84rem;color:var(--muted)">`
        + `<span><span class="dot dot--in"></span> รับ ${fmtTHB(r.tt.income)}</span><span><span class="dot dot--out"></span> จ่าย ${fmtTHB(r.tt.expense)}</span></div>`
        + `<div style="display:flex;justify-content:space-between;margin-top:6px;font-size:.8rem;color:var(--muted);border-top:1px solid var(--border);padding-top:8px">`
        + `<span>💵 สด ${fmtTHB(r.ms['เงินสด'].in - r.ms['เงินสด'].out)}</span><span>🏦 โอน ${fmtTHB(r.ms['เงินโอน'].in - r.ms['เงินโอน'].out)}</span></div>`
        + `</div>`).join('') + `</div></div>`;
  }

  // ---- Settings -----------------------------------------------------------
  function renderSettings() {
    const cats = state.data.categories;
    const catBlock = (type, title) => `<div class="section-title">${title}</div><div class="card">`
      + cats[type].map((c) => `<span class="cat-pill">${esc(c)}<button data-action="del-cat" data-type="${type}" data-cat="${esc(c)}" title="ลบ">×</button></span>`).join('')
      + `<div class="add-cat"><input id="addcat-${type}" placeholder="เพิ่มหมวด${type === 'income' ? 'รายรับ' : 'รายจ่าย'}…" />`
      + `<button class="chip active" data-action="add-cat" data-type="${type}">เพิ่ม</button></div></div>`;

    const installRow = deferredPrompt ? `<button class="list-row" data-action="install"><span class="list-row__ico">📲</span><span class="list-row__txt">ติดตั้งลงเครื่อง<div class="list-row__sub">ใช้เหมือนแอปจริง เปิดจากหน้าจอหลัก</div></span><span class="list-row__chev">›</span></button>` : '';
    const count = state.data.transactions.length;

    return `<div class="view narrow"><div class="section-title">ข้อมูลและการสำรอง</div><div class="card list-card">`
      + installRow
      + `<button class="list-row" data-action="export-json"><span class="list-row__ico">💾</span><span class="list-row__txt">สำรองข้อมูล (.json)<div class="list-row__sub">ดาวน์โหลดไฟล์สำรองทั้งหมด</div></span><span class="list-row__chev">›</span></button>`
      + `<button class="list-row" data-action="import-json"><span class="list-row__ico">📥</span><span class="list-row__txt">นำเข้าข้อมูล<div class="list-row__sub">กู้คืนจากไฟล์สำรอง</div></span><span class="list-row__chev">›</span></button>`
      + `<button class="list-row" data-action="export-csv"><span class="list-row__ico">📊</span><span class="list-row__txt">ส่งออก Excel / CSV<div class="list-row__sub">เปิดด้วย Excel หรือ Google Sheets</div></span><span class="list-row__chev">›</span></button></div>`
      + catBlock('income', 'หมวดรายรับ') + catBlock('expense', 'หมวดรายจ่าย')
      + `<div class="section-title">อื่นๆ</div><div class="card list-card">`
      + `<button class="list-row list-row--danger" data-action="clear-all"><span class="list-row__ico">🗑️</span><span class="list-row__txt">ล้างข้อมูลทั้งหมด<div class="list-row__sub" style="color:var(--muted)">มี ${count} รายการในเครื่องนี้</div></span></button></div>`
      + `<input type="file" id="import-file" accept="application/json,.json" hidden />`
      + `<div class="empty__text" style="text-align:center;margin:20px 4px">ข้อมูลทั้งหมดเก็บอยู่ในเครื่องนี้เท่านั้น<br/>แนะนำให้กด “สำรองข้อมูล” เป็นประจำ</div></div>`;
  }

  // ---- Form sheet ---------------------------------------------------------
  function renderForm() {
    if (!state.form) return '';
    const f = state.form;
    const methodGrid = METHODS[f.type].map((m) => `<button type="button" class="cat-opt ${f.method === m ? 'active' : ''}" data-action="form-method" data-method="${esc(m)}">${METHOD_ICON[m]} ${esc(m)}</button>`).join('');
    const catGrid = state.data.categories[f.type].map((c) => `<button type="button" class="cat-opt ${f.category === c ? 'active' : ''}" data-action="form-cat" data-cat="${esc(c)}">${iconFor(c, f.type)} ${esc(c)}</button>`).join('');
    return `<div class="overlay"><div class="sheet"><div class="sheet__grip"></div>`
      + `<div class="sheet__title">${f.id ? 'แก้ไขรายการ' : 'เพิ่มรายการ'}</div>`
      + `<div class="type-toggle">`
      + `<button class="${f.type === 'income' ? 'active--in' : ''}" data-action="form-type" data-type="income">＋ รายรับ</button>`
      + `<button class="${f.type === 'expense' ? 'active--out' : ''}" data-action="form-type" data-type="expense">－ รายจ่าย</button></div>`
      + `<div class="field"><label>จำนวนเงิน</label><div class="amount-wrap"><input class="amount-input" data-input="amount" type="text" inputmode="decimal" placeholder="0" value="${f.amount || ''}" /></div></div>`
      + `<div class="field"><label>ช่องทาง</label><div class="cat-grid">${methodGrid}</div></div>`
      + `<div class="field"><label>หมวดหมู่</label><div class="cat-grid">${catGrid}</div></div>`
      + `<div class="field"><label>วันที่</label><input type="date" data-input="date" value="${f.date}" max="${todayISO()}" /></div>`
      + `<div class="field"><label>รายละเอียด (ไม่บังคับ)</label><input type="text" data-input="note" placeholder="เช่น ตลาดเช้า, รอบบ่าย…" value="${esc(f.note || '')}" /></div>`
      + `<div class="field"><label>ใบเสร็จ (ไม่บังคับ)</label>`
      + `<button type="button" class="receipt-btn" data-action="pick-receipt">📷 ถ่าย / แนบรูปใบเสร็จ</button>`
      + `<input type="file" id="receipt-input" accept="image/*" capture="environment" hidden />`
      + (f.receipt ? `<div class="receipt-thumb"><img src="${f.receipt}" alt="ใบเสร็จ"/><button type="button" data-action="rm-receipt" aria-label="ลบรูป">×</button></div>` : '')
      + `</div>`
      + `<div class="btn-row">`
      + (f.id ? `<button class="btn btn--danger-ghost" data-action="delete" aria-label="ลบ">🗑️</button>` : '')
      + `<button class="btn btn--ghost" data-action="close">ยกเลิก</button>`
      + `<button class="btn btn--primary" data-action="save">บันทึก</button></div></div></div>`;
  }
  function openForm(tx) {
    if (tx) {
      state.form = { id: tx.id, type: tx.type, amount: String(tx.amount), method: tx.method || METHODS[tx.type][0], category: tx.category, date: tx.date, note: tx.note || '', receipt: tx.receipt || null };
    } else {
      state.form = { id: null, type: 'expense', amount: '', method: METHODS.expense[0], category: '', date: todayISO(), note: '', receipt: null };
    }
    render();
  }
  function closeForm() { state.form = null; render(); }
  function saveForm() {
    const f = state.form;
    const amount = parseFloat(String(f.amount).replace(/[, ]/g, ''));
    if (!amount || amount <= 0) { toast('กรอกจำนวนเงินให้ถูกต้อง'); return; }
    if (!f.category) { toast('เลือกหมวดหมู่ก่อน'); return; }
    if (!f.method) f.method = METHODS[f.type][0];
    if (f.id) {
      const t = state.data.transactions.find((x) => x.id === f.id);
      if (t) { Object.assign(t, { type: f.type, amount, method: f.method, category: f.category, date: f.date, note: f.note.trim(), receipt: f.receipt || null }); }
    } else {
      state.data.transactions.push({ id: uid(), type: f.type, amount, method: f.method, category: f.category, date: f.date, note: f.note.trim(), receipt: f.receipt || null, createdAt: Date.now() });
    }
    if (!save()) return;
    state.form = null; render(); toast('บันทึกแล้ว ✓');
  }
  function deleteForm() {
    if (!state.form || !state.form.id) return;
    if (!confirm('ลบรายการนี้?')) return;
    state.data.transactions = state.data.transactions.filter((x) => x.id !== state.form.id);
    save(); state.form = null; render(); toast('ลบแล้ว');
  }

  // ---- Receipt image (compress before storing) ---------------------------
  function readReceipt(file) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function () {
      const max = 1024; let w = img.width, h = img.height;
      if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
      else if (h > max) { w = Math.round(w * max / h); h = max; }
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      try { state.form.receipt = c.toDataURL('image/jpeg', 0.55); } catch (e) { state.form.receipt = null; }
      render();
    };
    img.onerror = function () { URL.revokeObjectURL(url); toast('อ่านรูปไม่สำเร็จ'); };
    img.src = url;
  }

  // ---- Import / export ----------------------------------------------------
  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
  }
  function exportJSON() {
    download('อาหารเหนือป้าย่า-สำรองข้อมูล-' + todayISO() + '.json', JSON.stringify({ app: 'rest-finance', version: 1, exportedAt: new Date().toISOString(), data: state.data }, null, 2), 'application/json');
    toast('ดาวน์โหลดไฟล์สำรองแล้ว');
  }
  function exportCSV() {
    const rows = [['วันที่', 'ประเภท', 'ช่องทาง', 'หมวดหมู่', 'รายละเอียด', 'จำนวนเงิน']];
    for (const t of state.data.transactions.slice().sort(sortTx)) {
      rows.push([t.date, t.type === 'income' ? 'รายรับ' : 'รายจ่าย', t.method || '', t.category, t.note || '', String(t.amount)]);
    }
    const csv = '﻿' + rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
    download('อาหารเหนือป้าย่า-รายการ-' + todayISO() + '.csv', csv, 'text/csv;charset=utf-8');
    toast('ส่งออก CSV แล้ว');
  }
  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        const data = d.data || d;
        if (!data || !Array.isArray(data.transactions)) throw new Error('bad');
        if (!confirm('นำเข้าข้อมูลนี้จะแทนที่ข้อมูลปัจจุบันทั้งหมด ดำเนินการต่อ?')) return;
        state.data.transactions = data.transactions.map((t) => ({ ...t, method: t.method || (METHODS[t.type] ? METHODS[t.type][0] : 'เงินสด') }));
        if (data.categories && data.categories.income && data.categories.expense) state.data.categories = data.categories;
        save(); render(); toast('นำเข้าข้อมูลสำเร็จ ✓');
      } catch (e) { toast('ไฟล์ไม่ถูกต้อง'); }
    };
    reader.readAsText(file);
  }

  // ---- Sample data --------------------------------------------------------
  function seedSample() {
    const mk = (d, type, category, amount, note, method) => ({ id: uid(), type, category, amount, note, method, date: isoDaysAgo(d), createdAt: Date.now() - d * 86400000 });
    state.data.transactions = [
      mk(0, 'income', 'ขายหน้าร้าน', 4200, 'ยอดขายหน้าร้าน', 'เงินสด'),
      mk(0, 'income', 'เดลิเวอรี', 1850, 'Grab / LineMan', 'รับโอนอื่นๆ'),
      mk(0, 'expense', 'วัตถุดิบ', 2300, 'ตลาดเช้า', 'เงินสด'),
      mk(1, 'income', 'ขายหน้าร้าน', 3800, '', 'เงินสด'),
      mk(1, 'income', 'ขายหน้าร้าน', 1500, 'ลูกค้าโอน', 'เงินโอน'),
      mk(1, 'expense', 'ค่าจ้างพนักงาน', 1200, 'รายวัน 2 คน', 'เงินสด'),
      mk(2, 'income', 'ขายหน้าร้าน', 5100, 'วันหยุด', 'เงินสด'),
      mk(2, 'income', 'สั่งกลับบ้าน', 900, '', 'เงินโอน'),
      mk(2, 'expense', 'วัตถุดิบ', 2600, '', 'เงินโอน'),
      mk(3, 'income', 'ขายหน้าร้าน', 3400, '', 'เงินสด'),
      mk(3, 'expense', 'ค่าน้ำค่าไฟ', 1500, 'บิลเดือนนี้', 'เงินโอน'),
      mk(4, 'income', 'เดลิเวอรี', 2200, '', 'รับโอนอื่นๆ'),
      mk(5, 'income', 'ขายหน้าร้าน', 4600, '', 'เงินสด'),
      mk(5, 'expense', 'แก๊ส', 430, 'ถังแก๊ส', 'เงินสด'),
      mk(6, 'expense', 'ค่าเช่า', 8000, 'ค่าเช่าที่', 'เงินโอน'),
      mk(7, 'income', 'ขายหน้าร้าน', 3900, '', 'เงินสด'),
    ];
    save(); render(); toast('ใส่ข้อมูลตัวอย่างแล้ว');
  }

  // ---- Toast --------------------------------------------------------------
  let toastTimer = null;
  function toast(msg) {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 1900);
  }

  // ---- Render router ------------------------------------------------------
  function render() {
    const app = document.getElementById('app');
    let view = '';
    if (state.view === 'dashboard') view = renderDashboard();
    else if (state.view === 'transactions') view = renderTransactions();
    else if (state.view === 'reports') view = renderReports();
    else if (state.view === 'settings') view = renderSettings();
    app.innerHTML = `<div class="layout">${renderSidebar()}<main class="main">${renderTopbar()}<div class="content">${view}</div></main></div>${renderBottomNav()}${renderForm()}`;
    if (state._refocus) {
      const el = document.getElementById(state._refocus);
      if (el) { el.focus(); try { const v = el.value; el.value = ''; el.value = v; } catch (e) {} }
      state._refocus = null;
    }
  }

  // ---- Events -------------------------------------------------------------
  function onClick(e) {
    const ov = e.target;
    if (ov.classList && ov.classList.contains('overlay')) { closeForm(); return; }
    const el = ov.closest && ov.closest('[data-action]');
    if (!el) return;
    const a = el.dataset.action;
    switch (a) {
      case 'nav': state.view = el.dataset.view; state.form = null; window.scrollTo(0, 0); render(); break;
      case 'period': state.period = el.dataset.period; render(); break;
      case 'list-type': state.ui.listType = el.dataset.type; render(); break;
      case 'new': openForm(null); break;
      case 'edit': { const t = state.data.transactions.find((x) => x.id === el.dataset.id); if (t) openForm(t); break; }
      case 'form-type': {
        state.form.type = el.dataset.type;
        if (!METHODS[state.form.type].includes(state.form.method)) state.form.method = METHODS[state.form.type][0];
        if (!state.data.categories[state.form.type].includes(state.form.category)) state.form.category = '';
        render(); break;
      }
      case 'form-method': state.form.method = el.dataset.method; render(); break;
      case 'form-cat': state.form.category = el.dataset.cat; render(); break;
      case 'pick-receipt': document.getElementById('receipt-input').click(); break;
      case 'rm-receipt': state.form.receipt = null; render(); break;
      case 'save': saveForm(); break;
      case 'delete': deleteForm(); break;
      case 'close': closeForm(); break;
      case 'seed': seedSample(); break;
      case 'export-json': exportJSON(); break;
      case 'export-csv': exportCSV(); break;
      case 'import-json': document.getElementById('import-file').click(); break;
      case 'install': if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; } break;
      case 'add-cat': {
        const type = el.dataset.type; const inp = document.getElementById('addcat-' + type);
        const v = (inp.value || '').trim();
        if (!v) { toast('พิมพ์ชื่อหมวดก่อน'); break; }
        if (state.data.categories[type].includes(v)) { toast('มีหมวดนี้แล้ว'); break; }
        state.data.categories[type].push(v); save(); render(); break;
      }
      case 'del-cat': {
        const { type, cat } = el.dataset;
        state.data.categories[type] = state.data.categories[type].filter((c) => c !== cat);
        save(); render(); break;
      }
      case 'clear-all': if (confirm('ล้างข้อมูลรายการทั้งหมด? (หมวดหมู่จะยังอยู่)')) { state.data.transactions = []; save(); render(); toast('ล้างข้อมูลแล้ว'); } break;
    }
  }
  function onInput(e) {
    const el = e.target; const key = el.dataset && el.dataset.input;
    if (!key) return;
    if (key === 'search') { state.ui.search = el.value; state._refocus = 'search-input'; render(); }
    else if (state.form) { state.form[key] = el.value; }
  }
  function onChange(e) {
    const el = e.target;
    if (el.id === 'import-file' && el.files && el.files[0]) { importJSON(el.files[0]); el.value = ''; }
    else if (el.id === 'receipt-input' && el.files && el.files[0]) { readReceipt(el.files[0]); el.value = ''; }
    else if (el.id === 'list-month') { state.ui.listMonth = el.value; render(); }
  }

  // ---- Init ---------------------------------------------------------------
  function init() {
    load();
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (state.view === 'settings') render(); });
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

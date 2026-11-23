/* =====================================================================
   Card order prototype — flow logic + settings menu (long-press clock)
   ===================================================================== */
(function () {
  'use strict';

  /* ---------- data ---------- */
  const PRODUCTS = {
    cashback:         { name: 'Birbank Cashback',       skin: 'cashback', cta: 'Order for free' },
    star:             { name: 'Birbank Star',           skin: 'star',     cta: 'Order for free' },
    miles:            { name: 'Birbank Miles',          skin: 'miles',    cta: 'Order for 99 ₼' },
    platinum:         { name: 'Birbank Platinum',       skin: 'platinum', cta: 'Order for 50 ₼' },
    'platinum-miles': { name: 'Birbank Platinum Miles', skin: 'miles',    cta: 'Order for 80 ₼' },
  };
  const CURRENCY_SIGN = { AZN: '₼', USD: '$', EUR: '€' };

  const OUTCOMES = [
    ['ok', 'Успех — продолжить заказ'],
    ['third-card', 'Третья карта — платная (15 ₼)'],
    ['same-currency', 'Карта в этой валюте уже есть'],
    ['err__under18', 'Ошибка: младше 18 лет'],
    ['err__id-expired', 'Ошибка: удостоверение просрочено'],
    ['err__negative', 'Ошибка: отрицательный баланс'],
    ['err__non-resident', 'Ошибка: нерезидент'],
    ['err__aml', 'Ошибка: AML'],
    ['err__10-cards', 'Ошибка: уже 10+ карт'],
    ['err__5-cards', 'Ошибка: уже 5+ карт'],
    ['err__incident', 'Ошибка: инцидент'],
  ];
  const REF_STATES = [
    ['ok', 'Код принят'],
    ['used', 'Siz bu koddan artıq istifadə etmisiniz'],
    ['limit', 'Koddan istifadə limiti tükənib'],
    ['wrong', 'Daxil etdiyiniz kod yanlışdır'],
    ['expired', 'Müddəti bitib'],
  ];
  const SCENARIO = [
    { key: 'outcome', label: 'Проверка данных после загрузки', options: OUTCOMES },
    { key: 'ref', label: 'Реферальный код', options: REF_STATES.map(([k, v]) => [k, k === 'ok' ? v : 'Ошибка: ' + v]) },
    { key: 'sign', label: 'Подписание SIMA', options: [['ok', 'Успех — цифровая карта готова'], ['incident', 'Инцидент — заказ принят, карта позже']] },
    { key: 'physical', label: 'Физическая карта', options: [['free', 'Бесплатно (первая)'], ['paid', 'Платно (вторая физическая)']] },
    { key: 'geo', label: 'Геолокация', options: [['ask', 'Спросить разрешение'], ['granted', 'Уже разрешена']] },
    { key: 'address', label: 'Доставка по адресу', options: [['ok', 'Доступна'], ['unavailable', 'Недоступна для адреса']] },
  ];

  /* ---------- state ---------- */
  const DEFAULTS = { start: 'home', lang: 'en', outcome: 'ok', ref: 'ok', sign: 'ok', physical: 'free', geo: 'ask', address: 'ok' };
  const S = Object.assign({}, DEFAULTS, load());

  /* ---------- i18n (strings come from the DS localization variables, see i18n/strings.json) ---------- */
  const LANGS = [['en', 'English'], ['az', 'Azərbaycanca'], ['ru', 'Русский']];
  const nk = s => String(s).replace(/[ ​ ]/g, ' ').replace(/[’‘`]/g, "'").replace(/[“”«»„]/g, '"')
    .replace(/[‑–—−]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
  const I18N_INDEX = new Map();
  (function buildIndex() {
    const entries = (window.I18N && window.I18N.entries) || [];
    entries.forEach(e => (e.src || []).forEach(s => s && I18N_INDEX.set(nk(s), e)));            // exact sources first
    entries.forEach(e => ['en', 'az', 'ru'].forEach(l => { if (e[l] && !I18N_INDEX.has(nk(e[l]))) I18N_INDEX.set(nk(e[l]), e); }));
  })();
  function t(s, vars) {
    const e = I18N_INDEX.get(nk(s));
    let out = e && e[S.lang] ? e[S.lang] : s;
    if (vars) out = out.replace(/\{([\w-]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return out;
  }
  const INLINE_TAGS = new Set(['BR', 'SPAN', 'B', 'STRONG', 'I', 'EM', 'A', 'SMALL', 'SUP', 'SUB', 'U']);
  const NON_INLINE_SEL = '*:not(br):not(span):not(b):not(strong):not(i):not(em):not(a):not(small)';
  function unitText(el) {
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeType === 1) {
        if (n.dataset && n.dataset.slot) s += '{' + n.dataset.slot + '}';
        else if (n.tagName === 'BR') s += ' ';
        else s += unitText(n);
      }
    }
    return s;
  }
  function isUnit(el) {
    if (el.tagName === 'STYLE' || el.tagName === 'SCRIPT' || !el.textContent.trim()) return false;
    for (const c of el.children) { if (!INLINE_TAGS.has(c.tagName) || c.querySelector(NON_INLINE_SEL)) return false; }
    return true;
  }
  App.translate = (root) => {
    if (!I18N_INDEX.size) return;
    const all = [root, ...root.querySelectorAll('*')];
    const inRoot = new Set(all);
    const units = all.filter(el => isUnit(el) && !(el.parentElement && inRoot.has(el.parentElement) && isUnit(el.parentElement)));
    for (const el of units) {
      const e = I18N_INDEX.get(nk(unitText(el)));
      const slots = {}; el.querySelectorAll('[data-slot]').forEach(s => { slots[s.dataset.slot] = s; });
      const val = e && e[S.lang];
      if (!val) { // no whole-phrase match: translate leaf pieces on their own (slot labels, "From" + amount + "credit…")
        el.querySelectorAll('*').forEach(s => { if (!s.children.length && s.textContent.trim()) { const v = t(s.textContent); if (v !== s.textContent) s.textContent = v; } });
        continue;
      }
      if (!Object.keys(slots).length) {
        if (nk(el.textContent) === nk(val)) continue; // already in this language: keep designer line breaks
        const parts = val.split('\n');
        const kids = [...el.children].filter(c => c.tagName !== 'BR' && c.textContent.trim());
        // "title\ndescription" units: put each part back into its own styled child
        if (parts.length > 1 && kids.length === parts.length && kids.every(k => k.children.length === 0)) {
          [...el.childNodes].forEach(n => { if (n.nodeType === 3 && n.nodeValue.trim()) n.nodeValue = ' '; });
          kids.forEach((k, i) => { k.textContent = parts[i]; });
        } else el.textContent = parts.join(' ');
        continue;
      }
      const frag = document.createDocumentFragment();
      val.split(/(\{[\w-]+\})/).forEach(part => {
        const m = part.match(/^\{([\w-]+)\}$/);
        if (m && slots[m[1]]) frag.appendChild(slots[m[1]]); else if (part) frag.appendChild(document.createTextNode(part));
      });
      el.replaceChildren(frag);
    }
    root.querySelectorAll('[placeholder]').forEach(i => i.setAttribute('placeholder', t(i.getAttribute('placeholder'))));
  };
  function rerenderAll() {
    document.documentElement.lang = S.lang;
    const opts = { keep: true, keepDraft: true, product: F.product };
    App.stack.forEach(s => { const r = App.build(s.id, opts); if (r) s.layer.replaceChildren(r); });
    App.sheets.forEach(s => { const r = App.build(s.id, opts); if (r) s.wrap.querySelector('.sheet-holder').replaceChildren(r); });
  }
  document.documentElement.lang = S.lang;
  const digitalSuffix = () => { const s = t(' · Rəqəmsal').trim(); return ' ' + (s.startsWith('·') ? s : '· ' + s); };
  const dateText = () => F.date || ('13 ' + t('avqust'));
  const F = {}; // per-run flow state
  resetFlow();

  function resetFlow() {
    Object.assign(F, {
      product: 'cashback', currency: 'AZN', phone: '505678898', phoneDraft: '', pin1: '', pin2: '',
      geoGranted: S.geo === 'granted', mode: 'address', address: 'Caspian center', branch: 'Sabail Branch',
      date: null, time: '9:00–11:00',
    });
  }
  function load() { try { return JSON.parse(localStorage.getItem('cardproto.settings') || '{}'); } catch (e) { return {}; } }
  function save() {
    try { const o = {}; Object.keys(DEFAULTS).forEach(k => o[k] = S[k]); localStorage.setItem('cardproto.settings', JSON.stringify(o)); } catch (e) {}
  }
  let ordered = [];      // cards that appear on the start screen
  let justAdded = null;  // the one to animate

  /* ---------- helpers ---------- */
  const slot = (root, name) => root && root.querySelector(`[data-slot="${name}"]`);
  const setText = (el, txt) => { if (!el) return; if ('value' in el && el.tagName === 'INPUT') el.value = txt; else el.textContent = txt; };
  const base = id => App.base(id);
  const curId = () => { const c = App.current(); return c ? c.id : ''; };
  function setDeepText(el, txt) { // replace the text of the deepest text-bearing element (keeps icons)
    if (!el) return;
    const cands = [el, ...el.querySelectorAll('*')].filter(n => n.children.length === 0 && n.textContent.trim());
    (cands[cands.length - 1] || el).textContent = txt;
  }
  function fmtPhone(d) { // 9 digits -> "+994 50 567 88 98"
    const p = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    return '+994' + (p.length ? ' ' + p.join(' ') : '');
  }
  function later(fn, ms) { // timers pause while the settings menu is open
    const t = { fn, left: ms, start: Date.now(), id: 0, done: false };
    t.id = setTimeout(() => run(t), ms);
    timers.add(t);
    return t;
  }
  const timers = new Set();
  function run(t) { if (settingsOpen) { t.pending = true; return; } t.done = true; timers.delete(t); t.fn(); }
  function cancel(t) { if (t) { clearTimeout(t.id); timers.delete(t); t.done = true; } }
  function flushTimers() { timers.forEach(t => { if (t.pending) { t.pending = false; setTimeout(() => run(t), 250); } }); }

  /* ---------- start screens ---------- */
  function fillCardRow(row, c) {
    const p = PRODUCTS[c.product];
    const img = slot(row, 'skin'); if (img) img.src = `assets/skins/${p.skin}.svg`;
    setText(slot(row, 'last4'), c.last4);
    setText(slot(row, 'amount-int'), '0');
    setText(slot(row, 'amount-dec'), ',00');
    setText(slot(row, 'name'), p.name + (c.physical ? '' : digitalSuffix()));
    if (c.currency !== 'AZN') {
      [...row.querySelectorAll('*')].filter(n => n.children.length === 0 && n.textContent.trim() === '₼')
        .forEach(n => n.textContent = CURRENCY_SIGN[c.currency]);
    }
    row.classList.add('proto-card-row');
    if (c === justAdded) row.classList.add('is-new');
  }
  function cardRow(c) {
    const r = App.build('_card-row'); if (!r) return null;
    fillCardRow(r, c); return r;
  }
  function animateNew(root) {
    const row = root.querySelector('.proto-card-row.is-new'); if (!row) return;
    const h = row.offsetHeight || 64;
    row.style.height = '0px'; row.style.overflow = 'hidden'; row.style.opacity = '0';
    setTimeout(() => {
      row.style.transition = 'height .5s cubic-bezier(.2,.8,.2,1), opacity .4s ease .15s';
      row.style.height = h + 'px'; row.style.opacity = '1';
      row.classList.add('is-flash');
      setTimeout(() => { row.style.height = ''; row.style.overflow = ''; }, 600);
    }, 550);
    justAdded = null;
  }
  App.hooks['home'] = (root) => {
    const list = slot(root, 'cards-list');
    if (list) ordered.forEach(c => { const r = cardRow(c); if (r) list.prepend(r); }); // newest on top
    requestAnimationFrame(() => animateNew(root));
  };
  App.hooks['home-alt'] = (root) => {
    const holder = slot(root, 'alt-cards');
    if (holder && ordered.length) {
      const block = App.build('_cards-block');
      if (block) {
        const list = slot(block, 'cards-list');
        ordered.slice().reverse().forEach(c => { const r = cardRow(c); if (r) list.appendChild(r); });
        holder.appendChild(block);
        if (justAdded) { block.classList.add('proto-block-new'); }
      }
    }
    requestAnimationFrame(() => animateNew(root));
  };
  App.actions['order-card'] = () => { resetFlow(); App.openSheet('add-card'); };

  /* ---------- add card / product ---------- */
  App.hooks['add-card'] = (root) => { if (![...root.classList].some(c => c.startsWith('tab-'))) root.classList.add('tab-daily'); };
  App.actions['tab'] = (el, root) => {
    [...root.classList].filter(c => c.startsWith('tab-')).forEach(c => root.classList.remove(c));
    root.classList.add('tab-' + el.dataset.tab);
    root.querySelectorAll('[data-action="tab"]').forEach(b => b.classList.toggle('is-active', b === el));
  };
  App.actions['open-product'] = (el) => {
    F.product = el.dataset.product || 'cashback';
    App.closeSheet(true);
    App.openSheet('product', { product: F.product });
  };
  App.actions['order-product'] = (el) => { F.product = el.dataset.product || 'cashback'; App.openSheet('currency'); };

  function applyProduct(root, key, fromScroll) {
    const p = PRODUCTS[key]; if (!p) return;
    F.product = key;
    setText(slot(root, 'title'), p.name);
    setText(slot(root, 'cta'), t(p.cta));
    const ben = slot(root, 'benefits');
    const frag = App.has('_benefits-' + key) ? App.build('_benefits-' + key) : (key === 'platinum-miles' && App.has('_benefits-platinum') ? App.build('_benefits-platinum') : null);
    if (ben && frag) ben.replaceChildren(frag);
    if (!fromScroll) {
      const car = slot(root, 'carousel'); const img = car && car.querySelector(`[data-skin="${key}"]`);
      if (car && img) requestAnimationFrame(() => { car.scrollLeft = img.offsetLeft - (car.clientWidth - img.offsetWidth) / 2; });
    }
  }
  App.hooks['product'] = (root, opts) => {
    if (!App.has('_benefits-' + (opts.product || F.product)) && (opts.product || F.product) === 'cashback') { /* keep default markup */ }
    applyProduct(root, opts.product || F.product);
    const car = slot(root, 'carousel');
    if (car) {
      let t;
      car.addEventListener('scroll', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const mid = car.scrollLeft + car.clientWidth / 2; let best = null, bd = 1e9;
          car.querySelectorAll('[data-skin]').forEach(i => { const d = Math.abs(i.offsetLeft + i.offsetWidth / 2 - mid); if (d < bd) { bd = d; best = i; } });
          if (best && best.dataset.skin !== F.product) applyProduct(root, best.dataset.skin, true);
        }, 120);
      }, { passive: true });
    }
    const inp = slot(root, 'ref-input');
    if (inp) inp.addEventListener('input', () => root.classList.remove('is-ref-error'));
    root.addEventListener('click', (e) => {
      const chip = e.target.closest('.pi-chip');
      if (chip) root.querySelectorAll('.pi-chip').forEach(c => c.classList.toggle('is-active', c === chip));
      if (e.target.closest('[data-toggle="is-referral"]') && inp) setTimeout(() => { if (root.classList.contains('is-referral')) inp.focus(); }, 60);
    });
  };
  function showRefError(root, key) {
    const txt = (REF_STATES.find(r => r[0] === key) || [])[1];
    root.classList.add('is-referral');
    const inp = slot(root, 'ref-input'); if (inp && !inp.value) inp.value = '77RT9';
    if (key === 'ok' || key === 'input') { root.classList.remove('is-ref-error'); return; }
    root.classList.add('is-ref-error');
    setDeepText(slot(root, 'ref-error'), t(txt));
  }
  App.actions['order'] = (el, root) => {
    const inp = slot(root, 'ref-input');
    if (root.classList.contains('is-referral') && inp && inp.value.trim() && S.ref !== 'ok') { showRefError(root, S.ref); return; }
    App.openSheet('currency');
  };
  App.hooks['currency'] = (root) => {
    root.querySelectorAll('[data-currency]').forEach(r => r.classList.toggle('is-selected', r.dataset.currency === F.currency));
  };
  App.actions['currency'] = (el, root) => {
    F.currency = el.dataset.currency;
    root.querySelectorAll('[data-currency]').forEach(r => r.classList.toggle('is-selected', r === el));
  };
  App.actions['currency-continue'] = () => App.go('loading');

  /* ---------- loading & outcome ---------- */
  let loadTimer = null;
  App.hooks['loading'] = (root) => {
    setText(slot(root, 'title'), PRODUCTS[F.product].name);
    const clock = root.querySelector('.ld-time');
    if (clock) { let sec = 178; const tick = () => { if (!root.isConnected) return; clock.textContent = `0${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; sec--; if (sec >= 0) later(tick, 1000); }; later(tick, 1000); }
    cancel(loadTimer);
    loadTimer = later(() => {
      if (base(curId()) !== 'loading') return;
      const o = S.outcome;
      if (o === 'ok') return afterChecks(true);
      App.go(o, { replace: true });
    }, 2600);
  };
  App.hooks['back:loading'] = () => {};
  function afterChecks(replace) {
    const next = S.start === 'home-alt' ? 'fin' : 'phone';
    App.go(next, { replace: !!replace });
  }
  App.actions['warning-continue'] = () => afterChecks(true);
  App.actions['other-cards'] = () => { finish(); setTimeout(() => App.openSheet('add-card'), 450); };
  App.actions['branches'] = () => toast('Список филиалов — вне этого прототипа');

  /* ---------- FIN / phone ---------- */
  App.actions['fin-continue'] = () => App.go('phone');
  App.hooks['phone'] = (root) => setText(slot(root, 'phone'), fmtPhone(F.phone));
  function renderPhone(root) {
    setText(slot(root, 'phone-input'), fmtPhone(F.phoneDraft));
    const clr = root.querySelector('[data-action="phone-clear"]'); if (clr) clr.style.visibility = F.phoneDraft ? '' : 'hidden';
    const ok = root.querySelector('[data-action="phone-confirm"]'); if (ok) ok.disabled = F.phoneDraft.length < 9;
  }
  App.hooks['phone__edit'] = App.hooks['phone__error'] = (root, opts) => {
    if (opts.keepDraft === undefined) F.phoneDraft = F.phone;
    renderPhone(root);
  };
  App.actions['phone-clear'] = (el, root) => { F.phoneDraft = ''; renderPhone(root);
    if (base(curId()) === 'phone' && curId() === 'phone__error') App.replaceCurrent('phone__edit', { keepDraft: true }); };
  App.actions['phone-confirm'] = () => {
    const ok = F.phoneDraft.length === 9 && /^(10|50|51|55|60|70|77|99)/.test(F.phoneDraft);
    if (!ok) return App.replaceCurrent('phone__error', { keepDraft: true });
    F.phone = F.phoneDraft;
    const prev = App.stack[App.stack.length - 2];
    if (prev && prev.id === 'phone') { App.back(); setText(slot(prev.layer.firstElementChild, 'phone'), fmtPhone(F.phone)); }
    else App.replaceCurrent('phone');
  };
  App.actions['phone-continue'] = () => App.go('pin');

  /* ---------- PIN ---------- */
  function renderPin(root) {
    const fill = (name, v) => { const s = slot(root, name); if (s) s.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('is-filled', i < v.length)); };
    fill('pin1', F.pin1); fill('pin2', F.pin2);
    root.classList.toggle('is-repeat', F.pin1.length === 4);
    const ok = root.querySelector('[data-action="pin-confirm"]'); if (ok) ok.disabled = F.pin1.length < 4 || F.pin2.length < 4;
  }
  App.hooks['pin'] = (root, opts) => { if (!opts.keep) { F.pin1 = ''; F.pin2 = ''; } renderPin(root); };
  App.hooks['pin__mismatch'] = (root) => { if (F.pin1.length < 4) F.pin1 = '1234'; if (F.pin2.length < 4) F.pin2 = '4321'; renderPin(root); root.classList.add('is-repeat'); };
  App.actions['pin-confirm'] = () => {
    if (F.pin1.length < 4 || F.pin2.length < 4) return toast('Введите PIN дважды');
    if (F.pin1 !== F.pin2) return App.replaceCurrent('pin__mismatch');
    App.go('info');
  };

  /* ---------- keypads ---------- */
  App.actions['key'] = (el, root) => {
    const k = el.dataset.key, id = curId(), b = base(id);
    if (b === 'phone') {
      if (k === 'del') F.phoneDraft = F.phoneDraft.slice(0, -1);
      else if (F.phoneDraft.length < 9) F.phoneDraft += k;
      if (id === 'phone__error') { App.replaceCurrent('phone__edit', { keepDraft: true }); return; }
      renderPhone(root);
    } else if (b === 'pin') {
      if (id === 'pin__mismatch') { F.pin2 = ''; root = App.replaceCurrent('pin', { keep: true }); }
      const target = F.pin1.length < 4 ? 'pin1' : 'pin2';
      if (k === 'del') { if (target === 'pin2' && F.pin2.length) F.pin2 = F.pin2.slice(0, -1); else if (target === 'pin2') F.pin1 = F.pin1.slice(0, -1); else F.pin1 = F.pin1.slice(0, -1); }
      else if (F[target].length < 4) F[target] += k;
      renderPin(root);
    }
  };

  /* ---------- KYC + SIMA ---------- */
  App.actions['kyc-start'] = (el, root) => {
    if (!root.classList.contains('is-agreed')) { root.classList.add('is-agreed'); }
    root.classList.add('is-loading');
    later(() => { root.classList.remove('is-loading'); App.openSheet('kyc-tips'); }, 900);
  };
  let kycTimers = [];
  App.hooks['kyc-ready'] = (root) => {
    kycTimers.forEach(cancel);
    kycTimers = [later(() => root.classList.add('is-ready'), 1300)];
  };
  App.actions['kyc-record'] = (el, root) => {
    if (!root.classList.contains('is-ready') || root.classList.contains('is-recording')) return;
    root.classList.add('is-recording');
    setText(slot(root, 'cta'), t('Çəkiliş gedir…'));
    kycTimers.push(later(() => App.go('sima', { replace: true }), 4200));
  };
  App.actions['sima-sign'] = (el) => {
    el.classList.add('proto-btn-loading');
    later(() => {
      if (S.sign === 'incident') return App.go('order-accepted', { replace: true });
      addCard();
      App.go('card-page', { replace: true });
    }, 900);
  };
  function addCard() {
    const last4 = ordered.length ? String(1000 + Math.floor(Math.random() * 9000)) : '4580';
    const c = { product: F.product, currency: F.currency, last4, physical: false };
    ordered.push(c); justAdded = c; F.card = c;
  }

  /* ---------- card page ---------- */
  App.hooks['card-page'] = (root) => {
    later(() => root.classList.add('no-toast'), 4500); // DS toast hides itself
    const c = F.card || ordered[ordered.length - 1];
    const p = PRODUCTS[(c && c.product) || F.product];
    const img = slot(root, 'skin'); if (img) img.src = `assets/skins/${p.skin}.svg`;
    if (c) setText(slot(root, 'last4'), c.last4);
    setText(slot(root, 'delivery-date'), /\d{4}/.test(dateText()) ? dateText() : dateText() + ' 2026');
    setText(slot(root, 'branch'), F.branch);
    setText(slot(root, 'branch-name'), F.branch);
    setText(slot(root, 'delivery-desc'), t('Your card will be delivered on {date}, {time} to {address}.', { date: dateText().split(',')[0], time: F.time, address: F.address }));
  };
  App.hooks['sima'] = (root) => setText(slot(root, 'signers'), '2');
  App.hooks['physical-paid'] = (root) => setText(slot(root, 'fee'), '10 ₼');
  App.actions['order-physical'] = () => {
    if (S.physical === 'paid') return App.go('physical-paid');
    startDelivery();
  };
  App.actions['physical-paid-continue'] = () => startDelivery();
  App.hooks['digital-info'] = (root) => {
    let x0 = null;
    root.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
    root.addEventListener('pointerup', (e) => {
      if (x0 === null) return; const dx = e.clientX - x0; x0 = null;
      const n = +(root.dataset.slide || 1);
      if (dx < -40 && n < 4) root.dataset.slide = String(n + 1);
      if (dx > 40 && n > 1) root.dataset.slide = String(n - 1);
    });
  };
  App.actions['slide-next'] = (el, root) => { const n = +(root.dataset.slide || 1); root.dataset.slide = String(Math.min(n + 1, 4)); };

  /* ---------- delivery ---------- */
  function startDelivery() {
    F.mode = 'address';
    App.go(F.geoGranted ? 'delivery' : 'delivery__permission');
  }
  App.actions['geo-allow'] = () => { F.geoGranted = true; App.replaceCurrent('delivery'); };
  App.actions['geo-deny'] = () => App.replaceCurrent('delivery__no-geo');
  App.actions['geo-skip'] = () => App.replaceCurrent('delivery__denied');
  App.actions['delivery-mode'] = (el) => {
    F.mode = el.dataset.mode;
    const b = base(curId());
    const target = F.mode === 'branch' ? 'branch' : 'delivery';
    if (b === 'delivery' || b === 'branch') App.replaceCurrent(target); else App.go(target);
  };
  App.actions['pick-address'] = (el) => {
    F.address = el.dataset.address || F.address;
    if (S.address === 'unavailable') {
      if (base(curId()) === 'delivery') return App.replaceCurrent('delivery__unavailable');
      return App.go('delivery__unavailable');
    }
    App.go('delivery-confirm');
  };
  App.hooks['delivery-confirm'] = (root) => setText(slot(root, 'address'), F.address);
  App.actions['choose'] = (el, root) => {
    const g = el.dataset.group;
    root.querySelectorAll(`[data-group="${g}"]`).forEach(n => n.classList.toggle('is-selected', n === el));
    const t = el.textContent.replace(/\s+/g, ' ').trim();
    if (g === 'date' && t) F.date = t; if (g === 'time' && t) F.time = t;
  };
  App.actions['pick-branch'] = (el) => { F.branch = el.dataset.branch || F.branch; F.mode = 'branch'; App.go('branch-confirm'); };
  App.hooks['branch-confirm'] = (root) => setText(slot(root, 'branch'), F.branch);
  App.actions['offers-confirm'] = (el) => {
    if (F.card) F.card.physical = true;
    el.classList.add('proto-btn-loading');
    later(() => App.go(F.mode === 'branch' ? 'card-page__branch' : 'card-page__delivery', { replace: false }), 700);
  };

  /* ---------- finish / back ---------- */
  function finish() {
    App.closeAllSheets(true);
    App.go(S.start, { reset: true, anim: 'fade' });
    const sc = App.currentRoot() && App.currentRoot().querySelector('.scr__scroll');
    if (sc) sc.scrollTop = 0;
  }
  App.actions['finish'] = () => finish();
  const FIRST_STEPS = ['phone', 'fin', 'third-card'];
  App.actions['back'] = () => {
    const id = curId();
    if (!App.sheets.length && FIRST_STEPS.includes(base(id)) && App.has('back-alert')) return App.openSheet('back-alert');
    App.back();
  };

  /* =====================================================================
     Settings menu (long press on the clock)
     ===================================================================== */
  let settingsOpen = false;
  const css = `
  #proto-settings{position:absolute;inset:0;z-index:90;display:none}
  #proto-settings.is-open{display:block}
  #proto-settings .ps-back{position:absolute;inset:0;background:rgba(0,0,0,.45);animation:fadeIn .2s ease both}
  #proto-settings .ps-panel{position:absolute;left:0;right:0;bottom:0;max-height:760px;display:flex;flex-direction:column;background:#f2f2f7;border-radius:14px 14px 0 0;
    animation:sheetUp .32s cubic-bezier(.2,.8,.2,1) both;font-family:var(--font);color:#000}
  #proto-settings .ps-head{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 8px}
  #proto-settings .ps-head b{font:600 17px/22px var(--font)}
  #proto-settings .ps-x{width:30px;height:30px;border-radius:15px;background:rgba(120,120,128,.16);display:grid;place-items:center;font:500 15px/1 var(--font);color:rgba(60,60,67,.6)}
  #proto-settings .ps-body{overflow-y:auto;padding:0 16px 34px;scrollbar-width:none}
  #proto-settings .ps-body::-webkit-scrollbar{display:none}
  #proto-settings h4{margin:18px 16px 6px;font:400 13px/18px var(--font);color:rgba(60,60,67,.6);text-transform:uppercase;letter-spacing:-.08px}
  #proto-settings .ps-group{background:#fff;border-radius:10px;overflow:hidden}
  #proto-settings .ps-row{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;padding:11px 16px;font:400 16px/21px var(--font);color:#000;position:relative;text-align:left}
  #proto-settings .ps-row+.ps-row::before{content:"";position:absolute;left:16px;right:0;top:0;height:.5px;background:rgba(60,60,67,.29)}
  #proto-settings .ps-row .ps-t{flex:1}
  #proto-settings .ps-row small{display:block;font:400 13px/17px var(--font);color:rgba(60,60,67,.6)}
  #proto-settings .ps-check{width:20px;color:#ea3340;font:600 17px/1 var(--font);visibility:hidden}
  #proto-settings .ps-row.is-on .ps-check{visibility:visible}
  #proto-settings .ps-row.is-on .ps-t{font-weight:500}
  #proto-settings .ps-note{margin:6px 16px 0;font:400 13px/17px var(--font);color:rgba(60,60,67,.6)}
  #proto-settings .ps-scn{flex-direction:column;align-items:stretch;gap:2px;padding-top:9px;padding-bottom:9px;cursor:pointer}
  #proto-settings .ps-cap{font:400 13px/17px var(--font);color:rgba(60,60,67,.6)}
  #proto-settings select{flex:1;min-width:0;font:400 16px/21px var(--font);color:#000;border:0;background:none;padding:0;appearance:none;-webkit-appearance:none;cursor:pointer;outline:none}
  #proto-settings .ps-sel{display:flex;align-items:center;gap:6px}
  #proto-settings .ps-sel::after{content:"›";color:rgba(60,60,67,.35);font-size:20px;line-height:1;transform:rotate(90deg)}
  #proto-settings .ps-btn{display:block;width:100%;padding:13px 16px;font:400 17px/22px var(--font);color:#ea3340;text-align:center}
  #proto-settings details summary{list-style:none;cursor:pointer}
  #proto-settings details summary::-webkit-details-marker{display:none}
  #proto-settings .ps-sec{display:flex;justify-content:space-between;align-items:center}
  #proto-settings details[open] .ps-chev{transform:rotate(90deg)}
  #proto-settings .ps-chev{transition:transform .2s;color:rgba(60,60,67,.35)}
  .proto-btn-loading{pointer-events:none;position:relative;color:transparent!important;filter:brightness(.82)}
  .proto-btn-loading>*{visibility:hidden}
  .proto-btn-loading::after{content:"";position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;
    border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:protoSpin .8s linear infinite}
  @keyframes protoSpin{to{transform:rotate(360deg)}}
  .proto-card-row{position:relative}
  .proto-card-row.is-flash::after{content:"";position:absolute;inset:0;background:rgba(234,51,64,.10);border-radius:10px;animation:protoFlash 2.2s ease .4s both;pointer-events:none}
  @keyframes protoFlash{0%{opacity:0}15%{opacity:1}70%{opacity:1}100%{opacity:0}}
  .proto-block-new{animation:protoBlockIn .6s cubic-bezier(.2,.8,.2,1) .45s both}
  @keyframes protoBlockIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
  `;
  document.getElementById('settings-css').textContent = css;

  const panel = document.createElement('div');
  panel.id = 'proto-settings';
  panel.lang = 'ru';
  panel.innerHTML = '<div class="ps-back"></div><div class="ps-panel"><div class="ps-head"><b>Настройки прототипа</b><button type="button" class="ps-x" data-ps="close">✕</button></div><div class="ps-body"></div></div>';
  document.getElementById('device').appendChild(panel);
  panel.querySelector('.ps-back').addEventListener('click', closeSettings);

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function titleOf(id) { const t = App.tpl(id); return (t && t.dataset.title) || id; }
  function statesOf(id) {
    const b = base(id);
    return $$('template[data-screen]').map(t => t.dataset.screen).filter(s => s === b || s.startsWith(b + '__'));
  }
  function row(attrs, text, on, sub) {
    return `<button type="button" class="ps-row${on ? ' is-on' : ''}" ${attrs}><span class="ps-check">✓</span><span class="ps-t">${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button>`;
  }
  function renderSettings() {
    const id = curId(), b = base(id);
    let h = '';
    h += '<h4>Точка старта</h4><div class="ps-group">';
    h += row('data-ps="start" data-v="home"', 'Главная страница', S.start === 'home', 'Кнопка «Kartlar» в «Məhsullar və xidmətlər»');
    h += row('data-ps="start" data-v="home-alt"', 'Альтернативный вход (новый клиент)', S.start === 'home-alt', 'Плитка «Birbank kartını sifariş…»');
    h += '</div>';
    h += '<h4>Язык интерфейса</h4><div class="ps-group">';
    h += LANGS.map(([k, v]) => row(`data-ps="lang" data-v="${k}"`, v, S.lang === k)).join('');
    h += '</div>';
    if (!I18N_INDEX.size) h += '<div class="ps-note">Словарь переводов ещё не собран — тексты показаны как в макетах.</div>';

    // this screen — alternative states
    const st = statesOf(id).filter(s => App.tpl(s).dataset.kind !== 'fragment');
    let extra = '';
    if (b === 'product') extra = REF_STATES.map(([k, v]) => row(`data-ps="ref-state" data-v="${k}"`, k === 'ok' ? 'Поле реферального кода' : 'Ошибка: ' + v, false)).join('');
    if (b === 'loading') extra = OUTCOMES.map(([k, v]) => row(`data-ps="outcome-now" data-v="${k}"`, v, S.outcome === k)).join('');
    if (b === 'sima') extra = SCENARIO[2].options.map(([k, v]) => row(`data-ps="scn" data-k="sign" data-v="${k}"`, v, S.sign === k)).join('');
    if (b === 'card-page' && !id.includes('__')) extra = SCENARIO[3].options.map(([k, v]) => row(`data-ps="scn" data-k="physical" data-v="${k}"`, v, S.physical === k)).join('');
    if (st.length > 1 || extra) {
      h += `<h4>Этот экран · ${esc(titleOf(id))}</h4><div class="ps-group">`;
      if (st.length > 1) h += st.map(s => row(`data-ps="state" data-v="${s}"`, titleOf(s), s === id)).join('');
      h += extra + '</div>';
      if (b === 'loading') h += '<div class="ps-note">Выбранный результат применится, когда загрузка закончится (на паузе, пока открыто меню).</div>';
    }

    h += '<h4>Сценарий</h4><div class="ps-group">';
    SCENARIO.forEach(sc => {
      h += `<label class="ps-row ps-scn"><span class="ps-cap">${esc(sc.label)}</span><span class="ps-sel"><select data-ps-sel="${sc.key}">` +
        sc.options.map(([k, v]) => `<option value="${k}"${S[sc.key] === k ? ' selected' : ''}>${esc(v)}</option>`).join('') + '</select></span></label>';
    });
    h += '</div>';

    h += '<h4>Перейти к экрану</h4><div class="ps-group"><details><summary class="ps-row ps-sec"><span class="ps-t">Все экраны прототипа</span><span class="ps-chev">›</span></summary>';
    h += $$('template[data-screen]').filter(t => t.dataset.kind !== 'fragment').map(t => row(`data-ps="jump" data-v="${t.dataset.screen}"`, t.dataset.title || t.dataset.screen, t.dataset.screen === id, t.dataset.screen)).join('');
    h += '</details></div>';

    h += '<div class="ps-group" style="margin-top:22px"><button type="button" class="ps-btn" data-ps="restart">Перезапустить с начала</button></div>';
    panel.querySelector('.ps-body').innerHTML = h;
  }
  function openSettings() { if (window.__gateOpen) return; settingsOpen = true; renderSettings(); panel.classList.add('is-open'); }
  function closeSettings() { settingsOpen = false; panel.classList.remove('is-open'); flushTimers(); }

  panel.addEventListener('change', (ev) => {
    const sel = ev.target.closest('[data-ps-sel]'); if (!sel) return;
    S[sel.dataset.psSel] = sel.value; save();
    if (sel.dataset.psSel === 'geo') F.geoGranted = sel.value === 'granted';
    renderSettings();
  });
  panel.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-ps]'); if (!el) return;
    const k = el.dataset.ps, v = el.dataset.v;
    if (k === 'close') return closeSettings();
    if (k === 'start') { S.start = v; save(); closeSettings(); return restart(); }
    if (k === 'restart') { closeSettings(); return restart(); }
    if (k === 'lang') { S.lang = v; save(); closeSettings(); rerenderAll(); return; }
    if (k === 'state') {
      closeSettings();
      const kind = App.kind(v);
      if (kind === 'sheet') App.replaceSheet(v); else App.replaceCurrent(v, { keepDraft: true, keep: true });
      return;
    }
    if (k === 'ref-state') { closeSettings(); const r = App.currentRoot(); if (r) showRefError(r, v === 'ok' ? 'input' : v); if (v !== 'ok') { S.ref = v; save(); } return; }
    if (k === 'outcome-now') { S.outcome = v; save(); renderSettings(); return; }
    if (k === 'scn') { S[el.dataset.k] = v; save(); renderSettings(); return; }
    if (k === 'jump') {
      closeSettings();
      if (App.kind(v) === 'sheet') { App.closeAllSheets(true); App.openSheet(v, { product: F.product }); }
      else App.go(v, { anim: 'fade' });
      return;
    }
  });

  function restart() {
    timers.forEach(cancel); ordered = []; justAdded = null; F.card = null; resetFlow();
    App.closeAllSheets(true);
    App.go(S.start, { reset: true, anim: 'fade' });
  }

  // search fields: the clear (x) empties the input
  document.getElementById('device').addEventListener('click', (e) => {
    const x = e.target.closest('.dl-osearch__clear'); if (!x) return;
    const inp = x.parentElement && x.parentElement.querySelector('input');
    if (inp) { inp.value = ''; inp.focus(); inp.dispatchEvent(new Event('input', { bubbles: true })); }
  });

  // long press on the clock
  const clock = document.getElementById('clock');
  let pressT = null;
  const startPress = (e) => { e.preventDefault(); clock.classList.add('is-pressing'); pressT = setTimeout(() => { clock.classList.remove('is-pressing'); pressT = null; openSettings(); }, 550); };
  const endPress = () => { clock.classList.remove('is-pressing'); if (pressT) { clearTimeout(pressT); pressT = null; } };
  clock.addEventListener('pointerdown', startPress);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(e => clock.addEventListener(e, endPress));
  clock.addEventListener('contextmenu', e => e.preventDefault());

  /* ---------- boot ---------- */
  window.AppBoot = function (behindSheet) {
    App.go(S.start, { anim: 'none' });
  };
  window.ProtoState = { S, F, get ordered() { return ordered; } };
})();

/* Акватех — скрипты магазина: каталог с фильтрами, карточка товара, корзина, оформление заказа, поиск.
   Подключается на страницах магазина после main.js и берёт оттуда window.akv (уведомления, диалоги, маска телефона).
   ДЕМО: корзина и последний заказ хранятся в браузере, фильтр отбирает товары по данным страницы.
   В Битриксе это делают компоненты (catalog.smart.filter, sale.basket.basket, sale.order.ajax), разметка и классы те же */
(function () {
  'use strict';

  var akv = window.akv;
  if (!akv) return;
  var NBSP = String.fromCharCode(160);
  var scrollMode = akv.reduceMotion ? 'auto' : 'smooth';

  /* ---------- Общее ---------- */
  function money(n) { return Math.round(n).toLocaleString('ru-RU').replace(/\s/g, NBSP) + NBSP + '₽'; }
  function num(n) { return n.toLocaleString('ru-RU').replace(/\s/g, NBSP); }
  function plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  }
  function goods(n) { return n + ' ' + plural(n, 'товар', 'товара', 'товаров'); }
  function readJson(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }
  // ссылки на ещё не готовые страницы (/product/…) оставляем как есть, относительные — делаем полными
  function absUrl(url) { return !url || url.charAt(0) === '/' ? url : new URL(url, location.href).href; }
  function each(root, selector, fn) { Array.prototype.forEach.call(root.querySelectorAll(selector), fn); }

  /* ---------- ДЕМО: корзина в браузере ---------- */
  var cart = {
    read: function () {
      try {
        var items = JSON.parse(localStorage.getItem(akv.cartKey) || '[]');
        return Array.isArray(items) ? items.filter(function (i) { return i && i.id && i.qty > 0; }) : [];
      } catch (e) { return []; }
    },
    write: function (items) {
      try { localStorage.setItem(akv.cartKey, JSON.stringify(items)); } catch (e) { /* приватный режим — корзина живёт до перезагрузки */ }
      document.dispatchEvent(new CustomEvent('cart:change'));
    },
    add: function (item) {
      var items = cart.read();
      var found = items.filter(function (i) { return i.id === item.id; })[0];
      if (found) found.qty = Math.min(99, found.qty + 1);
      else items.push(Object.assign({ qty: 1 }, item));
      cart.write(items);
    },
    setQty: function (id, qty) {
      cart.write(cart.read().map(function (i) { if (i.id === id) i.qty = qty; return i; }));
    },
    remove: function (id) {
      cart.write(cart.read().filter(function (i) { return i.id !== id; }));
    },
    totals: function (items) {
      return items.reduce(function (t, i) { t.qty += i.qty; t.sum += i.qty * i.price; return t; }, { qty: 0, sum: 0 });
    }
  };
  var cartLink = document.querySelector('.cart-btn');
  var cartUrl = cartLink ? cartLink.href : '';

  /* ---------- Кнопка «В корзину»: первое нажатие добавляет товар, следующее ведёт в корзину ---------- */
  function markInCart(btn) {
    btn.classList.add('is-added');
    btn.dataset.inCart = '1';
    var label = btn.querySelector('span');
    if (label) label.textContent = 'В корзине';
  }
  var inCart = cart.read().map(function (i) { return i.id; });
  each(document, '[data-add-to-cart]', function (btn) {
    if (inCart.indexOf(btn.dataset.id) !== -1) markInCart(btn);
  });
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-add-to-cart]');
    if (!btn) return;
    if (btn.dataset.inCart) { location.href = cartUrl; return; }
    var d = btn.dataset;
    cart.add({ id: d.id, name: d.name, price: Number(d.price), article: d.article, img: absUrl(d.img), url: absUrl(d.url) });
    markInCart(btn);
    akv.toast('Товар добавлен в корзину');
  });

  /* ---------- Каталог: фильтры, сортировка, страницы ---------- */
  var catalogEl = document.querySelector('[data-catalog]');
  if (catalogEl) initCatalog(catalogEl);

  function initCatalog(root) {
    var PER_PAGE = 16;
    var STOCK_ORDER = { 'in': 0, order: 1, out: 2 };
    var products = (readJson('catalog-data') || []).map(function (p, i) { p.index = i; return p; });
    if (!products.length) return;

    var form = root.querySelector('[data-filters]');
    var home = root.querySelector('[data-filters-home]');
    var dialog = document.querySelector('[data-filters-dialog]');
    var grid = root.querySelector('[data-products]');
    var sortSelect = root.querySelector('[data-sort]');
    var foundEl = root.querySelector('[data-found]');
    var chipsEl = root.querySelector('[data-chips]');
    var emptyEl = root.querySelector('[data-empty]');
    var pagesEl = root.querySelector('[data-pages]');
    var badge = root.querySelector('[data-filters-count]');
    var totalEl = form.querySelector('[data-filters-total]');
    var stockInput = form.elements.stock;
    var cards = {};
    each(grid, '.product-card', function (card) { cards[card.dataset.id] = card; });
    var page = Number(new URLSearchParams(location.search).get('page')) || 1;

    // значение характеристики: цена, бренд, серия — поля товара, остальное — в props; несколько значений — массив
    function valueOf(p, key) { return p.props && key in p.props ? p.props[key] : p[key]; }
    function valuesOf(p, key) { var v = valueOf(p, key); return v == null ? [] : [].concat(v); }

    // описание фильтров берём из разметки: группы галочек и пары полей «от — до»
    var checkGroups = [];
    each(form, '.filter', function (box) {
      var inputs = Array.prototype.slice.call(box.querySelectorAll('.check__input'));
      if (!inputs.length) return;
      var key = inputs[0].name;
      var known = {};
      products.forEach(function (p) { valuesOf(p, key).forEach(function (v) { known[v] = true; }); });
      checkGroups.push({ key: key, box: box, inputs: inputs, title: box.querySelector('.filter__title').textContent.trim(), single: Object.keys(known).length < 2 });
    });
    var ranges = [];
    each(form, '.range', function (pair) {
      var from = pair.querySelector('[name$="_from"]'), to = pair.querySelector('[name$="_to"]');
      var key = from.name.replace(/_from$/, '');
      var caption = (pair.previousElementSibling && pair.previousElementSibling.classList.contains('filter__subtitle')
        ? pair.previousElementSibling : pair.closest('.filter').querySelector('.filter__title')).textContent.trim();
      var parts = caption.split(','); // «Цена, ₽» → название и единица
      var values = products.map(function (p) { return valueOf(p, key); }).filter(function (v) { return typeof v === 'number'; });
      if (values.length) {
        from.placeholder = 'от ' + num(Math.min.apply(null, values));
        to.placeholder = 'до ' + num(Math.max.apply(null, values));
      }
      ranges.push({ key: key, from: from, to: to, name: parts[0].trim(), unit: (parts[1] || '').trim() });
    });

    // длинный список: первые пять значений, остальные по кнопке (отмеченные видны всегда — см. shop.css)
    checkGroups.forEach(function (g) {
      if (g.inputs.length <= 5) return;
      g.inputs.slice(5).forEach(function (input) { input.closest('.check').classList.add('is-extra'); });
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'filter__more';
      var label = 'Показать все (' + g.inputs.length + ')';
      more.textContent = label;
      more.addEventListener('click', function () {
        var open = g.box.classList.toggle('is-expanded');
        more.textContent = open ? 'Свернуть' : label;
      });
      g.box.querySelector('.filter__body').appendChild(more);
    });

    function readNumber(input) {
      var v = parseFloat(String(input.value).replace(',', '.'));
      return isNaN(v) ? null : v;
    }
    function readState() {
      var state = { stock: stockInput.checked, checks: {}, ranges: {} };
      checkGroups.forEach(function (g) {
        var picked = g.inputs.filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
        if (picked.length) state.checks[g.key] = picked;
      });
      ranges.forEach(function (r) {
        var from = readNumber(r.from), to = readNumber(r.to);
        if (from !== null || to !== null) state.ranges[r.key] = [from, to];
      });
      return state;
    }

    // в одном поле значения через «ИЛИ», между полями — «И»; skip — поле, для которого считаем счётчики
    function matches(p, state, skip) {
      if (state.stock && p.stock !== 'in') return false;
      for (var key in state.checks) {
        if (key === skip) continue;
        var has = valuesOf(p, key);
        if (!state.checks[key].some(function (v) { return has.indexOf(v) !== -1; })) return false;
      }
      for (var rk in state.ranges) {
        var x = valueOf(p, rk), r = state.ranges[rk];
        if (typeof x !== 'number' || (r[0] !== null && x < r[0]) || (r[1] !== null && x > r[1])) return false;
      }
      return true;
    }

    function sortList(list, mode) {
      return list.slice().sort(function (a, b) {
        if (mode === 'price-asc' || mode === 'price-desc') {
          // товары без цены — после товаров с ценой
          if ((a.price == null) !== (b.price == null)) return a.price == null ? 1 : -1;
          if (a.price !== b.price && a.price != null) return mode === 'price-asc' ? a.price - b.price : b.price - a.price;
          return a.index - b.index;
        }
        return STOCK_ORDER[a.stock] - STOCK_ORDER[b.stock] || a.index - b.index;
      });
    }

    // счётчики у значений: сколько товаров найдётся, если отметить это значение при остальных условиях
    function updateCounts(state) {
      checkGroups.forEach(function (g) {
        var base = products.filter(function (p) { return matches(p, state, g.key); });
        g.inputs.forEach(function (input) {
          var count = base.filter(function (p) { return valuesOf(p, g.key).indexOf(input.value) !== -1; }).length;
          input.disabled = !input.checked && (g.single || count === 0);
          var check = input.closest('.check');
          check.classList.toggle('is-disabled', input.disabled);
          check.querySelector('[data-count]').textContent = count;
        });
      });
    }

    function conditions(state) {
      var list = [];
      if (state.stock) list.push({ label: 'В наличии', clear: function () { stockInput.checked = false; } });
      checkGroups.forEach(function (g) {
        g.inputs.forEach(function (input) {
          if (input.checked) list.push({ label: g.title + ': ' + input.value, clear: function () { input.checked = false; } });
        });
      });
      ranges.forEach(function (r) {
        var v = state.ranges[r.key];
        if (!v) return;
        var text = (v[0] !== null ? 'от ' + num(v[0]) : '') + (v[0] !== null && v[1] !== null ? ' ' : '') + (v[1] !== null ? 'до ' + num(v[1]) : '');
        list.push({ label: r.name + ': ' + text + (r.unit ? ' ' + r.unit : ''), clear: function () { r.from.value = ''; r.to.value = ''; } });
      });
      return list;
    }

    function renderChips(list) {
      chipsEl.textContent = '';
      chipsEl.hidden = !list.length;
      list.forEach(function (c) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.setAttribute('aria-label', 'Убрать условие «' + c.label + '»');
        chip.innerHTML = '<span class="chip__text"></span><svg class="ico" aria-hidden="true"><use href="#i-close"/></svg>';
        chip.firstChild.textContent = c.label;
        chip.addEventListener('click', function () { c.clear(); render(true); });
        chipsEl.appendChild(chip);
      });
      if (list.length) {
        var reset = document.createElement('button');
        reset.type = 'button';
        reset.className = 'chips__reset';
        reset.textContent = 'Сбросить все';
        reset.addEventListener('click', resetAll);
        chipsEl.appendChild(reset);
      }
    }

    function pageLink(n, text, label) {
      var a = document.createElement('a');
      a.className = 'pagination__item';
      a.href = '?page=' + n;
      a.dataset.page = n;
      a.innerHTML = text;
      if (label) a.setAttribute('aria-label', label);
      return a;
    }
    function renderPages(pages, total, shownFrom, shownTo) {
      pagesEl.textContent = '';
      if (pages < 2) return;
      var nav = document.createElement('nav');
      nav.className = 'pagination';
      nav.setAttribute('aria-label', 'Страницы каталога');
      var arrow = '<svg class="ico" aria-hidden="true"><use href="#i-arrow-right"/></svg>';
      if (page > 1) {
        var prev = pageLink(page - 1, arrow, 'Предыдущая страница');
        prev.classList.add('pagination__item--prev');
        nav.appendChild(prev);
      }
      for (var n = 1; n <= pages; n++) {
        // много страниц: первая, последняя и соседние с текущей, между ними «…»
        if (pages > 7 && n !== 1 && n !== pages && Math.abs(n - page) > 1) {
          if (n === 2 || n === pages - 1) {
            var gap = document.createElement('span');
            gap.className = 'pagination__item pagination__item--gap';
            gap.textContent = '…';
            nav.appendChild(gap);
          }
          continue;
        }
        if (n === page) {
          var cur = document.createElement('span');
          cur.className = 'pagination__item';
          cur.setAttribute('aria-current', 'page');
          cur.textContent = n;
          nav.appendChild(cur);
        } else {
          nav.appendChild(pageLink(n, String(n)));
        }
      }
      if (page < pages) nav.appendChild(pageLink(page + 1, arrow, 'Следующая страница'));
      var shown = document.createElement('p');
      shown.className = 'catalog__shown';
      shown.textContent = 'Показано ' + shownFrom + '–' + shownTo + ' из ' + total;
      pagesEl.appendChild(nav);
      pagesEl.appendChild(shown);
    }

    // условия, сортировка и страница — в адресе: ссылкой с фильтрами можно поделиться
    function syncUrl() {
      var params = new URLSearchParams(new FormData(form));
      Array.from(params.keys()).forEach(function (k) { if (!params.get(k)) params.delete(k); });
      if (sortSelect.value) params.set('sort', sortSelect.value);
      if (page > 1) params.set('page', page);
      var qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    }
    function restoreFromUrl() {
      var params = new URLSearchParams(location.search);
      stockInput.checked = params.get('stock') === stockInput.value;
      checkGroups.forEach(function (g) {
        var picked = params.getAll(g.key);
        g.inputs.forEach(function (input) { input.checked = picked.indexOf(input.value) !== -1; });
      });
      ranges.forEach(function (r) {
        r.from.value = params.get(r.from.name) || '';
        r.to.value = params.get(r.to.name) || '';
      });
      if (params.get('sort')) sortSelect.value = params.get('sort');
    }

    function render(toFirstPage) {
      if (toFirstPage) page = 1;
      var state = readState();
      var list = sortList(products.filter(function (p) { return matches(p, state); }), sortSelect.value);
      var pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
      page = Math.min(Math.max(1, page), pages);
      var start = (page - 1) * PER_PAGE;
      var visible = list.slice(start, start + PER_PAGE);

      products.forEach(function (p) { if (cards[p.id]) cards[p.id].hidden = true; });
      visible.forEach(function (p) {
        var card = cards[p.id];
        if (!card) return;
        card.hidden = false;
        grid.appendChild(card); // порядок карточек = порядок сортировки
      });
      grid.hidden = !list.length;
      emptyEl.hidden = !!list.length;
      foundEl.innerHTML = 'Найдено <b>' + list.length + '</b> ' + plural(list.length, 'товар', 'товара', 'товаров');
      totalEl.textContent = goods(list.length);

      var conds = conditions(state);
      badge.hidden = !conds.length;
      badge.textContent = conds.length;
      updateCounts(state);
      renderChips(conds);
      renderPages(pages, list.length, start + 1, start + visible.length);
      syncUrl();
    }

    function resetAll() {
      form.reset();
      render(true);
    }

    // галочки и переключатель — сразу, поля «от — до» — после ввода
    form.addEventListener('change', function (e) {
      if (e.target.classList.contains('range__input')) return;
      render(true);
    });
    var typing;
    form.addEventListener('input', function (e) {
      if (!e.target.classList.contains('range__input')) return;
      clearTimeout(typing);
      typing = setTimeout(function () { render(true); }, 600);
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); render(true); });
    form.addEventListener('reset', function () { setTimeout(function () { render(true); }); });
    sortSelect.addEventListener('change', function () { render(true); });
    each(root, '[data-filters-reset]', function (btn) {
      if (btn.type !== 'reset') btn.addEventListener('click', resetAll);
    });
    pagesEl.addEventListener('click', function (e) {
      var link = e.target.closest('[data-page]');
      if (!link) return;
      e.preventDefault();
      page = Number(link.dataset.page);
      render(false);
      root.scrollIntoView({ behavior: scrollMode, block: 'start' });
    });

    // на телефоне и планшете фильтры открываются в отдельной панели: форма переносится в <dialog> и обратно
    var openBtn = root.querySelector('[data-filters-open]');
    if (dialog && openBtn) {
      openBtn.addEventListener('click', function () {
        dialog.appendChild(form);
        akv.openDialog(dialog);
      });
      each(form, '[data-filters-close]', function (btn) {
        btn.addEventListener('click', function () { akv.closeDialog(dialog); });
      });
      dialog.addEventListener('close', function () { home.appendChild(form); });
      window.matchMedia('(min-width: 1024px)').addEventListener('change', function (e) {
        if (e.matches && dialog.open) akv.closeDialog(dialog);
      });
    }

    restoreFromUrl();
    render(false);
  }

  /* ---------- Карточка товара: фото, увеличенный просмотр, вкладки ---------- */
  var gallery = document.querySelector('[data-gallery]');
  if (gallery) initGallery(gallery);

  function initGallery(box) {
    var main = box.querySelector('[data-gallery-main]');
    var opener = box.querySelector('[data-gallery-open]');
    var thumbs = Array.prototype.slice.call(box.querySelectorAll('[data-gallery-thumb]'));
    var lightbox = document.querySelector('[data-lightbox]');
    if (!main || !opener) return;
    var current = 0;

    function show(i) {
      if (!thumbs.length) return;
      current = (i + thumbs.length) % thumbs.length;
      main.src = thumbs[current].dataset.galleryThumb;
      thumbs.forEach(function (t, k) {
        t.classList.toggle('is-active', k === current);
        if (k === current) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
      });
    }
    thumbs.forEach(function (t, i) { t.addEventListener('click', function () { show(i); }); });
    show(0);

    if (!lightbox) return;
    var big = lightbox.querySelector('[data-lightbox-img]');
    var counter = lightbox.querySelector('[data-lightbox-counter]');
    var steps = lightbox.querySelectorAll('[data-lightbox-step]');
    function showBig(i) {
      show(i);
      big.src = main.src;
      big.alt = main.alt;
      counter.textContent = thumbs.length > 1 ? (current + 1) + ' из ' + thumbs.length : '';
    }
    Array.prototype.forEach.call(steps, function (btn) {
      btn.hidden = thumbs.length < 2;
      btn.addEventListener('click', function () { showBig(current + Number(btn.dataset.lightboxStep)); });
    });
    opener.addEventListener('click', function () { showBig(current); akv.openDialog(lightbox); });
    lightbox.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') showBig(current + 1);
      if (e.key === 'ArrowLeft') showBig(current - 1);
    });
    // клик по затемнению вокруг фото закрывает просмотр
    lightbox.addEventListener('click', function (e) { if (e.target === lightbox) akv.closeDialog(lightbox); });
    // листание пальцем
    var touchX = null;
    lightbox.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener('touchend', function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) showBig(current + (dx < 0 ? 1 : -1));
      touchX = null;
    });
  }

  each(document, '[data-tabs]', function (box) {
    var tabs = Array.prototype.slice.call(box.querySelectorAll('[role="tab"]'));
    function select(tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        var to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (to === undefined) return;
        e.preventDefault();
        select(tabs[(to + tabs.length) % tabs.length], true);
      });
    });
    // «Все характеристики» открывает нужную вкладку и прокручивает к ней
    each(document, '[data-tab-open]', function (link) {
      link.addEventListener('click', function (e) {
        var tab = document.getElementById('tab-' + link.dataset.tabOpen);
        if (!tab || !box.contains(tab)) return;
        e.preventDefault();
        select(tab);
        box.parentNode.scrollIntoView({ behavior: scrollMode, block: 'start' });
      });
    });
  });

  /* ---------- Корзина ---------- */
  var cartEl = document.querySelector('[data-cart]');
  if (cartEl) initCart(cartEl);

  function fillTotals(root, items) {
    var t = cart.totals(items);
    each(root, '[data-cart-qty]', function (el) { el.textContent = t.qty; });
    each(root, '[data-cart-sum]', function (el) { el.textContent = money(t.sum); });
    each(root, '[data-cart-total]', function (el) { el.textContent = money(t.sum); });
  }

  function initCart(box) {
    var list = box.querySelector('[data-cart-list]');
    var tpl = document.getElementById('cart-item');
    var empty = document.querySelector('[data-cart-empty]');

    function rowFor(item) {
      var row = tpl.content.firstElementChild.cloneNode(true);
      row.dataset.id = item.id;
      each(row, '[data-item-link]', function (a) { a.href = item.url; });
      var img = row.querySelector('[data-item-img]');
      if (item.img) { img.src = item.img; img.alt = item.name; } else img.hidden = true; // товар без фото
      row.querySelector('[data-item-name]').textContent = item.name;
      row.querySelector('[data-item-article]').textContent = item.article;
      row.querySelector('[data-item-price]').textContent = money(item.price);
      updateRow(row, item);
      return row;
    }
    function updateRow(row, item) {
      row.querySelector('[data-qty-input]').value = item.qty;
      row.querySelector('[data-item-sum]').textContent = money(item.qty * item.price);
      row.querySelector('[data-qty-step="-1"]').disabled = item.qty <= 1;
      row.querySelector('[data-qty-step="1"]').disabled = item.qty >= 99;
    }
    function draw() {
      var items = cart.read();
      box.hidden = !items.length;
      empty.hidden = !!items.length;
      list.textContent = '';
      items.forEach(function (item) { list.appendChild(rowFor(item)); });
      fillTotals(box, items);
    }
    function change(row, qty) {
      qty = Math.min(99, Math.max(1, Math.round(qty) || 1));
      cart.setQty(row.dataset.id, qty);
      var item = cart.read().filter(function (i) { return i.id === row.dataset.id; })[0];
      if (item) updateRow(row, item);
      fillTotals(box, cart.read());
    }
    list.addEventListener('click', function (e) {
      var row = e.target.closest('.cart-item');
      if (!row) return;
      var step = e.target.closest('[data-qty-step]');
      if (step) change(row, Number(row.querySelector('[data-qty-input]').value) + Number(step.dataset.qtyStep));
      if (e.target.closest('[data-item-remove]')) {
        cart.remove(row.dataset.id);
        draw();
        akv.toast('Товар удалён из корзины');
      }
    });
    list.addEventListener('change', function (e) {
      if (e.target.matches('[data-qty-input]')) change(e.target.closest('.cart-item'), Number(e.target.value));
    });
    // корзину поменяли в другой вкладке
    window.addEventListener('storage', function (e) { if (e.key === akv.cartKey) draw(); });
    draw();
  }

  /* ---------- Оформление заказа ---------- */
  var ORDER_KEY = 'akv-last-order';
  var checkout = document.querySelector('[data-checkout]');
  if (checkout) initCheckout(checkout);

  function fillSummaryItems(root, items) {
    var list = root.querySelector('[data-summary-items]');
    var tpl = document.getElementById('summary-item');
    if (!list || !tpl) return;
    list.textContent = '';
    items.forEach(function (item) {
      var li = tpl.content.firstElementChild.cloneNode(true);
      var img = li.querySelector('[data-item-img]');
      if (item.img) img.src = item.img; else img.hidden = true;
      li.querySelector('[data-item-name]').textContent = item.name;
      li.querySelector('[data-item-qty]').textContent = item.qty + ' шт. × ' + money(item.price);
      li.querySelector('[data-item-sum]').textContent = money(item.qty * item.price);
      list.appendChild(li);
    });
  }

  function initCheckout(form) {
    var items = cart.read();
    var empty = document.querySelector('[data-checkout-empty]');
    form.hidden = !items.length;
    empty.hidden = !!items.length;
    if (!items.length) return;
    fillSummaryItems(form, items);
    fillTotals(form, items);

    var alertBox = form.querySelector('[data-checkout-alert]');
    var DELIVERY_COST = { pickup: 'бесплатно', courier: 'согласует менеджер', cdek: 'по тарифу СДЭК' };
    var costEl = form.querySelector('[data-delivery-cost]');

    function picked(name) { return form.elements[name].value; }
    // блоки, зависящие от выбора: адрес курьера, город СДЭК, реквизиты для счёта; наличные — только при самовывозе
    function sync() {
      each(form, '[data-show-for]', function (el) {
        var rule = el.dataset.showFor.split(':');
        el.hidden = picked(rule[0]) !== rule[1];
      });
      each(form, '[data-only-for]', function (option) {
        var rule = option.dataset.onlyFor.split(':');
        var input = option.querySelector('input');
        var allowed = picked(rule[0]) === rule[1];
        input.disabled = !allowed;
        option.classList.toggle('is-disabled', !allowed);
        if (!allowed && input.checked) form.querySelector('input[name="' + input.name + '"]:not(:disabled)').checked = true;
      });
      costEl.textContent = DELIVERY_COST[picked('delivery')];
    }
    form.addEventListener('change', sync);
    sync();

    form.addEventListener('input', function (e) {
      if (e.target.classList.contains('field__input')) akv.setFieldError(e.target, '');
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'consent' && e.target.checked) form.classList.remove('consent-invalid');
    });

    // поле считается обязательным, только если его блок сейчас показан
    function visible(el) { return !el.closest('[hidden]'); }
    function validate() {
      var errors = [];
      function check(input, ok, message) {
        akv.setFieldError(input, ok ? '' : message);
        if (!ok) errors.push(input);
      }
      var el = form.elements;
      check(el.name, el.name.value.trim().length >= 2, 'Укажите имя');
      check(el.phone, akv.phoneDigits(el.phone.value).length === 11, 'Укажите номер телефона полностью');
      check(el.email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(el.email.value.trim()), 'Укажите электронную почту, например name@mail.ru');
      each(form, '[data-required]', function (input) {
        if (!visible(input)) { akv.setFieldError(input, ''); return; }
        if (input.hasAttribute('data-inn')) check(input, /^(\d{10}|\d{12})$/.test(input.value.trim()), 'ИНН — 10 или 12 цифр');
        else check(input, input.value.trim().length > 0, 'Заполните это поле');
      });
      var consent = el.consent;
      form.classList.toggle('consent-invalid', !consent.checked);
      form.querySelector('.field__error--consent').textContent = consent.checked ? '' : 'Нужно согласие на обработку персональных данных';
      if (!consent.checked) errors.push(consent);
      alertBox.hidden = !errors.length;
      if (errors.length) {
        errors[0].focus({ preventScroll: true });
        errors[0].closest('.checkout__step, .summary').scrollIntoView({ behavior: scrollMode, block: 'start' });
      }
      return !errors.length;
    }

    function describe() {
      var el = form.elements;
      var delivery = {
        pickup: 'Самовывоз: ' + el.store.value,
        courier: 'Курьер по Мариуполю: ' + (el.address.value.trim()),
        cdek: 'СДЭК: ' + el.city.value.trim() + ', ' + el.cdek_point.value.trim()
      }[picked('delivery')];
      var payment = {
        card: 'Банковской картой онлайн',
        invoice: 'По счёту: ' + el.company.value.trim() + ', ИНН ' + el.inn.value.trim(),
        cash: 'Наличными при самовывозе'
      }[picked('payment')];
      return { delivery: delivery, payment: payment };
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validate()) return;
      var btn = form.querySelector('[type="submit"]');
      btn.classList.add('is-loading');
      btn.querySelector('span').textContent = 'Оформляем…';
      var el = form.elements;
      var text = describe();
      var order = {
        number: String(Date.now()).slice(-6),
        items: cart.read(),
        delivery: text.delivery,
        payment: text.payment,
        payOnline: picked('payment') === 'card',
        name: el.name.value.trim(),
        phone: el.phone.value.trim(),
        email: el.email.value.trim()
      };
      // ДЕМО: заказ не отправляется, а показывается на странице подтверждения. В Битриксе — sale.order.ajax
      setTimeout(function () {
        try { sessionStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch (err) { /* без хранилища страница покажет «заказ не найден» */ }
        cart.write([]);
        location.href = form.action;
      }, 700);
    });
  }

  /* ---------- Заказ оформлен ---------- */
  var orderEl = document.querySelector('[data-order]');
  if (orderEl) {
    var order = null;
    try { order = JSON.parse(sessionStorage.getItem(ORDER_KEY) || 'null'); } catch (e) { order = null; }
    var orderEmpty = document.querySelector('[data-order-empty]');
    if (order && order.items && order.items.length) {
      orderEl.hidden = false;
      orderEmpty.hidden = true;
      var put = function (attr, value) { each(orderEl, '[' + attr + ']', function (el) { el.textContent = value; }); };
      put('data-order-number', order.number);
      put('data-order-total', money(cart.totals(order.items).sum));
      put('data-order-delivery', order.delivery);
      put('data-order-payment', order.payment);
      put('data-order-customer', order.name + ', ' + order.phone);
      put('data-order-email', order.email);
      fillSummaryItems(orderEl, order.items);
      orderEl.querySelector('[data-order-pay]').hidden = !order.payOnline;
    }
  }

  /* ---------- Поиск по названию, бренду и артикулу ---------- */
  var searchForm = document.querySelector('[data-search-form]');
  if (searchForm) initSearch(searchForm);

  function initSearch(form) {
    var data = [].concat.apply([], readJson('search-data') || []);
    var input = form.elements.q;
    var grid = document.querySelector('[data-products]');
    var empty = document.querySelector('[data-search-empty]');
    var summary = document.querySelector('[data-search-summary]');
    var cards = {};
    each(grid, '.product-card', function (card) { cards[card.dataset.id] = card; });

    function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim(); }
    function run(query) {
      var words = norm(query).split(' ').filter(Boolean);
      var found = words.length ? data.filter(function (p) {
        var hay = norm([p.name, p.article, p.brand, p.series].join(' '));
        return words.every(function (w) { return hay.indexOf(w) !== -1; });
      }) : [];
      var ids = found.map(function (p) { return p.id; });
      Object.keys(cards).forEach(function (id) { cards[id].hidden = ids.indexOf(id) === -1; });
      grid.hidden = !found.length;
      empty.hidden = !words.length || found.length > 0;
      summary.textContent = !words.length ? 'Введите название, бренд или артикул — например, «Ariston» или «3636151».'
        : found.length ? 'По запросу «' + query + '» ' + plural(found.length, 'найден', 'найдено', 'найдено') + ' ' + goods(found.length) + '.'
        : 'По запросу «' + query + '» ничего не нашлось.';
    }
    input.value = new URLSearchParams(location.search).get('q') || '';
    run(input.value.trim());
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = input.value.trim();
      history.replaceState(null, '', location.pathname + (q ? '?q=' + encodeURIComponent(q) : ''));
      run(q);
    });
  }
})();

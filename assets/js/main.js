/* Акватех — скрипты сайта. Без зависимостей. */
(function () {
  'use strict';

  window.__akvReady = true;
  var doc = document.documentElement;
  var isDemo = doc.dataset.demo === '1';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Уведомление ---------- */
  var toastEl = document.querySelector('.toast');
  var toastTimer;
  function toast(text) {
    if (!toastEl) return;
    toastEl.hidden = false;
    toastEl.textContent = text;
    requestAnimationFrame(function () { toastEl.classList.add('is-visible'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 3200);
  }

  /* ---------- Шапка: тень и компактный каталог при прокрутке ---------- */
  var header = document.getElementById('site-header');
  var nav = document.querySelector('.site-nav');
  var catalogMenu = document.getElementById('catalog-menu');
  var headerCatalog = document.querySelector('.header-catalog');
  if (catalogMenu && headerCatalog) {
    var clone = catalogMenu.cloneNode(true);
    clone.removeAttribute('id');
    headerCatalog.appendChild(clone);
  }
  var ticking = false;
  function updateHeader() {
    ticking = false;
    var stuck;
    if (nav && nav.offsetParent !== null) {
      stuck = nav.getBoundingClientRect().bottom <= header.offsetHeight;
    } else {
      stuck = window.scrollY > 4;
    }
    header.classList.toggle('is-stuck', stuck);
    if (!stuck && headerCatalog && headerCatalog.classList.contains('is-open')) setOpen(headerCatalog, false);
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(updateHeader); }
  }, { passive: true });
  window.addEventListener('resize', updateHeader);
  updateHeader();

  /* ---------- Выпадающие меню (клик, касание, клавиатура) ---------- */
  var dropdowns = Array.prototype.slice.call(document.querySelectorAll('[data-dd]'));
  function setOpen(dd, open) {
    dd.classList.toggle('is-open', open);
    var trigger = dd.querySelector('[data-dd-trigger]');
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeAllDropdowns(except) {
    dropdowns.forEach(function (dd) { if (dd !== except) setOpen(dd, false); });
  }
  var lastPointer = 'mouse';
  document.addEventListener('pointerdown', function (e) { lastPointer = e.pointerType || 'mouse'; }, true);

  dropdowns.forEach(function (dd) {
    var trigger = dd.querySelector('[data-dd-trigger]');
    if (!trigger) return;
    trigger.addEventListener('click', function (e) {
      var isLink = trigger.tagName === 'A';
      var open = dd.classList.contains('is-open');
      // Кнопка без ссылки — всегда переключает. Ссылка — на касании первое нажатие открывает меню
      if (!isLink || (lastPointer !== 'mouse' && !open)) {
        e.preventDefault();
        e.stopPropagation();
        closeAllDropdowns(dd);
        setOpen(dd, !open);
      }
    });
    dd.addEventListener('focusin', function () { closeAllDropdowns(dd); setOpen(dd, true); });
    dd.addEventListener('focusout', function (e) {
      if (!dd.contains(e.relatedTarget)) setOpen(dd, false);
    });
    dd.addEventListener('mouseleave', function () {
      if (!dd.contains(document.activeElement)) setOpen(dd, false);
    });
    dd.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { setOpen(dd, false); trigger.focus(); }
    });
  });
  document.addEventListener('click', function (e) {
    dropdowns.forEach(function (dd) { if (!dd.contains(e.target)) setOpen(dd, false); });
  });

  /* ---------- Диалоги: мобильное меню и всплывающая форма ---------- */
  function openDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function closeDialog(dlg) {
    if (!dlg) return;
    if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open');
  }
  var drawer = document.getElementById('drawer');
  var burger = document.querySelector('[data-open-drawer]');
  if (burger && drawer) {
    burger.addEventListener('click', function () { openDialog(drawer); burger.setAttribute('aria-expanded', 'true'); });
    drawer.addEventListener('close', function () { burger.setAttribute('aria-expanded', 'false'); });
  }
  document.querySelectorAll('dialog').forEach(function (dlg) {
    // клик по затемнению закрывает окно
    dlg.addEventListener('click', function (e) {
      if (e.target !== dlg) return;
      var r = dlg.getBoundingClientRect();
      var inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeDialog(dlg);
    });
    dlg.querySelectorAll('[data-close-dialog]').forEach(function (btn) {
      btn.addEventListener('click', function () { closeDialog(dlg); });
    });
  });
  // Кнопка может задать окну свой заголовок, текст кнопки и название заявки в письме:
  // data-modal-title, data-modal-button, data-modal-form. Без них возвращаются тексты из разметки.
  function customizeModal(dlg, btn) {
    var form = dlg.querySelector('[data-lead-form]');
    [
      [dlg.querySelector('.modal__title'), 'textContent', btn.dataset.modalTitle],
      [form && form.querySelector('[type="submit"] span'), 'textContent', btn.dataset.modalButton],
      [form && form.querySelector('input[name="form"]'), 'value', btn.dataset.modalForm]
    ].forEach(function (item) {
      var el = item[0], prop = item[1];
      if (!el) return;
      if (!('default' in el.dataset)) el.dataset.default = el[prop];
      el[prop] = item[2] || el.dataset.default;
    });
  }
  document.querySelectorAll('[data-open-modal]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var dlg = document.getElementById(btn.getAttribute('data-open-modal'));
      if (!dlg) return;
      resetLeadForm(dlg.querySelector('[data-lead-form]'));
      customizeModal(dlg, btn);
      openDialog(dlg);
    });
  });

  /* ---------- Маска телефона +7 (___) ___-__-__ ---------- */
  function phoneDigits(value) {
    var d = value.replace(/\D/g, '');
    if (!d) return '';
    if (d[0] === '8') d = '7' + d.slice(1);
    else if (d[0] !== '7') d = '7' + d;
    return d.slice(0, 11);
  }
  function formatPhone(d) {
    if (!d) return '';
    var out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ')';
    if (d.length > 4) out += ' ' + d.slice(4, 7);
    if (d.length > 7) out += '-' + d.slice(7, 9);
    if (d.length > 9) out += '-' + d.slice(9, 11);
    return out;
  }
  document.querySelectorAll('[data-phone]').forEach(function (input) {
    input.addEventListener('input', function (e) {
      // при удалении скобки или дефиса не «застреваем» на разделителе
      var d = phoneDigits(input.value);
      if (e.inputType === 'deleteContentBackward' && formatPhone(d) === input.value && /[\s()\-]$/.test(input.value)) {
        d = d.slice(0, -1);
      }
      input.value = formatPhone(d);
    });
    input.addEventListener('focus', function () { if (!input.value) input.value = '+7 ('; });
    input.addEventListener('blur', function () { if (phoneDigits(input.value).length <= 1) input.value = ''; });
  });

  /* ---------- Формы заявок ---------- */
  function setFieldError(input, message) {
    var field = input.closest('.field');
    if (!field) return;
    field.classList.toggle('is-invalid', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    var err = field.querySelector('.field__error');
    if (err) err.textContent = message || '';
  }
  function validateLeadForm(form) {
    var firstInvalid = null;
    var name = form.elements.name;
    var phone = form.elements.phone;
    var consent = form.elements.consent;
    if (name) {
      var ok = name.value.trim().length >= 2;
      setFieldError(name, ok ? '' : 'Укажите, как к вам обращаться');
      if (!ok && !firstInvalid) firstInvalid = name;
    }
    if (phone) {
      var okPhone = phoneDigits(phone.value).length === 11;
      setFieldError(phone, okPhone ? '' : 'Укажите номер телефона полностью');
      if (!okPhone && !firstInvalid) firstInvalid = phone;
    }
    if (consent) {
      form.classList.toggle('consent-invalid', !consent.checked);
      var cErr = form.querySelector('.field__error--consent');
      if (cErr) cErr.textContent = consent.checked ? '' : 'Нужно согласие на обработку персональных данных';
      if (!consent.checked && !firstInvalid) firstInvalid = consent;
    }
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }
  function resetLeadForm(form) {
    if (!form) return;
    var success = form.parentNode.querySelector('.lead-success');
    if (success) success.remove();
    form.hidden = false;
    form.reset();
    form.classList.remove('consent-invalid');
    form.querySelectorAll('.field').forEach(function (f) { f.classList.remove('is-invalid'); });
  }
  function showSuccess(form) {
    var box = document.createElement('div');
    box.className = 'lead-success';
    box.setAttribute('role', 'status');
    box.innerHTML = '<span class="lead-success__icon"><svg class="ico"><use href="#i-check"/></svg></span>' +
      '<p class="lead-success__title"></p>';
    box.querySelector('.lead-success__title').textContent = form.getAttribute('data-success') || 'Спасибо! Мы свяжемся с вами.';
    form.hidden = true;
    form.parentNode.insertBefore(box, form.nextSibling);
  }
  document.querySelectorAll('[data-lead-form]').forEach(function (form) {
    form.addEventListener('input', function (e) {
      if (e.target.name === 'name' || e.target.name === 'phone') setFieldError(e.target, '');
    });
    form.addEventListener('change', function (e) {
      if (e.target.name === 'consent' && e.target.checked) form.classList.remove('consent-invalid');
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validateLeadForm(form)) return;
      var btn = form.querySelector('[type="submit"]');
      var label = btn && btn.querySelector('span');
      var original = label ? label.textContent : '';
      if (btn) btn.classList.add('is-loading');
      if (label) label.textContent = 'Отправляем…';
      var done = function (ok) {
        if (btn) btn.classList.remove('is-loading');
        if (label) label.textContent = original;
        if (ok) showSuccess(form); else toast('Не удалось отправить заявку. Позвоните нам: +7 (949) 006-006-1');
      };
      var data = new FormData(form);
      data.append('page', location.href);
      if (isDemo) { setTimeout(function () { done(true); }, 700); return; }
      // Битрикс: обработчик заявок принимает POST и отвечает JSON {success: true}
      fetch(form.action, { method: 'POST', body: data, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function (r) { return r.ok ? r.json() : { success: false }; })
        .then(function (res) { done(!!(res && res.success)); })
        .catch(function () { done(false); });
    });
  });

  /* ---------- Слайдер отзывов ---------- */
  var track = document.getElementById('reviews-track');
  if (track) {
    var btns = document.querySelectorAll('[data-slide]');
    var step = function () {
      var card = track.querySelector('.review-card');
      var gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return card ? card.getBoundingClientRect().width + gap : track.clientWidth;
    };
    var updateBtns = function () {
      var max = track.scrollWidth - track.clientWidth - 2;
      btns.forEach(function (b) {
        var dir = Number(b.getAttribute('data-slide'));
        b.disabled = dir < 0 ? track.scrollLeft <= 2 : track.scrollLeft >= max;
      });
    };
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        track.scrollBy({ left: Number(b.getAttribute('data-slide')) * step(), behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });
    track.addEventListener('scroll', function () { requestAnimationFrame(updateBtns); }, { passive: true });
    window.addEventListener('resize', updateBtns);
    updateBtns();
  }

  /* ---------- Появление блоков при прокрутке ---------- */
  var reveals = document.querySelectorAll('.reveal');
  if (doc.classList.contains('js') && 'IntersectionObserver' in window && !reduceMotion) {
    reveals.forEach(function (el) {
      var siblings = Array.prototype.filter.call(el.parentNode.children, function (c) { return c.classList.contains('reveal'); });
      var i = siblings.indexOf(el);
      if (i > 0) el.style.transitionDelay = Math.min(i, 5) * 70 + 'ms';
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- Яндекс.Карта: загрузка, когда блок рядом с экраном ---------- */
  var YMAPS_API_KEY = ''; // Битрикс: вставить ключ JavaScript API Яндекс.Карт
  var mapEl = document.getElementById('stores-map');
  function initMap() {
    var points = [];
    try { points = JSON.parse(mapEl.getAttribute('data-points')); } catch (e) { points = []; }
    var ymaps = window.ymaps;
    var narrow = mapEl.offsetWidth < 600;
    var map = new ymaps.Map(mapEl, { center: [47.115, 37.585], zoom: 12, controls: ['zoomControl', 'fullscreenControl'] }, { suppressMapOpenBlock: false, avoidFractionalZoom: !narrow });
    // метка как на макете: «капля» и белая плашка с адресом сбоку (у сервиса тёмная капля с ключом);
    // у стандартных меток Яндекса подпись уходит влево от точки и у края карты обрезается
    var PinLayout = ymaps.templateLayoutFactory.createClass(
      '<div class="ymap-pin{% if properties.service %} ymap-pin--service{% endif %}{% if properties.left %} ymap-pin--left{% endif %}">' +
        '<svg class="ymap-pin__icon" viewBox="0 0 28 36" aria-hidden="true"><path d="M14 35.5S27.5 23.8 27.5 14A13.5 13.5 0 0 0 .5 14c0 9.8 13.5 21.5 13.5 21.5z"/>' +
        '{% if properties.service %}<path class="ymap-pin__wrench" transform="translate(7.5 7.5) scale(.54)" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>' +
        '{% else %}<circle cx="14" cy="14" r="5" fill="#fff"/>{% endif %}</svg>' +
        '<span class="ymap-pin__label">{{ properties.label }}</span>' +
      '</div>'
    );
    var collection = new ymaps.GeoObjectCollection();
    points.forEach(function (p) {
      var w = Math.round(p.t.length * 7.6) + 24; // примерная ширина плашки — для области клика
      collection.add(new ymaps.Placemark(p.c, {
        label: p.t, full: p.t, short: p.short || p.t, service: !!p.service, left: !!p.left,
        hintContent: p.service ? 'Сервисный центр' : 'Магазин Акватех',
        balloonContentHeader: p.service ? 'Сервисный центр Акватех' : 'Магазин Акватех',
        balloonContentBody: 'г. Мариуполь, ' + (p.addr || p.t)
      }, {
        iconLayout: PinLayout,
        iconShape: { type: 'Rectangle', coordinates: p.left ? [[-18 - w, -36], [14, 0]] : [[-14, -36], [18 + w, 0]] },
        balloonOffset: [0, -34]
      }));
    });
    map.geoObjects.add(collection);
    // на масштабе меньше 13 точки сближаются: длинная подпись сервиса наезжает на «Победы», берём короткую
    function fitLabels(zoom) {
      collection.each(function (pm) { pm.properties.set('label', pm.properties.get(zoom < 13 ? 'short' : 'full')); });
    }
    map.events.add('boundschange', function (e) { fitLabels(e.get('newZoom')); });
    if (points.length) {
      // поля: сверху место под каплю, по бокам немного — подписи западных точек идут вправо, восточной влево;
      // на узкой карте дробный масштаб, чтобы точки не слипались на целом меньшем
      map.setBounds(collection.getBounds(), { checkZoomRange: true, zoomMargin: [52, 24, 16, 24], preciseZoom: narrow })
        .then(function () { fitLabels(map.getZoom()); });
    }
    map.behaviors.disable('scrollZoom');
    if (window.matchMedia('(pointer: coarse)').matches) map.behaviors.disable('drag');
    var ph = mapEl.querySelector('.map__placeholder');
    if (ph) ph.remove();
  }
  function loadMap() {
    if (window.ymaps) { window.ymaps.ready(initMap); return; }
    var s = document.createElement('script');
    s.src = 'https://api-maps.yandex.ru/2.1/?lang=ru_RU' + (YMAPS_API_KEY ? '&apikey=' + YMAPS_API_KEY : '');
    s.async = true;
    s.onload = function () { window.ymaps.ready(initMap); };
    s.onerror = function () {
      var ph = mapEl.querySelector('.map__placeholder');
      if (ph) ph.innerHTML = 'Не удалось загрузить карту. <a href="https://yandex.ru/maps/?text=%D0%90%D0%BA%D0%B2%D0%B0%D1%82%D0%B5%D1%85%20%D0%9C%D0%B0%D1%80%D0%B8%D1%83%D0%BF%D0%BE%D0%BB%D1%8C" target="_blank" rel="noopener">Открыть в Яндекс Картах</a>';
    };
    document.head.appendChild(s);
  }
  if (mapEl) {
    if ('IntersectionObserver' in window) {
      var mapIo = new IntersectionObserver(function (entries) {
        if (entries.some(function (en) { return en.isIntersecting; })) { mapIo.disconnect(); loadMap(); }
      }, { rootMargin: '400px 0px' });
      mapIo.observe(mapEl);
    } else {
      loadMap();
    }
  }

  /* ---------- ДЕМО: ссылки на ещё не свёрстанные страницы ----------
     Готовые страницы связаны относительными ссылками, остальные пока ведут от корня сайта (/category/…) */
  var DEMO_NOTES = [
    ['/services/', 'Страницы остальных услуг собираются по шаблону «Ремонт котлов»'],
    ['/articles/', 'Для примера свёрстана одна статья, остальные добавляются в админке']
  ];
  if (isDemo) {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="/"]');
      if (!a || e.defaultPrevented) return;
      e.preventDefault();
      var href = a.getAttribute('href');
      var note = DEMO_NOTES.filter(function (n) { return href.indexOf(n[0]) === 0; })[0];
      toast(note ? note[1] : 'Эта страница появится на следующем этапе');
    });
    document.querySelectorAll('form[role="search"]').forEach(function (f) {
      f.addEventListener('submit', function (e) { e.preventDefault(); toast('Поиск заработает вместе с каталогом'); });
    });
  }

  /* ---------- Мобильное меню закрывается после выбора пункта ---------- */
  if (drawer) {
    drawer.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeDialog(drawer);
    });
  }
})();

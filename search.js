// Site search: a button in the header (or "/" / Ctrl+K) opens a box that searches the FAQ, setup steps, features
// and the Garmin page as you type. Everything runs in the browser; the other page is read once when the box opens.
(function () {
  var PAGES = ['index.html', 'garmin.html'];
  // Words people type that the page says differently
  var SYNONYMS = {
    login: 'sign', log: 'sign', signin: 'sign', password: 'password sign', account: 'account sign',
    lan: 'lan wi-fi wifi', wifi: 'wi-fi lan', 'wi-fi': 'lan', local: 'lan', offline: 'lan wi-fi',
    ip: 'ip lan', code: 'access code', install: 'install download place', setup: 'install place sign',
    add: 'place add', widget: 'widget', watch: 'garmin watch', garmin: 'garmin watch', forerunner: 'garmin',
    lock: 'lock live notification', notification: 'notification live', live: 'live notification update',
    filament: 'filament spool ams', spool: 'filament spool', ams: 'ams humidity filament', humidity: 'humidity ams',
    printer: 'printer', printers: 'printer multiple', multiple: 'multiple several printer', two: 'multiple printer',
    theme: 'theme material liquid neon candy', color: 'theme colour', colour: 'theme colour', dark: 'theme dark',
    free: 'free coffee', price: 'free', cost: 'free', iphone: 'ios', apple: 'apple ios', china: 'chinese',
    camera: 'camera handy', refresh: 'refresh update fast', slow: 'late refresh', late: 'late refresh',
    privacy: 'privacy secure password', safe: 'secure', security: 'secure certificate', apk: 'apk download test',
    battery: 'battery refresh', robot: 'robot', captcha: 'robot', '2fa': 'two-step', mfa: 'two-step'
  };

  function slug(t) {
    return 'q-' + t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  }
  function clean(t) { return (t || '').replace(/\s+/g, ' ').trim(); }

  // Gives every FAQ answer, step and card an id (the same on every visit), so results can link to it
  function entries(doc, page) {
    var list = [];
    function add(el, title, text, kind, section) {
      if (!el.id) el.id = slug(title);
      list.push({ page: page, id: el.id, title: clean(title), text: clean(text), kind: kind, section: section,
                  hay: (clean(title) + ' ' + clean(text) + ' ' + section).toLowerCase() });
    }
    function sectionOf(el) {
      var s = el.closest('section, main');
      var h = s && s.querySelector('h1, h2');
      return h ? clean(h.childNodes[0] ? h.childNodes[0].textContent : h.textContent) : '';
    }
    doc.querySelectorAll('details').forEach(function (d) {
      var sum = d.querySelector('summary');
      if (sum) add(d, sum.textContent, d.textContent.replace(sum.textContent, ''), 'Question', sectionOf(d));
    });
    doc.querySelectorAll('.steps li').forEach(function (li, i) {
      var t = clean(li.textContent);
      add(li, 'Step ' + (i + 1) + ': ' + t.split(/[.:]/)[0], t, 'Setup', sectionOf(li));
    });
    doc.querySelectorAll('.card').forEach(function (c) {
      var h = c.querySelector('h3');
      if (h) add(c, h.textContent, c.textContent.replace(h.textContent, ''), 'Feature', sectionOf(c));
    });
    doc.querySelectorAll('section[id], main').forEach(function (s) {
      var h = s.querySelector('h1, h2'), p = s.querySelector('p');
      if (h) add(h, clean(h.childNodes[0] ? h.childNodes[0].textContent : h.textContent), p ? p.textContent : '', 'Section', '');
    });
    return list;
  }

  var here = (location.pathname.split('/').pop() || 'index.html');
  if (PAGES.indexOf(here) < 0) here = 'index.html';
  var index = entries(document, here);
  var loaded = false;
  function loadOthers() {
    if (loaded) return;
    loaded = true;
    PAGES.filter(function (p) { return p !== here; }).forEach(function (p) {
      fetch(p).then(function (r) { return r.text(); }).then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        index = index.concat(entries(doc, p));
        if (input && input.value) run();
      }).catch(function () {});
    });
  }

  function terms(q) {
    var words = q.toLowerCase().split(/[^a-z0-9\-]+/).filter(function (w) { return w.length > 1 || /\d/.test(w); });
    return words.map(function (w) { return [w].concat((SYNONYMS[w] || '').split(' ').filter(Boolean)); });
  }
  function score(e, groups) {
    var total = 0;
    for (var i = 0; i < groups.length; i++) {
      var best = 0;
      groups[i].forEach(function (w, k) {
        var inTitle = e.title.toLowerCase().indexOf(w) >= 0, inText = e.hay.indexOf(w) >= 0;
        var s = inTitle ? 3 : inText ? 1 : 0;
        if (k > 0) s *= 0.6;   // a synonym counts a bit less than the word itself
        if (s > best) best = s;
      });
      if (!best) return 0;     // every word (or one of its synonyms) must be somewhere
      total += best;
    }
    return total + (e.kind === 'Section' ? 1 : e.kind === 'Question' ? 0.5 : 0);
  }
  function snippet(e, groups) {
    var t = e.text, low = t.toLowerCase(), at = -1;
    groups.some(function (g) { return g.some(function (w) { at = low.indexOf(w); return at >= 0; }); });
    var start = Math.max(0, at - 50), s = (start ? '…' : '') + t.slice(start, start + 150) + (t.length > start + 150 ? '…' : '');
    return mark(s, groups);
  }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mark(s, groups) {
    var out = esc(s);
    groups.forEach(function (g) {
      g.forEach(function (w) {
        if (w.length < 2) return;
        out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
      });
    });
    return out;
  }

  // The box
  var overlay, input, results, active = 0, shown = [];
  function build() {
    overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.innerHTML =
      '<div class="search-box" role="dialog" aria-modal="true" aria-label="Search this site">' +
      '<div class="search-field"><span aria-hidden="true">⌕</span>' +
      '<input type="search" placeholder="Search: sign in, LAN, Garmin, themes…" aria-label="Search" autocomplete="off">' +
      '<button class="search-close" aria-label="Close">Esc</button></div>' +
      '<div class="search-results" role="listbox"></div>' +
      '<p class="search-hint">Try: <a href="#">google login</a> · <a href="#">lan mode</a> · <a href="#">two printers</a> · <a href="#">garmin</a></p>' +
      '</div>';
    document.body.appendChild(overlay);
    input = overlay.querySelector('input');
    results = overlay.querySelector('.search-results');
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    overlay.querySelector('.search-close').addEventListener('click', close);
    overlay.querySelectorAll('.search-hint a').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); input.value = a.textContent; run(); input.focus(); });
    });
    input.addEventListener('input', run);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); select(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); select(active - 1); }
      else if (e.key === 'Enter' && shown[active]) { e.preventDefault(); go(shown[active]); }
    });
  }
  function run() {
    var q = input.value.trim();
    var groups = terms(q);
    if (!groups.length) { results.innerHTML = ''; shown = []; return; }
    shown = index.map(function (e) { return { e: e, s: score(e, groups) }; })
      .filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 8).map(function (x) { return x.e; });
    if (!shown.length) {
      results.innerHTML = '<p class="search-empty">Nothing found. Try other words, or write to <a href="mailto:houmer.dev@gmail.com">houmer.dev@gmail.com</a>.</p>';
      return;
    }
    results.innerHTML = shown.map(function (e, i) {
      return '<a class="search-hit" role="option" href="' + (e.page === here ? '' : e.page) + '#' + e.id + '" data-i="' + i + '">' +
        '<span class="search-kind">' + e.kind + (e.page !== here ? (e.page === 'garmin.html' ? ' · Garmin page' : ' · Main page') : '') + '</span>' +
        '<span class="search-title">' + mark(e.title, groups) + '</span>' +
        '<span class="search-snip">' + snippet(e, groups) + '</span></a>';
    }).join('');
    results.querySelectorAll('.search-hit').forEach(function (a) {
      a.addEventListener('click', function (ev) { ev.preventDefault(); go(shown[+a.dataset.i]); });
      a.addEventListener('mousemove', function () { select(+a.dataset.i, true); });
    });
    select(0, true);
  }
  function select(i, quiet) {
    var hits = results.querySelectorAll('.search-hit');
    if (!hits.length) return;
    active = (i + hits.length) % hits.length;
    hits.forEach(function (h, k) { h.classList.toggle('on', k === active); });
    if (!quiet) hits[active].scrollIntoView({ block: 'nearest' });
  }
  function go(e) {
    if (e.page !== here) { location.href = e.page + '#' + e.id; return; }
    close();
    reveal(e.id);
    history.replaceState(null, '', '#' + e.id);
  }
  function reveal(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'DETAILS') el.open = true;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('search-flash'); void el.offsetWidth; el.classList.add('search-flash');
  }
  function open() {
    if (!overlay) build();
    loadOthers();
    overlay.classList.add('open');
    document.documentElement.classList.add('search-lock');
    input.focus(); input.select();
  }
  function close() {
    overlay.classList.remove('open');
    document.documentElement.classList.remove('search-lock');
  }

  // Header button, keyboard shortcuts, and links from the other page (#q-…)
  document.querySelectorAll('.search-btn').forEach(function (b) { b.addEventListener('click', open); });
  document.addEventListener('keydown', function (e) {
    var typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); open(); }
    else if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) close();
  });
  if (location.hash) setTimeout(function () { reveal(location.hash.slice(1)); }, 50);
})();

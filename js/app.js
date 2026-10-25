import { primary, sources, searchAll } from './provider.js';
import * as P from './player.js';
import { store } from './store.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const ic = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
const img = u => (u ? `<img src="${esc(u)}" alt="" loading="lazy" decoding="async">` : '<div class="ph"></div>');
const enc = encodeURIComponent;
const view = $('#view'), sheet = $('#sheet'), full = $('#full'), mini = $('#mini'), toastEl = $('#toast');
const GENRES = [['Electronic', 'إلكترونية'], ['Hip-Hop/Rap', 'هيب هوب'], ['Pop', 'بوب'], ['Rock', 'روك'], ['Ambient', 'أمبينت'], ['Jazz', 'جاز'], ['Lo-Fi', 'لو-فاي'], ['Alternative', 'بديلة']];

let ctxs = {}, routeName = 'home', token = 0, ac = null, curId = '';

/* ---------- helpers ---------- */
let tt;
function toast(msg, action) {
  clearTimeout(tt);
  toastEl.innerHTML = `<span>${esc(msg)}${action ? `<button class="btn" data-toast>${esc(action.label)}</button>` : ''}</span>`;
  if (action) $('[data-toast]', toastEl).onclick = () => { toastEl.innerHTML = ''; action.run(); };
  tt = setTimeout(() => { toastEl.innerHTML = ''; }, action ? 12000 : 3000);
}
const skeleton = (n = 6) => '<div class="sk"></div>'.repeat(n);
const empty = m => `<div class="box">${esc(m)}</div>`;
const errBox = () => `<div class="box">${navigator.onLine ? 'تعذّر جلب البيانات من المصدر. حاول مجدداً بعد قليل.' : 'لا يوجد اتصال بالإنترنت.'}<br><button class="btn" data-act="retry">إعادة المحاولة</button></div>`;
const rows = (list, key) => {
  ctxs[key] = list;
  return list.map((t, i) => `<div class="row" data-uid="${esc(t.uid)}"><button class="row-main" data-act="play" data-c="${key}" data-i="${i}">${img(t.cover)}<span class="meta"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span></button>
<button class="ib${store.isLiked(t.uid) ? ' on' : ''}" data-act="like" data-c="${key}" data-i="${i}" aria-label="إعجاب">${ic('heart')}</button>
<button class="ib" data-act="more" data-c="${key}" data-i="${i}" aria-label="المزيد">${ic('more')}</button></div>`).join('');
};
const listCards = l => l.map(p => `<a class="card" href="#/album/${p.source}/${enc(p.id)}">${img(p.cover)}<span class="meta"><b>${esc(p.title)}</b><small>${esc(p.owner)}</small></span></a>`).join('');
const artistCards = a => a.map(x => `<a class="card rd" href="#/artist/${x.source}/${enc(x.id)}">${img(x.avatar)}<span class="meta"><b>${esc(x.name)}</b></span></a>`).join('');
const section = (t, body) => (body ? `<h2>${t}</h2>${body}` : '');
const playBar = key => `<div class="acts"><button class="btn" data-act="playall" data-c="${key}">تشغيل</button><button class="btn ghost" data-act="shuffleall" data-c="${key}">عشوائي</button><button class="btn ghost" data-act="enqueueall" data-c="${key}">إلى القائمة</button></div>`;
const followLabel = id => (store.isFollowing(id) ? 'تتابعه' : 'متابعة');

/* ---------- views ---------- */
const V = {
  async home(_, sig) {
    const h = new Date().getHours();
    const hi = h < 5 ? 'مساء الخير' : h < 12 ? 'صباح الخير' : h < 18 ? 'مرحباً' : 'مساء الخير';
    const fol = store.follows().slice(0, 6);
    const [tr, pl, fresh] = await Promise.allSettled([
      primary.trending(null, sig), primary.trendingLists(sig),
      Promise.allSettled(fol.map(a => sources[a.source]?.userTracks(a.id, sig)))
    ]);
    if (tr.status === 'rejected' && pl.status === 'rejected') throw tr.reason;
    const news = fresh.status === 'fulfilled'
      ? fresh.value.flatMap(r => (r.status === 'fulfilled' ? r.value.slice(0, 5) : [])).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8) : [];
    const hist = store.prefs().history ? store.history().slice(0, 10) : [];
    ctxs.hist = hist;
    return `<h1>${hi}</h1><p class="mu">اكتشف موسيقى مرخّصة من فنانين مستقلين</p>
<div class="chips">${GENRES.map(([g, n]) => `<a class="chip" href="#/genre/${enc(g)}">${n}</a>`).join('')}</div>
${section('إصدارات من فنانين تتابعهم', news.length ? rows(news, 'news') : '')}
${section('استمعت مؤخراً', hist.length ? `<div class="rail">${hist.map((t, i) => `<button class="card" data-act="play" data-c="hist" data-i="${i}">${img(t.cover)}<span class="meta"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span></button>`).join('')}</div>` : '')}
${section('الأكثر استماعاً الآن', tr.status === 'fulfilled' ? (tr.value.length ? rows(tr.value.slice(0, 12), 'trend') : empty('لا توجد نتائج حالياً')) : errBox())}
${section('قوائم وألبومات رائجة', pl.status === 'fulfilled' && pl.value.length ? `<div class="rail">${listCards(pl.value)}</div>` : '')}
${section('فنانون تتابعهم', fol.length ? `<div class="rail">${artistCards(fol)}</div>` : '')}`;
  },

  search(_, __, qs) {
    const q0 = qs.get('q') || '';
    return {
      html: `<h1>بحث</h1><form class="search glass" role="search">${ic('search')}<input id="q" type="search" placeholder="أغنية، فنان، ألبوم…" value="${esc(q0)}" enterkeyhint="search" autocomplete="off" aria-label="بحث"></form><div id="res"></div>`,
      after() {
        const inp = $('#q'), res = $('#res');
        let t, c;
        const run = async () => {
          const q = inp.value.trim();
          c?.abort();
          history.replaceState(null, '', '#/search' + (q ? '?q=' + enc(q) : ''));
          if (q.length < 2) { res.innerHTML = q ? '' : empty('ابحث عن أغنية أو فنان أو ألبوم'); return; }
          res.innerHTML = skeleton(4);
          c = new AbortController();
          try {
            const r = await searchAll(q, c.signal);
            if (c.signal.aborted) return;
            ctxs = {};
            res.innerHTML = (r.tracks.length || r.artists.length || r.lists.length)
              ? section('فنانون', r.artists.length ? `<div class="rail">${artistCards(r.artists)}</div>` : '') + section('أغانٍ', rows(r.tracks, 'sr')) + section('ألبومات وقوائم', r.lists.length ? `<div class="rail">${listCards(r.lists)}</div>` : '')
              : empty(`لا توجد نتائج لـ «${q}»`);
            markCurrent();
          } catch (e) { if (e.name !== 'AbortError') res.innerHTML = errBox(); }
        };
        inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 350); });
        inp.form.addEventListener('submit', e => { e.preventDefault(); clearTimeout(t); run(); inp.blur(); });
        run();
        if (!q0) inp.focus({ preventScroll: true });
      }
    };
  },

  async genre([g], sig) {
    const t = await primary.trending(g, sig);
    return `<a class="mu" href="#/">‹ الرئيسية</a><h1>${esc(GENRES.find(x => x[0] === g)?.[1] || g)}</h1>${t.length ? playBar('g') + rows(t, 'g') : empty('لا توجد أغانٍ في هذا التصنيف حالياً')}`;
  },

  async artist([src, id], sig) {
    const s = sources[src];
    if (!s) throw new Error('unknown source');
    const [a, tr] = await Promise.all([s.user(id, sig), s.userTracks(id, sig)]);
    ctxs.artist = a;
    return `<div class="hero rd">${img(a.avatar)}<div class="meta"><b>${esc(a.name)}</b><small>${a.followers.toLocaleString('ar')} متابع · ${a.tracks.toLocaleString('ar')} أغنية</small></div></div>
<div class="acts"><button class="btn" data-act="playall" data-c="at">تشغيل</button><button class="btn ghost${store.isFollowing(a.uid) ? ' on' : ''}" data-act="follow" data-c="artist" id="follow">${followLabel(a.uid)}</button></div>
${a.bio ? `<p class="mu">${esc(a.bio.slice(0, 280))}</p>` : ''}${section('الأغاني', tr.length ? rows(tr, 'at') : empty('لا توجد أغانٍ متاحة للتشغيل'))}`;
  },

  async album([src, id], sig) {
    const l = await sources[src].list(id, sig);
    return `<div class="hero">${img(l.cover)}<div class="meta"><small>${l.isAlbum ? 'ألبوم' : 'قائمة تشغيل'}</small><b>${esc(l.title)}</b><small>${esc(l.owner)} · ${l.tracks.length.toLocaleString('ar')} أغنية</small></div></div>
${l.tracks.length ? playBar('al') + rows(l.tracks, 'al') : empty('لا توجد أغانٍ متاحة للتشغيل')}`;
  },

  library([tab = 'likes']) {
    const tabs = [['likes', 'المفضلة'], ['artists', 'الفنانون'], ['playlists', 'قوائمي'], ['history', 'السجل']];
    let body;
    if (tab === 'likes') { const l = store.likes(); body = l.length ? playBar('lk') + rows(l, 'lk') : empty('لم تضف أي أغنية إلى المفضلة بعد'); }
    else if (tab === 'artists') { const f = store.follows(); body = f.length ? `<div class="rail" style="flex-wrap:wrap">${artistCards(f)}</div>` : empty('لا تتابع أي فنان بعد'); }
    else if (tab === 'playlists') { const p = store.playlists(); body = `<div class="acts"><button class="btn" data-act="newpl">قائمة جديدة</button></div>` + (p.length ? p.map(x => `<a class="row row-main" href="#/pl/${x.id}"><div class="ph"></div><span class="meta"><b>${esc(x.name)}</b><small>${x.tracks.length.toLocaleString('ar')} أغنية</small></span></a>`).join('') : empty('لا توجد قوائم تشغيل بعد')); }
    else { const h = store.history(); body = store.prefs().history ? (h.length ? `<div class="acts"><button class="btn ghost" data-act="clearhist">مسح السجل</button></div>` + rows(h, 'hs') : empty('سجل الاستماع فارغ')) : empty('سجل الاستماع متوقف. يمكنك تفعيله من الإعدادات.'); }
    return `<h1>مكتبتي</h1><div class="chips">${tabs.map(([k, n]) => `<a class="chip${k === tab ? ' on' : ''}" href="#/library/${k}">${n}</a>`).join('')}</div><div style="margin-top:12px">${body}</div>`;
  },

  pl([id]) {
    const p = store.playlist(id);
    if (!p) return empty('هذه القائمة غير موجودة') + '<p><a class="btn" href="#/library/playlists">قوائمي</a></p>';
    return `<a class="mu" href="#/library/playlists">‹ قوائمي</a><h1>${esc(p.name)}</h1><p class="mu">${p.tracks.length.toLocaleString('ar')} أغنية</p>
${p.tracks.length ? playBar('pl') + rows(p.tracks, 'pl') : empty('القائمة فارغة. أضف أغاني من زر «المزيد» بجانب أي أغنية.')}
<div class="acts"><button class="btn ghost" data-act="delpl" data-id="${p.id}">حذف القائمة</button></div>`;
  },

  settings() {
    const pr = store.prefs();
    const install = standalone() ? '<p>التطبيق مثبّت ✓</p>'
      : deferred ? '<button class="btn" data-act="install">تثبيت التطبيق</button>'
      : isIOS() ? '<p>في Safari: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية». التثبيت على iPhone لا يعمل من متصفحات أخرى غير Safari في الإصدارات القديمة.</p>'
      : '<p>من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</p>';
    return `<h1>الإعدادات</h1>
<div class="set glass"><h3>التثبيت</h3>${install}</div>
<div class="set glass"><h3>التشغيل</h3><label class="line"><span>حفظ سجل الاستماع على هذا الجهاز</span><input type="checkbox" class="sw" id="pref-history" ${pr.history ? 'checked' : ''}></label>
<p>${P.volumeSupported ? 'التحكم بالصوت متاح من المشغل.' : 'يتحكم iPhone بمستوى الصوت من أزرار الجهاز فقط.'}</p></div>
<div class="set glass"><h3>الإشعارات</h3><p>غير مفعّلة في هذه النسخة: إشعارات الإصدارات الجديدة تحتاج خادم Web Push ومفاتيح VAPID (راجع README). لا يوجد زر وهمي هنا عمداً.</p></div>
<div class="set glass"><h3>البيانات والخصوصية</h3><p>المفضلة والقوائم والسجل محفوظة على جهازك فقط.</p>
<div class="acts"><button class="btn ghost" data-act="clearhist">مسح السجل</button><button class="btn ghost" data-act="wipe">حذف كل بياناتي</button></div>
<div class="line"><a href="#/legal/privacy">سياسة الخصوصية</a><a href="#/legal/terms">شروط الاستخدام</a></div></div>
<div class="set glass"><h3>عن SyrMusic</h3><p>الإصدار 0.1.0. الموسيقى عبر Audius، وحقوقها محفوظة لفنانيها. يُعرض اسم الفنان في كل مكان، ويمكن فتح الأغنية في Audius من «المزيد».</p></div>`;
  },

  legal([k]) {
    const priv = `<h1>سياسة الخصوصية</h1><div class="prose"><p>نسخة أولية تحتاج مراجعة قانونية قبل الإطلاق العام.</p>
<h2>ما نخزّنه</h2><p>المفضلة وقوائم التشغيل والفنانون المتابَعون وسجل الاستماع وحالة المشغل تُحفظ في تخزين المتصفح على جهازك فقط، ولا نرسلها إلى أي خادم.</p>
<h2>ما نرسله لجهات خارجية</h2><p>عند البحث أو التشغيل يتصل متصفحك مباشرة بخدمة Audius، وتصلها بذلك عنوان IP الخاص بك وكلمات البحث ومعرّف التطبيق. تخضع هذه البيانات لسياسة Audius.</p>
<h2>التحكم</h2><p>يمكنك إيقاف السجل وحذف كل بياناتك من الإعدادات. لا نستخدم أدوات تحليلات أو إعلانات.</p></div>`;
    const terms = `<h1>شروط الاستخدام</h1><div class="prose"><p>نسخة أولية تحتاج مراجعة قانونية قبل الإطلاق العام.</p>
<h2>المحتوى</h2><p>المحتوى الصوتي مقدَّم من Audius وفنانيه ويخضع لشروطهم. لا يجوز إعادة توزيعه أو تنزيله خارج ما تسمح به المنصة.</p>
<h2>الاستخدام</h2><p>الخدمة مجانية «كما هي» دون ضمان استمرار توفر أي أغنية أو مصدر.</p></div>`;
    return `<a class="mu" href="#/settings">‹ الإعدادات</a>${k === 'terms' ? terms : priv}`;
  },

  notfound: () => `${empty('الصفحة غير موجودة')}<p style="text-align:center"><a class="btn" href="#/">الرئيسية</a></p>`,
};

/* ---------- router ---------- */
async function render(keep) {
  const my = ++token;
  const [path, qs = ''] = (location.hash.slice(1) || '/').split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const name = V[parts[0] || 'home'] ? parts[0] || 'home' : 'notfound';
  routeName = name;
  const navOf = { pl: 'library', artist: 'home', album: 'home', genre: 'home', legal: 'settings' }[name] || name;
  $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.nav === navOf));
  ac?.abort(); ac = new AbortController();
  ctxs = {};
  let out;
  try {
    out = V[name](parts.slice(1), ac.signal, new URLSearchParams(qs));
    if (out instanceof Promise) { if (!keep) { view.innerHTML = skeleton(); scrollTo(0, 0); } out = await out; }
  } catch (e) { if (my === token && e.name !== 'AbortError') view.innerHTML = errBox(); return; }
  if (my !== token) return;
  const o = typeof out === 'string' ? { html: out } : out;
  view.innerHTML = o.html;
  if (!keep && !(out instanceof Promise)) scrollTo(0, 0);
  o.after?.();
  markCurrent();
}
addEventListener('hashchange', () => render());

/* ---------- actions ---------- */
function openNewPl(t = null) {
  sheet._t = t;
  sheet.innerHTML = `<h3>قائمة جديدة</h3><input id="plname" maxlength="60" placeholder="اسم القائمة" aria-label="اسم القائمة"><button class="btn" data-s="mk" style="justify-content:center">إنشاء</button>`;
  if (!sheet.open) sheet.showModal();
  $('#plname').focus();
}
function openMore(t, key) {
  sheet._t = t;
  const pid = key === 'pl' ? location.hash.split('/')[2] : null;
  sheet.innerHTML = `<h3>${esc(t.title)}</h3><button data-s="next">تشغيل بعد الحالية</button><button data-s="queue">إضافة إلى قائمة الانتظار</button>
${t.artistId ? `<a href="#/artist/${t.source}/${enc(t.artistId)}" data-s="close">الذهاب إلى الفنان</a>` : ''}${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener" data-s="close">فتح في Audius</a>` : ''}
${pid ? `<button data-s="rm" data-id="${esc(pid)}">إزالة من هذه القائمة</button>` : ''}
<h4>إضافة إلى قائمة تشغيل</h4>${store.playlists().map(p => `<button data-s="pl" data-id="${p.id}">${esc(p.name)}</button>`).join('')}<button data-s="newpl">+ قائمة جديدة</button>`;
  sheet.showModal();
}
sheet.addEventListener('click', e => {
  if (e.target === sheet) return sheet.close();
  const b = e.target.closest('[data-s]');
  if (!b) return;
  const t = sheet._t, k = b.dataset.s;
  if (k === 'newpl') return openNewPl(t);
  if (k === 'next') { P.playNext(t); toast('ستُشغَّل بعد الحالية'); }
  else if (k === 'queue') { P.enqueue(t); toast('أُضيفت إلى قائمة الانتظار'); }
  else if (k === 'pl') { store.addToPlaylist(b.dataset.id, t); toast('أُضيفت إلى القائمة'); }
  else if (k === 'rm') store.removeFromPlaylist(b.dataset.id, t.uid);
  else if (k === 'mk') { const p = store.createPlaylist($('#plname').value); if (t) store.addToPlaylist(p.id, t); toast('تم إنشاء القائمة'); }
  sheet.close();
});
sheet.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'plname') $('[data-s=mk]', sheet).click(); });

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, list = ctxs[el.dataset.c] || [], i = +el.dataset.i, t = list[i];
  if (a === 'play') P.setQueue(list, i);
  else if (a === 'playall') list.length && P.setQueue(list, 0);
  else if (a === 'shuffleall') { if (list.length) { if (!P.getState().shuffle) P.toggleShuffle(); P.setQueue(list, Math.floor(Math.random() * list.length)); } }
  else if (a === 'enqueueall') { list.forEach(P.enqueue); toast('أُضيفت إلى قائمة الانتظار'); }
  else if (a === 'like') store.toggleLike(t);
  else if (a === 'more') openMore(t, el.dataset.c);
  else if (a === 'follow') { const a2 = ctxs.artist; store.toggleFollow(a2); el.textContent = followLabel(a2.uid); el.classList.toggle('on', store.isFollowing(a2.uid)); }
  else if (a === 'newpl') openNewPl();
  else if (a === 'delpl') { if (confirm('حذف هذه القائمة؟')) { store.deletePlaylist(el.dataset.id); location.hash = '#/library/playlists'; } }
  else if (a === 'clearhist') { store.clearHistory(); toast('تم مسح السجل'); }
  else if (a === 'wipe') { if (confirm('سيتم حذف المفضلة والقوائم والسجل وكل بياناتك المحلية. متابعة؟')) { store.clearAll(); toast('تم حذف بياناتك'); } }
  else if (a === 'qplay') P.playAt(i);
  else if (a === 'retry') render();
  else if (a === 'install' && deferred) { deferred.prompt(); deferred.userChoice.finally(() => { deferred = null; render(true); }); }
});
document.addEventListener('change', e => { if (e.target.id === 'pref-history') store.setPref('history', e.target.checked); });

store.bus.addEventListener('change', () => {
  syncLikes();
  if (['library', 'pl', 'settings'].includes(routeName)) render(true);
});
function syncLikes() {
  $$('[data-act=like]').forEach(b => { const t = ctxs[b.dataset.c]?.[+b.dataset.i]; if (t) b.classList.toggle('on', store.isLiked(t.uid)); });
  const c = P.getState().track;
  $('#full-like').classList.toggle('on', !!c && store.isLiked(c.uid));
}

/* ---------- player UI ---------- */
let dragging = false;
const setImg = (el, u) => { if (u) el.src = u; else el.removeAttribute('src'); };
function markCurrent() { $$('.row[data-uid]').forEach(r => r.classList.toggle('on', r.dataset.uid === curId)); }
function paintQueue() {
  const s = P.getState();
  $('#full-queue').innerHTML = s.queue.length ? s.queue.map((t, i) => `<div class="row${i === s.index ? ' on' : ''}"><button class="row-main" data-act="qplay" data-i="${i}">${img(t.cover)}<span class="meta"><b>${esc(t.title)}</b><small>${esc(t.artist)}</small></span></button></div>`).join('') : empty('قائمة الانتظار فارغة');
}
function paintTrack() {
  const s = P.getState(), t = s.track;
  curId = t?.uid || '';
  mini.hidden = !t;
  document.body.style.setProperty('--mini', t ? '64px' : '0px');
  if (t) {
    $('#mini-title').textContent = $('#full-title').textContent = t.title;
    $('#mini-artist').textContent = $('#full-artist').textContent = t.artist;
    setImg($('#mini-cover'), t.cover); setImg($('#full-cover'), t.cover);
    $('#t-dur').textContent = fmt(s.duration);
  }
  markCurrent(); syncLikes(); paintQueue(); paintState();
}
function paintState() {
  const s = P.getState(), pp = ic(s.playing ? 'pause' : 'play');
  $('#mini-play').innerHTML = $('#full-play').innerHTML = pp;
  $('#b-shuffle').classList.toggle('on', s.shuffle);
  const r = $('#b-repeat');
  r.classList.toggle('on', s.repeat !== 'off'); r.dataset.m = s.repeat;
  r.setAttribute('aria-label', { off: 'التكرار متوقف', all: 'تكرار الكل', one: 'تكرار أغنية واحدة' }[s.repeat]);
}
function paintTime() {
  const s = P.getState(), d = s.duration || 0;
  $('#mini-bar').style.transform = `scaleX(${d ? Math.min(1, s.time / d) : 0})`;
  if (dragging) return;
  $('#seek').value = d ? Math.round((s.time / d) * 1000) : 0;
  $('#t-cur').textContent = fmt(s.time); $('#t-dur').textContent = fmt(d);
}
P.player.addEventListener('track', paintTrack);
P.player.addEventListener('state', paintState);
P.player.addEventListener('time', paintTime);
P.player.addEventListener('error', e => toast(`تعذّر تشغيل «${e.detail?.title || 'الأغنية'}»` + (navigator.onLine ? '' : ' — لا يوجد اتصال')));
P.player.addEventListener('blocked', () => toast('اضغط زر التشغيل للمتابعة'));

document.addEventListener('click', e => {
  const b = e.target.closest('[data-p]');
  if (!b) return;
  const k = b.dataset.p;
  if (k === 'toggle') P.toggle(); else if (k === 'next') P.next(true); else if (k === 'prev') P.prev();
  else if (k === 'shuffle') P.toggleShuffle(); else if (k === 'repeat') P.cycleRepeat();
  else if (k === 'like') { const t = P.getState().track; if (t) store.toggleLike(t); }
});
const seekEl = $('#seek');
seekEl.addEventListener('input', () => { dragging = true; $('#t-cur').textContent = fmt((seekEl.value / 1000) * P.getState().duration); });
seekEl.addEventListener('change', () => { P.seek((seekEl.value / 1000) * P.getState().duration); dragging = false; });
const vol = $('#vol');
$('#vol-wrap').hidden = !P.volumeSupported;
vol.addEventListener('input', () => P.setVolume(vol.value / 100));

function openFull() { if (!P.getState().track) return; full.inert = false; full.classList.add('open'); vol.value = Math.round(P.getState().volume * 100); history.pushState({ full: 1 }, ''); $('#full-close').focus(); }
function closeFull(fromPop) { if (!full.classList.contains('open')) return; full.classList.remove('open'); full.inert = true; if (!fromPop && history.state?.full) history.back(); }
full.inert = true;
$('#mini-open').addEventListener('click', openFull);
$('#full-close').addEventListener('click', () => closeFull());
addEventListener('popstate', () => { if (!history.state?.full) closeFull(true); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeFull(); });
$('#full-qbtn').addEventListener('click', e => {
  const on = $('#full-queue').hidden;
  $('#full-queue').hidden = !on; $('#full-body').hidden = on; e.currentTarget.setAttribute('aria-pressed', String(on));
});

/* ---------- install, network, service worker ---------- */
let deferred = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (routeName === 'settings') render(true); });
addEventListener('appinstalled', () => { deferred = null; toast('تم تثبيت SyrMusic'); if (routeName === 'settings') render(true); });
const net = () => { $('#offline').hidden = navigator.onLine; };
addEventListener('online', net); addEventListener('offline', net); net();

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      const ask = w => toast('يتوفر تحديث للتطبيق', { label: 'تحديث', run: () => w.postMessage('SKIP_WAITING') });
      if (reg.waiting && hadController) ask(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    } catch { /* app works without a service worker */ }
  });
}

/* ---------- boot ---------- */
P.restore();
paintTrack();
render();

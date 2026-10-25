// One <audio> element for the whole app lifetime (the app is a SPA, so navigation never recreates it).
import { store } from './store.js';

const audio = new Audio();
audio.preload = 'metadata';
audio.setAttribute('playsinline', '');
export const player = new EventTarget();
export const volumeSupported = (() => { try { const a = new Audio(); a.volume = 0.5; return a.volume === 0.5; } catch { return false; } })();

const S = { queue: [], index: -1, repeat: 'off', shuffle: false, fails: 0, logged: '' };
const emit = (t, d) => player.dispatchEvent(new CustomEvent(t, { detail: d }));
const cur = () => S.queue[S.index] || null;
const hasNext = () => S.queue.length > 1 && (S.shuffle || S.repeat === 'all' || S.index < S.queue.length - 1);
const mediaSession = 'mediaSession' in navigator ? navigator.mediaSession : null;

export const getState = () => ({
  queue: S.queue, index: S.index, track: cur(), repeat: S.repeat, shuffle: S.shuffle,
  playing: !audio.paused && !audio.ended, time: audio.currentTime || 0,
  duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : cur()?.duration || 0,
  volume: audio.volume,
});

let savedAt = 0;
function persist(force) {
  const n = Date.now();
  if (!force && n - savedAt < 4000) return;
  savedAt = n;
  store.set('player', { queue: S.queue, index: S.index, repeat: S.repeat, shuffle: S.shuffle, time: audio.currentTime || 0, volume: audio.volume });
}

function setMeta() {
  if (!mediaSession) return;
  const t = cur();
  mediaSession.metadata = t ? new MediaMetadata({ title: t.title, artist: t.artist, album: 'SyrMusic', artwork: t.cover ? [{ src: t.cover, sizes: '480x480' }] : [] }) : null;
}
function setPosition() {
  const d = audio.duration;
  if (!mediaSession?.setPositionState || !Number.isFinite(d) || d <= 0) return;
  try { mediaSession.setPositionState({ duration: d, playbackRate: audio.playbackRate || 1, position: Math.min(audio.currentTime, d) }); } catch {}
}

function load(i, { autoplay = true, at = 0 } = {}) {
  const t = S.queue[i];
  if (!t) return;
  S.index = i;
  audio.src = t.src;
  if (at > 0) audio.addEventListener('loadedmetadata', () => { try { audio.currentTime = at; } catch {} }, { once: true });
  setMeta(); emit('track');
  if (autoplay) audio.play().catch(onPlayError);
  persist(true);
}
function onPlayError(e) {
  if (e?.name === 'NotAllowedError') return emit('blocked');
  if (e?.name === 'AbortError') return;
  fail();
}
function fail() {
  emit('error', cur());
  if (++S.fails < 3 && hasNext()) next(true); else { S.fails = 0; audio.pause(); }
}

export function setQueue(tracks, i = 0) { S.queue = tracks.slice(0, 200); S.fails = 0; load(i); }
export function enqueue(t) { S.queue.push(t); if (S.index < 0) load(0); else { emit('track'); persist(true); } }
export function playNext(t) { if (S.index < 0) return enqueue(t); S.queue.splice(S.index + 1, 0, t); emit('track'); persist(true); }
export function playAt(i) { load(i); }

export function toggle(force) {
  const want = force === undefined ? audio.paused : force;
  if (want) { if (cur()) audio.play().catch(onPlayError); } else audio.pause();
}
export function next(user) {
  if (!S.queue.length) return;
  if (S.shuffle && S.queue.length > 1) { let j; do j = Math.floor(Math.random() * S.queue.length); while (j === S.index); return load(j); }
  if (S.index < S.queue.length - 1) return load(S.index + 1);
  if (S.repeat === 'all') return load(0);
  audio.pause(); audio.currentTime = 0; emit('state');
}
export function prev() { if (audio.currentTime > 3 || S.index <= 0) seek(0); else load(S.index - 1); }
export function seek(t) { if (Number.isFinite(t)) { audio.currentTime = Math.max(0, Math.min(t, audio.duration || t)); setPosition(); } }
export function setVolume(v) { audio.volume = Math.max(0, Math.min(1, v)); persist(true); }
export function cycleRepeat() { S.repeat = { off: 'all', all: 'one', one: 'off' }[S.repeat]; persist(true); emit('state'); }
export function toggleShuffle() { S.shuffle = !S.shuffle; persist(true); emit('state'); }

export function restore() {
  const s = store.get('player');
  if (!s?.queue?.length) return;
  S.queue = s.queue; S.repeat = s.repeat || 'off'; S.shuffle = !!s.shuffle;
  if (volumeSupported && typeof s.volume === 'number') audio.volume = s.volume;
  load(Math.min(Math.max(s.index, 0), S.queue.length - 1), { autoplay: false, at: s.time || 0 });
  emit('state');
}

audio.addEventListener('play', () => { if (mediaSession) mediaSession.playbackState = 'playing'; emit('state'); });
audio.addEventListener('pause', () => { if (mediaSession) mediaSession.playbackState = 'paused'; emit('state'); persist(true); setPosition(); });
audio.addEventListener('playing', () => {
  S.fails = 0;
  const t = cur();
  if (t && S.logged !== t.uid) { S.logged = t.uid; store.addHistory(t); }
});
audio.addEventListener('timeupdate', () => { emit('time'); persist(false); });
audio.addEventListener('loadedmetadata', () => { setPosition(); emit('time'); });
audio.addEventListener('seeked', setPosition);
audio.addEventListener('waiting', () => emit('buffering', true));
audio.addEventListener('canplay', () => emit('buffering', false));
audio.addEventListener('error', () => { if (audio.getAttribute('src')) fail(); });
audio.addEventListener('ended', () => {
  if (S.repeat === 'one') { audio.currentTime = 0; audio.play().catch(onPlayError); } else next(false);
});

if (mediaSession) {
  // seekbackward/seekforward are deliberately NOT registered: on iOS they replace prev/next on the lock screen.
  const h = { play: () => toggle(true), pause: () => toggle(false), previoustrack: prev, nexttrack: () => next(true), seekto: d => seek(d.seekTime) };
  for (const [k, f] of Object.entries(h)) { try { mediaSession.setActionHandler(k, f); } catch {} }
}

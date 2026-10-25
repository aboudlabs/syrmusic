// Local-first library (localStorage). Nothing leaves the device.
const P = 'syr:';
const bus = new EventTarget();
const read = (k, d) => { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch {} };
const changed = () => bus.dispatchEvent(new Event('change'));
const slim = t => ({ uid: t.uid, id: t.id, source: t.source, title: t.title, artist: t.artist, artistId: t.artistId, cover: t.cover, duration: t.duration, src: t.src, link: t.link });
const uid = () => Math.random().toString(36).slice(2, 10);

export const store = {
  bus, get: (k, d = null) => read(k, d), set: write,
  prefs: () => ({ history: true, ...read('prefs', {}) }),
  setPref(k, v) { write('prefs', { ...store.prefs(), [k]: v }); changed(); },

  likes: () => read('likes', []),
  isLiked: id => read('likes', []).some(t => t.uid === id),
  toggleLike(t) {
    const l = read('likes', []), i = l.findIndex(x => x.uid === t.uid);
    if (i >= 0) l.splice(i, 1); else l.unshift(slim(t));
    write('likes', l); changed(); return i < 0;
  },

  follows: () => read('follows', []),
  isFollowing: id => read('follows', []).some(a => a.uid === id),
  toggleFollow(a) {
    const l = read('follows', []), i = l.findIndex(x => x.uid === a.uid);
    if (i >= 0) l.splice(i, 1); else l.unshift({ uid: a.uid, id: a.id, source: a.source, name: a.name, avatar: a.avatar });
    write('follows', l); changed(); return i < 0;
  },

  playlists: () => read('playlists', []),
  playlist: id => read('playlists', []).find(p => p.id === id) || null,
  createPlaylist(name) {
    const l = read('playlists', []), p = { id: uid(), name: name.trim().slice(0, 60) || 'قائمة جديدة', tracks: [] };
    l.push(p); write('playlists', l); changed(); return p;
  },
  deletePlaylist(id) { write('playlists', read('playlists', []).filter(p => p.id !== id)); changed(); },
  addToPlaylist(id, t) {
    const l = read('playlists', []), p = l.find(x => x.id === id);
    if (!p) return false;
    if (!p.tracks.some(x => x.uid === t.uid)) p.tracks.push(slim(t));
    write('playlists', l); changed(); return true;
  },
  removeFromPlaylist(id, tuid) {
    const l = read('playlists', []), p = l.find(x => x.id === id);
    if (p) { p.tracks = p.tracks.filter(x => x.uid !== tuid); write('playlists', l); changed(); }
  },

  history: () => read('history', []),
  addHistory(t) {
    if (!store.prefs().history) return;
    const h = read('history', []).filter(x => x.uid !== t.uid);
    h.unshift(slim(t)); write('history', h.slice(0, 100));
  },
  clearHistory() { write('history', []); changed(); },
  clearAll() {
    try { Object.keys(localStorage).filter(k => k.startsWith(P)).forEach(k => localStorage.removeItem(k)); } catch {}
    changed();
  },
};

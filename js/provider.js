// Music sources. Each source implements the same small interface, so adding another
// licensed source (e.g. Jamendo) means adding one object to `sources` — no UI changes.
import { CONFIG } from './config.js';

const art = a => (a && (a['480x480'] || a['150x150'] || a['1000x1000'])) || '';

export function url(path, params = {}) {
  const u = new URL(CONFIG.audius.base + path);
  u.searchParams.set('app_name', CONFIG.appName);
  if (CONFIG.audius.apiKey) u.searchParams.set('api_key', CONFIG.audius.apiKey);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function get(path, params, signal) {
  const r = await fetch(url(path, params), { signal });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return j.data ?? [];
}

const playable = t => t && !t.is_delete && t.is_streamable !== false && t.access?.stream !== false;

export const mapTrack = t => ({
  uid: 'audius:' + t.id, id: t.id, source: 'audius',
  title: t.title || '', artist: t.user?.name || '', artistId: t.user?.id,
  cover: art(t.artwork), duration: t.duration || 0,
  date: t.release_date || t.created_at || '',
  src: url(`/v1/tracks/${t.id}/stream`),
  link: t.permalink ? 'https://audius.co' + t.permalink : '',
});
export const mapUser = u => ({
  uid: 'audius:' + u.id, id: u.id, source: 'audius', name: u.name || '', handle: u.handle || '',
  avatar: art(u.profile_picture), banner: art(u.cover_photo),
  followers: u.follower_count || 0, tracks: u.track_count || 0, bio: u.bio || '',
});
export const mapList = p => ({
  id: p.id, source: 'audius', title: p.playlist_name || '', owner: p.user?.name || '',
  cover: art(p.artwork), isAlbum: !!p.is_album, count: p.track_count || 0,
});
const tracks = arr => arr.filter(playable).map(mapTrack);

const audius = {
  id: 'audius', name: 'Audius',
  trending: (genre, s) => get('/v1/tracks/trending', { limit: 25, ...(genre ? { genre } : {}) }, s).then(tracks),
  trendingLists: s => get('/v1/playlists/trending', { limit: 12 }, s).then(a => a.map(mapList)),
  async search(q, s) {
    const p = { query: q, limit: 20 };
    const r = await Promise.allSettled([
      get('/v1/tracks/search', p, s), get('/v1/users/search', p, s), get('/v1/playlists/search', p, s)]);
    if (r.every(x => x.status === 'rejected')) throw r[0].reason;
    const v = i => (r[i].status === 'fulfilled' ? r[i].value : []);
    return { tracks: tracks(v(0)), artists: v(1).map(mapUser), lists: v(2).map(mapList) };
  },
  user: async (id, s) => mapUser((await get('/v1/users/' + encodeURIComponent(id), {}, s))),
  userTracks: (id, s) => get(`/v1/users/${encodeURIComponent(id)}/tracks`, { limit: 30 }, s).then(tracks),
  async list(id, s) {
    const [meta, tr] = await Promise.all([
      get('/v1/playlists/' + encodeURIComponent(id), {}, s),
      get(`/v1/playlists/${encodeURIComponent(id)}/tracks`, {}, s)]);
    const m = Array.isArray(meta) ? meta[0] : meta;
    if (!m) throw new Error('not found');
    return { ...mapList(m), tracks: tracks(tr) };
  },
};

export const sources = { audius };
export const primary = sources.audius;

// Aggregates every source; a failing source never breaks the others.
export async function searchAll(q, signal) {
  const res = await Promise.allSettled(Object.values(sources).map(s => s.search(q, signal)));
  const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value);
  if (!ok.length) throw res[0].reason;
  return { tracks: ok.flatMap(r => r.tracks), artists: ok.flatMap(r => r.artists), lists: ok.flatMap(r => r.lists) };
}

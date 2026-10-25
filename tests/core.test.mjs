import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const realFetch = globalThis.fetch;
const mem = new Map();
globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), get length() { return mem.size; }, key: i => [...mem.keys()][i] };
Object.defineProperty(globalThis.localStorage, 'keys', { value: () => [...mem.keys()] });
// store.clearAll uses Object.keys(localStorage): expose keys as own props for the stub
const { store } = await import('../js/store.js');
const prov = await import('../js/provider.js');

const raw = (id, over = {}) => ({ id, title: 'T' + id, user: { id: 'u1', name: 'Artist' }, artwork: { '480x480': 'https://x/a.jpg' }, duration: 100, permalink: '/artist/t' + id, is_streamable: true, ...over });

test('mapTrack builds a stream URL with app_name and no secrets', () => {
  const t = prov.mapTrack(raw('abc'));
  assert.equal(t.uid, 'audius:abc');
  const u = new URL(t.src);
  assert.equal(u.pathname, '/v1/tracks/abc/stream');
  assert.equal(u.searchParams.get('app_name'), 'SyrMusic');
  assert.ok(!/bearer|secret/i.test(t.src));
});

test('search filters gated/deleted tracks and survives a failing endpoint', async () => {
  globalThis.fetch = async (u) => {
    const p = new URL(u).pathname;
    if (p.includes('/users/search')) return { ok: false, status: 500 };
    if (p.includes('/tracks/search')) return { ok: true, json: async () => ({ data: [raw('1'), raw('2', { is_delete: true }), raw('3', { access: { stream: false } }), raw('4', { is_streamable: false })] }) };
    return { ok: true, json: async () => ({ data: [] }) };
  };
  const r = await prov.searchAll('x');
  assert.deepEqual(r.tracks.map(t => t.id), ['1']);
  assert.deepEqual(r.artists, []);
});

test('search rejects (error state) when every request fails', async () => {
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(prov.searchAll('x'));
});

test('likes, follows, playlists, history', () => {
  const t = prov.mapTrack(raw('9'));
  assert.equal(store.toggleLike(t), true); assert.ok(store.isLiked(t.uid));
  assert.equal(store.toggleLike(t), false); assert.ok(!store.isLiked(t.uid));
  const p = store.createPlaylist('  مفضلتي  ');
  store.addToPlaylist(p.id, t); store.addToPlaylist(p.id, t);
  assert.equal(store.playlist(p.id).tracks.length, 1);
  store.removeFromPlaylist(p.id, t.uid); assert.equal(store.playlist(p.id).tracks.length, 0);
  store.addHistory(t); assert.equal(store.history().length, 1);
  store.setPref('history', false); store.addHistory(prov.mapTrack(raw('10'))); assert.equal(store.history().length, 1);
});

test('PWA files are consistent', () => {
  const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  for (const i of m.icons) assert.ok(existsSync(i.src), i.src);
  const sw = readFileSync('sw.js', 'utf8');
  for (const f of [...sw.matchAll(/'((?:[\w./-]+))'/g)].map(x => x[1]).filter(x => /\.(js|css|png|html|webmanifest)$/.test(x))) assert.ok(existsSync(f), 'SW shell file missing: ' + f);
  assert.equal(m.theme_color, '#0B0A12'); assert.equal(m.dir, 'rtl');
});

test('static server serves the app shell', async () => {
  const { server } = await import('../tools/serve.mjs');
  await new Promise(r => server.listen(0, r));
  globalThis.fetch = realFetch;
  const base = 'http://localhost:' + server.address().port;
  for (const [p, type] of [['/', 'text/html'], ['/js/app.js', 'javascript'], ['/sw.js', 'javascript'], ['/manifest.webmanifest', 'manifest'], ['/icons/icon-512.png', 'png']]) {
    const r = await fetch(base + p); assert.equal(r.status, 200, p); assert.ok(r.headers.get('content-type').includes(type), p);
  }
  server.closeAllConnections?.(); server.close();
});

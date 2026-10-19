import test from 'node:test';
import assert from 'node:assert/strict';
import { findAddresses, resolveAddress } from '../address-lookup.ts';

const reply = result => async () => ({ ok: true, json: async () => ({ code: 2000, result }) });

test('postcode search preserves separate flats and requests UK property results', async () => {
  const items = [{ id: 'mr_flat1', suggestion: 'Flat 1, Example House, London, SW1A 1AA' }, { id: 'mr_flat2', suggestion: 'Flat 2, Example House, London, SW1A 1AA' }];
  const result = await findAddresses('sw1a1aa', 'ak_fixture', undefined, async (url, options) => {
    assert.equal(new URL(url).searchParams.get('query'), 'sw1a1aa');
    assert.equal(new URL(url).searchParams.get('context'), 'GBR');
    assert.equal(new URL(url).searchParams.get('limit'), '100');
    assert.equal(options.headers.Authorization, 'api_key="ak_fixture"');
    assert.ok(!url.includes('ak_fixture'));
    return reply({ hits: items })();
  });
  assert.equal(result.length, 2);
  assert.equal(result[1].id, 'mr_flat2');
});

test('selected property retains flat, building, street, town and postcode', async () => {
  const value = await resolveAddress('mr/example', 'ak_fixture', undefined, async url => {
    assert.ok(url.endsWith('/mr%2Fexample/gbr'));
    return reply({ line_1: 'Flat 12', line_2: 'Example House', line_3: '20 Example Road', post_town: 'London', postcode: 'SW1A 1AA' })();
  });
  assert.equal(value, 'Flat 12, Example House, 20 Example Road, London, SW1A 1AA');
});

test('no key or short search never sends address text', async () => {
  const unexpected = () => { throw Error('Must not call provider'); };
  assert.deepEqual(await findAddresses('SW', '', undefined, unexpected), []);
  await assert.rejects(findAddresses('SW1A 1AA', '', undefined, unexpected), /not configured/);
});

test('offline, exhausted quota and malformed replies surface errors', async () => {
  await assert.rejects(findAddresses('Example', 'ak_fixture', undefined, async () => { throw Error('offline'); }), /offline/);
  await assert.rejects(findAddresses('Example', 'ak_fixture', undefined, async () => ({ ok: false })), /unavailable/);
  await assert.rejects(findAddresses('Example', 'ak_fixture', undefined, async () => ({ ok: true, json: async () => ({ code: 4020 }) })), /unavailable/);
  await assert.rejects(resolveAddress('house', 'ak_fixture', undefined, reply({ line_1: 'Example' })), /Incomplete/);
});

test('empty results are valid and cancellation propagates to the provider', async () => {
  assert.deepEqual(await findAddresses('Unknown', 'ak_fixture', undefined, reply({ hits: [] })), []);
  const controller = new AbortController();
  const pending = findAddresses('Example', 'ak_fixture', controller.signal, async (_url, { signal }) =>
    new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true })));
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});

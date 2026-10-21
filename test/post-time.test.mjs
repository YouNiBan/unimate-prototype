import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPostTime } from '../post-time.ts';
test('relative times and one-week boundary', () => {
  const now = new Date(2026, 9, 28, 12).getTime();
  for (const [age, expected] of [[0, 'Just now'], [60000, '1 minute ago'], [300000, '5 minutes ago'], [3600000, '1 hour ago'], [86400000, '1 day ago'], [7 * 86400000, '7 days ago']]) assert.equal(formatPostTime(now - age, 'EN', now), expected);
  assert.equal(formatPostTime(new Date(2026, 9, 20, 12).getTime(), 'EN', now), '20th October 2026');
  assert.equal(formatPostTime(NaN), '');
  assert.equal(formatPostTime(now + 1000, 'EN', now), 'Just now');
});
test('ordinal dates and Chinese', () => {
  for (const [day, suffix] of [[1,'st'],[2,'nd'],[3,'rd'],[11,'th'],[12,'th'],[13,'th'],[21,'st'],[22,'nd'],[23,'rd'],[31,'st']]) assert.equal(formatPostTime(new Date(2026, 9, day).getTime(), 'EN', new Date(2026, 11, 1).getTime()), `${day}${suffix} October 2026`);
  assert.equal(formatPostTime(0, '简体', 300000), '5 分钟前');
});

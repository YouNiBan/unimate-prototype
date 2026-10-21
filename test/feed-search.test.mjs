import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractForumHashtags, forumMatchesSearch } from '../forum-utils.ts';
test('Moments and Forum share case-insensitive hashtag and text search', () => {
  const caption = 'Jenney He @jenney.he exploring #London #留学 #London';
  const tags = extractForumHashtags(caption);
  assert.deepEqual(tags, ['London', '留学']);
  for (const query of ['Jenney', 'jenney.he', '@jenney.he', 'exploring', '#london', '#留学', 'Jenney #London']) {
    assert.ok(forumMatchesSearch(query, caption, tags), query);
  }
  assert.equal(forumMatchesSearch('#Lon', caption, tags), false);
  assert.equal(forumMatchesSearch('#Paris', caption, tags), false);
});

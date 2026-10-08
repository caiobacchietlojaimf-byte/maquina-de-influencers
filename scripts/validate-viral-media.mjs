import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AI_PROFILES } from '../src/data/ai-profiles.ts';

// Inspect ISO BMFF boxes, including their declared lengths, rather than trusting
// file extensions or finding an arbitrary signature inside compressed data.
function boxes(buffer, start = 0, end = buffer.length) {
  const result = [];
  for (let offset = start; offset < end;) {
    assert(offset + 8 <= end, 'Truncated MP4 box header');
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (size === 1) { size = Number(buffer.readBigUInt64BE(offset + 8)); header = 16; }
    if (size === 0) size = end - offset;
    assert(size >= header && offset + size <= end, `Invalid ${type} box length`);
    result.push({ type, offset, start: offset + header, end: offset + size });
    offset += size;
  }
  return result;
}

const codes = new Set();
let total = 0;
for (const profile of AI_PROFILES) {
  for (const post of profile.posts) {
    try {
      assert(!codes.has(post.code), 'Duplicate post code');
      codes.add(post.code);
      assert.equal(post.video, `/reel-videos/${post.code}.mp4`, 'Missing dedicated local video');
      const buffer = await readFile(new URL(`../public${post.video}`, import.meta.url));
      const top = boxes(buffer);
      assert.equal(top[0]?.type, 'ftyp', 'Not an MP4');
      const moov = top.find(box => box.type === 'moov');
      const mdat = top.find(box => box.type === 'mdat');
      assert(moov && mdat && mdat.end - mdat.start > 1000, 'Missing movie/media payload');
      const children = boxes(buffer, moov.start, moov.end);
      const mvhd = children.find(box => box.type === 'mvhd');
      assert(mvhd, 'Missing movie header');
      const v1 = buffer[mvhd.start] === 1;
      const timescale = buffer.readUInt32BE(mvhd.start + (v1 ? 20 : 12));
      const ticks = v1 ? Number(buffer.readBigUInt64BE(mvhd.start + 24)) : buffer.readUInt32BE(mvhd.start + 16);
      assert(timescale > 0 && ticks / timescale > 0, 'Invalid duration');
      assert(Math.abs(ticks / timescale - post.metrics?.duration) < 0.5, 'Catalog duration differs from media');
      const handlers = children.filter(box => box.type === 'trak').map(track => {
        const mdia = boxes(buffer, track.start, track.end).find(box => box.type === 'mdia');
        assert(mdia, 'Missing track media');
        const hdlr = boxes(buffer, mdia.start, mdia.end).find(box => box.type === 'hdlr');
        assert(hdlr, 'Missing track handler');
        return buffer.toString('ascii', hdlr.start + 8, hdlr.start + 12);
      });
      assert(handlers.includes('vide'), 'Missing video track');
      assert(handlers.includes('soun'), 'Missing audio track');
      const poster = post.thumbnail ?? `/reel-thumbs/${post.code}.jpg`;
      assert.equal(poster, `/reel-thumbs/${post.code}.jpg`, 'Missing dedicated poster');
      const jpeg = await readFile(new URL(`../public${poster}`, import.meta.url));
      assert(jpeg.length > 1000 && jpeg[0] === 0xff && jpeg[1] === 0xd8 && jpeg[2] === 0xff, 'Invalid JPEG poster');
      total += buffer.length;
    } catch (error) {
      throw new Error(`Viral media ${profile.handle}/${post.code}: ${error.message}`, { cause: error });
    }
  }
}
console.log(`Validated ${codes.size} videos with audio, durations and dedicated posters (${(total / 1048576).toFixed(1)} MiB).`);

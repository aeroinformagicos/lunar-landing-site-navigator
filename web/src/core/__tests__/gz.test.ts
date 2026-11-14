// AI-assisted: written with Claude Code, reviewed by team Aeroinformágicos
import { describe, expect, it } from 'vitest';
import { PROFILE_BYTES } from '../constants';
import { gunzip, isGzip, maybeGunzip } from '../gz';
import { exampleBytes } from './fixtures';

describe('gz', () => {
  it('decompresses the example profile to its exact size and header', async () => {
    const gz = exampleBytes('profile/demo-a.bin.gz');
    expect(isGzip(gz)).toBe(true);
    const raw = await gunzip(gz);
    expect(raw.byteLength).toBe(PROFILE_BYTES);
    expect(new TextDecoder().decode(raw.subarray(0, 8))).toBe('LLSNPRF1');
  });

  it('decompresses an ArrayBuffer too', async () => {
    const gz = exampleBytes('compact/regions.bin.gz');
    const raw = await gunzip(gz.slice().buffer);
    expect(new TextDecoder().decode(raw.subarray(0, 8))).toBe('LLSNCMP1');
  });

  it('rejects data without the gzip magic number', async () => {
    await expect(gunzip(new Uint8Array([1, 2, 3]))).rejects.toThrow('Not a gzip stream');
  });

  it('passes through data the host already decompressed', async () => {
    const raw = new TextEncoder().encode('LLSNPRF1 rest');
    expect(await maybeGunzip(raw)).toBe(raw);
  });
});

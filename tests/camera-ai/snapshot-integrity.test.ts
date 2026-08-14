import { describe, it, expect } from 'vitest';
import { extractBlocksFromSnapshot } from '@/server/camera-ai/verify-handler';

describe('extractBlocksFromSnapshot', () => {
  it('should find blocks in canonical object format', () => {
    const content = {
      title: 'Test',
      blocks: [{ id: 'cam1', type: 'camera' }],
      settings: {}
    };
    const blocks = extractBlocksFromSnapshot(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe('cam1');
  });

  it('should find blocks in legacy array format', () => {
    const content = [{ id: 'cam1', type: 'camera' }];
    const blocks = extractBlocksFromSnapshot(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe('cam1');
  });

  it('should return empty array for invalid formats', () => {
    expect(extractBlocksFromSnapshot(null)).toEqual([]);
    expect(extractBlocksFromSnapshot({})).toEqual([]);
    expect(extractBlocksFromSnapshot('invalid')).toEqual([]);
    expect(extractBlocksFromSnapshot({ blocks: 'not-an-array' })).toEqual([]);
  });

  it('should extract the same IDs as the frontend expect', () => {
    const content = {
      blocks: [
        { id: '1', type: 'text' },
        { id: '2', type: 'camera' }
      ]
    };
    const blocks = extractBlocksFromSnapshot(content);
    expect(blocks.map(b => b.id)).toEqual(['1', '2']);
  });
});

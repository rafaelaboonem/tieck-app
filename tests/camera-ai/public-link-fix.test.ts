import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY!;

describe('get_public_checklist regression fix', () => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  it('should fetch checklist by custom_slug', async () => {
    const { data, error } = await supabase.rpc('get_public_checklist', { p_public_id: 'SdJOQV' });
    
    if (error) {
      console.error('RPC Error:', error);
    }
    
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].custom_slug).toBe('SdJOQV');
    expect(data![0].short_slug).toBe('SdJOQV');
    expect(data![0]).toHaveProperty('published_at');
    expect(Array.isArray(data![0].blocks)).toBe(true);
  });

  it('should fetch checklist by UUID', async () => {
    const { data, error } = await supabase.rpc('get_public_checklist', { p_public_id: 'a050976c-d5ed-44a0-af45-791a2c558dd8' });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].id).toBe('a050976c-d5ed-44a0-af45-791a2c558dd8');
  });

  it('should return empty for non-existent ID', async () => {
    const { data, error } = await supabase.rpc('get_public_checklist', { p_public_id: 'non-existent' });
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

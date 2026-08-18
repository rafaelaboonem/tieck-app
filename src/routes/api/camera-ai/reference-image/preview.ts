import { z } from 'zod';
import { createFileRoute } from '@tanstack/react-router';
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/camera-ai/reference-image/preview')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const checklistId = url.searchParams.get('checklistId');
        const storagePath = url.searchParams.get('storagePath');
        const blockId = url.searchParams.get('blockId');
        
        if (!checklistId || !storagePath || !blockId) return new Response('Missing params', { status: 400 });

        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response('Unauthorized', { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const supabase = createServerSupabaseClient();
        if (!supabase) return new Response('Config error', { status: 500 });

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return new Response('Unauthorized', { status: 401 });

        // RBAC check
        const { data: access, error: accessError } = await supabase.rpc('get_checklist_access', {
          p_checklist_id: checklistId,
          p_user_id: user.id
        });

        if (accessError || !access || !access.length || !access[0].can_manage) {
          return new Response('Forbidden', { status: 403 });
        }

        // 1. Storage path must start with checklistId
        if (!storagePath.startsWith(checklistId + '/')) {
          return new Response('Forbidden: Path mismatch', { status: 403 });
        }

        // 2. Fetch the specific block from the checklist to verify metadata matches storagePath
        const { data: checklist, error: chkError } = await supabase
          .from('checklists')
          .select('blocks')
          .eq('id', checklistId)
          .single();

        if (chkError || !checklist) return new Response('Not Found', { status: 404 });

        const blocks = Array.isArray(checklist.blocks) ? checklist.blocks : [];
        const block = blocks.find((b: any) => b.id === blockId);

        if (!block || block.type !== 'camera' || !block.cameraReference) {
          return new Response('Forbidden: Invalid block', { status: 403 });
        }

        if (block.cameraReference.storagePath !== storagePath) {
          return new Response('Forbidden: Metadata mismatch', { status: 403 });
        }

        // Get signed URL (short duration: 5m)
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data, error } = await supabaseAdmin.storage
          .from('camera-references')
          .createSignedUrl(storagePath, 300);

        if (error || !data?.signedUrl) return new Response('Error', { status: 500 });

        return Response.json({ signedUrl: data.signedUrl });
      }
    }
  }
});

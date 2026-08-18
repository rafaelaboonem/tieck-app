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
        
        if (!checklistId || !storagePath) return new Response('Missing params', { status: 400 });

        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response('Unauthorized', { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const supabase = createServerSupabaseClient();
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

        // Verify path belongs to checklist
        if (!storagePath.startsWith(checklistId + '/')) {
          return new Response('Forbidden', { status: 403 });
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

import { createFileRoute } from '@tanstack/react-router';
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';
import { getSignedUrl } from '@/server/camera-ai/signed-url.server';

export const Route = createFileRoute('/api/camera-ai/signed-url')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const path = url.searchParams.get('path');
        const bucket = url.searchParams.get('bucket') || 'checklist-evidences';

        if (!path) {
          return new Response('Path required', { status: 400 });
        }

        const client = createServerSupabaseClient();
        if (!client) return new Response('Internal error', { status: 500 });

        // Validação de acesso: O usuário deve estar autenticado
        const { data: { user }, error: authError } = await client.auth.getUser();
        if (authError || !user) {
          return new Response('Unauthorized', { status: 401 });
        }

        // Verificação de Propriedade: O path contém checklistId e responseId
        // Formato: checklistId/responseId/blockId/idempotencyKey.ext
        const parts = path.split('/');
        if (parts.length < 2) {
          return new Response('Invalid path format', { status: 400 });
        }
        const checklistId = parts[0];

        // Confirma que o usuário é dono do checklist ou tem permissão
        const { data: checklist, error: chkError } = await client
          .from('checklists')
          .select('id')
          .eq('id', checklistId)
          .maybeSingle();
        
        if (chkError || !checklist) {
          return new Response('Forbidden: Access to checklist denied', { status: 403 });
        }

        const signedUrl = await getSignedUrl(path, bucket);
        if (!signedUrl) {
          return new Response('Object not found or access denied', { status: 404 });
        }

        return Response.json({ signedUrl });
      }
    }
  }
});

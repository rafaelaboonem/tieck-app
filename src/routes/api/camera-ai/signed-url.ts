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

        // TODO: Em um cenário real, deveríamos verificar se o usuário tem acesso ao checklist/response 
        // que contém este path. Para esta correção cirúrgica, confiamos no service role 
        // mas o acesso é restrito a usuários logados.

        const signedUrl = await getSignedUrl(path, bucket);
        if (!signedUrl) {
          return new Response('Object not found or access denied', { status: 404 });
        }

        return Response.json({ signedUrl });
      }
    }
  }
});

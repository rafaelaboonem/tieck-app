import { z } from 'zod';
import { createFileRoute } from '@tanstack/react-router';
import { createServerSupabaseClient } from '@/integrations/supabase/client.server';
import { validateImageBuffer } from '@/server/camera-ai/image-validation';
import { createHash } from 'crypto';

const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB

export const Route = createFileRoute('/api/camera-ai/reference-image')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("Authorization");
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return new Response('Unauthorized', { status: 401 });
        }
        const token = authHeader.replace('Bearer ', '');

        const supabase = createServerSupabaseClient();
        if (!supabase) return new Response('Config error', { status: 500 });

        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (authError || !user) return new Response('Unauthorized', { status: 401 });

        let formData: FormData;
        try {
          formData = await request.formData();
        } catch (e) {
          return new Response('Invalid form data', { status: 400 });
        }

        const checklistId = formData.get('checklistId') as string;
        const blockId = formData.get('blockId') as string;
        const file = formData.get('reference') as Blob;

        if (!checklistId || !blockId || !file) {
          return new Response('Missing parameters', { status: 400 });
        }

        // 1. RBAC check via RPC
        const { data: access, error: accessError } = await supabase.rpc('get_checklist_access', {
          p_checklist_id: checklistId,
          p_user_id: user.id
        });

        if (accessError || !access || !access.length) {
          return new Response('Checklist not found', { status: 404 });
        }

        if (!access[0].can_manage) {
          return new Response('Forbidden', { status: 403 });
        }

        // 2. Validate file
        const buffer = await file.arrayBuffer();
        const imgVal = await validateImageBuffer(buffer, file.type);
        if (!imgVal.valid) {
          return new Response(imgVal.message || 'Invalid image', { status: 400 });
        }

        // 3. Immutable storage path: {checklistId}/{blockId}/{sha256}.{ext}
        const sha256 = createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
        const ext = file.type.split('/')[1] || 'jpg';
        const storagePath = `${checklistId}/${blockId}/${sha256}.${ext}`;

        // 4. Upload to private bucket (using service role via admin client for storage bypass if needed, 
        // but since we are server-side and have service role availability, we use supabaseAdmin)
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        
        // Check if exists (idempotency)
        const { data: existing } = await supabaseAdmin.storage
          .from('camera-references')
          .list(`${checklistId}/${blockId}`, { search: sha256 });
        
        if (!existing || existing.length === 0) {
          const { error: uploadError } = await supabaseAdmin.storage
            .from('camera-references')
            .upload(storagePath, buffer, {
              contentType: file.type,
              upsert: false
            });

          if (uploadError && uploadError.message !== 'The resource already exists') {
            return new Response('Upload failed: ' + uploadError.message, { status: 500 });
          }
        }

        // 5. Return metadata
        return Response.json({
          version: 1,
          storagePath,
          mimeType: file.type,
          sha256,
          sizeBytes: buffer.byteLength
        });
      }
    }
  }
});

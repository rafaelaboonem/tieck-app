import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendOverdueAssignmentEmail } from '@/server/team/overdue-email.server';
import { timingSafeEqual } from 'crypto';

export const Route = createFileRoute('/api/public/cron/overdue-assignments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1. Authorization check
        const authHeader = request.headers.get('Authorization');
        const cronSecret = process.env['CRON_SECRET'];
        
        if (!cronSecret) {
          console.error('CRON_SECRET not configured in environment');
          return new Response('Server configuration error', { status: 500 });
        }

        const expected = `Bearer ${cronSecret}`;
        
        // Safe comparison
        if (!authHeader || authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          // 2. Query overdue assignments that haven't been notified yet
          // Logic: due_at < now AND (completed_at IS NULL OR completed_at > due_at) AND overdue_notified_at IS NULL
          const now = new Date().toISOString();
          
          const { data: overdue, error } = await supabaseAdmin
            .from('checklist_assignments')
            .select(\`
              id,
              due_at,
              completed_at,
              checklist_id,
              workspace_id,
              checklists(title),
              workspaces(name, owner_id),
              workspace_members(profiles(display_name, email))
            \`)
            .lt('due_at', now)
            .is('overdue_notified_at', null)
            .or(\`completed_at.is.null,completed_at.gt.due_at\`);

          if (error) throw error;
          if (!overdue || overdue.length === 0) {
            return new Response(JSON.stringify({ processed: 0 }), { 
              status: 200, 
              headers: { 'Content-Type': 'application/json' } 
            });
          }

          const results = [];
          
          for (const assignment of overdue) {
            try {
              // Get Owner Email
              const ownerId = (assignment.workspaces as any)?.owner_id;
              if (!ownerId) continue;
              
              const { data: ownerProfile } = await supabaseAdmin
                .from('profiles')
                .select('email')
                .eq('id', ownerId)
                .single();
              
              if (!ownerProfile?.email) continue;

              // Send Email
              await sendOverdueAssignmentEmail({
                assignmentId: assignment.id,
                checklistTitle: (assignment.checklists as any)?.title || 'Checklist',
                workspaceName: (assignment.workspaces as any)?.name || 'Meu Workspace',
                assigneeName: (assignment.workspace_members as any)?.profiles?.display_name || (assignment.workspace_members as any)?.profiles?.email || 'Membro',
                dueAt: assignment.due_at!,
                ownerEmail: ownerProfile.email,
                isStillPending: !assignment.completed_at
              });

              // Mark as notified
              await supabaseAdmin
                .from('checklist_assignments')
                .update({ overdue_notified_at: new Date().toISOString() })
                .eq('id', assignment.id);

              results.push({ id: assignment.id, status: 'sent' });
            } catch (err: any) {
              console.error(\`Failed to process assignment \${assignment.id}:\`, err);
              results.push({ id: assignment.id, status: 'failed', error: err.message });
            }
          }

          return new Response(JSON.stringify({ processed: results.length, results }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });

        } catch (err: any) {
          console.error('Cron job error:', err);
          return new Response(JSON.stringify({ error: err.message }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }
  }
});

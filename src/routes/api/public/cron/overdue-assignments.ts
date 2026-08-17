import { createFileRoute } from '@tanstack/react-router';
import { supabaseAdmin } from '@/integrations/supabase/client.server';
import { sendOverdueAssignmentEmail } from '@/server/team/overdue-email.server';
import { timingSafeEqual } from 'crypto';

export const Route = createFileRoute('/api/public/cron/overdue-assignments')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get('Authorization');
        const cronSecret = process.env['CRON_SECRET'];
        
        if (!cronSecret) {
          console.error('CRON_SECRET not configured in environment');
          return new Response('Server configuration error', { status: 500 });
        }

        const expected = `Bearer ${cronSecret}`;
        
        if (!authHeader || authHeader.length !== expected.length || !timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))) {
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          const now = new Date();
          
          // Get assignments that passed their deadline and haven't been notified yet
          const { data: candidates, error } = await supabaseAdmin
            .from('checklist_assignments')
            .select(`
              id,
              due_at,
              completed_at,
              checklist_id,
              workspace_id,
              checklists(title),
              workspaces(name, owner_id),
              workspace_members(user_id)
            `)
            .lt('due_at', now.toISOString())
            .is('overdue_notified_at', null);

          if (error) throw error;
          if (!candidates || candidates.length === 0) {
            return new Response(JSON.stringify({ processed: 0 }), { 
              status: 200, 
              headers: { 'Content-Type': 'application/json' } 
            });
          }

          const results = [];
          
          for (const assignment of candidates) {
            try {
              const dueAt = new Date(assignment.due_at!);
              const completedAt = assignment.completed_at ? new Date(assignment.completed_at) : null;
              
              // Business logic:
              // - completed_at NULL + due_at passed = overdue (ATRASADO)
              // - completed_at <= due_at = NOT overdue (OK)
              // - completed_at > due_at = completed late (ATRASADO)
              const isOverdue = !completedAt || completedAt > dueAt;
              
              if (!isOverdue) continue;

              const ownerId = (assignment.workspaces as any)?.owner_id;
              if (!ownerId) continue;
              
              // Resolve owner email using Admin API (source of truth)
              const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(ownerId);
              if (userError || !userData.user?.email) {
                console.error(`Could not resolve email for owner ${ownerId}:`, userError);
                continue;
              }
              
              const ownerEmail = userData.user.email;

              // Resolve assignee name/email fallback
              const member = assignment.workspace_members as any;
              let assigneeName = 'Membro';
              
              if (member?.user_id) {
                // 1. Try profiles.display_name
                const { data: profile } = await supabaseAdmin
                  .from('profiles')
                  .select('display_name')
                  .eq('id', member.user_id)
                  .maybeSingle();
                
                if (profile?.display_name) {
                  assigneeName = profile.display_name;
                } else {
                  // 2. Fallback to auth email
                  const { data: memberData } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
                  if (memberData.user?.email) {
                    assigneeName = memberData.user.email;
                  }
                }
              }

              await sendOverdueAssignmentEmail({
                assignmentId: assignment.id,
                checklistTitle: (assignment.checklists as any)?.title || 'Checklist',
                workspaceName: (assignment.workspaces as any)?.name || 'Meu Workspace',
                assigneeName: assigneeName,
                dueAt: assignment.due_at!,
                completedAt: assignment.completed_at,
                ownerEmail: ownerEmail,
                isStillPending: !assignment.completed_at
              });

              // Only persist notified_at AFTER successful Resend response
              const { error: notifyUpdateError } = await supabaseAdmin
                .from('checklist_assignments')
                .update({ overdue_notified_at: new Date().toISOString() })
                .eq('id', assignment.id);

              if (notifyUpdateError) {
                console.error(`Failed to persist notification status for assignment ${assignment.id}:`, notifyUpdateError);
                results.push({ id: assignment.id, status: 'failed', error: 'Persistence error' });
              } else {
                results.push({ id: assignment.id, status: 'sent' });
              }
            } catch (err: any) {
              console.error(`Failed to process assignment ${assignment.id}:`, err);
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

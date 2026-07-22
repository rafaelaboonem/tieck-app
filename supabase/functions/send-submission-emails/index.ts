import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { checklistId, responseId, answers } = await req.json();

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch checklist and settings
    const { data: checklist, error: checklistError } = await supabaseClient
      .from("checklists")
      .select("*, profiles(plan_type), user_domains!custom_email_domain_id(domain, status)")
      .eq("id", checklistId)
      .single();


    if (checklistError || !checklist) {
      throw new Error("Checklist not found");
    }

    const isPro = checklist.profiles?.plan_type === "pro" || checklist.profiles?.plan_type === "business";
    const settings = checklist.settings || {};

    if (!isPro) {
      return new Response(JSON.stringify({ message: "Not a pro user, skipping emails" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const emailsToSend = [];

    // 1. Notification to Owner
    if (settings.selfEmailNotif) {
      let ownerEmail = settings.ownerEmailAddress;
      
      if (!ownerEmail) {
        // Fallback: get owner's email from auth.users or workspace_members
        const { data: userData, error: userError } = await supabaseClient.rpc('get_user_email_by_id', {
          user_uuid: checklist.user_id
        });
        
        if (!userError && userData) {
          ownerEmail = userData;
        }
      }

      if (ownerEmail) {
        emailsToSend.push({
          to: ownerEmail,
          subject: `Novo envio: ${checklist.title}`,
          html: `
            <h2>Novo envio recebido!</h2>
            <p>Seu checklist "<strong>${checklist.title}</strong>" recebeu uma nova resposta.</p>
            <p><a href="${(Deno.env.get("PUBLIC_URL") || '').replace(/\/+$/, '')}/workspace?id=${checklistId}">Clique aqui para ver os detalhes no painel.</a></p>
          `,
        });
      }
    }

    // 2. Notification to Respondent
    if (settings.respondentEmailNotif && settings.respondentEmailFieldId) {
      const respondentEmail = answers[settings.respondentEmailFieldId];
      if (respondentEmail && typeof respondentEmail === "string") {
        let message = settings.respondentEmailMessage || "Obrigado por responder!";
        message = message.replace("{{title}}", checklist.title);

        let responsesHtml = "";
        if (settings.includeResponsesInEmail) {
          responsesHtml = "<h3>Suas respostas:</h3><ul>";
          const blocks = checklist.blocks || [];
          blocks.forEach((block: any) => {
            if (answers[block.id] !== undefined) {
              const question = block.subtitle || block.placeholder || "Pergunta";
              const answer = answers[block.id];
              responsesHtml += `<li><strong>${question}:</strong> ${Array.isArray(answer) ? answer.join(", ") : answer}</li>`;
            }
          });
          responsesHtml += "</ul>";
        }

        emailsToSend.push({
          to: respondentEmail,
          subject: settings.respondentEmailSubject || "Confirmação de envio",
          html: `
            <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
              <p>${message.replace(/\n/g, "<br>")}</p>
              ${responsesHtml}
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
              <p style="font-size: 12px; color: #999;">Enviado via Amplliar</p>
            </div>
          `,
        });
      }
    }

    // Since we don't have a direct email tool, we'll use a placeholder for the actual sending logic
    // In a real scenario, you'd use Resend, Postmark, or Supabase's internal SMTP
    console.log("Emails to send:", emailsToSend);
    
    // Determine sender address
    const customDomain = checklist.user_domains;
    let fromEmail = "Amplliar <notificacoes@amplliar.com>";
    
    if (customDomain && customDomain.status === 'verified') {
      fromEmail = `Notificações <notificacoes@${customDomain.domain}>`;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (LOVABLE_API_KEY && RESEND_API_KEY) {
      for (const email of emailsToSend) {
        try {
          const response = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": RESEND_API_KEY,
            },
            body: JSON.stringify({
              from: fromEmail,
              to: email.to,
              subject: email.subject,
              html: email.html,
            }),
          });
          if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Failed to send email to ${email.to}: ${response.status} ${errorBody}`);
          }
        } catch (e) {
          console.error(`Failed to send email to ${email.to}:`, e);
        }
      }
    } else {
      console.warn("Resend connector credentials not found. Emails were not sent but were logged.");
    }


    return new Response(JSON.stringify({ success: true, count: emailsToSend.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

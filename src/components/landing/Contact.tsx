import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { sendContactEmails } from "@/lib/contact.functions";

export function Contact() {
  const send = useServerFn(sendContactEmails);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      await send({ data: { name, email, message } });
      setSent(true);
      setName("");
      setEmail("");
      setMessage("");
      toast.success("Mensagem enviada! Verifique sua caixa de entrada.");
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Não foi possível enviar sua mensagem.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="contato" className="py-24 px-6 bg-neutral-50">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-5xl font-extrabold text-neutral-900">
            Fale com a gente
          </h2>
          <p className="mt-4 text-neutral-600 text-lg">
            Envie sua mensagem e retornaremos o mais breve possível.
          </p>
        </div>

        {sent ? (
          <div className="rounded-2xl bg-white border border-neutral-200 p-8 text-center shadow-sm">
            <div className="text-2xl font-bold text-[#FF007F]">Mensagem enviada!</div>
            <p className="mt-2 text-neutral-600">
              Obrigado pelo contato. Enviamos uma confirmação para o seu e-mail.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="mt-6 text-sm font-semibold text-[#FF007F] hover:underline"
            >
              Enviar outra mensagem
            </button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="rounded-2xl bg-white border border-neutral-200 p-8 shadow-sm space-y-4"
          >
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Nome
              </label>
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 focus:border-[#FF007F] focus:outline-none focus:ring-2 focus:ring-[#FF007F]/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                E-mail
              </label>
              <input
                required
                type="email"
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 focus:border-[#FF007F] focus:outline-none focus:ring-2 focus:ring-[#FF007F]/20"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neutral-700 mb-1">
                Mensagem
              </label>
              <textarea
                required
                rows={5}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 focus:border-[#FF007F] focus:outline-none focus:ring-2 focus:ring-[#FF007F]/20 resize-none"
              />
            </div>
            <button
              type="submit"
              disabled={sending}
              className="w-full bg-[#FF007F] text-white font-bold py-4 rounded-lg hover:bg-[#e6006f] transition-colors disabled:opacity-60"
            >
              {sending ? "Enviando..." : "Enviar mensagem"}
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
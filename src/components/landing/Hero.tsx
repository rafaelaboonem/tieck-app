import { Link } from "@tanstack/react-router";
import { m } from "@/lib/motion";
import { CheckCircle2, ArrowRight } from "lucide-react";

export const Hero = () => {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FF007F]/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="max-w-7xl mx-auto px-6 text-center">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="inline-block px-4 py-1.5 rounded-full bg-[#FF007F]/10 text-[#FF007F] text-xs font-bold uppercase tracking-wider mb-6">
            ✨ Simples, Rápido e Gratuito
          </span>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-neutral-900 leading-[1.1] max-w-4xl mx-auto">
            A forma mais <span className="text-[#FF007F]">profissional</span> de criar seus checklists
          </h1>
          <p className="mt-8 text-xl text-neutral-600 max-w-2xl mx-auto leading-relaxed">
            Diga adeus à desorganização. Crie, gerencie e compartilhe checklists intuitivos em segundos. Sem burocracia, apenas produtividade.
          </p>
        </m.div>

        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Link
            to="/checklist"
            className="group bg-[#FF007F] text-white px-8 py-4 rounded-full text-lg font-semibold hover:bg-[#FF007F]/90 transition-all shadow-xl shadow-[#FF007F]/25 flex items-center gap-2"
          >
            Começar agora gratuitamente
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <div className="flex items-center gap-2 text-neutral-500 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            Nenhum cartão necessário
          </div>
        </m.div>

        {/* Mockup Preview */}
        <m.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.4 }}
          className="mt-20 relative max-w-5xl mx-auto"
        >
          <div className="bg-white rounded-2xl shadow-2xl border border-neutral-100 p-4 md:p-8 overflow-hidden">
            <div className="flex items-center gap-2 mb-6 border-b border-neutral-50 pb-4">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <div className="h-6 w-1/3 bg-neutral-100 rounded-md ml-4" />
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-xl bg-neutral-50/50">
                <CheckCircle2 className="w-6 h-6 text-[#FF007F]" />
                <div className="h-4 bg-neutral-200 rounded-md w-full max-w-[280px]" />
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-neutral-50/50">
                <div className="w-6 h-6 rounded-md border-2 border-neutral-200" />
                <div className="h-4 bg-neutral-200 rounded-md w-full max-w-[200px]" />
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl bg-neutral-50/50 opacity-60">
                <div className="w-6 h-6 rounded-md border-2 border-neutral-200" />
                <div className="h-4 bg-neutral-200 rounded-md w-full max-w-[150px]" />
              </div>
              <div className="flex items-center gap-4 p-4 rounded-xl border-2 border-dashed border-neutral-100">
                <div className="w-6 h-6 rounded-md border-2 border-neutral-200" />
                <div className="h-4 bg-neutral-100 rounded-md w-full max-w-[180px]" />
              </div>
            </div>
          </div>
          
          {/* Floating badges */}
          <div className="absolute -top-6 -right-6 bg-white p-4 rounded-2xl shadow-xl border border-neutral-100 hidden md:block">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-neutral-400 uppercase tracking-tighter">Status</p>
                <p className="text-sm font-semibold">Checklist Publicado</p>
              </div>
            </div>
          </div>
        </m.div>
      </div>
    </section>
  );
};

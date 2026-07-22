import { m } from "@/lib/motion";

const steps = [
  {
    number: "01",
    title: "Crie",
    description: "Use nossa interface dinâmica para montar seu checklist em minutos."
  },
  {
    number: "02",
    title: "Configure",
    description: "Ajuste cores, adicione permissões e configure regras de envio."
  },
  {
    number: "03",
    title: "Compartilhe",
    description: "Envie o link para sua equipe ou publique para o mundo todo."
  }
];

export const HowItWorks = () => {
  return (
    <section className="py-24 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row items-center gap-16">
          <div className="flex-1">
            <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 leading-tight">
              Do rascunho à publicação em segundos
            </h2>
            <p className="mt-6 text-lg text-neutral-600 leading-relaxed">
              O Tieck foi desenhado para remover qualquer fricção. Não importa se você está criando uma lista de tarefas pessoal ou um processo complexo para sua empresa.
            </p>
            
            <div className="mt-12 space-y-10">
              {steps.map((step, index) => (
                <m.div 
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="flex gap-6"
                >
                  <span className="text-4xl font-black text-[#FF007F]/10 tabular-nums">
                    {step.number}
                  </span>
                  <div>
                    <h4 className="text-xl font-bold text-neutral-900">{step.title}</h4>
                    <p className="text-neutral-600 mt-1">{step.description}</p>
                  </div>
                </m.div>
              ))}
            </div>
          </div>
          
          <div className="flex-1 relative">
            <m.div
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              className="relative z-10 bg-neutral-900 rounded-[2.5rem] p-4 shadow-2xl rotate-3"
            >
              <div className="bg-white rounded-[2rem] h-[500px] w-full overflow-hidden">
                <div className="p-8 space-y-6">
                  <div className="h-8 w-1/2 bg-[#FF007F]/10 rounded-lg animate-pulse" />
                  <div className="space-y-3">
                    <div className="h-4 w-full bg-neutral-100 rounded" />
                    <div className="h-4 w-3/4 bg-neutral-100 rounded" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-24 bg-neutral-50 rounded-xl border border-neutral-100" />
                    <div className="h-24 bg-neutral-50 rounded-xl border border-neutral-100" />
                  </div>
                  <div className="h-32 bg-neutral-50 rounded-xl border border-neutral-100 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full border-4 border-[#FF007F] border-t-transparent animate-spin" />
                  </div>
                </div>
              </div>
            </m.div>
            
            {/* Decorative background circle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-[#FF007F]/5 rounded-full -z-0" />
          </div>
        </div>
      </div>
    </section>
  );
};

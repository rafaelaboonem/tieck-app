import { m } from "@/lib/motion";
import { Layout, Users, ShieldCheck, BarChart3, Zap, Globe } from "lucide-react";

const features = [
  {
    title: "Checklists Dinâmicos",
    description: "Crie checklists com comandos intuitivos e formatação flexível em segundos.",
    icon: Layout,
    color: "bg-pink-50 text-[#FF007F]"
  },
  {
    title: "Insights em Tempo Real",
    description: "Acompanhe o progresso e analise resultados com gráficos automáticos.",
    icon: BarChart3,
    color: "bg-purple-50 text-purple-600"
  },
  {
    title: "Velocidade Extrema",
    description: "Interface ultra-rápida projetada para produtividade máxima sem esperas.",
    icon: Zap,
    color: "bg-yellow-50 text-yellow-600"
  },
  {
    title: "Publicação Instantânea",
    description: "Compartilhe seus checklists com um clique através de links públicos.",
    icon: Globe,
    color: "bg-indigo-50 text-indigo-600"
  }
];

export const Features = () => {
  return (
    <section className="py-24 bg-neutral-50/50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-neutral-900">Tudo o que você precisa</h2>
          <p className="mt-4 text-neutral-600 max-w-2xl mx-auto text-lg">
            Funcionalidades poderosas envoltas em uma interface que qualquer um sabe usar.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <m.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ y: -5 }}
              className="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm hover:shadow-xl transition-all"
            >
              <div className={`w-14 h-14 ${feature.color} rounded-2xl flex items-center justify-center mb-6`}>
                <feature.icon className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-neutral-900 mb-3">{feature.title}</h3>
              <p className="text-neutral-600 leading-relaxed">{feature.description}</p>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  );
};

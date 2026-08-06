import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MotionProvider, m } from "@/lib/motion";
import { ArrowRight } from "lucide-react";

import logoUrl from "../assets/local/logo-tieck.webp";
import ogImageUrl from "/og-image.webp?url";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Contact } from "@/components/landing/Contact";
import { Footer } from "@/components/landing/Footer";

const ogImageUrl = logoUrl;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tieck — A forma mais simples de criar checklists" },
      { name: "description", content: "Crie checklists de forma simples, rápida e intuitiva. Organize suas tarefas de maneira gratuita e personalizada." },
      { property: "og:title", content: "Tieck — A forma mais simples de criar checklists" },
      { property: "og:description", content: "Crie checklists de forma simples, rápida e intuitiva. Organize suas tarefas de maneira gratuita e personalizada." },
      { property: "og:image", content: ogImageUrl },
      { name: "twitter:image", content: ogImageUrl },
    ],
    links: [
      { rel: "preload", as: "image", href: logoUrl, fetchpriority: "high" } as any,
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate({ to: "/inicio" });
    }
  }, [user, navigate]);

  return (
    <MotionProvider>
    <div className="min-h-screen bg-white text-neutral-900 selection:bg-[#FF007F]/20 selection:text-[#FF007F]">
      <Header />
      
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Contact />

        {/* Final CTA Section */}
        <section className="py-24 px-6">
          <m.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="max-w-5xl mx-auto bg-[#FF007F] rounded-[3rem] p-12 md:p-20 text-center relative overflow-hidden shadow-2xl shadow-[#FF007F]/20"
          >
            {/* Background pattern */}
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="absolute top-0 left-0 w-64 h-64 bg-white rounded-full blur-[80px] -translate-x-1/2 -translate-y-1/2" />
              <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-400 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2" />
            </div>

            <div className="relative z-10">
              <h2 className="text-3xl md:text-6xl font-extrabold text-white leading-tight">
                Pronto para organizar sua vida hoje?
              </h2>
              <p className="mt-6 text-pink-100 text-lg md:text-xl max-w-2xl mx-auto">
                Junte-se a centenas de usuários que já estão simplificando seus processos com o Tieck.
              </p>
              <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6">
                <Link
                  to="/checklist"
                  className="bg-white text-[#FF007F] px-10 py-5 rounded-full text-xl font-bold hover:bg-neutral-50 transition-all shadow-xl flex items-center gap-3"
                >
                  Começar gratuitamente
                  <ArrowRight className="w-6 h-6" />
                </Link>
                <Link
                  to="/cadastro"
                  className="text-white font-semibold hover:underline decoration-2 underline-offset-4"
                >
                  Criar conta profissional
                </Link>
              </div>
            </div>
          </m.div>
        </section>
      </main>

      <Footer />
    </div>
    </MotionProvider>
  );
}

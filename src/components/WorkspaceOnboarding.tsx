import React from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Briefcase, User, BookOpen, Sparkles } from "lucide-react";

interface WorkspaceOnboardingProps {
  isOpen: boolean;
  onSelect: (type: "Pessoal" | "Trabalho" | "Estudos" | "Limpo") => void;
}

export function WorkspaceOnboarding({ isOpen, onSelect }: WorkspaceOnboardingProps) {
  const options = [
    {
      id: "Trabalho" as const,
      title: "Trabalho",
      description: "Organize projetos, sprints e prazos da sua equipe.",
      icon: Briefcase,
      color: "blue",
      bgColor: "bg-blue-50 text-blue-600 border-blue-100",
      hoverBg: "hover:bg-blue-100/50"
    },
    {
      id: "Pessoal" as const,
      title: "Pessoal",
      description: "Gerencie suas finanças, viagens e hobbies em um só lugar.",
      icon: User,
      color: "pink",
      bgColor: "bg-pink-50 text-pink-600 border-pink-100",
      hoverBg: "hover:bg-pink-100/50"
    },
    {
      id: "Estudos" as const,
      title: "Estudos",
      description: "Controle seus cursos, leituras e cronograma de provas.",
      icon: BookOpen,
      color: "emerald",
      bgColor: "bg-emerald-50 text-emerald-600 border-emerald-100",
      hoverBg: "hover:bg-emerald-100/50"
    }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-none bg-white rounded-3xl">
        <div className="bg-gradient-to-br from-[#FF007F]/10 via-white to-[#FF007F]/5 p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-white shadow-xl shadow-[#FF007F]/10 flex items-center justify-center animate-bounce">
              <Sparkles className="w-8 h-8 text-[#FF007F]" />
            </div>
          </div>
          
          <DialogHeader className="text-center mb-8">
            <DialogTitle className="text-2xl font-bold text-neutral-900 mb-2">
              Bora organizar seu espaço?
            </DialogTitle>
            <DialogDescription className="text-neutral-500 text-base">
              Escolha um ponto de partida e nós preparamos tudo para você.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            {options.map((option) => (
              <button
                key={option.id}
                onClick={() => onSelect(option.id)}
                className={`flex items-center gap-4 p-4 rounded-2xl border bg-white transition-all duration-300 group ${option.hoverBg} hover:scale-[1.02] hover:shadow-md text-left`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${option.bgColor} transition-transform group-hover:rotate-6`}>
                  <option.icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-neutral-800 mb-0.5">{option.title}</h3>
                  <p className="text-xs text-neutral-500 leading-relaxed">
                    {option.description}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-8 text-center">
            <button 
              onClick={() => onSelect("Limpo")}
              className="text-xs text-neutral-400 hover:text-neutral-600 underline underline-offset-4 transition-colors"
            >
              Ou comece com um espaço em branco
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

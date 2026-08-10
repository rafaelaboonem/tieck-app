import { useState, useMemo } from "react";
import { Search, ChevronRight, ImageIcon, Info, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { CameraQuestion } from "@/lib/camera-blocks";
import type { VisualStandard } from "@/lib/visual-standards";
import { PadraoHeader, ProjectSelector, ReferenceImageSlot } from "./new-ui/Components";
import { OpenAILabTest } from "./new-ui/OpenAILabTest";

interface StandardWorkspaceProps {
  workspaceId: string;
  project: any;
  question: CameraQuestion | null;
  standard: VisualStandard | null;
  loading: boolean;
  onChanged: () => void;
  projects: any[];
  onProjectChange: (id: string) => void;
  onQuestionChange: (blockId: string) => void;
}

export function StandardWorkspace({
  workspaceId,
  project,
  question,
  standard,
  loading,
  onChanged,
  projects,
  onProjectChange,
  onQuestionChange,
}: StandardWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredQuestions = useMemo(() => {
    if (!project) return [];
    return project.cameraBlocks.filter((q: CameraQuestion) =>
      q.question.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [project, searchQuery]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PadraoHeader />
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Selector */}
        <div className="lg:col-span-4 space-y-6">
          <ProjectSelector
            projects={projects}
            selectedId={project?.id || ""}
            onChange={onProjectChange}
            loading={loading}
          />

          <div className="hidden lg:block space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar pergunta..."
                className="w-full h-10 pl-9 pr-4 rounded-lg border bg-background text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="rounded-xl border bg-background overflow-hidden">
              {project ? (
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {filteredQuestions.length > 0 ? (
                    filteredQuestions.map((q: CameraQuestion) => {
                      const isActive = question?.cameraBlockId === q.cameraBlockId;
                      return (
                        <button
                          key={q.cameraBlockId}
                          onClick={() => onQuestionChange(q.cameraBlockId)}
                          className={cn(
                            "w-full text-left p-4 hover:bg-muted/50 transition-colors flex items-center justify-between gap-3",
                            isActive && "bg-pink-50/50 border-r-2 border-pink-500"
                          )}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">{q.question}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{project.title}</p>
                          </div>
                          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground", isActive && "text-pink-500")} />
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      Nenhuma pergunta encontrada.
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-12 text-center space-y-3">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm text-muted-foreground">Selecione um projeto para ver as perguntas.</p>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Selector */}
          <div className="lg:hidden">
            <label className="text-sm font-medium mb-2 block">Pergunta /Camera</label>
            <select
              className="w-full h-12 px-4 rounded-xl border bg-background"
              value={question?.cameraBlockId || ""}
              onChange={(e) => onQuestionChange(e.target.value)}
              disabled={!project}
            >
              <option value="">Selecione a pergunta</option>
              {project?.cameraBlocks.map((q: CameraQuestion) => (
                <option key={q.cameraBlockId} value={q.cameraBlockId}>{q.question}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Column: Detail */}
        <div className="lg:col-span-8">
          {question ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              {/* Step 1: Pergunta */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                  <span className="h-5 w-5 rounded-full border border-muted-foreground flex items-center justify-center text-[8px]">1</span>
                  Pergunta
                </div>
                <div className="p-6 rounded-2xl border bg-background shadow-sm space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase">{project.title}</p>
                    <h2 className="text-xl font-bold mt-1">“{question.question}”</h2>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <Info className="h-4 w-4 shrink-0" />
                    Esta pergunta vem do checklist e não precisa ser escrita novamente.
                  </div>
                </div>
              </section>

              {/* Step 2: Referências */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                  <span className="h-5 w-5 rounded-full border border-muted-foreground flex items-center justify-center text-[8px]">2</span>
                  Fotos de referência
                </div>
                <div className="p-6 rounded-2xl border bg-background shadow-sm space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <ReferenceImageSlot
                      standard={standard!}
                      position={1}
                      reference={standard?.references?.find(r => r.position === 1)}
                      label="Referência principal"
                      onChanged={onChanged}
                    />
                    <ReferenceImageSlot
                      standard={standard!}
                      position={2}
                      reference={standard?.references?.find(r => r.position === 2)}
                      label="Referência complementar"
                      onChanged={onChanged}
                    />
                  </div>
                  
                  <div className="space-y-4 border-t pt-6">
                    <p className="text-sm text-muted-foreground italic">Use fotos corretas do mesmo local ou item, preferencialmente em ângulos diferentes.</p>
                    <div className="flex items-start gap-3 text-xs text-slate-500 bg-slate-50/50 p-4 rounded-xl border border-dashed">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>As referências orientam a comparação visual. Elas não treinam permanentemente o modelo nem são armazenadas para outros fins.</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Step 3: Teste com IA */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                  <span className="h-5 w-5 rounded-full border border-muted-foreground flex items-center justify-center text-[8px]">3</span>
                  Teste com IA
                </div>
                <div className="p-6 rounded-2xl border bg-background shadow-sm">
                  {standard ? (
                    <OpenAILabTest standard={standard} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 text-slate-300 animate-spin" />
                      </div>
                      <p className="text-sm text-muted-foreground">Inicializando laboratório...</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="h-[600px] rounded-2xl border-2 border-dashed bg-muted/30 flex flex-col items-center justify-center text-center p-8 space-y-4">
              <div className="h-16 w-16 rounded-3xl bg-background shadow-sm flex items-center justify-center border">
                <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Nenhuma pergunta selecionada</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">Selecione uma pergunta ao lado para configurar suas referências e realizar testes.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

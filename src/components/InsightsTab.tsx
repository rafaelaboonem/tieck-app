import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, MousePointer2, Send, Clock, UserMinus, BarChart3, AlertCircle } from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

interface InsightsData {
  visits: number;
  submissions: number;
  uniqueRespondents: number;
  avgDuration: number;
  dropOffs: number;
  dropOffRate: number;
  dropOffAnalysis: Array<{
    blockId: string;
    label: string;
    count: number;
    percentage: number;
  }>;
}

export function InsightsTab({ checklistId }: { checklistId: string }) {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolvedId, setResolvedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      setLoading(true);

      // Resolve checklist id: prop can be either UUID or custom_slug
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      let checklist: { id: string; blocks: any } | null = null;

      if (uuidRegex.test(checklistId)) {
        const { data, error } = await supabase
          .from("checklists")
          .select("id, blocks")
          .eq("id", checklistId)
          .maybeSingle();
        if (error) console.error("[Insights] checklist by id error:", error);
        checklist = data as any;
      }
      if (!checklist) {
        const { data, error } = await supabase
          .from("checklists")
          .select("id, blocks")
          .eq("custom_slug", checklistId)
          .maybeSingle();
        if (error) console.error("[Insights] checklist by slug error:", error);
        checklist = data as any;
      }

      if (!checklist) {
        console.warn("[Insights] checklist not found for:", checklistId);
        setData({ visits: 0, submissions: 0, uniqueRespondents: 0, avgDuration: 0, dropOffs: 0, dropOffRate: 0, dropOffAnalysis: [] });
        setLoading(false);
        return;
      }

      const resolvedChecklistId = checklist.id;
      setResolvedId(resolvedChecklistId);

      const { data: analytics, error } = await supabase
        .from("checklist_analytics")
        .select("*")
        .eq("checklist_id", resolvedChecklistId);

      if (error) {
        console.error("[Insights] analytics error:", error);
      }

      {
        const rows = analytics || [];
        const visits = rows.length;
        const submittedRows = rows.filter(a => a.submitted_at);
        const submissions = submittedRows.length;
        const uniqueRespondents = new Set(rows.map(a => a.visitor_id)).size;

        // Tempo médio de resposta: considera apenas quem enviou
        let totalDuration = 0;
        submittedRows.forEach(a => {
          const start = new Date(a.started_at).getTime();
          const end = new Date(a.submitted_at as string).getTime();
          totalDuration += (end - start);
        });
        const avgDuration = submissions > 0 ? (totalDuration / submissions) / 1000 : 0;

        const dropOffs = visits - submissions;
        const dropOffRate = visits > 0 ? (dropOffs / visits) * 100 : 0;

        // Análise de Abandono
        const blocks = (checklist?.blocks as any[]) || [];
        const interactiveBlocks = blocks.filter(b => 
          ["short-answer", "long-answer", "multiple-choice", "checkboxes", "dropdown", "rating", "date", "time", "image", "file-upload"].includes(b.type)
        );

        const dropOffCounts: Record<string, number> = {};
        interactiveBlocks.forEach(b => {
          dropOffCounts[b.id] = 0;
        });

        // Count drop-offs per block
        rows.forEach(a => {
          if (!a.submitted_at) {
            const metadata = a.metadata as any;
            const lastBlockId = metadata?.last_block_id;
            
            if (lastBlockId && dropOffCounts[lastBlockId] !== undefined) {
              dropOffCounts[lastBlockId]++;
            } else if (!lastBlockId || Object.keys(metadata?.partial_answers || {}).length === 0) {
              // If no answers yet, they dropped off at the very beginning (first interactive block)
              if (interactiveBlocks.length > 0) {
                dropOffCounts[interactiveBlocks[0].id]++;
              }
            }
          }
        });

        const dropOffAnalysis = interactiveBlocks.map(b => ({
          blockId: b.id,
          label: b.title || b.placeholder || b.type,
          count: dropOffCounts[b.id] || 0,
          percentage: dropOffs > 0 ? ((dropOffCounts[b.id] || 0) / dropOffs) * 100 : 0
        })).filter(d => d.count > 0);

        setData({
          visits,
          submissions,
          uniqueRespondents,
          avgDuration,
          dropOffs,
          dropOffRate,
          dropOffAnalysis
        });
      }
      
      setLoading(false);
    };

    if (checklistId) {
      fetchInsights();
    }
  }, [checklistId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF007F]"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20">
        <p className="text-neutral-500">Nenhum dado disponível ainda.</p>
      </div>
    );
  }

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const metrics = [
    { label: "Visitas", value: data.visits, icon: MousePointer2, color: "text-blue-500", bg: "bg-blue-50" },
    { label: "Respostas enviadas", value: data.submissions, icon: Send, color: "text-green-500", bg: "bg-green-50" },
    { label: "Respondentes únicos", value: data.uniqueRespondents, icon: Users, color: "text-purple-500", bg: "bg-purple-50" },
    { label: "Tempo médio de resposta", value: formatDuration(data.avgDuration), icon: Clock, color: "text-orange-500", bg: "bg-orange-50" },
    { label: "Taxa de abandono", value: `${data.dropOffRate.toFixed(1)}%`, icon: UserMinus, color: "text-red-500", bg: "bg-red-50" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h3 className="text-lg font-bold text-neutral-900 mb-2">Desempenho do Checklist</h3>
        <p className="text-sm text-neutral-500">Acompanhe como as pessoas estão interagindo com seu checklist.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="p-6 bg-white border border-neutral-100 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
            <div className={`w-10 h-10 ${metric.bg} ${metric.color} rounded-xl flex items-center justify-center mb-4`}>
              <metric.icon className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-neutral-500 mb-1">{metric.label}</p>
            <p className="text-2xl font-bold text-neutral-900">{metric.value}</p>
          </div>
        ))}
      </div>

      {data.visits > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-100">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="w-5 h-5 text-neutral-400" />
              <h4 className="font-bold text-neutral-900">Taxa de Conversão</h4>
            </div>
            <div className="relative h-4 w-full bg-neutral-200 rounded-full overflow-hidden mb-4">
              <div 
                className="absolute top-0 left-0 h-full bg-[#FF007F] transition-all duration-1000"
                style={{ width: `${(data.submissions / data.visits) * 100}%` }}
              />
            </div>
            <p className="text-sm text-neutral-600 font-medium">
              {((data.submissions / data.visits) * 100).toFixed(1)}% dos visitantes enviaram o formulário.
            </p>
          </div>

          <div className="p-6 bg-neutral-50 rounded-2xl border border-neutral-100">
            <div className="flex items-center gap-2 mb-6">
              <UserMinus className="w-5 h-5 text-red-400" />
              <h4 className="font-bold text-neutral-900">Perguntas com maior abandono</h4>
            </div>
            
            {data.dropOffAnalysis.length > 0 ? (
              <div className="space-y-4">
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.dropOffAnalysis} layout="vertical" margin={{ left: -20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="label" 
                        type="category" 
                        width={100} 
                        fontSize={10}
                        tick={{ fill: '#666' }}
                      />
                      <Tooltip 
                        formatter={(value: number) => [`${value} abandonos`, 'Quantidade']}
                        labelStyle={{ color: '#000', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {data.dropOffAnalysis.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill="#EF4444" opacity={0.6 + (entry.percentage / 100) * 0.4} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {data.dropOffAnalysis.slice(0, 3).map((item) => (
                    <div key={item.blockId} className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500 truncate max-w-[200px]">{item.label}</span>
                      <span className="font-bold text-red-500">{item.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="w-8 h-8 text-neutral-300 mb-2" />
                <p className="text-sm text-neutral-500">
                  {data.dropOffs > 0 
                    ? "Ainda não há dados detalhados sobre onde os usuários pararam." 
                    : "Nenhum abandono registrado até agora!"}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

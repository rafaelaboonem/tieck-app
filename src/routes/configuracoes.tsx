import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Search, Monitor, AlertTriangle, Upload, Loader2, FileText } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useSidebar } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useWorkspaceRBAC, type WorkspaceRole } from "@/hooks/useWorkspaceRBAC";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AvatarPicker } from "@/components/member/AvatarPicker";
import { MemberAvatar } from "@/components/member/MemberAvatar";
import { useOptimisticAvatarSelection } from "@/hooks/useOptimisticAvatarSelection";
import {
  avatarSelectionKey,
  buildSettingsWithAvatarSelection,
  resolveAvatarSelection,
  type AvatarDisplayMode,
  type ProfileSettings,
} from "@/lib/member-avatar-preference";
import logo from "../assets/local/logo-k.webp";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — ChecklistApp" }] }),
  component: ConfiguracoesPage,
});

// Abas de conta — qualquer membro autenticado.
const ACCOUNT_TABS = ["Minha conta", "Notificações"];
// Abas contratuais — exclusivas do dono do workspace (ver ConfiguracoesPage).
const CONTRACTUAL_TABS = [...ACCOUNT_TABS, "Assinaturas"];

/**
 * Apresentação HUMANA do RBAC real do workspace. Fonte única é o
 * `useWorkspaceRBAC` (RPC canônica `get_my_workspace_access`):
 *   is_owner (workspaces.owner_id = auth.uid()) → 'owner'
 *   senão workspace_members.role onde status = 'active' → admin|editor|viewer
 * Os rótulos são os mesmos já usados em /equipe (nada de vocabulário novo).
 */
const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visualizador",
};

/**
 * Confirmação humana de cada modo de avatar. O estado é anunciado em TEXTO (não
 * só por cor/anel), e nunca mostra ID interno — "avatar-14" não diz nada a quem
 * escolheu uma ilustração.
 */
const AVATAR_MODE_STATUS: Record<AvatarDisplayMode, string> = {
  photo: "Você está usando sua foto.",
  automatic: "Avatar selecionado automaticamente pelo Tieck.",
  illustrated: "Você está usando uma ilustração personalizada.",
};

/** Toque discreto de sucesso, com a mesma linguagem dos outros avisos da tela. */
const AVATAR_MODE_TOAST: Record<AvatarDisplayMode, string> = {
  photo: "Agora você aparece com sua foto!",
  automatic: "Avatar automático ativado!",
  illustrated: "Avatar atualizado!",
};

/**
 * Permissões efetivas derivadas APENAS das flags reais do hook:
 *   isAdmin   (owner|admin)         → Painel, Domínios e Equipe
 *   canManage (owner|admin|editor)  → Organizar (categorias/itens e
 *                                     atribuições) e edição de checklists
 *   membro ativo (qualquer role)    → executar checklists atribuídos (/executar)
 * Nenhuma capacidade é listada sem uma regra real correspondente no produto.
 */
function getEffectivePermissions(role: WorkspaceRole | null): string[] {
  if (role === "owner" || role === "admin") {
    return [
      "Administrar domínios e equipe",
      "Organizar e editar checklists",
      "Executar checklists atribuídos",
    ];
  }
  if (role === "editor") {
    return ["Organizar e editar checklists", "Executar checklists atribuídos"];
  }
  if (role === "viewer") {
    return ["Executar checklists atribuídos"];
  }
  return [];
}

function ConfiguracoesPage() {
  const isMobile = useIsMobile();
  const { sidebarOpen } = useSidebar();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Minha conta");
  const [profile, setProfile] = useState<{ id: string; display_name: string | null; avatar_url: string | null; plan_type: string | null; settings: any } | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSettingsUpdating, setIsSettingsUpdating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modelo de produto: a assinatura pertence ao WORKSPACE/empresa, não ao
  // usuário. O acesso contratual é do dono do workspace (workspaces.owner_id →
  // role 'owner' no RBAC canônico); convidados — inclusive admin/editor — são
  // membros e não veem a aba Assinaturas. Fail-closed: enquanto o RBAC não
  // confirmou o papel, a aba não é exposta.
  const { currentWorkspace } = useWorkspace();
  const { role } = useWorkspaceRBAC(currentWorkspace?.id);
  const isWorkspaceOwner = role === "owner";
  const visibleTabs = isWorkspaceOwner ? CONTRACTUAL_TABS : ACCOUNT_TABS;
  const effectivePermissions = getEffectivePermissions(role);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
      return;
    }
  }, [user, loading, navigate]);

  // Se o papel do usuário não expõe a aba ativa (ex.: troca de workspace),
  // volta para a aba de conta em vez de renderizar conteúdo sem permissão.
  useEffect(() => {
    if (!visibleTabs.includes(activeTab)) setActiveTab("Minha conta");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isWorkspaceOwner]);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserEmail(user.email || "");

      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      if (error) throw error;
      
      setProfile(data);
      if (data.display_name) {
        const parts = data.display_name.split(" ");
        setFormData({
          firstName: parts[0] || "",
          lastName: parts.slice(1).join(" ") || "",
        });
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!profile) return;
    setIsUpdating(true);
    try {
      const fullName = `${formData.firstName} ${formData.lastName}`.trim();
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: fullName })
        .eq("id", profile.id);

      if (error) throw error;
      toast.success("Perfil atualizado com sucesso!");
      fetchProfile();
    } catch (error: any) {
      toast.error("Erro ao atualizar perfil: " + error.message);
    } finally {
      setIsUpdating(false);
    }
  };
  
  /**
   * Única escrita de `profiles.settings` desta tela.
   *
   * O jsonb é COMPARTILHADO (`save_for_later`, `product_updates`,
   * `illustrated_avatar_id`), portanto toda gravação é ADITIVA: quem monta
   * `nextSettings` parte do objeto atual e preserva as demais chaves. O estado
   * local recebe o MESMO objeto que foi para o banco — a UI nunca mostra valor
   * que não foi salvo.
   */
  const persistSettings = async (
    nextSettings: ProfileSettings,
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (!profile) return { ok: false, message: "Perfil não carregado." };

    const { error } = await supabase
      .from("profiles")
      .update({ settings: nextSettings })
      .eq("id", profile.id);

    if (error) return { ok: false, message: error.message };

    setProfile((prev) => (prev ? { ...prev, settings: nextSettings } : prev));
    return { ok: true };
  };

  const handleUpdateSettings = async (newSettings: ProfileSettings) => {
    if (!profile) return;
    setIsSettingsUpdating(true);

    const result = await persistSettings({ ...(profile.settings || {}), ...newSettings });
    if (result.ok) {
      toast.success("Configurações atualizadas!");
    } else {
      toast.error("Erro ao atualizar configurações: " + result.message);
    }

    setIsSettingsUpdating(false);
  };

  /**
   * Avatar — a escolha é um MODO explícito (`avatar_display_mode`: photo /
   * automatic / illustrated) que vive em `profiles.settings`, lido/escrito SÓ por
   * @/lib/member-avatar-preference.
   *
   * Antes o modo era implícito e isso confundia: quem tinha foto escolhia uma
   * ilustração e continuava vendo a foto. Agora "Sua foto", "Automático" e as 20
   * ilustrações são três escolhas do MESMO grupo — e a ilustração escolhida fica
   * guardada mesmo quando outro modo está ativo, para que voltar ao ilustrado
   * recupere o avatar anterior.
   *
   * O optimistic + rollback ficam em @/hooks/useOptimisticAvatarSelection: aqui é
   * só o que é desta tela (o toast e a gravação aditiva em settings).
   */
  const hasPhoto = Boolean(profile?.avatar_url);
  const savedSelection = resolveAvatarSelection(profile?.settings, { hasPhoto });

  const {
    selection: avatarSelection,
    isSaving: isAvatarSaving,
    pendingKey: pendingAvatarKey,
    select: handleSelectAvatar,
  } = useOptimisticAvatarSelection(savedSelection, avatarSelectionKey, async (next) => {
    const result = await persistSettings(
      buildSettingsWithAvatarSelection(profile?.settings, next),
    );

    if (result.ok) {
      toast.success(AVATAR_MODE_TOAST[next.mode]);
    } else {
      toast.error("Erro ao salvar avatar: " + result.message);
    }

    return result;
  });

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${profile.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: publicUrl });
      toast.success("Foto de perfil atualizada!");
    } catch (error: any) {
      toast.error("Erro no upload: " + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
     <DashboardLayout>
      <header className="flex items-center justify-between px-4 sm:px-6 py-4">
        <div className={cn(
          "flex items-center gap-2 text-sm transition-all duration-300",
          !sidebarOpen && !isMobile ? "pl-14" : "pl-0",
          isMobile && !sidebarOpen ? "pl-12" : "pl-0"
        )}>
          <Link to="/inicio">
            <img 
              src={logo} 
              alt="Logo" 
              className={cn(
                "object-contain grayscale hover:grayscale-0 transition-all cursor-pointer",
                isMobile ? "w-10 h-10" : "w-20 h-20"
              )} 
            />
          </Link>
          <span className="text-neutral-400">›</span>
          <span className="text-neutral-700 font-medium">Configurações</span>
        </div>
        <button className="flex items-center gap-1 text-xs sm:text-sm text-neutral-500 hover:text-neutral-900">
          <Search className="w-4 h-4" /> <span className="hidden sm:inline">Buscar</span>
        </button>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold">Configurações</h1>

          <div className="mt-6 border-b border-neutral-200 flex gap-6 text-sm">
            {visibleTabs.map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`pb-3 -mb-px border-b-2 transition-colors ${
                  activeTab === t
                    ? "border-neutral-900 text-neutral-900 font-medium"
                    : "border-transparent text-neutral-500 hover:text-neutral-900"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {activeTab === "Minha conta" && (
            <div className="mt-8 space-y-10">
              {/* Profile */}
              <section className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Foto</label>
                  <div className="mt-2 flex items-center gap-4">
                    <div 
                      className="w-16 h-16 rounded-full bg-neutral-100 border border-neutral-200 overflow-hidden relative group cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {profile?.avatar_url ? (
                        <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-orange-300 to-pink-400" />
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {isUploading ? (
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        ) : (
                          <Upload className="w-5 h-5 text-white" />
                        )}
                      </div>
                    </div>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      onChange={handleAvatarUpload}
                      disabled={isUploading}
                    />
                    <div className="text-xs text-neutral-500">
                      <p>Clique na imagem para alterar.</p>
                      <p>Formatos aceitos: JPG, PNG ou GIF.</p>
                    </div>
                  </div>
                </div>
                <Field 
                  label="Nome" 
                  value={formData.firstName} 
                  onChange={(val) => setFormData(prev => ({ ...prev, firstName: val }))}
                />
                <Field 
                  label="Sobrenome" 
                  value={formData.lastName} 
                  onChange={(val) => setFormData(prev => ({ ...prev, lastName: val }))}
                />
                <Field
                  label="E-mail"
                  value={userEmail}
                  disabled
                  trailing={<button className="text-sm text-neutral-400 cursor-not-allowed">Alterar e-mail</button>}
                />
                <Field
                  label="Senha"
                  placeholder=""
                  trailing={<button className="text-sm text-neutral-600 hover:text-neutral-900">Definir senha</button>}
                />
                <button 
                  onClick={handleUpdateProfile}
                  disabled={isUpdating}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-2 rounded-md disabled:opacity-50 flex items-center gap-2"
                >
                  {isUpdating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Atualizar
                </button>
              </section>

              <Divider />

              {/* Avatar — a escolha EXPLÍCITA de como aparecer no Tieck.
                  O modo (`avatar_display_mode`) e a ilustração
                  (`illustrated_avatar_id`) vivem em `profiles.settings` e são
                  lidos/escritos SÓ por @/lib/member-avatar-preference. As 20
                  opções vêm do registry oficial; nenhum array de avatares é
                  escrito nesta tela. */}
              <section>
                <h2 className="font-semibold text-lg">Avatar</h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Como você quer aparecer no Tieck? Você pode usar sua foto, deixar
                  o Tieck escolher ou selecionar uma ilustração.
                </p>

                {isLoading ? (
                  // Espera o profile antes de pintar a seleção: nunca pisca
                  // "Automático" para depois descobrir que existe escolha salva.
                  <div className="mt-4 flex items-center gap-2 text-sm text-neutral-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando seu avatar…
                  </div>
                ) : (
                  <>
                    <div className="mt-4 flex items-start gap-4">
                      {/* Prévia com a resolução REAL do modo escolhido. */}
                      <MemberAvatar
                        userId={user?.id}
                        displayName={profile?.display_name}
                        email={userEmail}
                        avatarUrl={profile?.avatar_url}
                        avatarDisplayMode={avatarSelection.mode}
                        selectedAvatarId={
                          avatarSelection.mode === "illustrated"
                            ? avatarSelection.avatarId
                            : null
                        }
                        size="xl"
                        decorative
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-neutral-900">
                          {profile?.display_name || userEmail || "Seu avatar"}
                        </p>
                        {/* Estado textual: a seleção nunca é indicada só por cor. */}
                        <p
                          className="mt-1 text-sm text-neutral-600"
                          role="status"
                          aria-live="polite"
                        >
                          {isAvatarSaving
                            ? "Salvando avatar…"
                            : AVATAR_MODE_STATUS[avatarSelection.mode]}
                        </p>
                      </div>
                    </div>

                    <AvatarPicker
                      className="mt-6"
                      selection={avatarSelection}
                      hasPhoto={hasPhoto}
                      photoUrl={profile?.avatar_url}
                      identity={{
                        userId: user?.id,
                        displayName: profile?.display_name,
                        email: userEmail,
                      }}
                      disabled={isAvatarSaving}
                      pending={isAvatarSaving}
                      pendingKey={pendingAvatarKey}
                      onSelect={handleSelectAvatar}
                    />
                  </>
                )}
              </section>

              <Divider />

              {/* Acesso ao workspace — dados REAIS: o workspace atual vem do
                  WorkspaceContext; a função vem do RBAC canônico; as permissões
                  são derivadas das flags reais do hook. Vale para dono e convidado. */}
              <section>
                <h2 className="font-semibold">Acesso ao workspace</h2>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm text-neutral-500">Workspace</span>
                    <span className="text-sm text-neutral-900">
                      {currentWorkspace?.name ?? "Nenhum workspace ativo"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm text-neutral-500">Função</span>
                    <span className="text-sm text-neutral-900">
                      {role ? ROLE_LABELS[role] : "—"}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="w-28 shrink-0 text-sm text-neutral-500">Permissões</span>
                    <div className="space-y-1">
                      {effectivePermissions.length > 0 ? (
                        effectivePermissions.map((permission) => (
                          <p key={permission} className="text-sm text-neutral-900">
                            {permission}
                          </p>
                        ))
                      ) : (
                        <span className="text-sm text-neutral-900">—</span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <Divider />

              {/* Device verification */}
              <section>
                <div className="flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  <h2 className="font-semibold">Verificação de dispositivo desconhecido</h2>
                  <Badge tone="success">Ativado</Badge>
                </div>
                <p className="mt-2 text-sm text-neutral-600">
                  Adiciona segurança extra enviando um código de verificação ao seu
                  e-mail sempre que houver login de um dispositivo novo ou não reconhecido.
                </p>
                <button className="mt-3 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-2 rounded-md">
                  Desativar
                </button>
              </section>

              <Divider />

              {/* Behavior */}
              <section className="space-y-6">
                <h2 className="font-semibold text-lg">Comportamento</h2>
                <Toggle
                  title="Salvar respostas para depois"
                  description="Salve as respostas de formulários não enviados para que os respondentes possam continuar de onde pararam. As respostas são armazenadas no armazenamento local do navegador e nunca saem do computador do respondente."
                  checked={profile?.settings?.save_for_later ?? true}
                  onChange={(checked) => handleUpdateSettings({ save_for_later: checked })}
                />
              </section>

              <Divider />

              {/* Danger zone — UI honesta. A auditoria do projeto confirmou que
                  NÃO existe backend de auto-exclusão (sem RPC/endpoint/server
                  action; deletar auth.users direto derrubaria workspaces de
                  terceiros por ON DELETE CASCADE no workspaces.owner_id). O fluxo
                  antigo (modal + confirmação por e-mail) aparentava funcionar e
                  terminava em erro, então foi removido: sem botão inerte, sem
                  modal, sem loading falso. Também não há fluxo real de suporte
                  inbound no produto (o item "Falar com suporte" do menu só fecha
                  o diálogo), por isso nenhum CTA de solicitação foi criado.
                  TODO(backend): exclusão segura precisa (1) resolver ownership
                  antes de apagar o usuário — transferir/preservar o workspace;
                  (2) remover apenas as memberships do usuário; (3) exigir
                  step-up/reautenticação; (4) ser transacional e idempotente;
                  (5) nunca apagar dados de outros membros. */}
              <section>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h2 className="font-semibold">Zona de perigo</h2>
                </div>
                <h3 className="mt-3 text-sm font-medium">Excluir conta</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  A exclusão automática de conta ainda não está disponível. Entre em
                  contato com o suporte para solicitar a exclusão.
                </p>
              </section>
            </div>
          )}

          {activeTab === "Notificações" && (
            <div className="mt-8">
              <Toggle
                title="Atualizações de Produto Ampliar"
                description="Receba atualizações por e-mail sobre o que construímos, por que construímos e como usá-lo."
                checked={profile?.settings?.product_updates ?? true}
                onChange={(checked) => handleUpdateSettings({ product_updates: checked })}
              />
            </div>
          )}

          {/* Visível SOMENTE para o dono do workspace: a assinatura pertence ao
              workspace/empresa, não ao usuário. Convidados (admin/editor/viewer)
              não têm esta aba — veem "Acesso ao workspace" em Minha conta. */}
          {activeTab === "Assinaturas" && (
            <div className="mt-8 space-y-8">
              {/* Área de CONSULTA da assinatura atual — não é pricing/checkout.
                  plan_type em profiles (free/pro) é gating de features por usuário
                  e NÃO é reaproveitado como modalidade contratual. Modalidade,
                  status e contrato não existem no backend — estado vazio honesto. */}
              <section>
                <h2 className="font-semibold">Assinatura atual</h2>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm text-neutral-500">Modalidade</span>
                    <span className="text-sm text-neutral-900">—</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-28 shrink-0 text-sm text-neutral-500">Status</span>
                    <span className="text-sm text-neutral-900">—</span>
                  </div>
                </div>
                <p className="mt-3 text-sm text-neutral-500">
                  Nenhuma assinatura vinculada a este workspace.
                </p>
              </section>

              <Divider />

              {/* Contrato — só aparece quando houver documento real vinculado.
                  Infra de storage (checklist-assets, avatars, workspace-assets)
                  existe, mas nenhuma associação contrato↔workspace ainda. */}
              <section>
                <h2 className="font-semibold">Contrato</h2>
                <div className="mt-3 flex items-center gap-3 text-sm text-neutral-500">
                  <FileText className="w-5 h-5 shrink-0" />
                  <span>Nenhum contrato anexado.</span>
                </div>
              </section>
            </div>
          )}

        </div>
      </main>

     </DashboardLayout>
  );
}

function Field({
  label,
  defaultValue,
  value,
  onChange,
  placeholder,
  trailing,
  disabled,
}: {
  label: string;
  defaultValue?: string;
  value?: string;
  onChange?: (val: string) => void;
  placeholder?: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium">{label}</label>
      <div className="mt-1.5 relative">
        <input
          defaultValue={defaultValue}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full border border-neutral-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400 disabled:bg-neutral-50 disabled:text-neutral-500"
        />
        {trailing && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-neutral-200" />;
}

function Badge({ tone, children }: { tone: "neutral" | "success"; children: React.ReactNode }) {
  const cls =
    tone === "success"
      ? "bg-green-100 text-green-700"
      : "bg-neutral-100 text-neutral-600";
  return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{children}</span>;
}

function Toggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const on = checked || false;
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex-1">
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="mt-1 text-sm text-neutral-600">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange?.(!on)}
        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${
          on ? "bg-blue-500" : "bg-neutral-300"
        }`}
        aria-pressed={on}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            on ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
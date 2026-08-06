import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Search, Shield, Monitor, Link2, AlertTriangle, Upload, Loader2, Check } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useSidebar } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import logo from "../assets/local/logo-k.webp";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — ChecklistApp" }] }),
  component: ConfiguracoesPage,
});

const tabs = ["Minha conta", "Notificações", "Chaves de API", "Cobrança"];

function ConfiguracoesPage() {
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

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login" });
      return;
    }
  }, [user, loading, navigate]);

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
  
  const handleUpdateSettings = async (newSettings: any) => {
    if (!profile) return;
    setIsSettingsUpdating(true);
    try {
      const updatedSettings = { ...(profile.settings || {}), ...newSettings };
      const { error } = await supabase
        .from("profiles")
        .update({ settings: updatedSettings })
        .eq("id", profile.id);

      if (error) throw error;
      setProfile({ ...profile, settings: updatedSettings });
      toast.success("Configurações atualizadas!");
    } catch (error: any) {
      toast.error("Erro ao atualizar configurações: " + error.message);
    } finally {
      setIsSettingsUpdating(false);
    }
  };

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
      <header className="flex items-center justify-between px-6 py-4">
        <div className={`flex items-center gap-2 text-sm transition-all duration-300 ${sidebarOpen ? "pl-0" : "pl-14"}`}>
          <Link to="/inicio">
            <img src={logo} alt="Logo" className="w-14 h-14 object-contain grayscale hover:grayscale-0 active:grayscale-0 transition-all cursor-pointer" />
          </Link>
          <span className="text-neutral-400">›</span>
          <span className="text-neutral-700 font-medium">Configurações</span>
        </div>
        <button className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
          <Search className="w-4 h-4" /> Buscar
        </button>
      </header>

      <main className="flex-1 px-6 py-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold">Configurações</h1>

          <div className="mt-6 border-b border-neutral-200 flex gap-6 text-sm">
            {tabs.map((t) => (
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

              {/* 2FA */}
              <section>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  <h2 className="font-semibold">Autenticação em duas etapas</h2>
                  <Badge tone="neutral">Desativado</Badge>
                </div>
                <p className="mt-2 text-sm text-neutral-600">
                  Proteja sua conta com autenticação em duas etapas, que adiciona uma
                  camada extra de segurança no login.
                </p>
                <button className="mt-3 bg-neutral-900 hover:bg-neutral-800 text-white text-sm font-medium px-4 py-2 rounded-md">
                  Configurar
                </button>
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

              {/* Connected accounts */}
              <section>
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  <h2 className="font-semibold">Contas conectadas</h2>
                </div>
                <p className="mt-2 text-sm text-neutral-600">
                  Conecte sua conta com Google ou Apple para acesso mais rápido, seguro
                  e prático.
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-green-500" />
                      Google
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                    </span>
                    <button className="text-neutral-500 hover:text-neutral-900">Desconectar</button>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-neutral-900" />
                      Apple
                    </span>
                    <button className="text-neutral-500 hover:text-neutral-900">Conectar</button>
                  </div>
                </div>
              </section>

              <Divider />

              {/* Prevent duplicate submissions */}
              <section className="space-y-4">
                <Toggle
                  title="Evitar envios duplicados"
                  description="Garanta que cada respondente só possa enviar o formulário uma vez, selecionando um campo (e-mail, telefone, endereço de IP) que será usado como identificador único. Isso permite que nosso sistema detecte e impeça envios duplicados."
                  checked={profile?.settings?.prevent_duplicates || false}
                  onChange={(checked) => handleUpdateSettings({ prevent_duplicates: checked })}
                />
                
                {profile?.settings?.prevent_duplicates && (
                  <div className="pl-6 animate-in fade-in slide-in-from-top-1 duration-200">
                    <label className="text-sm font-medium text-neutral-700 mb-2 block">
                      Campo identificador único
                    </label>
                    <Select
                      value={profile?.settings?.duplicate_identifier || "ip"}
                      onValueChange={(val) => handleUpdateSettings({ duplicate_identifier: val })}
                    >
                      <SelectTrigger className="w-full sm:w-64 bg-white">
                        <SelectValue placeholder="Selecione o identificador" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">E-mail</SelectItem>
                        <SelectItem value="phone">Telefone</SelectItem>
                        <SelectItem value="ip">Endereço de IP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </section>

              <Divider />

              {/* Behavior */}
              <section className="space-y-6">
                <h2 className="font-semibold text-lg">Comportamento</h2>
                <Toggle
                  title="Pular automaticamente para a próxima página"
                  description="Avance automaticamente para a próxima página ao responder uma pergunta. Funciona apenas com perguntas de múltipla escolha, lista suspensa, avaliação ou escala linear, com uma pergunta por página."
                  checked={profile?.settings?.auto_skip || false}
                  onChange={(checked) => handleUpdateSettings({ auto_skip: checked })}
                />
                <Toggle
                  title="Salvar respostas para depois"
                  description="Salve as respostas de formulários não enviados para que os respondentes possam continuar de onde pararam. As respostas são armazenadas no armazenamento local do navegador e nunca saem do computador do respondente."
                  checked={profile?.settings?.save_for_later ?? true}
                  onChange={(checked) => handleUpdateSettings({ save_for_later: checked })}
                />
              </section>

              <Divider />

              {/* Danger zone */}
              <section>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <h2 className="font-semibold">Zona de perigo</h2>
                </div>
                <p className="mt-2 text-sm text-neutral-600">
                  Isso irá excluir permanentemente toda a sua conta. Todos os
                  checklists, envios e workspaces serão deletados.
                </p>
                <button className="mt-3 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-md">
                  Excluir conta
                </button>
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

          {activeTab === "Cobrança" && (
            <div className="mt-8">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">Plano Atual</h2>
                <Badge tone="neutral">{profile?.plan_type === 'pro' ? 'Pro' : 'Grátis'}</Badge>
              </div>
              <p className="mt-2 text-sm text-neutral-600 max-w-md">
                {profile?.plan_type === 'pro' 
                  ? "Seu plano Pro está ativo. Aproveite todos os recursos avançados."
                  : "Atualize para o plano Pro para acessar recursos avançados projetados para equipes e criadores em crescimento."}
              </p>
              {profile?.plan_type !== 'pro' && (
                <button 
                  onClick={() => navigate({ to: "/membros" })}
                  className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md"
                >
                  Atualizar plano
                </button>
              )}
            </div>
          )}

          {activeTab !== "Minha conta" && activeTab !== "Notificações" && activeTab !== "Cobrança" && (
            <div className="mt-12 text-center text-sm text-neutral-500">
              Em breve.
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
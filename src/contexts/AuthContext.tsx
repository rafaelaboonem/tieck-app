import { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { ensureUserProfile } from "@/utils/auth-bootstrap";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  /** true quando o e-mail do usuário já foi confirmado (ou não há usuário logado ainda) */
  emailConfirmed: boolean;
  /** true apenas quando existe um usuário logado com e-mail ainda não confirmado */
  needsEmailConfirmation: boolean;
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        lastUserIdRef.current = session.user.id;
        await ensureUserProfile(session.user.id, session.user.email!);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const newUser = session?.user ?? null;
      const newUserId = newUser?.id ?? null;
      
      // Se for TOKEN_REFRESHED e o ID do usuário não mudou, evitamos re-bootstrap destrutivo
      if (event === 'TOKEN_REFRESHED' && newUserId === lastUserIdRef.current && lastUserIdRef.current !== null) {
        setSession(session);
        // Não atualizamos o objeto 'user' para evitar disparar hooks que dependem do objeto inteiro
        // O Supabase garante que session.user e user são o mesmo, mas a referência do objeto muda.
        // Se realmente precisarmos atualizar o objeto (ex: metadados mudaram), faríamos aqui,
        // mas o requisito é estabilidade.
        return;
      }

      lastUserIdRef.current = newUserId;

      if (newUser) {
        await ensureUserProfile(newUser.id, newUser.email!);
      }
      
      setSession(session);
      setUser(newUser);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      lastUserIdRef.current = data.user.id;
      setUser(data.user);
    }
  };

  const signOut = async () => {
    lastUserIdRef.current = null;
    await supabase.auth.signOut();
  };

  const emailConfirmed = !user || Boolean(user.email_confirmed_at);
  const needsEmailConfirmation = Boolean(user) && !user?.email_confirmed_at;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        emailConfirmed,
        needsEmailConfirmation,
        refreshUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

import { createContext, useContext, useEffect, useState } from "react";
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

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await ensureUserProfile(session.user.id, session.user.email!);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for changes on auth state (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await ensureUserProfile(session.user.id, session.user.email!);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshUser = async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) setUser(data.user);
  };

  const signOut = async () => {
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

import { Link } from "@tanstack/react-router";
import { m } from "@/lib/motion";
import { useAuth } from "@/contexts/AuthContext";
import logoUrl from "../../assets/local/logo-tieck.webp";

export const Header = () => {
  const { user } = useAuth();

  return (
    <m.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-neutral-100"
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center">
          <img
            src={logoUrl}
            alt="Tieck"
            fetchPriority="high"
            decoding="async"
            className="h-8 w-auto object-contain"
          />
        </Link>
        <nav className="flex items-center gap-6">
          {user ? (
            <Link to="/inicio" className="text-sm font-medium text-neutral-600 hover:text-[#FF007F] transition-colors">
              Meu Painel
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-neutral-600 hover:text-[#FF007F] transition-colors">
                Login
              </Link>
              <Link to="/cadastro" className="text-sm font-medium text-neutral-600 hover:text-[#FF007F] transition-colors">
                Cadastrar
              </Link>
            </>
          )}
          <Link
            to="/checklist"
            className="bg-[#FF007F] text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-[#FF007F]/90 transition-all shadow-lg shadow-[#FF007F]/20"
          >
            Criar Checklist
          </Link>
        </nav>
      </div>
    </m.header>
  );
};

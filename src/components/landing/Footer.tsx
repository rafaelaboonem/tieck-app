import { Link } from "@tanstack/react-router";
import logoAsset from "@/assets/logo-tieck.webp.asset.json";
const logoUrl = logoAsset.url;

export const Footer = () => {
  return (
    <footer className="bg-neutral-50 border-t border-neutral-100 pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-1">
            <Link to="/" className="inline-block">
              <img src={logoUrl} alt="Tieck" className="h-8 w-auto object-contain" />
            </Link>
            <p className="mt-6 text-neutral-500 text-sm leading-relaxed">
              A ferramenta de checklists mais simples e poderosa do Brasil. Feita para quem busca eficiência e clareza.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold text-neutral-900 mb-6">Produto</h4>
            <ul className="space-y-4 text-sm text-neutral-600">
              <li><button className="hover:text-[#FF007F] transition-colors">Funcionalidades</button></li>
              <li><button className="hover:text-[#FF007F] transition-colors">Novidades</button></li>
              <li><button className="hover:text-[#FF007F] transition-colors">Templates</button></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-neutral-900 mb-6">Suporte</h4>
            <ul className="space-y-4 text-sm text-neutral-600">
              <li><button className="hover:text-[#FF007F] transition-colors">Ajuda & FAQ</button></li>
              <li><button className="hover:text-[#FF007F] transition-colors">Privacidade</button></li>
              <li><button className="hover:text-[#FF007F] transition-colors">Termos de Uso</button></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-bold text-neutral-900 mb-6">Conecte-se</h4>
            <ul className="space-y-4 text-sm text-neutral-600">
              <li><button className="hover:text-[#FF007F] transition-colors">Twitter</button></li>
              <li><button className="hover:text-[#FF007F] transition-colors">LinkedIn</button></li>
              <li><button className="hover:text-[#FF007F] transition-colors">Instagram</button></li>
            </ul>
          </div>
        </div>
        
        <div className="pt-8 border-t border-neutral-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-neutral-500">
            © {new Date().getFullYear()} Tieck. Todos os direitos reservados.
          </p>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Sistemas Operacionais
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

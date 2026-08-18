import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

interface SidebarContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile();
  // Initialize with a state that doesn't conflict with the final resolved state
  // We'll use an effect to sync it as soon as isMobile is resolved.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    if (isMobile === true) {
      setSidebarOpen(false);
    } else if (isMobile === false) {
      setSidebarOpen(true);
    }
  }, [isMobile]);

  return (
    <SidebarContext.Provider value={{ sidebarOpen, setSidebarOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}


export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}

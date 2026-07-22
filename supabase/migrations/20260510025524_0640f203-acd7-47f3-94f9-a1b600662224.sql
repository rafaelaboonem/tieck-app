-- Tabela de checklists
CREATE TABLE public.checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

-- Políticas para checklists
CREATE POLICY "Usuários podem ver seus próprios checklists" 
ON public.checklists FOR SELECT 
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Usuários podem criar checklists" 
ON public.checklists FOR INSERT 
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Usuários podem atualizar seus próprios checklists" 
ON public.checklists FOR UPDATE 
USING (auth.uid() = user_id OR user_id IS NULL);

-- Tabela de perfis
CREATE TABLE public.profiles (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS para perfis
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Perfis são visíveis por todos" 
ON public.profiles FOR SELECT 
USING (true);

CREATE POLICY "Usuários podem atualizar seu próprio perfil" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- Trigger para atualizar timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_checklists_updated_at
BEFORE UPDATE ON public.checklists
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

# Fase 5A - Responsividade Global Mobile da Área Autenticada

Implementar responsividade mobile completa para o shell autenticado, resolvendo o problema da sidebar ocupando espaço no celular, melhorando o cabeçalho e garantindo que as páginas principais (/inicio, /organizar, etc.) funcionem perfeitamente em dispositivos móveis.

## Alterações Técnicas

### 1. Sidebar e Layout (DashboardLayout.tsx)
- **Estado Inicial SSR-Safe**: Modificar `SidebarProvider` para iniciar fechado em mobile usando `useIsMobile`. Garantir que não haja hydration mismatch usando um efeito para sincronizar o estado após a montagem.
- **Drawer Mobile**: Alterar o CSS da sidebar no `DashboardLayout` para que, em viewports menores que `md`, ela funcione como um drawer (`position: fixed`, `z-index: 50`) com um backdrop escuro e translúcido.
- **Interação Mobile**: Adicionar lógica para fechar o drawer ao clicar no backdrop, ao navegar para uma nova rota ou ao pressionar Escape.
- **Scroll Lock**: Impedir o scroll do conteúdo principal quando o drawer estiver aberto em mobile.

### 2. Cabeçalho e Botão de Menu
- **Botão de Menu Mobile**: Adicionar um botão "Menu" no cabeçalho das páginas autenticadas, visível apenas em mobile, para abrir o drawer.
- **Headers Responsivos**: Auditar e ajustar os headers das páginas para evitar colisões entre logo, nome do workspace e ações. Usar `flex-wrap` e truncamento de texto onde necessário.
- **Redimensionamento de Logo**: Reduzir o tamanho do logo em mobile (aprox. 48px).

### 3. Ajustes em Páginas Específicas
- **/inicio**: Corrigir cards de checklist para usarem 100% da largura em mobile, ajustar badges para não causarem overflow e garantir que o grid se torne uma coluna única.
- **Containers Globais**: Garantir que o container principal tenha `min-width: 0` e `width: 100%` para evitar que a sidebar o "esprema" no desktop ou mobile.

### 4. iPhone e Safe Areas
- **Safari iOS**: Usar `min-h-dvh` ou `h-[100dvh]` para ocupar a altura correta da tela, respeitando a barra de endereços dinâmica.
- **Safe Areas**: Aplicar `padding-top: env(safe-area-inset-top)` e `padding-bottom: env(safe-area-inset-bottom)` nos containers principais.

## Plano de Testes

### Testes de Componente (Vitest)
1. **Sidebar State**: Verificar se `sidebarOpen` inicia como `false` quando `useIsMobile` retorna `true`.
2. **Hydration Sync**: Testar se o estado da sidebar é atualizado corretamente após a montagem inicial para evitar mismatch.
3. **Drawer Visibility**: Validar se as classes CSS de drawer são aplicadas corretamente em modo mobile.

### Verificação Manual/E2E
1. **Viewport 375x812 (iPhone X)**: Abrir `/inicio` e verificar se não há overflow horizontal.
2. **Menu Toggle**: Clicar no botão de menu, abrir a sidebar, clicar no backdrop e verificar se fecha.
3. **Navegação**: Abrir sidebar, clicar em um link (ex: "Equipe") e verificar se a sidebar fecha automaticamente após a navegação.
4. **Desktop 1440x900**: Garantir que a sidebar lateral clássica continua funcionando sem alterações indesejadas.

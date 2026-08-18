import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Dashboard } from '../inicio';
import { DashboardLayout } from '../../components/DashboardLayout';
import * as WorkspaceContext from '../../contexts/WorkspaceContext';
import * as AuthContext from '../../contexts/AuthContext';
import * as WorkspaceRBAC from '../../hooks/useWorkspaceRBAC';
import * as SidebarContext from '../../contexts/SidebarContext';
import React from 'react';

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock DashboardLayout to avoid full layout complexity
vi.mock('../../components/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div data-testid="dashboard-layout">{children}</div>,
}));

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => () => ({}),
  useNavigate: () => vi.fn(),
  Link: ({ children }: any) => <a>{children}</a>,
}));

vi.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspace: vi.fn(),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../../hooks/useWorkspaceRBAC', () => ({
  useWorkspaceRBAC: vi.fn(),
}));

vi.mock('../../contexts/SidebarContext', () => ({
  useSidebar: vi.fn(),
}));

vi.mock('../../hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

describe('Patch 5B.13: Search Button in /inicio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    (WorkspaceContext.useWorkspace as any).mockReturnValue({
      currentWorkspace: { id: 'ws1', name: 'Test Workspace' },
      workspaceStatus: 'workspace',
    });
    
    (AuthContext.useAuth as any).mockReturnValue({
      user: { id: 'user1' },
      loading: false,
    });
    
    (WorkspaceRBAC.useWorkspaceRBAC as any).mockReturnValue({
      canManage: true,
      isViewer: false,
      role: 'admin',
      loading: false,
    });
    
    (SidebarContext.useSidebar as any).mockReturnValue({
      sidebarOpen: true,
    });
  });

  it('should dispatch open-search event when search button is clicked', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    
    render(<Dashboard />);
    
    const searchButton = screen.getByRole('button', { name: /buscar/i });
    expect(searchButton).toBeInTheDocument();
    expect(searchButton).toHaveAttribute('type', 'button');
    
    fireEvent.click(searchButton);
    
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(CustomEvent));
    expect(dispatchSpy.mock.calls[0][0].type).toBe('open-search');
  });
});

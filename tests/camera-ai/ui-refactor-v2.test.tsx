import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CameraSettingsPanel } from '@/components/camera-ai/CameraSettingsPanel';
import { supabase } from '@/integrations/supabase/client';

// Mock UI components that might cause issues in test environment
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => open ? <div>{children}</div> : null,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: any) => <div>{children}</div>,
  AccordionItem: ({ children }: any) => <div>{children}</div>,
  AccordionTrigger: ({ children }: any) => <button>{children}</button>,
  AccordionContent: ({ children }: any) => <div data-testid="accordion-content">{children}</div>,
}));

vi.mock('@/components/camera-ai/CameraVerificationTestDialog', () => ({
  CameraVerificationTestDialog: () => <div data-testid="test-dialog">Test Dialog</div>,
}));

describe('CameraSettingsPanel', () => {
  const mockBlock = {
    id: 'block-123',
    title: 'Test Camera',
    description: 'Test Description',
    required: true,
    mode: 'auto',
    cameraAiPolicy: {
      version: 1,
      verifiability: 'visual',
      summary: 'Test summary',
      questionHash: 'hash123',
      requiredVisibleEvidence: ['evidence 1'],
      rejectionSignals: ['signal 1'],
      source: 'generated'
    }
  };

  const mockProps = {
    block: mockBlock,
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    isCompiling: false,
    checklistId: 'checklist-123'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with default values', () => {
    render(<CameraSettingsPanel {...mockProps} />);
    expect(screen.getByDisplayValue('Test Camera')).toBeDefined();
    expect(screen.getByText('Automático')).toBeDefined();
    expect(screen.getByText('Múltiplas fotos')).toBeDefined();
  });

  it('shows "Em breve" badges for disabled modes', () => {
    render(<CameraSettingsPanel {...mockProps} />);
    const emBreveBadges = screen.getAllByText('Em breve');
    expect(emBreveBadges.length).toBe(2);
  });

  it('enables save button only when changes are made', () => {
    render(<CameraSettingsPanel {...mockProps} />);
    const saveButton = screen.getByText('Salvar bloco');
    expect(saveButton).toBeDisabled();

    const titleInput = screen.getByDisplayValue('Test Camera');
    fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
    
    expect(saveButton).not.toBeDisabled();
  });

  it('opens test dialog when clicking test button', () => {
    render(<CameraSettingsPanel {...mockProps} />);
    const testButton = screen.getByText('Testar verificação');
    fireEvent.click(testButton);
    
    expect(screen.getByTestId('test-dialog')).toBeDefined();
  });
});

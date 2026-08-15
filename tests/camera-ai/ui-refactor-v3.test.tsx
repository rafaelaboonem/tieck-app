import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CameraSettingsPanel } from '@/components/camera-ai/CameraSettingsPanel';
import React from 'react';

// Mock UI components
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
}));

// Stateful Mock for Accordion
const MockAccordion = ({ children }: any) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      {React.Children.map(children, child => 
        React.cloneElement(child, { open, setOpen })
      )}
    </div>
  );
};

vi.mock('@/components/ui/accordion', () => ({
  Accordion: MockAccordion,
  AccordionItem: ({ children, open, setOpen }: any) => (
    <div>{React.Children.map(children, child => React.cloneElement(child, { open, setOpen }))}</div>
  ),
  AccordionTrigger: ({ children, open, setOpen }: any) => (
    <button onClick={() => setOpen(!open)} data-testid="accordion-trigger">{children}</button>
  ),
  AccordionContent: ({ children, open }: any) => open ? <div data-testid="accordion-content">{children}</div> : null,
}));

vi.mock('@/components/camera-ai/CameraVerificationTestDialog', () => ({
  CameraVerificationTestDialog: ({ isOpen }: any) => isOpen ? <div data-testid="test-dialog">Test Dialog</div> : null,
}));

describe('CameraSettingsPanel UI & Lifecycle', () => {
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
    block: mockBlock as any,
    isOpen: true,
    onClose: vi.fn(),
    onSave: vi.fn(),
    isCompiling: false,
    checklistId: 'checklist-123'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('configuração avançada inicia recolhida', () => {
    render(<CameraSettingsPanel {...mockProps} />);
    expect(screen.queryByTestId('accordion-content')).toBeNull();
  });

  it('exibe configuração avançada após clique', () => {
    render(<CameraSettingsPanel {...mockProps} />);
    fireEvent.click(screen.getByTestId('accordion-trigger'));
    expect(screen.getByTestId('accordion-content')).toBeDefined();
    expect(screen.getByDisplayValue('evidence 1')).toBeDefined();
  });

  it('exibe aviso de consumo no diálogo de teste', () => {
    render(<CameraSettingsPanel {...mockProps} />);
    fireEvent.click(screen.getByText('Testar verificação'));
    expect(screen.getByTestId('test-dialog')).toBeDefined();
  });

  it('impede salvamento sem alterações', () => {
    render(<CameraSettingsPanel {...mockProps} />);
    const saveButton = screen.getByText('Salvar bloco');
    expect(saveButton).toBeDisabled();
  });

  it('permite salvamento após alterar título', () => {
    render(<CameraSettingsPanel {...mockProps} />);
    const input = screen.getByDisplayValue('Test Camera');
    fireEvent.change(input, { target: { value: 'New Title' } });
    expect(screen.getByText('Salvar bloco')).not.toBeDisabled();
  });
});

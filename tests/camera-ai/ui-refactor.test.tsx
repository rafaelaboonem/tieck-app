import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CameraSettingsPanel } from '@/components/camera-ai/CameraSettingsPanel';
import React from 'react';

// Mock components that might be problematic in test
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open, onOpenChange }: any) => open ? <div data-testid="sheet-root">{children}</div> : null,
  SheetContent: ({ children }: any) => <div data-testid="sheet-content">{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <div>{children}</div>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/accordion', () => ({
  Accordion: ({ children }: any) => <div>{children}</div>,
  AccordionItem: ({ children }: any) => <div>{children}</div>,
  AccordionTrigger: ({ children }: any) => <button>{children}</button>,
  AccordionContent: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} data-testid="switch" />
  ),
}));

vi.mock('./CameraVerificationTestDialog', () => ({
  CameraVerificationTestDialog: () => <div data-testid="test-dialog" />
}));

describe('CameraSettingsPanel', () => {
  const mockBlock = {
    id: 'block-1',
    title: 'Test Camera',
    description: 'Test Description',
    required: true,
    cameraAiPolicy: {
      summary: 'Test summary',
      verifiability: 'visual',
      questionHash: 'hash1'
    }
  };

  const mockOnSave = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly when open', () => {
    render(
      <CameraSettingsPanel
        block={mockBlock}
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        isCompiling={false}
      />
    );

    expect(screen.getByText('Configuração da câmera')).toBeDefined();
    expect(screen.getByDisplayValue('Test Camera')).toBeDefined();
    expect(screen.getByText('Test summary')).toBeDefined();
  });

  it('updates draft state on input change', () => {
    render(
      <CameraSettingsPanel
        block={mockBlock}
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        isCompiling={false}
      />
    );

    const input = screen.getByDisplayValue('Test Camera');
    fireEvent.change(input, { target: { value: 'Updated Camera' } });
    
    expect(input.value).toBe('Updated Camera');
  });

  it('calls onSave with draft values', () => {
    render(
      <CameraSettingsPanel
        block={mockBlock}
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        isCompiling={false}
      />
    );

    const input = screen.getByDisplayValue('Test Camera');
    fireEvent.change(input, { target: { value: 'Updated Camera' } });

    const saveButton = screen.getByText('Salvar bloco');
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Updated Camera'
    }));
  });

  it('handles old blocks without policy', () => {
    const oldBlock = { id: 'old-1', title: 'Old' };
    render(
      <CameraSettingsPanel
        block={oldBlock}
        isOpen={true}
        onClose={mockOnClose}
        onSave={mockOnSave}
        isCompiling={false}
      />
    );

    expect(screen.getByText('Salve para gerar o resumo da IA.')).toBeDefined();
  });
});

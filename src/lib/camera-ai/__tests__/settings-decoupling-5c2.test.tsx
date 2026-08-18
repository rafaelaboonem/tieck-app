import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CameraBlockEditor } from '../../../routes/checklist';
import React from 'react';


// Mocks
vi.mock('@/components/camera-ai/CameraBlockCard', () => ({
  CameraBlockCard: ({ onSelect, isActive }: any) => (
    <div data-testid="camera-card" onClick={onSelect} data-active={isActive}>
      Camera Card
    </div>
  ),
}));

vi.mock('@/components/camera-ai/CameraSettingsPanel', () => ({
  CameraSettingsPanel: ({ isOpen, onClose }: any) => (
    isOpen ? (
      <div data-testid="settings-panel">
        <button data-testid="close-button" onClick={onClose}>Close</button>
      </div>
    ) : null
  ),
}));

vi.mock('@/lib/camera-ai/hashing', () => ({
  hashQuestion: vi.fn().mockResolvedValue('fake-hash'),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'token' } } }),
    },
  },
}));

describe('CameraBlockEditor UX Hardening (5C.2)', () => {
  const defaultProps = {
    block: { id: 'b1', title: 'Test', description: 'Desc' },
    isActive: false,
    currentChecklistId: 'c1',
    updateBlock: vi.fn(),
    removeBlock: vi.fn(),
    setActiveBlockId: vi.fn(),
    textColor: '#000',
    textareaRefs: { current: {} } as any,
  };

  it('should decouple active block from settings panel', () => {
    const { rerender } = render(<CameraBlockEditor {...defaultProps} />);
    
    // Initial state: not active, panel closed
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();

    // 1. Selection without explicit click (e.g. focus/keyboard)
    // We simulate this by rerendering with isActive=true
    rerender(<CameraBlockEditor {...defaultProps} isActive={true} />);
    
    // isActive=true should NOT automatically open the panel anymore
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();
  });

  it('should open settings panel only on explicit card selection', () => {
    render(<CameraBlockEditor {...defaultProps} />);
    
    const card = screen.getByTestId('camera-card');
    fireEvent.click(card);

    // Should call setActiveBlockId AND open the panel (internal state)
    expect(defaultProps.setActiveBlockId).toHaveBeenCalledWith('b1');
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
  });

  it('should close settings panel without affecting active state', () => {
    const { rerender } = render(<CameraBlockEditor {...defaultProps} />);
    
    // Open it
    fireEvent.click(screen.getByTestId('camera-card'));
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();

    // Close it
    const closeBtn = screen.getByTestId('close-button');
    fireEvent.click(closeBtn);

    // Panel should be closed
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();
    
    // IMPORTANT: closing the panel should NOT call setActiveBlockId(null)
    // The block remains selected in the editor.
    expect(defaultProps.setActiveBlockId).not.toHaveBeenCalledWith(null);
  });

  it('should not reopen panel when block becomes active if it was closed', () => {
    const { rerender } = render(<CameraBlockEditor {...defaultProps} />);
    
    // 1. Open
    fireEvent.click(screen.getByTestId('camera-card'));
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();

    // 2. Close
    fireEvent.click(screen.getByTestId('close-button'));
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();

    // 3. Rerender with isActive=true (simulating focus returning to block)
    rerender(<CameraBlockEditor {...defaultProps} isActive={true} />);
    
    // Should NOT reopen
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();
  });

  it('should handle deletion regression: block removal cleans up panel state implicitly', () => {
    // This is more of a component lifecycle test. 
    // If the component is removed, the panel (child) is unmounted.
    const { unmount } = render(<CameraBlockEditor {...defaultProps} />);
    
    fireEvent.click(screen.getByTestId('camera-card'));
    expect(screen.getByTestId('settings-panel')).toBeInTheDocument();

    unmount();
    expect(screen.queryByTestId('settings-panel')).not.toBeInTheDocument();
  });
});

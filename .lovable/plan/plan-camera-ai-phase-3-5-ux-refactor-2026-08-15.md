# Plan: Camera AI Phase 3.5 — UX Refactor

Refactor the Camera block editor in the checklist builder to a simplified card view and a side settings panel, following the Tieck design language.

## User-facing changes
- **Compact Card**: Camera blocks in the editor list now show only the question, an AI status badge, and a verification summary.
- **Side Settings Panel**: Clicking a Camera block opens a right-side panel (Sheet) for all configurations (Question, Instructions, Advanced Settings).
- **Draft & Save**: Settings in the panel are kept as a draft. Saving applies them to the block; closing without saving asks for confirmation.
- **Test Verification**: A new button allows testing the AI verification with a real photo upload/capture in a dedicated modal.
- **Improved Badges**: Clearer status labels like "Verificação por IA" and "Configuração pendente".

## Technical Details
- **Component Extraction**:
  - `src/components/camera-ai/CameraBlockCard.tsx`: The compact card UI.
  - `src/components/camera-ai/CameraSettingsPanel.tsx`: The side panel logic using `@/components/ui/sheet`.
  - `src/components/camera-ai/CameraTestModal.tsx`: The test verification dialog.
- **State Management**: Use local state within `CameraSettingsPanel` for draft values. Pass a `onSave` callback to update the main checklist state.
- **Verification Service**: Reuse existing `/api/camera-ai/verify` for the "Test Verification" feature, ensuring no operational data is created.
- **Hashing & Cache**: Maintain the `hashQuestion` logic to trigger `compile-policy` only when the question text changes and is saved.
- **Styles**: Use `hover:bg-neutral-50`, `border-neutral-200`, and `pink` for primary actions.

## Constraints
- **Zero Engine Changes**: No modifications to `compile-policy` API, OpenAI prompts, or semantic thresholds.
- **No Real Inferences in Tests**: Mock all AI calls in automated tests.
- **Compatibility**: No destructive migrations; handle blocks without explicit modes by defaulting to "Automático".

# Plan: Fix Image Regression and UX Hierarchy in SubmissionsTab

Fixing the broken image thumbnails and redundant/confusing UX in the Submissions tab for the `txqfdscdlltohpkkznwa` project.

## User Review Required

> [!IMPORTANT]
> - This plan modifies the visual presentation and data fetching logic for the "Envios" tab.
> - No database migrations or OpenAI inferences are required.
> - Signed URLs will be regenerated client-side for secure access to private storage.

## Proposed Changes

### 1. Data Source and Image Fix (Backend/Frontend Integration)
- **Problem:** Thumbnails are broken because they use public URLs or direct storage paths for private bucket objects.
- **Solution:**
    - Update `SubmissionsTab` to use `getEvidenceSignedUrl` from `src/lib/evidence-signed-url.ts` for all images stored in the `checklist-evidences` bucket.
    - Validate that `storage_path` correctly points to the private bucket and handle potential "broken icon" scenarios with a "Imagem indisponível" placeholder.
    - Ensure signed URLs are created on-the-fly during rendering or through a dedicated effect to avoid expiration.

### 2. UX Hierarchy and Labeling (UI/UX)
- **Problem:** Redundant labels ("1 FOTO RECEBIDA" vs "Foto recebida") and lack of clear differentiation between AI decisions and human review.
- **Solution:**
    - **Header:** Change "X FOTOS RECEBIDAS" to "X evidência" (singular) or "X evidências" (plural).
    - **Cards:**
        - Remove the redundant "Foto recebida" label inside individual cards.
        - Display the original checklist question as the title for each block.
        - **Camera AI Status (Source of Truth: `camera_ai_attempts`):**
            - `approved` -> "Aprovada pela IA" (Green)
            - `rejected` -> "Rejeitada pela IA" (Red)
            - `failed`/`technical_failure` -> "Verificação indisponível" (Gray)
            - No attempt -> "Sem verificação automática" (Gray)
        - **Human Review Status:** Separate section showing "Não revisada", "Confirmada", or "Marcada para revisão".
    - **Cleanup:** Remove the "Usar para treinar a IA" button as it's not supported.

### 3. Image Presentation (Styling)
- **Problem:** Inconsistent image proportions in thumbnails and modals.
- **Solution:**
    - Apply `object-fit: cover` to thumbnails.
    - Apply `object-fit: contain` to the enlarged modal view.
    - Ensure responsive layout for both portrait and landscape images.

## Technical Details

- **Files affected:**
    - `src/components/SubmissionsTab.tsx`: Major refactor of rendering logic and data hydration.
- **Verification Plan:**
    - Run `npm run test:camera-ai` to ensure no regressions in verification logic.
    - Run `npm run build` to verify type safety and bundle integrity.
    - Manually verify in the browser: Dashboard -> Checklist -> Envios -> Inspect existing submissions.

## Verification
- Confirm singular/plural logic for "evidência".
- Confirm status badges correctly reflect DB values.
- Confirm thumbnails load correctly via signed URLs.
- Confirm no extra OpenAI calls or database writes.

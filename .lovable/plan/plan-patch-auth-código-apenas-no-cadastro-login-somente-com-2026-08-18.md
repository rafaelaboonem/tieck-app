# Plan: PATCH AUTH — CÓDIGO APENAS NO CADASTRO, LOGIN SOMENTE COM SENHA

Refactor the authentication flow to use Email + Password for Login and a two-step verification flow for Signup (Email + Password + OTP Verification).

## Proposed Changes

### 1. Authentication UI & Logic (`src/components/AuthPage.tsx`)
- **Login Mode**:
    - Remove OTP-related UI and logic.
    - Add Password field with show/hide toggle.
    - Use `supabase.auth.signInWithPassword` for authentication.
- **Signup Mode**:
    - **Step 1**: Collect Name, Email, Password, and Confirm Password.
    - Validate password strength (min 8 chars) and confirmation match.
    - Invoke Edge Function `signup-request-otp` to send verification code.
    - **Step 2**: Collect 6-digit OTP.
    - Invoke `signup-verify-otp` to obtain a `verificationToken`.
    - Invoke `signup-complete` with all collected data (Name, Email, Password, Token).
    - **Auto-Login**: Automatically sign in the user after successful signup using `signInWithPassword`.
- **General**:
    - Preserve `safeRedirect` logic (including invitations).
    - Use `lucide-react` icons for password visibility.
    - Implement numeric-only filtering for OTP input.

### 2. Testing (`src/server/auth/auth-flows-v4.test.tsx`)
- Add comprehensive Vitests covering the 17 mandatory scenarios:
    - Successful login with password.
    - Login failures (wrong password, missing account).
    - Signup step 1 validation and Edge Function call.
    - Signup step 2 verification and completion.
    - Auto-login after signup.
    - Preservation of redirect parameters.
    - Re-sending OTP logic.

### 3. Verification
- Run `tsgo` for type checking.
- Run `npm run build` to ensure production readiness.
- Execute Vitests to confirm all flows.

## Technical Details
- **Edge Functions**: Reusing `signup-request-otp`, `signup-verify-otp`, and `signup-complete`.
- **Dependencies**: `lucide-react` for icons, `sonner` for notifications, `supabase-js` for auth and functions.
- **Security**: Passwords kept in component state only; never persisted to storage or URLs.

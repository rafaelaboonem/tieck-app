import { supabase } from "@/integrations/supabase/client";

/**
 * Ensures a user profile exists in the 'profiles' table.
 * If not, creates one with default values.
 * This should be called during the authentication bootstrap process.
 */
export async function ensureUserProfile(userId: string, email: string) {
  // Use maybeSingle to avoid 406 errors when not found
  const { data: profile, error: fetchError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!profile && !fetchError) {
    // Profile not found, create it
    console.log(`[Auth-Bootstrap] Creating missing profile for user ${userId}`);
    const displayName = email.split("@")[0];
    const { error: insertError } = await supabase
      .from("profiles")
      .insert([
        {
          id: userId,
          display_name: displayName,
          is_admin: false,
          plan_type: "free",
        },
      ]);

    if (insertError) {
      console.error("[Auth-Bootstrap] Failed to create profile:", insertError);
      return { success: false, error: insertError };
    }
  } else if (fetchError) {
    console.error("[Auth-Bootstrap] Error fetching profile:", fetchError);
    return { success: false, error: fetchError };
  }

  return { success: true };
}

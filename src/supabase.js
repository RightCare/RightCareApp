import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail loudly in dev if the .env wasn't picked up, rather than silently no-op.
if (!url || !anonKey) {
  console.warn(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Add them to .env and restart the dev server with `npx expo start --clear`.'
  );
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: { persistSession: false }, // no login yet; enabled in step 2
});

export const supabaseConfigured = Boolean(url && anonKey);

// Persist a finished consult. Returns { consult_ref, access_code } on success.
// Never throws — a backend hiccup must not break the on-device consult flow.
export async function saveConsult(record) {
  if (!supabaseConfigured) return null;
  try {
    const { data, error } = await supabase
      .from('consults')
      .insert({
        consult_ref: record.id,
        source: 'app',
        name: record.name,
        dob: record.dob,
        sex: record.sex ?? null,
        age: record.age ?? null,
        outcome: record.outcome ?? null,
        medication: record.medication ?? null,
        referral_reason: record.referralReason ?? null,
        query: record.query ?? null,
        answers: record.answers ?? [],
      })
      .select('consult_ref, access_code')
      .single();
    if (error) {
      console.warn('[supabase] saveConsult failed:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[supabase] saveConsult threw:', e?.message ?? e);
    return null;
  }
}

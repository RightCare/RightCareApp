import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { File, Paths } from 'expo-file-system';

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

// Ask the match-scenario Edge Function (Gemini, constrained to the
// pharmacist's SCENARIOS keys) which scenario best fits free-text query.
// Returns a scenario key, null ("no match" — same as today's manual picker),
// or undefined if the call failed/timed out, so callers can fall back to
// local keyword matching without treating "no match" as a failure.
export async function matchScenarioRemote(query, timeoutMs = 4000) {
  if (!supabaseConfigured) return undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const { data, error } = await supabase.functions.invoke('match-scenario', {
      body: { query },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (error) {
      console.warn('[supabase] matchScenarioRemote failed:', error.message);
      return undefined;
    }
    return data?.key ?? null;
  } catch (e) {
    console.warn('[supabase] matchScenarioRemote threw:', e?.message ?? e);
    return undefined;
  }
}

// Conversational triage: given the running conversation (array of
// { role: 'user' | 'assistant', text }), returns the next move:
//   { action: 'ask' | 'suggest' | 'escalate', message, conditionKey }
// Returns undefined if the call failed/timed out, so the caller can fall
// back to the one-shot matcher and never gets stuck.
export async function triageChat(history, timeoutMs = 8000) {
  if (!supabaseConfigured) return undefined;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const { data, error } = await supabase.functions.invoke('triage-chat', {
      body: { history },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (error) {
      console.warn('[supabase] triageChat failed:', error.message);
      return undefined;
    }
    if (!data || !data.action) return undefined;
    return data;
  } catch (e) {
    console.warn('[supabase] triageChat threw:', e?.message ?? e);
    return undefined;
  }
}

// Text-to-speech via the tts-speak Edge Function (ElevenLabs). Downloads the
// audio to a local cache file and returns its uri, ready for expo-audio's
// createAudioPlayer — React Native can't reliably play an in-memory Blob.
// Returns null on failure so callers can just skip playback.
export async function synthesizeSpeech(text, timeoutMs = 10000) {
  if (!supabaseConfigured || !text) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(`${url}/functions/v1/tts-speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      console.warn('[supabase] synthesizeSpeech failed:', resp.status, await resp.text());
      return null;
    }
    const bytes = new Uint8Array(await resp.arrayBuffer());
    const file = new File(Paths.cache, `tts-${Date.now()}.mp3`);
    file.create();
    file.write(bytes);
    return file.uri;
  } catch (e) {
    console.warn('[supabase] synthesizeSpeech threw:', e?.message ?? e);
    return null;
  }
}

// Speech-to-text via the stt-transcribe Edge Function (ElevenLabs Scribe).
// fileUri is a local recording (e.g. from expo-audio). Returns the
// transcribed text, or null on failure.
export async function transcribeSpeech(fileUri, timeoutMs = 15000) {
  if (!supabaseConfigured || !fileUri) return null;
  try {
    const form = new FormData();
    form.append('file', { uri: fileUri, name: 'recording.m4a', type: 'audio/m4a' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const { data, error } = await supabase.functions.invoke('stt-transcribe', {
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (error) {
      console.warn('[supabase] transcribeSpeech failed:', error.message);
      return null;
    }
    return data?.text || null;
  } catch (e) {
    console.warn('[supabase] transcribeSpeech threw:', e?.message ?? e);
    return null;
  }
}

// A returning patient's regular medications, matched by name + DOB (no
// login yet — see schema.sql). Returns [] on failure so the questionnaire
// just shows no suggestions rather than breaking.
export async function listPatientMedications(name, dob) {
  if (!supabaseConfigured || !name || !dob) return [];
  try {
    const { data, error } = await supabase.functions.invoke('patient-medications', {
      body: { action: 'list', name, dob },
    });
    if (error) {
      console.warn('[supabase] listPatientMedications failed:', error.message);
      return [];
    }
    return data?.medications ?? [];
  } catch (e) {
    console.warn('[supabase] listPatientMedications threw:', e?.message ?? e);
    return [];
  }
}

export async function addPatientMedication(name, dob, medication) {
  if (!supabaseConfigured || !name || !dob || !medication) return false;
  try {
    const { error } = await supabase.functions.invoke('patient-medications', {
      body: { action: 'add', name, dob, medication },
    });
    if (error) console.warn('[supabase] addPatientMedication failed:', error.message);
    return !error;
  } catch (e) {
    console.warn('[supabase] addPatientMedication threw:', e?.message ?? e);
    return false;
  }
}

// Permanently forgets a medication for this patient (they're no longer
// taking it, so it shouldn't be suggested again).
export async function removePatientMedication(name, dob, medication) {
  if (!supabaseConfigured || !name || !dob || !medication) return false;
  try {
    const { error } = await supabase.functions.invoke('patient-medications', {
      body: { action: 'remove', name, dob, medication },
    });
    if (error) console.warn('[supabase] removePatientMedication failed:', error.message);
    return !error;
  } catch (e) {
    console.warn('[supabase] removePatientMedication threw:', e?.message ?? e);
    return false;
  }
}

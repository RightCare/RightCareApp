// Stand-in for the future phone-call backend.
//
// It does what a Twilio/voice-agent webhook will eventually do: create a
// finished consult server-side, then read it back to prove it landed. This
// exercises the exact call -> server -> (later) app path, minus the telephony.
//
// Usage:
//   node --env-file=.env scripts/simulate-call.mjs
//
// Needs SUPABASE_SERVICE_ROLE_KEY + EXPO_PUBLIC_SUPABASE_URL in .env.

import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    '\n✗ Missing env. Need EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.\n'
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const ref = 'PC-' + Math.random().toString(36).slice(2, 8).toUpperCase();

const consult = {
  consult_ref: ref,
  source: 'phone',
  name: 'Test Caller',
  dob: '14/03/1990',
  sex: 'Female',
  age: 35,
  outcome: 'Pharmacist consultation — Chloramphenicol eye drops',
  medication: 'Chloramphenicol eye drops',
  referral_reason: null,
  query: 'red itchy eye for two days',
  answers: [
    { q: 'Reason for visit', a: 'Conjunctivitis (eye infection)' },
    { q: 'Medicine is for', a: 'Myself' },
    { q: 'Duration', a: '1–3 days' },
  ],
};

console.log('\n→ Simulating an inbound call creating a consult…');

const { data: created, error: insErr } = await admin
  .from('consults')
  .insert(consult)
  .select('consult_ref, access_code, source, created_at')
  .single();

if (insErr) {
  console.error('✗ Insert failed:', insErr.message);
  process.exit(1);
}

console.log('✓ Consult created on the server:');
console.log('    consult_ref:', created.consult_ref);
console.log('    access_code:', created.access_code, ' ← what the caller would receive');
console.log('    source:     ', created.source);

// Read it back the way the app will (by the code the caller was given).
const { data: fetched, error: selErr } = await admin
  .from('consults')
  .select('consult_ref, name, outcome, answers')
  .eq('access_code', created.access_code)
  .single();

if (selErr) {
  console.error('✗ Read-back failed:', selErr.message);
  process.exit(1);
}

console.log('\n✓ Read back by access_code — round trip works:');
console.log('   ', fetched.name, '·', fetched.outcome);
console.log('    answers:', fetched.answers.length, 'items\n');

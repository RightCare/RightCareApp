// Lists / adds / removes a patient's regular medications, matched by
// name + DOB (no login yet — see schema.sql for the caveat). Uses the
// service_role key so the table can stay fully locked to anon/authenticated
// clients: every lookup here is for exactly the name+dob it was given,
// never a blanket SELECT, so a leaked anon key can't enumerate the table.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically in
// every Edge Function's environment — no `supabase secrets set` needed.
//
// Deploy: npx supabase functions deploy patient-medications --project-ref <ref>

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { action, name, dob, medication } = await req.json();
    if (!name || typeof name !== 'string' || !dob || typeof dob !== 'string') {
      return json({ error: 'name and dob are required' }, 400);
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const nameKey = name.trim();
    const dobKey = dob.trim();

    if (action === 'list') {
      const { data, error } = await admin
        .from('patient_medications')
        .select('medication')
        .ilike('name', nameKey)
        .eq('dob', dobKey)
        .order('medication');
      if (error) throw error;
      return json({ medications: (data ?? []).map((r) => r.medication) });
    }

    if (action === 'add') {
      if (!medication || typeof medication !== 'string' || !medication.trim()) {
        return json({ error: 'medication is required' }, 400);
      }
      const { error } = await admin
        .from('patient_medications')
        .upsert({ name: nameKey, dob: dobKey, medication: medication.trim() }, { onConflict: 'name,dob,medication' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === 'remove') {
      if (!medication || typeof medication !== 'string' || !medication.trim()) {
        return json({ error: 'medication is required' }, 400);
      }
      const { error } = await admin
        .from('patient_medications')
        .delete()
        .ilike('name', nameKey)
        .eq('dob', dobKey)
        .eq('medication', medication.trim());
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: 'action must be "list", "add", or "remove"' }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

// Proxies speech-to-text to ElevenLabs Scribe so the API key never ships in
// the app bundle. Client sends the recorded audio as multipart/form-data
// (field name "file"); we forward it to ElevenLabs and return { text }.
//
// Deploy:  npx supabase functions deploy stt-transcribe --project-ref <ref>
// Secret:  npx supabase secrets set ELEVENLABS_API_KEY=... --project-ref <ref>

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const incoming = await req.formData();
    const file = incoming.get('file');
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'multipart field "file" is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

    const outgoing = new FormData();
    outgoing.append('model_id', 'scribe_v1');
    outgoing.append('file', file, 'recording.m4a');

    const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: outgoing,
    });

    if (!resp.ok) throw new Error(`ElevenLabs STT error: ${resp.status} ${await resp.text()}`);

    const data = await resp.json();
    return new Response(JSON.stringify({ text: data.text ?? '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

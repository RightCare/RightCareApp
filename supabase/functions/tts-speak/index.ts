// Proxies text-to-speech to ElevenLabs so the API key never ships in the app
// bundle. Returns raw MP3 bytes — the client saves them to a local file and
// plays it with expo-audio (React Native can't reliably play an in-memory
// Blob directly).
//
// Deploy:  npx supabase functions deploy tts-speak --project-ref <ref>
// Secrets: npx supabase secrets set ELEVENLABS_API_KEY=... --project-ref <ref>
//          npx supabase secrets set ELEVENLABS_VOICE_ID=... --project-ref <ref>  (optional)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// "Rachel" — a default ElevenLabs voice, used only if ELEVENLABS_VOICE_ID
// isn't set. Pick your own from the ElevenLabs dashboard's voice library.
const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { text } = await req.json();
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');
    const voiceId = Deno.env.get('ELEVENLABS_VOICE_ID') || DEFAULT_VOICE_ID;

    const resp = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
      }
    );

    if (!resp.ok) throw new Error(`ElevenLabs TTS error: ${resp.status} ${await resp.text()}`);

    return new Response(resp.body, { headers: { ...corsHeaders, 'Content-Type': 'audio/mpeg' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

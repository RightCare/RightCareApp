// Classifies a patient's free-text reason for visiting into one of the
// pharmacist-curated scenarios from src/theme.js — never invents a new
// category, question, symptom, or piece of advice. The Gemini call uses a
// JSON schema whose `key` field is an enum of exactly these ids (+ "none"),
// so the model is structurally unable to return anything outside this list.
//
// Deploy:  npx supabase functions deploy match-scenario --project-ref <ref>
// Secret:  npx supabase secrets set GEMINI_API_KEY=... --project-ref <ref>

// Keep in sync with SCENARIOS in ../../../src/theme.js whenever the
// pharmacist adds or changes a scenario.
const SCENARIOS: Record<string, { label: string; hint: string }> = {
  hayfever: { label: 'Hay fever / allergies', hint: 'sneezing, runny nose, itchy eyes, blocked nose, pollen, congestion' },
  uti: { label: 'Urinary symptoms (UTI)', hint: 'burning or stinging when urinating, frequent urge, bladder, cystitis' },
  headache: { label: 'Headache / migraine', hint: 'head pain, tension headache, migraine' },
  coldsore: { label: 'Cold sore', hint: 'lip blister, tingling lip, herpes, fever blister' },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query || typeof query !== 'string') {
      return new Response(JSON.stringify({ error: 'query is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const keys = Object.keys(SCENARIOS);
    const catalogue = keys.map((k) => `- "${k}": ${SCENARIOS[k].label} (${SCENARIOS[k].hint})`).join('\n');

    const prompt =
      `A pharmacy patient described their reason for visiting:\n"${query}"\n\n` +
      `Match it to exactly one of these pharmacist-curated categories, or "none" if nothing fits well:\n${catalogue}\n\n` +
      `Respond with only the matching key.`;

    // Uses the Gemini Interactions API (generateContent is retired for this
    // project). Note: Google's own docs show "v1beta2/interactions", but
    // that path 404s — the live endpoint is "v1beta/interactions".
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: 'gemini-3.5-flash',
        input: prompt,
        response_format: [
          {
            type: 'text',
            mime_type: 'application/json',
            schema: {
              type: 'object',
              properties: { key: { type: 'string', enum: [...keys, 'none'] } },
              required: ['key'],
            },
          },
        ],
      }),
    });

    if (!resp.ok) throw new Error(`Gemini API error: ${resp.status} ${await resp.text()}`);

    const data = await resp.json();
    const modelStep = (data.steps ?? []).find((s: { type: string }) => s.type === 'model_output');
    const text = modelStep?.content?.find((c: { type: string }) => c.type === 'text')?.text;
    const parsed = JSON.parse(text ?? '{}');
    const key = keys.includes(parsed.key) ? parsed.key : null;

    return new Response(JSON.stringify({ key }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

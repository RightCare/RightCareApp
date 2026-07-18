// Conversational triage brain (Part 1).
//
// Given the running conversation, Gemini decides the NEXT move: ask one more
// clarifying question, suggest a pharmacist-curated condition, or escalate to
// a GP / emergency care. It is deliberately constrained:
//   • It may only ever route to a condition id from the curated catalogue
//     below (schema enum) — it cannot invent a condition.
//   • It never provides clinical advice or a medicine choice; that lives in
//     the pharmacist-authored questionnaire that runs AFTER a condition is
//     chosen, on the client.
//   • Its whole job here is understanding + routing + safe escalation.
//
// Deploy:  npx supabase functions deploy triage-chat --project-ref <ref>

// Keep in sync with SCENARIOS in ../../../src/theme.js.
const CONDITIONS: Record<string, { label: string; hint: string }> = {
  hayfever: { label: 'Hay fever / allergies', hint: 'sneezing, runny nose, itchy eyes, blocked nose, pollen, congestion' },
  uti: { label: 'Urinary symptoms (UTI)', hint: 'burning or stinging when urinating, frequent urge, bladder, cystitis' },
  headache: { label: 'Headache / migraine', hint: 'head pain, tension headache, migraine' },
  coldsore: { label: 'Cold sore', hint: 'lip blister, tingling lip, herpes, fever blister' },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Turn = { role: 'user' | 'assistant'; text: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { history } = (await req.json()) as { history?: Turn[] };
    if (!Array.isArray(history) || history.length === 0) {
      return new Response(JSON.stringify({ error: 'history (non-empty array) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const keys = Object.keys(CONDITIONS);
    const catalogue = keys.map((k) => `- "${k}": ${CONDITIONS[k].label} (${CONDITIONS[k].hint})`).join('\n');
    const transcript = history.map((t) => `${t.role === 'user' ? 'Patient' : 'Assistant'}: ${t.text}`).join('\n');

    const instructions =
      `You are a calm, friendly pharmacy assistant for an Australian community pharmacy. ` +
      `You help a patient describe what's going on so they can be routed to the right ` +
      `pharmacist-curated assessment. You do NOT diagnose, recommend medicines, or give ` +
      `clinical advice — that happens later in a curated questionnaire.\n\n` +
      `The pharmacist can help with exactly these conditions:\n${catalogue}\n\n` +
      `Decide the single best NEXT action:\n` +
      `- "ask": you need ONE more short, plain-language clarifying question to understand ` +
      `which condition this is. Keep it conversational and warm. Prefer to ask at most 1–2 ` +
      `questions total before suggesting.\n` +
      `- "suggest": you are reasonably confident it matches ONE condition above. Set ` +
      `conditionKey to that id and write a short friendly lead-in (e.g. "Sounds like this ` +
      `might be hay fever.").\n` +
      `- "escalate": there are red flags, it's an emergency, or it's clearly outside the ` +
      `conditions above. Set conditionKey to "none" and gently explain they should see a GP ` +
      `(or call 000 if severe). Escalate for things like: chest pain, difficulty breathing, ` +
      `a sudden "worst ever" headache, symptoms in very young children, or anything not in ` +
      `the list.\n\n` +
      `Keep "message" to 1–2 warm, non-clinical sentences. Never list the raw condition ids.\n\n` +
      `Conversation so far:\n${transcript}\n\n` +
      `Respond with the next action as JSON.`;

    // Gemini Interactions API (generateContent is retired for this project).
    // Live endpoint is v1beta/interactions (docs' v1beta2 path 404s).
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: 'gemini-3.5-flash',
        input: instructions,
        response_format: [
          {
            type: 'text',
            mime_type: 'application/json',
            schema: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['ask', 'suggest', 'escalate'] },
                message: { type: 'string' },
                conditionKey: { type: 'string', enum: [...keys, 'none'] },
              },
              required: ['action', 'message', 'conditionKey'],
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

    // Defensive normalisation: never trust the key blindly.
    const action = ['ask', 'suggest', 'escalate'].includes(parsed.action) ? parsed.action : 'ask';
    const conditionKey = keys.includes(parsed.conditionKey) ? parsed.conditionKey : null;
    const message = typeof parsed.message === 'string' && parsed.message.trim()
      ? parsed.message.trim()
      : 'Could you tell me a bit more about what you’re experiencing?';

    // If it claimed "suggest" but gave no valid condition, downgrade to "ask".
    const safeAction = action === 'suggest' && !conditionKey ? 'ask' : action;

    return new Response(JSON.stringify({ action: safeAction, message, conditionKey }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

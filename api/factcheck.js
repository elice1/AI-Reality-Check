const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: "Missing text" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Server not configured" });

  try {
    const claimResult = await callGemini(apiKey, 100,
      `Analyze this text: "${text}"
Is this a verifiable factual claim?
- Opinions, questions, feelings → reply exactly: NOT_A_CLAIM
- Verifiable facts, statistics, events, quotes → reply with the core claim in 1 sentence
Reply with ONLY the claim sentence or NOT_A_CLAIM.`
    );

    if (claimResult.trim() === "NOT_A_CLAIM") {
      return res.json({ type: "NOT_A_CLAIM", original: text });
    }

    const claim = claimResult.trim();

    const verdictRaw = await callGemini(apiKey, 500,
      `You are a fact-checker. Evaluate this claim:
CLAIM: "${claim}"
No live sources available. Use your training knowledge only.
Reply with ONLY this JSON (no markdown, no extra text):
{"score":"VERIFIED","confidence":85,"summary":"2-3 sentence verdict.","keyFindings":["finding 1","finding 2"],"reasoning":"brief reason"}
score must be exactly one of: VERIFIED, DISPUTED, UNVERIFIABLE`
    );

    const clean = verdictRaw.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    let verdict;
    try { verdict = JSON.parse(clean); }
    catch { verdict = { score: "UNVERIFIABLE", confidence: 0, summary: clean.slice(0, 300), keyFindings: [], reasoning: "" }; }

    return res.json({ type: "VERDICT", original: text, claim, verdict, articles: [] });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

async function callGemini(apiKey, maxTokens, prompt) {
  const res = await fetch(`${GEMINI_API}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.1 }
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini ${res.status}: ${err.error?.message || res.statusText}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

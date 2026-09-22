import { ai } from "hatchable";

export const access = "member";
export const methods = ["POST"];

const SYSTEM = `You are MediKiosk's clinical documentation extraction engine.
You are NOT a diagnostic or prescribing system.
Convert supplied patient/document text into conservative structured documentation.
Never invent facts. If information is absent, use null or an empty array.
Preserve uncertainty and distinguish patient-reported information from extracted information.
Return ONLY valid JSON with this exact top-level shape:
{
  "patient": {"name": null, "age": null, "sex": null},
  "symptoms": [],
  "conditions": [],
  "medications": [],
  "allergies": [],
  "procedures": [],
  "investigations": [],
  "dates": [],
  "redFlagsForClinicianReview": [],
  "missingInformation": [],
  "sourceNotes": []
}
Each medication should contain name, strength, dose, frequency, route, timing, duration, confidence.
Each item must be traceable to supplied text where possible.`;

export default async function (req, res) {
  const text = String(req.body?.text || "").trim();
  if (!text || text.length > 50000) {
    return res.status(400).json({ error: "text is required and must be <= 50,000 characters" });
  }

  try {
    const result = await ai.generateText({
      model: "gemini-flash",
      purpose: "medikiosk-extraction",
      system: SYSTEM,
      prompt: text,
      maxTokens: 5000
    });

    if (result.finishReason === "length") {
      return res.status(502).json({ error: "AI response was truncated; extraction was not accepted." });
    }

    let parsed;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      return res.status(502).json({ error: "AI returned non-JSON output", raw: result.text.slice(0, 4000) });
    }

    res.json({ data: parsed, model: "gemini-flash", usage: result.usage || null });
  } catch (e) {
    console.error("LLM extraction failed", e);
    res.status(502).json({ error: "LLM extraction failed", code: e?.code || null });
  }
}
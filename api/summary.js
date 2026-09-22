import { ai, db } from "hatchable";

export const access = "public";
export const methods = ["POST"];

const SYSTEM = `You are MediKiosk's physician-documentation assistant.
Create a concise clinical intake summary from supplied structured/patient information.
Do not diagnose, prescribe, or recommend treatment.
Never invent missing information.
Separate patient-reported facts, document-extracted facts, and clinician-review safety signals.
Use "Not recorded" for missing single-value fields.
Return ONLY valid JSON:
{
  "chiefComplaint": "",
  "historyOfPresentingComplaint": "",
  "relevantHistory": [],
  "medications": [],
  "allergies": [],
  "investigations": [],
  "timeline": [],
  "safetySignalsForClinicianReview": [],
  "missingInformation": [],
  "verificationItems": []
}`;

export default async function (req, res) {
  const sessionId = String(req.body?.sessionId || "");
  if (!sessionId) return res.status(400).json({ error: "sessionId is required." });

  const { rows } = await db.query(
    "SELECT id, patient_name, patient_age, language, chief_complaint, intake_json FROM clinical_sessions WHERE id=$1",
    [sessionId]
  );
  if (!rows.length) return res.status(404).json({ error: "Session not found." });

  const docs = await db.query(
    "SELECT id, filename, ocr_text, extraction_json, verification_status FROM clinical_documents WHERE session_id=$1 ORDER BY created_at ASC",
    [sessionId]
  );

  const source = JSON.stringify({ session: rows[0], documents: docs.rows });
  if (source.length > 60000) return res.status(413).json({ error: "Clinical record is too large for one summary request. Summarize documents individually first." });

  try {
    const result = await ai.generateText({
      model: "gemini-flash",
      purpose: "medikiosk-summary",
      system: SYSTEM,
      prompt: source,
      maxTokens: 5000
    });

    if (result.finishReason === "length") return res.status(502).json({ error: "Summary was truncated and was not accepted." });

    let summary;
    try { summary = JSON.parse(result.text); }
    catch { return res.status(502).json({ error: "Summary model returned invalid JSON." }); }

    await db.query(
      "UPDATE clinical_sessions SET intake_json = intake_json || $1::jsonb, status='in_review', updated_at=now() WHERE id=$2",
      [JSON.stringify({ lastSummary: summary, summaryUpdatedAt: new Date().toISOString() }), sessionId]
    );

    await db.query(
      "INSERT INTO clinical_events (session_id, event_type, source, payload) VALUES ($1,$2,$3,$4)",
      [sessionId, "summary_generated", "ai", JSON.stringify(summary)]
    );

    res.json({ sessionId, summary, model: "gemini-flash", usage: result.usage || null, clinicianReviewRequired: true });
  } catch (e) {
    console.error("Summary failed", e);
    res.status(502).json({ error: "Summary generation failed", code: e?.code || null });
  }
}
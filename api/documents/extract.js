import { ai, db } from "hatchable";

export const access = "public";
export const methods = ["POST"];

export default async function (req, res) {
  const documentId = String(req.body?.documentId || "");
  if (!documentId) return res.status(400).json({ error: "documentId is required." });

  const { rows } = await db.query(
    "SELECT id, session_id, ocr_text FROM clinical_documents WHERE id=$1",
    [documentId]
  );
  if (!rows.length) return res.status(404).json({ error: "Document not found." });

  const text = rows[0].ocr_text;
  if (!text) return res.status(400).json({ error: "No OCR text is available for this document." });

  const result = await ai.generateText({
    model: "gemini-flash",
    purpose: "medikiosk-document-extraction",
    system: `Extract medical facts from the supplied OCR text conservatively. Never diagnose or prescribe. Return ONLY JSON with keys: medications, conditions, allergies, investigations, procedures, dates, symptoms, redFlagsForClinicianReview, missingInformation, sourceNotes. Do not invent facts. For medications include name, strength, dose, frequency, route, timing, duration and confidence.`,
    prompt: text.slice(0, 50000),
    maxTokens: 5000
  });

  if (result.finishReason === "length") return res.status(502).json({ error: "Extraction was truncated." });

  let data;
  try {
    const raw = String(result.text || "").trim();
    const unfenced = raw.replace(/^\`\`\`(?:json)?\s*/i, "").replace(/\s*\`\`\`$/i, "").trim();
    data = JSON.parse(unfenced);
  } catch {
    return res.status(502).json({ error: "Extraction model returned invalid JSON." });
  }

  await db.query(
    "UPDATE clinical_documents SET extraction_json=$1, verification_status='pending' WHERE id=$2",
    [JSON.stringify(data), documentId]
  );

  await db.query(
    "INSERT INTO clinical_events (session_id, event_type, source, payload) VALUES ($1,$2,$3,$4)",
    [rows[0].session_id, "document_extraction_completed", "ai", JSON.stringify({ documentId, data })]
  );

  res.json({ documentId, data, verificationRequired: true });
}
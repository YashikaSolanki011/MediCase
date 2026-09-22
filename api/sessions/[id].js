import { db } from "hatchable";

export const access = "member";
export const methods = ["GET"];

export default async function (req, res) {
  const id = String(req.params?.id || "");
  if (!id) return res.status(400).json({ error: "session id is required." });

  const sessions = await db.query(
    "SELECT id, patient_name, patient_age, language, chief_complaint, intake_json, status, created_at, updated_at FROM clinical_sessions WHERE id=$1",
    [id]
  );
  if (!sessions.rows.length) return res.status(404).json({ error: "Session not found." });

  const docs = await db.query(
    "SELECT id, filename, content_type, ocr_text, extraction_json, verification_status, created_at FROM clinical_documents WHERE session_id=$1 ORDER BY created_at ASC",
    [id]
  );
  const events = await db.query(
    "SELECT id, event_type, source, payload, created_at FROM clinical_events WHERE session_id=$1 ORDER BY created_at ASC",
    [id]
  );

  const s = sessions.rows[0];
  const intake = s.intake_json || {};
  return res.json({
    session: {
      id: s.id,
      patientName: s.patient_name,
      patientAge: s.patient_age,
      language: s.language,
      chiefComplaint: s.chief_complaint,
      patientStory: intake.patientStory || "",
      status: s.status,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      lastSummary: intake.lastSummary || null,
      summaryUpdatedAt: intake.summaryUpdatedAt || null,
      documents: docs.rows.map(d => ({
        id: d.id,
        filename: d.filename,
        contentType: d.content_type,
        ocrText: d.ocr_text,
        extraction: d.extraction_json || {},
        verificationStatus: d.verification_status,
        createdAt: d.created_at
      }))
    },
    events: events.rows.map(e => ({
      id: e.id,
      eventType: e.event_type,
      source: e.source,
      payload: e.payload,
      createdAt: e.created_at
    }))
  });
}
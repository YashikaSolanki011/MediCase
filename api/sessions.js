import { db } from "hatchable";

export const access = "public";
export const methods = ["GET","POST"];

export default async function (req, res) {
  if (req.method === "GET") {
    const limit = Math.min(Math.max(Number(req.query?.limit || 8), 1), 50);
    const { rows } = await db.query(
      "SELECT id, patient_name, patient_age, language, chief_complaint, status, created_at, updated_at FROM clinical_sessions ORDER BY updated_at DESC LIMIT $1",
      [limit]
    );
    return res.json({
      sessions: rows.map(r => ({
        id: r.id,
        patientName: r.patient_name,
        patientAge: r.patient_age,
        language: r.language,
        chiefComplaint: r.chief_complaint,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
    });
  }

  const body = req.body || {};
  const name = String(body.patientName || "").trim().slice(0, 200);
  const age = Number.isFinite(Number(body.patientAge)) ? Number(body.patientAge) : null;
  const language = String(body.language || "English").slice(0, 50);
  const complaint = String(body.chiefComplaint || "").trim().slice(0, 5000);
  const story = String(body.story || "").trim().slice(0, 10000);

  if (!name && !complaint) {
    return res.status(400).json({ error: "patientName or chiefComplaint is required" });
  }

  const intake = {
    patientName: name || "Not recorded",
    patientAge: age,
    language,
    chiefComplaint: complaint || "Not recorded",
    patientStory: story || "Not recorded"
  };

  const { rows } = await db.query(
    "INSERT INTO clinical_sessions (patient_name, patient_age, language, chief_complaint, intake_json) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at, updated_at",
    [name || null, age, language, complaint || null, JSON.stringify(intake)]
  );

  await db.query(
    "INSERT INTO clinical_events (session_id, event_type, source, payload) VALUES ($1,$2,$3,$4)",
    [rows[0].id, "session_created", "patient", JSON.stringify(intake)]
  );

  res.status(201).json({ sessionId: rows[0].id, createdAt: rows[0].created_at, intake });
}
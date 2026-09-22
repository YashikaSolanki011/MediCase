import { db } from "hatchable";

export const access = "public";
export const methods = ["POST"];

export default async function (req, res) {
  const body = req.body || {};
  const name = String(body.patientName || "").trim().slice(0, 200);
  const age = Number.isFinite(Number(body.patientAge)) ? Number(body.patientAge) : null;
  const language = String(body.language || "English").slice(0, 50);
  const complaint = String(body.chiefComplaint || "").trim().slice(0, 5000);

  if (!name && !complaint) {
    return res.status(400).json({ error: "patientName or chiefComplaint is required" });
  }

  const intake = {
    patientName: name || "Not recorded",
    patientAge: age,
    language,
    chiefComplaint: complaint || "Not recorded"
  };

  const { rows } = await db.query(
    "INSERT INTO clinical_sessions (patient_name, patient_age, language, chief_complaint, intake_json) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at",
    [name || null, age, language, complaint || null, JSON.stringify(intake)]
  );

  await db.query(
    "INSERT INTO clinical_events (session_id, event_type, source, payload) VALUES ($1,$2,$3,$4)",
    [rows[0].id, "session_created", "patient", JSON.stringify(intake)]
  );

  res.status(201).json({ sessionId: rows[0].id, createdAt: rows[0].created_at, intake });
}
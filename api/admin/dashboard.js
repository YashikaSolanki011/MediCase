import { admin, db } from 'hatchable';

export const access = 'admin';
export const methods = ['GET'];

export default async function (req, res) {
  const [sessions, documents, users, recent] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS n FROM clinical_sessions'),
    db.query('SELECT COUNT(*)::int AS n FROM clinical_documents'),
    db.query('SELECT COUNT(DISTINCT owner_user_id)::int AS n FROM clinical_sessions WHERE owner_user_id IS NOT NULL'),
    db.query('SELECT id, patient_name AS "patientName", chief_complaint AS "chiefComplaint", language, updated_at AS "updatedAt" FROM clinical_sessions ORDER BY updated_at DESC LIMIT 20')
  ]);
  const profile = await admin.profile(req);
  res.json({
    admin: profile ? {email: profile.email, handle: profile.handle} : null,
    stats: {
      sessions: sessions.rows[0].n,
      documents: documents.rows[0].n,
      users: users.rows[0].n
    },
    sessions: recent.rows
  });
}
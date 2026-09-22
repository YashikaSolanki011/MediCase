import { admin, db } from 'hatchable';

export const access = 'admin';
export const methods = ['GET'];

export default async function (req, res) {
  const [
    sessions,
    documents,
    users,
    completed,
    pendingDocs,
    languages,
    documentTypes,
    recentActivity
  ] = await Promise.all([
    db.query('SELECT COUNT(*)::int AS n FROM clinical_sessions'),
    db.query('SELECT COUNT(*)::int AS n FROM clinical_documents'),
    db.query('SELECT COUNT(DISTINCT owner_user_id)::int AS n FROM clinical_sessions WHERE owner_user_id IS NOT NULL'),
    db.query("SELECT COUNT(*)::int AS n FROM clinical_sessions WHERE status IN ('completed','ready','reviewed')"),
    db.query("SELECT COUNT(*)::int AS n FROM clinical_documents WHERE verification_status IS DISTINCT FROM 'verified'"),
    db.query("SELECT COALESCE(language, 'Unknown') AS language, COUNT(*)::int AS count FROM clinical_sessions GROUP BY language ORDER BY count DESC"),
    db.query("SELECT COALESCE(NULLIF(split_part(content_type, '/', 2), ''), 'unknown') AS type, COUNT(*)::int AS count FROM clinical_documents GROUP BY type ORDER BY count DESC"),
    db.query("SELECT date_trunc('day', created_at) AS day, COUNT(*)::int AS count FROM clinical_sessions WHERE created_at >= NOW() - INTERVAL '30 days' GROUP BY day ORDER BY day")
  ]);

  const profile = await admin.profile(req);
  res.json({
    admin: profile ? { email: profile.email, handle: profile.handle } : null,
    stats: {
      totalPatients: sessions.rows[0].n,
      totalDocuments: documents.rows[0].n,
      totalUsers: users.rows[0].n,
      completedSessions: completed.rows[0].n,
      pendingDocuments: pendingDocs.rows[0].n
    },
    breakdowns: {
      languages: languages.rows,
      documentTypes: documentTypes.rows,
      activity30d: recentActivity.rows
    }
  });
}
import { db } from "hatchable";

export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const patients = await db.query("SELECT count(*)::int AS count FROM benchmark_patients");
  const docs = await db.query("SELECT count(*)::int AS count FROM benchmark_documents");
  const byType = await db.query("SELECT document_type, count(*)::int AS count FROM benchmark_documents GROUP BY document_type ORDER BY document_type");
  return res.json({
    name: "MediKiosk Gold Test Set",
    synthetic: true,
    purpose: "SIH26047 evaluation benchmark",
    patients: patients.rows[0]?.count || 0,
    documents: docs.rows[0]?.count || 0,
    documentsByType: byType.rows,
    note: "Synthetic ground-truth records. Public OCR datasets will be added as a separate image benchmark."
  });
}
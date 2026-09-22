import { ai, storage, db } from "hatchable";

export const access = "public";
export const methods = ["POST"];

const VISION_MODEL = "gemini-2.5-flash";

export default async function (req, res) {
  const file = req.files?.[0];
  const sessionId = String(req.body?.sessionId || "").trim();

  if (!file) return res.status(400).json({ error: "Upload a document or image in multipart/form-data." });
  if (!sessionId) return res.status(400).json({ error: "sessionId is required." });
  if (!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.contentType)) {
    return res.status(400).json({ error: "Supported types: JPEG, PNG, WEBP, PDF." });
  }
  if (file.buffer.length > 15 * 1024 * 1024) {
    return res.status(413).json({ error: "File too large. Maximum is 15 MB." });
  }

  const storageKey = `clinical/${sessionId}/${crypto.randomUUID()}-${file.filename}`;
  await storage.put(storageKey, file.buffer, file.contentType);

  const b64 = Buffer.from(file.buffer).toString("base64");
  const prompt = `You are the OCR/document-understanding layer of MediKiosk.
Extract ONLY text that is visibly present in this medical document. Preserve medicine names, doses, units, dates, headings and numbers exactly as seen where possible.
Do not diagnose. Do not correct ambiguous OCR into a guessed value.
Return plain text only. Mark an unreadable region as [UNCLEAR] rather than inventing it.`;

  try {
    const r = await ai.fetch({
      provider: "google",
      path: `/v1beta/models/${VISION_MODEL}:generateContent`,
      body: {
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: file.contentType, data: b64 } }
          ]
        }],
        generationConfig: { responseModalities: ["TEXT"] }
      },
      purpose: "medikiosk-ocr",
      timeoutMs: 120000
    });

    if (!r.ok) {
      console.error("Gemini OCR failed", { status: r.status, error: r.error });
      return res.status(502).json({ error: "OCR provider failed. The uploaded file was retained for retry." });
    }

    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();

    if (!text) return res.status(502).json({ error: "OCR provider returned no readable text." });

    const { rows } = await db.query(
      "INSERT INTO clinical_documents (session_id, filename, content_type, storage_key, ocr_text) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at",
      [sessionId, file.filename, file.contentType, storageKey, text]
    );

    await db.query(
      "INSERT INTO clinical_events (session_id, event_type, source, payload) VALUES ($1,$2,$3,$4)",
      [sessionId, "document_ocr_completed", "ocr", JSON.stringify({ documentId: rows[0].id, filename: file.filename })]
    );

    res.json({
      documentId: rows[0].id,
      filename: file.filename,
      text,
      verificationRequired: true,
      message: "OCR completed. Verify all medicines, doses and numbers against the original document."
    });
  } catch (e) {
    console.error("OCR exception", e);
    res.status(502).json({ error: "OCR request failed", code: e?.code || null });
  }
}
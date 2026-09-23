import { supabase, requireUser, sendError, geminiGenerate } from "../../lib/server.js";

const SYSTEM=`Extract medical facts from supplied OCR text conservatively. Never diagnose or prescribe. Return ONLY JSON with keys: medications, conditions, allergies, investigations, procedures, dates, symptoms, redFlagsForClinicianReview, missingInformation, sourceNotes. Do not invent facts. For medications include name, strength, dose, frequency, route, timing, duration and confidence.`;

export default async function(req,res){
 try{
  const user=await requireUser(req); const documentId=String(req.body?.documentId||"");
  if(!documentId)return res.status(400).json({error:"documentId is required."});
  const {data:doc,error}=await supabase.from("clinical_documents").select("id,session_id,ocr_text").eq("id",documentId).single();
  if(error||!doc)return res.status(404).json({error:"Document not found."});
  const {data:owner}=await supabase.from("clinical_sessions").select("id").eq("id",doc.session_id).eq("owner_user_id",user.id).single();
  if(!owner)return res.status(404).json({error:"Document not found."});
  if(!doc.ocr_text)return res.status(400).json({error:"No OCR text is available for this document."});
  const result=await geminiGenerate({model:process.env.GEMINI_TEXT_MODEL||"gemini-2.5-flash",system:SYSTEM,prompt:doc.ocr_text.slice(0,50000),maxTokens:5000,json:true});
  let parsed;try{parsed=JSON.parse(result.text);}catch{ return res.status(502).json({error:"Extraction model returned invalid JSON."});}
  const {error:ue}=await supabase.from("clinical_documents").update({extraction_json:parsed,verification_status:"pending"}).eq("id",documentId);
  if(ue)throw ue;
  await supabase.from("clinical_events").insert({session_id:doc.session_id,event_type:"document_extraction_completed",source:"ai",payload:{documentId,data:parsed}});
  await supabase.from("clinical_sessions").update({status:"in_review",updated_at:new Date().toISOString()}).eq("id",doc.session_id);
  res.json({documentId,data:parsed,verificationRequired:true});
 }catch(e){sendError(res,e);}
}
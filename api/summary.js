import { supabase, requireUser, sendError, geminiGenerate } from "../lib/server.js";
const SYSTEM=`You are MediKiosk's physician-documentation assistant. Create a concise clinical intake summary from supplied structured/patient information. Do not diagnose, prescribe, or recommend treatment. Never invent missing information. Separate patient-reported facts, document-extracted facts, and clinician-review safety signals. Use "Not recorded" for missing single-value fields. Return ONLY valid JSON with chiefComplaint, historyOfPresentingComplaint, relevantHistory, medications, allergies, investigations, timeline, safetySignalsForClinicianReview, missingInformation, verificationItems.`;
export default async function(req,res){
 try{
  const user=await requireUser(req);const sessionId=String(req.body?.sessionId||"");if(!sessionId)return res.status(400).json({error:"sessionId is required."});
  const {data:s,error:se}=await supabase.from("clinical_sessions").select("id,patient_name,patient_age,language,chief_complaint,intake_json").eq("id",sessionId).eq("owner_user_id",user.id).single();if(se||!s)return res.status(404).json({error:"Session not found."});
  const {data:docs,error:de}=await supabase.from("clinical_documents").select("id,filename,ocr_text,extraction_json,verification_status").eq("session_id",sessionId).order("created_at",{ascending:true});if(de)throw de;
  const source=JSON.stringify({session:s,documents:docs||[]});if(source.length>60000)return res.status(413).json({error:"Clinical record is too large for one summary request."});
  const result=await geminiGenerate({model:process.env.GEMINI_TEXT_MODEL||"gemini-2.5-flash",system:SYSTEM,prompt:source,maxTokens:5000,json:true});let summary;try{summary=JSON.parse(result.text)}catch{return res.status(502).json({error:"Summary model returned invalid JSON."})};
  const intake={...(s.intake_json||{}),lastSummary:summary,summaryUpdatedAt:new Date().toISOString()};
  await supabase.from("clinical_sessions").update({intake_json:intake,status:"in_review",updated_at:new Date().toISOString()}).eq("id",sessionId);
  await supabase.from("clinical_events").insert({session_id:sessionId,event_type:"summary_generated",source:"ai",payload:summary});
  res.json({sessionId,summary,model:process.env.GEMINI_TEXT_MODEL||"gemini-2.5-flash",usage:result.usage,clinicianReviewRequired:true});
 }catch(e){sendError(res,e,"Summary generation failed");}
}
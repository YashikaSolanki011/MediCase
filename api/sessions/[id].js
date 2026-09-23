import { supabase, requireUser, sendError } from "../../lib/server.js";

export default async function(req,res){
  try{
    const user=await requireUser(req);
    const id=String(req.query?.id||req.params?.id||"");
    if(!id)return res.status(400).json({error:"session id is required."});
    const {data:s,error}=await supabase.from("clinical_sessions").select("id,owner_user_id,patient_name,patient_age,language,chief_complaint,intake_json,status,created_at,updated_at").eq("id",id).eq("owner_user_id",user.id).single();
    if(error||!s)return res.status(404).json({error:"Session not found."});
    const [{data:docs,error:de},{data:events,error:ee}]=await Promise.all([
      supabase.from("clinical_documents").select("id,filename,content_type,ocr_text,extraction_json,verification_status,created_at").eq("session_id",id).order("created_at",{ascending:true}),
      supabase.from("clinical_events").select("id,event_type,source,payload,created_at").eq("session_id",id).order("created_at",{ascending:true})
    ]);
    if(de)throw de;if(ee)throw ee;
    const intake=s.intake_json||{};
    res.json({session:{id:s.id,patientName:s.patient_name,patientAge:s.patient_age,language:s.language,chiefComplaint:s.chief_complaint,patientStory:intake.patientStory||"",status:s.status,createdAt:s.created_at,updatedAt:s.updated_at,lastSummary:intake.lastSummary||null,summaryUpdatedAt:intake.summaryUpdatedAt||null,documents:(docs||[]).map(d=>({id:d.id,filename:d.filename,contentType:d.content_type,ocrText:d.ocr_text,extraction:d.extraction_json||{},verificationStatus:d.verification_status,createdAt:d.created_at}))},events:(events||[]).map(e=>({id:e.id,eventType:e.event_type,source:e.source,payload:e.payload,createdAt:e.created_at}))});
  }catch(e){sendError(res,e);}
}
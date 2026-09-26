import { supabase, requireUser, sendError } from "../lib/server.js";

export default async function(req,res){
  try{
    const user=await requireUser(req);
    if(req.method==="GET"){
      const limit=Math.min(Math.max(Number(req.query?.limit||8),1),50);
      const {data,error}=await supabase.from("clinical_sessions").select("id,patient_name,patient_age,language,chief_complaint,status,created_at,updated_at").eq("owner_user_id",user.id).order("updated_at",{ascending:false}).limit(limit);
      if(error) throw error;
      return res.json({sessions:(data||[]).map(r=>({id:r.id,patientName:r.patient_name,patientAge:r.patient_age,language:r.language,chiefComplaint:r.chief_complaint,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at}))});
    }
    const body=req.body||{};
    const name=String(body.patientName||"").trim().slice(0,200);
    const age=Number.isFinite(Number(body.patientAge))?Number(body.patientAge):null;
    const language=String(body.language||"English").slice(0,50);
    const complaint=String(body.chiefComplaint||"").trim().slice(0,5000);
    const story=String(body.story||"").trim().slice(0,10000);
    if(!name&&!complaint)return res.status(400).json({error:"patientName or chiefComplaint is required"});
    const intake={patientName:name||"Not recorded",patientAge:age,language,chiefComplaint:complaint||"Not recorded",patientStory:story||"Not recorded"};
    const {data:session,error}=await supabase.from("clinical_sessions").insert({owner_user_id:user.id,patient_name:name||null,patient_age:age,language,chief_complaint:complaint||null,intake_json:intake}).select("id,created_at,updated_at").single();
    if(error)throw error;
    const {error:eventError}=await supabase.from("clinical_events").insert({session_id:session.id,event_type:"session_created",source:"patient",payload:intake});
    if(eventError)throw eventError;
    res.status(201).json({sessionId:session.id,createdAt:session.created_at,intake});
  }catch(e){sendError(res,e);}
}
import { supabase, requireAdmin, sendError } from "../../lib/server.js";
export default async function(req,res){
 try{
  const user=await requireAdmin(req);
  const [{count:patients,error:pe},{count:docs,error:de},{data:sessions,error:se}]=await Promise.all([
   supabase.from("clinical_sessions").select("*",{count:"exact",head:true}),
   supabase.from("clinical_documents").select("*",{count:"exact",head:true}),
   supabase.from("clinical_sessions").select("owner_user_id,language,status,created_at")
  ]);
  if(pe||de||se)throw pe||de||se;
  const {data:documents,error:docErr}=await supabase.from("clinical_documents").select("content_type,verification_status");
  if(docErr)throw docErr;
  const totalUsers=new Set((sessions||[]).map(x=>x.owner_user_id).filter(Boolean)).size;
  const completed=(sessions||[]).filter(x=>["completed","ready","reviewed"].includes(x.status)).length;
  const pending=(documents||[]).filter(x=>x.verification_status!=="verified").length;
  const languages={};for(const x of sessions||[])languages[x.language||"Unknown"]=(languages[x.language||"Unknown"]||0)+1;
  const documentTypes={};for(const x of documents||[]){const t=(x.content_type||"unknown").split("/")[1]||"unknown";documentTypes[t]=(documentTypes[t]||0)+1;}
  const cutoff=Date.now()-30*24*60*60*1000;const activity30d={};for(const x of sessions||[]){if(new Date(x.created_at).getTime()>=cutoff){const day=String(x.created_at).slice(0,10);activity30d[day]=(activity30d[day]||0)+1;}}
  res.json({admin:{email:user.email},stats:{totalPatients:patients||0,totalDocuments:docs||0,totalUsers,completedSessions:completed,pendingDocuments:pending},breakdowns:{languages:Object.entries(languages).map(([language,count])=>({language,count})),documentTypes:Object.entries(documentTypes).map(([type,count])=>({type,count})),activity30d:Object.entries(activity30d).map(([day,count])=>({day,count}))}});
 }catch(e){sendError(res,e);}
}
import { supabase } from "../lib/server.js";
export default async function(req,res){
 const [{count:patients,error:pError},{count:docs,error:dError}]=await Promise.all([
  supabase.from("benchmark_patients").select("*",{count:"exact",head:true}),
  supabase.from("benchmark_documents").select("*",{count:"exact",head:true})
 ]);
 if(pError||dError)return res.status(500).json({error:pError?.message||dError?.message});
 const {data:byType}=await supabase.from("benchmark_documents").select("document_type");
 const grouped={};for(const row of byType||[])grouped[row.document_type]=(grouped[row.document_type]||0)+1;
 res.json({name:"MediKiosk Gold Test Set",synthetic:true,purpose:"SIH26047 evaluation benchmark",patients:patients||0,documents:docs||0,documentsByType:Object.entries(grouped).map(([document_type,count])=>({document_type,count})),note:"Synthetic ground-truth records. Public OCR datasets will be added as a separate image benchmark."});
}
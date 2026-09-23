import { supabase } from "../../lib/server.js";

export default async function (req,res){
  const { data, error } = await supabase.rpc("now").catch(()=>({data:null,error:null}));
  const { data: probe, error: dbError } = await supabase.from("clinical_sessions").select("id").limit(1);
  if(dbError) return res.status(500).json({ok:false,service:"MediKiosk API",database:"error",error:dbError.message});
  res.json({ok:true,service:"MediKiosk API",database:"connected",ai:{provider:"google",configured:Boolean(process.env.GEMINI_API_KEY)}});
}
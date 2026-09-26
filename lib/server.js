import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false } }
);

export async function requireUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const e = new Error("Not signed in.");
    e.status = 401;
    throw e;
  }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const e = new Error("Not signed in.");
    e.status = 401;
    throw e;
  }
  return data.user;
}

export async function requireAdmin(req) {
  const user = await requireUser(req);
  const admins = String(process.env.ADMIN_EMAILS || "").split(",").map(x=>x.trim().toLowerCase()).filter(Boolean);
  if (!admins.includes(String(user.email||"").toLowerCase())) {
    const e = new Error("Administrator access required.");
    e.status = 403;
    throw e;
  }
  return user;
}

export function sendError(res,e,fallback="Request failed.") {
  const status = Number(e?.status) || 500;
  res.status(status).json({error:e?.message || fallback});
}

export async function geminiGenerate({model,prompt,system,maxTokens=5000,json=false,parts=null}) {
  const key=process.env.GEMINI_API_KEY;
  if(!key) throw new Error("GEMINI_API_KEY is not configured.");
  const contents=[{role:"user",parts:parts || [{text:prompt}]}];
  const body={
    systemInstruction: system ? {parts:[{text:system}]} : undefined,
    contents,
    generationConfig:{maxOutputTokens:maxTokens,...(json?{responseMimeType:"application/json"}:{})}
  };
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)
  });
  const data=await r.json().catch(()=>({}));
  if(!r.ok) {
    const msg=data?.error?.message || `Gemini returned HTTP ${r.status}`;
    const e=new Error(msg); e.status=502; throw e;
  }
  const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("").trim();
  if(!text) throw new Error("Gemini returned no text.");
  return {text,usage:data?.usageMetadata||null};
}

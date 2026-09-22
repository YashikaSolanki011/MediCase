import { db } from "hatchable";

export const access = "public";
export const methods = ["GET"];

export default async function (req, res) {
  const { rows } = await db.query("SELECT now() AS server_time");
  res.json({
    ok: true,
    service: "MediKiosk API",
    database: "connected",
    serverTime: rows[0].server_time,
    ai: { provider: "google", configuredThroughHatchable: true }
  });
}
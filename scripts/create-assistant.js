import "dotenv/config";
import fs from "node:fs";
import { buildAssistant } from "../lib/assistant.js";
const { VAPI_PRIVATE_KEY, PUBLIC_URL } = process.env;
if (!VAPI_PRIVATE_KEY) { console.error("Set VAPI_PRIVATE_KEY in .env"); process.exit(1); }
const res = await fetch("https://api.vapi.ai/assistant", {
  method: "POST", headers: { Authorization: `Bearer ${VAPI_PRIVATE_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify(buildAssistant({ publicUrl: PUBLIC_URL }))
});
const data = await res.json();
if (!res.ok) { console.error("Vapi error:", data); process.exit(1); }
let env = fs.readFileSync(".env", "utf8");
env = /^VAPI_ASSISTANT_ID=.*$/m.test(env) ? env.replace(/^VAPI_ASSISTANT_ID=.*$/m, `VAPI_ASSISTANT_ID=${data.id}`) : env + `\nVAPI_ASSISTANT_ID=${data.id}\n`;
fs.writeFileSync(".env", env);
console.log("Assistant created:", data.id);

import "dotenv/config";
import express from "express";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAssistant } from "./lib/assistant.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const env = () => process.env;
const DATA = path.join(__dirname, "data");
fs.mkdirSync(DATA, { recursive: true });

const read = (f, d = []) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return d; } };
const write = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2));
const addTo = (f, item) => write(f, [item, ...read(f)].slice(0, 2000));
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const prettyDate = () => new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" });
const pct = s => s.total ? Math.round((s.attended / s.total) * 100) : 0;
const admin = (req, res, next) => req.get("x-admin-key") === (env().ADMIN_KEY || "change-me") ? next() : res.status(401).json({ error: "Wrong admin key" });
const verifyVapiWebhook = (req, res, next) => {
  const secret = process.env.VAPI_WEBHOOK_TOKEN;

  if (!secret) {
    console.error("VAPI_WEBHOOK_TOKEN is missing");
    return res.status(503).json({
      error: "Webhook authentication is not configured"
    });
  }

  const authorization = req.get("authorization") || "";
  const expected = `Bearer ${secret}`;

  const receivedBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return res.status(401).json({
      error: "Unauthorized webhook request"
    });
  }

  next();
};

const vapi = (p, body) => fetch("https://api.vapi.ai" + p, {
  method: "POST", headers: { Authorization: `Bearer ${env().VAPI_PRIVATE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body)
});

async function ensureAssistant() {
  const e = env();
  if (e.VAPI_ASSISTANT_ID || !e.VAPI_PRIVATE_KEY) return;
  const r = await vapi("/assistant", buildAssistant({ publicUrl: e.PUBLIC_URL }));
  const d = await r.json();
  if (!r.ok) return console.error("Could not create assistant:", d);
  process.env.VAPI_ASSISTANT_ID = d.id;
  const f = path.join(__dirname, ".env");
  let txt = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  txt = /^VAPI_ASSISTANT_ID=.*$/m.test(txt) ? txt.replace(/^VAPI_ASSISTANT_ID=.*$/m, `VAPI_ASSISTANT_ID=${d.id}`) : txt + `\nVAPI_ASSISTANT_ID=${d.id}\n`;
  fs.writeFileSync(f, txt);
  console.log("✔ ADAM assistant created:", d.id);
}

// ---- outbound parent notification ----
async function notifyParent(s) {
  const e = env();
  if (!e.VAPI_PHONE_NUMBER_ID) throw new Error("Set VAPI_PHONE_NUMBER_ID in .env");
  const first = `नमस्ते ${s.parentName} जी, मैं एडम बोल रहा हूँ, Career Point University, Kota से। क्या मैं ${s.parentName} जी से बात कर रहा हूँ?`;
  const r = await vapi("/call", {
    assistantId: e.VAPI_ASSISTANT_ID, phoneNumberId: e.VAPI_PHONE_NUMBER_ID,
    customer: { number: s.parentPhone, name: s.parentName },
    assistantOverrides: {
      firstMessage: first,
      variableValues: {
        studentName: s.name, rollNumber: s.rollNumber, course: s.course, parentName: s.parentName,
        today: prettyDate(), todayStatus: s.absentToday ? "ABSENT" : "present", attendancePercent: String(pct(s)),
        recentAbsences: (s.recentAbsences || []).slice(-5).join(", ") || "none"
      }
    }
  });
  const d = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(d));
  addTo("notifications.json", { at: new Date().toISOString(), rollNumber: s.rollNumber, student: s.name, parent: s.parentName, phone: s.parentPhone, callId: d.id });
  return d.id;
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/config", (_q, res) => res.json({ publicKey: env().VAPI_PUBLIC_KEY || "", assistantId: env().VAPI_ASSISTANT_ID || "" }));

// ---- Vapi webhook: tools + end-of-call reports ----
app.post("/api/webhook", verifyVapiWebhook, (req, res) => {
  const m = req.body?.message || {};
  if (m.type === "end-of-call-report") {
    addTo("calls.json", { id: m.call?.id, at: new Date().toISOString(), who: m.call?.customer?.number || "web call",
      endedReason: m.endedReason, summary: m.summary || m.analysis?.summary || "", transcript: m.transcript || "" });
  }
  if (m.type === "tool-calls") {
    const results = (m.toolCallList || []).map(t => {
      const a = typeof t.arguments === "string" ? JSON.parse(t.arguments || "{}") : (t.arguments || {});
      const students = read("students.json");
      const s = students.find(x => x.rollNumber.toLowerCase() === String(a.rollNumber || "").trim().toLowerCase());
      let result = "Unknown tool.";
      if (t.name === "getAttendance") {
        if (!s || !s.parentPhone.endsWith(String(a.parentPhoneLast4 || "").trim())) result = "VERIFICATION FAILED. Do not share any details.";
        else result = `Student ${s.name}, ${s.course}. Overall attendance ${pct(s)}% (${s.attended} of ${s.total} classes). Absent today: ${s.absentToday ? "yes" : "no"}. Recent absences: ${(s.recentAbsences || []).slice(-5).join(", ") || "none"}.`;
      } else if (t.name === "logAbsenceReason") {
        addTo("reasons.json", { at: new Date().toISOString(), rollNumber: a.rollNumber, student: s?.name || "?", reason: a.reason });
        result = "Reason saved.";
      } else if (t.name === "requestCallback") {
        addTo("callbacks.json", { at: new Date().toISOString(), name: a.name, phone: a.phone || "", topic: a.topic });
        result = "Callback request saved. Tell the parent the university will call back.";
      }
      return { toolCallId: t.id, result };
    });
    return res.json({ results });
  }
  res.json({ ok: true });
});

// ---- admin APIs ----
app.get("/api/students", admin, (_q, res) => res.json(read("students.json").map(s => ({ ...s, percent: pct(s) }))));
app.post("/api/students/:roll/absent", admin, (req, res) => {
  const list = read("students.json"); const s = list.find(x => x.rollNumber === req.params.roll);
  if (!s) return res.status(404).json({ error: "Not found" });
  const absent = !!req.body.absent, d = today();
  if (absent && !s.absentToday) { s.total += 1; s.recentAbsences = [...(s.recentAbsences || []), d].slice(-30); }
  if (!absent && s.absentToday) { s.total = Math.max(0, s.total - 1); s.recentAbsences = (s.recentAbsences || []).filter(x => x !== d); }
  s.absentToday = absent; write("students.json", list); res.json({ ok: true });
});
app.post("/api/students/import", admin, (req, res) => {
  const rows = String(req.body.csv || "").trim().split(/\r?\n/).map(l => l.split(",").map(x => x.trim()));
  if (rows[0]?.[0]?.toLowerCase() === "rollnumber") rows.shift();
  const list = rows.filter(r => r.length >= 7).map(r => ({ rollNumber: r[0], name: r[1], course: r[2], parentName: r[3], parentPhone: r[4],
    attended: +r[5] || 0, total: +r[6] || 0, absentToday: false, recentAbsences: [], notifiedOn: "" }));
  if (!list.length) return res.status(400).json({ error: "No valid rows. Format: rollNumber,name,course,parentName,parentPhone,attended,total" });
  write("students.json", list); res.json({ imported: list.length });
});
app.post("/api/notify/:roll", admin, async (req, res) => {
  try {
    const list = read("students.json"); const s = list.find(x => x.rollNumber === req.params.roll);
    if (!s) return res.status(404).json({ error: "Not found" });
    if (!/^\+\d{8,15}$/.test(s.parentPhone)) return res.status(400).json({ error: "Parent phone must look like +919876543210" });
    const id = await notifyParent(s); s.notifiedOn = today(); write("students.json", list); res.json({ ok: true, callId: id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/notify-absent", admin, async (_q, res) => {
  const list = read("students.json"), todo = list.filter(s => s.absentToday && s.notifiedOn !== today() && /^\+\d{8,15}$/.test(s.parentPhone));
  res.json({ started: todo.length });
  for (const s of todo) {
    try { await notifyParent(s); s.notifiedOn = today(); write("students.json", list); } catch (e) { console.error(s.rollNumber, e.message); }
    await new Promise(r => setTimeout(r, 8000));
  }
});
for (const k of ["calls", "notifications", "reasons", "callbacks"]) app.get(`/api/${k}`, admin, (_q, res) => res.json(read(`${k}.json`)));

const port = env().PORT || 3000;
app.listen(port, async () => {
  console.log(`ADAM (CPU Kota) → http://localhost:${port}   dashboard: /admin.html`);
  if (!env().VAPI_PRIVATE_KEY || !env().VAPI_PUBLIC_KEY) console.log("⚠ Add your Vapi keys to .env, then restart.");
  try { await ensureAssistant(); } catch (e) { console.error(e.message); }
});

import fs from "node:fs";

const tool = (name, description, properties, required, server) => ({
  type: "function", function: { name, description, parameters: { type: "object", properties, required } }, server
});

export function buildAssistant({ publicUrl }) {
  const prompt = fs.readFileSync(new URL("../prompts/system-prompt.md", import.meta.url), "utf8");
  const server = publicUrl && publicUrl.startsWith("https") ? { url: `${publicUrl}/api/webhook` } : undefined;
  const tools = server ? [
    tool("getAttendance", "Get a student's attendance after verifying the parent.",
      { rollNumber: { type: "string" }, parentPhoneLast4: { type: "string", description: "Last 4 digits of the registered parent mobile" } },
      ["rollNumber", "parentPhoneLast4"], server),
    tool("logAbsenceReason", "Save the reason the parent gives for the student's absence.",
      { rollNumber: { type: "string" }, reason: { type: "string" } }, ["rollNumber", "reason"], server),
    tool("requestCallback", "Ask the university office/coordinator to call the parent back.",
      { name: { type: "string" }, phone: { type: "string" }, topic: { type: "string" } }, ["name", "topic"], server)
  ] : [];

  return {
    name: "ADAM - CPU Kota",
    firstMessage: "नमस्ते! मैं एडम हूँ, Career Point University, Kota का AI assistant। मैं आपकी कैसे मदद कर सकता हूँ?",
    model: { provider: "openai", model: "gpt-4o", temperature: 0.4, messages: [{ role: "system", content: prompt }], tools },
    voice: { provider: "azure", voiceId: "hi-IN-MadhurNeural" },
    transcriber: { provider: "deepgram", model: "nova-3", language: "multi" },
    ...(server && { server }),
    endCallMessage: "धन्यवाद! आपका दिन शुभ हो। Goodbye!",
    maxDurationSeconds: 420,
    silenceTimeoutSeconds: 25
  };
}

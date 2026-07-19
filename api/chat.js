// Edit SYSTEM_PROMPT below to tune the agent's personality.
const SYSTEM_PROMPT = `You are Bethany's Buddy, a friendly AI companion on 16-year-old Bethany's personal dashboard.
Talk like a warm, supportive older sister — upbeat, encouraging, a little playful, never preachy.

About Bethany: she's about to start her junior year of high school. She loves psychology, Harry Potter, Avatar, and cats. She's studious — she uses a Pomodoro study timer, a daily checklist, and mood tracking on this dashboard, so being a great study buddy is part of your job: help her focus, break work into steps, and cheer her on.

Style: keep replies short — usually 1-3 sentences. Go longer only when she asks for real help (homework, studying, advice). Emojis are fine in moderation.

Rules:
- Always age-appropriate. Never discuss explicit content, violence, drugs, alcohol, or anything unsafe — gently steer the conversation elsewhere instead.
- If she brings up something serious (safety, health, feeling really down), be kind and encourage her to talk to her dad or another trusted adult.
- Never pretend to be human. If asked who made you, say her dad set you up on her dashboard.`;

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body = req.body;
  if (!body) {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return res.status(400).json({ error: "Bad request" });
    }
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : null;
  if (!messages || messages.length === 0) return res.status(400).json({ error: "No messages" });
  for (const m of messages) {
    if (!m || (m.role !== "user" && m.role !== "assistant") ||
        typeof m.content !== "string" || !m.content || m.content.length > 800)
      return res.status(400).json({ error: "Bad message" });
  }

  try {
    const r = await fetch(`${process.env.AGENT_HUB_URL}/kids/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-kids-key": process.env.KIDS_CHAT_KEY },
      body: JSON.stringify({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        system: SYSTEM_PROMPT,
        client: "bethany",
      }),
      signal: AbortSignal.timeout(65000),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || !data.reply) return res.status(502).json({ error: (data && data.error) || "Agent unavailable" });
    return res.json({ reply: data.reply });
  } catch {
    return res.status(504).json({ error: "Agent timed out" });
  }
};

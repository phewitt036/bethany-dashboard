const ZONES = ["ceiling", "desk", "all"];
const SCENES = ["study", "wind_down", "movie", "ravenclaw", "avatar"];

function buildPayload(body) {
  switch (body.action) {
    case "state":
      return { action: "state" };
    case "power":
      if (!ZONES.includes(body.zone) || typeof body.on !== "boolean") return null;
      return { action: "power", zone: body.zone, on: body.on };
    case "brightness": {
      const value = Number(body.value);
      if (!ZONES.includes(body.zone) || !Number.isInteger(value) || value < 1 || value > 100) return null;
      return { action: "brightness", zone: body.zone, value };
    }
    case "scene":
      if (!SCENES.includes(body.scene)) return null;
      return { action: "scene", scene: body.scene };
    default:
      return null;
  }
}

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

  const payload = buildPayload(body || {});
  if (!payload) return res.status(400).json({ error: "Bad request" });

  try {
    const r = await fetch(`${process.env.AGENT_HUB_URL}/kids/lights`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-kids-key": process.env.KIDS_CHAT_KEY },
      body: JSON.stringify({ ...payload, client: "bethany" }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data) return res.status(502).json({ error: (data && data.error) || "Lights unavailable" });
    return res.json(data);
  } catch {
    return res.status(504).json({ error: "Lights timed out" });
  }
};

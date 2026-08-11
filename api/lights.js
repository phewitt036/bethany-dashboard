const SCENES = ["sunrise", "study", "wind_down", "movie", "ravenclaw", "avatar"];

// Govee strips accept roughly 2000K (candle warm) to 9000K (daylight cool).
const KELVIN_MIN = 2000;
const KELVIN_MAX = 9000;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function parseDays(days) {
  if (days === undefined) return [0, 1, 2, 3, 4, 5, 6];
  if (!Array.isArray(days) || days.length === 0 || days.length > 7) return null;
  const seen = new Set();
  for (const d of days) {
    if (!Number.isInteger(d) || d < 0 || d > 6 || seen.has(d)) return null;
    seen.add(d);
  }
  return [...seen].sort();
}

function buildPayload(body) {
  switch (body.action) {
    case "state":
      return { action: "state" };
    case "power":
      if (typeof body.on !== "boolean") return null;
      return { action: "power", on: body.on };
    case "brightness": {
      const value = Number(body.value);
      if (!Number.isInteger(value) || value < 1 || value > 100) return null;
      return { action: "brightness", value };
    }
    case "warmth": {
      const kelvin = Number(body.kelvin);
      if (!Number.isInteger(kelvin) || kelvin < KELVIN_MIN || kelvin > KELVIN_MAX) return null;
      return { action: "warmth", kelvin };
    }
    case "color":
      if (typeof body.hex !== "string" || !HEX_RE.test(body.hex)) return null;
      return { action: "color", hex: body.hex.toLowerCase() };
    case "scene":
      if (!SCENES.includes(body.scene)) return null;
      return { action: "scene", scene: body.scene };
    case "wake_set": {
      if (typeof body.enabled !== "boolean") return null;
      if (typeof body.time !== "string" || !TIME_RE.test(body.time)) return null;
      const days = parseDays(body.days);
      if (!days) return null;
      return { action: "wake_set", enabled: body.enabled, time: body.time, days };
    }
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

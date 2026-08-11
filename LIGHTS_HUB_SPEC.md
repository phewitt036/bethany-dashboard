# `/kids/lights` — agent-hub contract

What the dashboard sends and what comes back. Both halves are implemented as of
2026-08-11: the hub side lives in `~/agent-hub/server.js` on **pimax**
(`192.168.4.123`), under pm2 as `agent-hub`.

## Shape

```
browser → POST /api/lights            (Vercel function, api/lights.js — validates, no auth)
        → POST $AGENT_HUB_URL/kids/lights
          headers: x-kids-key: $KIDS_CHAT_KEY
          body:    { ...action, client: "bethany" }
        → Home Assistant at 192.168.4.73:8123
          light.h802a + light.h802a_2
```

The strips are driven **locally over the LAN through Home Assistant**, not Govee's cloud,
so there is no third-party rate limit to design around — only HA's own lag, which is why
control actions answer from `lightsCache` rather than reading state back.

`api/lights.js` rejects malformed input before it reaches the hub, but the hub re-validates
everything: it is the thing holding the HA token.

## Requests

| Action | Body | Notes |
|---|---|---|
| `state` | `{ action: "state" }` | Reads HA, returns light + wake schedule |
| `power` | `{ action: "power", on: bool }` | |
| `brightness` | `{ action: "brightness", value: 1–100 }` | integer |
| `scene` | `{ action: "scene", scene: <name> }` | `sunrise`, `study`, `wind_down`, `movie`, `ravenclaw`, `avatar` |
| `warmth` | `{ action: "warmth", kelvin: 2000–9000 }` | integer; white/CT mode |
| `color` | `{ action: "color", hex: "#rrggbb" }` | lowercased, always 6 digits |
| `wake_set` | `{ action: "wake_set", enabled: bool, time: "HH:MM", days: [0–6] }` | 24h; `days` 0=Sunday, sorted, deduped, 1–7 entries |

Both strips report `supported_color_modes: ["color_temp", "rgb"]` with a kelvin range of
**2000–9000K**, which is what the API validates against. The dashboard's warmth slider only
exposes 2000–6500K, so the UI range can be widened later without touching the hub.

## Response

```json
{
  "light": { "on": true, "brightness": 25, "kelvin": 2200, "color": null },
  "wake":  { "enabled": true, "time": "06:45", "days": [1,2,3,4,5] }
}
```

`color` and `kelvin` are mutually exclusive — the strips are in one mode or the other, and
setting either clears the other. The card renders whichever is live. `state` also returns
`reachable`, the count of strips that answered, so one unplugged strip doesn't blank the card.

## The sunrise ramp

`scene: "sunrise"` and the scheduled wake-up run the same routine:

1. Power on, warm white **2200K**, brightness **1%**.
2. Ramp to **25% over 10 minutes** — 24 steps, one percent every 25s.
3. Hold at 25%. No auto-off.

Each step is 2 HA calls on the LAN, so the ramp is cheap; it also bypasses
`KIDS_LIGHTS_DAILY_LIMIT` (400/day), which only counts endpoint requests.

**Any manual touch cancels a ramp in progress** — `power`, `brightness`, `warmth`, `color`,
or a different scene. Waking up to the lights fighting you is worse than no feature.
Cancellation carries a generation counter (`sunriseRun`), because a step sits inside `await`
for seconds and would otherwise repaint and re-arm itself after being cancelled.

To retune the curve, edit `SUNRISE = { kelvin, from, to, minutes }` in `server.js` — and
update the card's helper text in `index.html` (`.wake-note`) so it doesn't lie to her.

## Scheduling

- `time` is **house local time**. pimax runs `America/Chicago`.
- `checkWake` runs every 30s and compares against the wall clock rather than arming an
  absolute timer, so a DST shift, a clock correction, or a restart can't strand the alarm.
  It fires within a two-minute window after the mark, which absorbs a busy event loop.
- `lastFire` (a `YYYY-MM-DD` string) keeps it to once a day and is persisted, so a restart
  mid-morning can't re-fire it.
- Moving the alarm to a time still ahead of you today clears `lastFire` so today can fire
  again; otherwise today stays spent and it resumes tomorrow.
- State persists to `~/agent-hub/data/bethany_wake.json` (gitignored).
- This is a *pre-alarm*: the time she picks is the ramp **start**, meant to land before her
  phone alarm.

## Deploying a change

```
ssh pi@192.168.4.123
cd ~/agent-hub
cp server.js server.js.bak-$(date +%Y%m%d)-<what>
# edit
node --check server.js
PATH=$PATH:$HOME/.npm-global/bin pm2 restart agent-hub --update-env
```

`pm2` is not on the default PATH; it lives in `~/.npm-global/bin`. Secrets come from
`/home/pi/.config/agent-hub.env` via `ecosystem.config.js`; the HA URL and token come from
`/etc/fan-control.conf`.

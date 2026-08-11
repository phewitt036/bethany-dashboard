# `/kids/lights` — agent-hub contract

What the dashboard now sends and what it expects back. The dashboard side is done;
the hub side of the new actions (`warmth`, `color`, `scene:sunrise`, `wake_set`) still
needs implementing.

## Shape

```
browser → POST /api/lights            (Vercel function, api/lights.js — validates, no auth)
        → POST $AGENT_HUB_URL/kids/lights
          headers: x-kids-key: $KIDS_CHAT_KEY
          body:    { ...action, client: "bethany" }
```

`api/lights.js` rejects anything malformed before it reaches the hub, so the hub can trust
shapes — but it is still the thing holding the Govee credentials, so keep validating there too.

## Requests

| Action | Body | Notes |
|---|---|---|
| `state` | `{ action: "state" }` | Also returns the wake schedule now — see below |
| `power` | `{ action: "power", on: bool }` | |
| `brightness` | `{ action: "brightness", value: 1–100 }` | integer |
| `scene` | `{ action: "scene", scene: <name> }` | `sunrise`, `study`, `wind_down`, `movie`, `ravenclaw`, `avatar` |
| `warmth` | `{ action: "warmth", kelvin: 2000–9000 }` | **new** — integer; white/CT mode |
| `color` | `{ action: "color", hex: "#rrggbb" }` | **new** — lowercased, always 6 digits |
| `wake_set` | `{ action: "wake_set", enabled: bool, time: "HH:MM", days: [0–6] }` | **new** — 24h; `days` 0=Sunday, sorted, deduped, 1–7 entries |

The dashboard's warmth slider only exposes 2000–6500K; the API accepts up to 9000K so the
range can be widened in the UI later without touching the hub.

## Response

Every action should return the resulting state, same as today:

```json
{
  "light": { "on": true, "brightness": 25, "kelvin": 2200, "color": null },
  "wake":  { "enabled": true, "time": "06:45", "days": [1,2,3,4,5] }
}
```

- `color` is `null` whenever the strips are in white/CT mode; `kelvin` is `null` (or stale —
  the dashboard ignores it) whenever `color` is set. The two are mutually exclusive on the
  hardware and the UI renders them that way.
- `wake` may be omitted on non-`state` actions; the dashboard leaves its current values alone
  if it's missing. Returning it on `wake_set` is what makes the save confirm.

## The sunrise ramp

`scene: "sunrise"` and the scheduled wake-up run the same routine:

1. Power on, warm white **2200K**, brightness **1%**.
2. Ramp brightness **1% → 25% over 10 minutes**.
3. Hold at 25%. No auto-off — she turns it off herself.

Suggested stepping: +1% every 25s (24 steps). With two strips fanned out that's ~4.8 Govee
calls/minute, under the usual 10/min cloud limit — but if you add more steps for smoothness,
check that ceiling first.

Abort the ramp if she touches the lights mid-way (any `power`, `brightness`, `warmth`,
`color`, or a different `scene` for her room). Waking up and finding the dashboard fighting
you is worse than no feature.

To change the curve, these three numbers are the only thing to edit — the dashboard doesn't
send them, it just describes them in the card's helper text (`index.html`, `.wake-note`), so
update that string to match if you retune it.

## Scheduling

- `time` is **house local time**, not UTC. Recompute across DST rather than storing an epoch.
- Fires on each day in `days`, once per day. `days: [1,2,3,4,5]` is the dashboard default
  (school mornings).
- Persist the schedule — it has to survive a hub restart, and `state` reads it back on page load.
- `enabled: false` keeps `time`/`days` stored so toggling back on restores her settings.
- This is a *pre-alarm*: it's meant to start 10 minutes before her phone alarm, so the time she
  picks is the ramp **start**. Worth confirming that's how she reads it once she uses it.

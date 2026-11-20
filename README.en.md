# CLODEx RP Studio (for Tavo AI & SillyTavern)

**AI Physiology & 18+ Biology Tracker + Underworld, Wanted & Relics (Casino, Pawn Shop, Shadow Services, 12 Egg Skins & ES256 Signed Relics) + Director & Living World (One-Turn Director Strip, Local Anti-Slop Radar, Hidden Thoughts & Action Buttons, Click-to-Reveal Smartphone/Diary, Living Session Wiki, Branch-Safe Journals & `.clodex-pack` Presets) + Cradle & Familiar + Lore Navigator (Codex) + Live Scene Backgrounds, Video & Voice — powered by a single CLODEx API key.**

[Русская документация](README.md) · [Changelog](CHANGELOG.md) · [License](LICENSE)

---

## Highlights

- **Underworld, Wanted & Relics (`v1.4`):**
  - **Underworld Wallet, Casino & Story Wagers (`🧬 Tracker → 🎲 Underworld & Casino`):** Chat-scoped wallet with setting-aware skins (`Auto / Crime / Tavern / Syndicate`), visible outcome displays for **Dice (`2d6`)**, **3-Reel Slots**, interactive **Blackjack (`21`)** (player cards + total, dealer upcard + `[🂠]`, *Hit*, *Stand*, *Double*), and **Story Wagers with `{{char}}`** (*Truth / Wish / Secret* stakes arming one-turn depth-0 world events).
  - **Pawn Shop, Inventory Pawning & Debt Escalation:** Separate loan/pawn valuation, 1-click setting-themed property presets (*Apartment, Car, Estate, Ancestral Blade, Habitat Pod, Cyber Implant*, etc.), 1-click pawning & redemption of items from `state.inventory.user`, character/companion safety filter, and collector DMs + turn-3 voice warning in `📱`.
  - **Wanted (`0..5★`), Factions & Shadow Services:** Visual 5-star heat meter, `-100..+100` standing, 1-click faction import from Session Wiki NPCs, and 3 Shadow Services: *Erase Traces (`−2★`)*, *Black-Market NPC Dossier → `📱`* (`confirmPaid`, auto-refunded if cancelled or failed), and *Call Enforcers / Mercenaries / Cyber-Team* (arms next-turn world event).
  - **Summoning Altar, 12 Egg Skins & Verified Relics (`🐣 Cradle → 🥚 Altar / 💎 Relics`):** Story summons (`50`) and optional paid CLODEx rituals (JSON lore + **Nano Banana** egg art; paid rituals never alter rarity odds), Epic (`10`) & SSR (`30`) pity, live equipping of unlocked egg skins across **Altar pending eggs**, **active Cradle companions**, and **Oviposition Nest eggs**, plus offline `ES256` WebCrypto verification for `clodex.xyz` relic certificates and PNG Character Cards V2.
- **Director & Living World (`v1.3`, ≤ 250 prompt tokens total):**
  - **One-Turn Director Strip (`M1`):** Collapsed bar above the composer (`🎬 Director`). Pick up to 2 quick modifiers (*Suspense, Sudden twist, Dialogue focus, Slow the pacing, Through NPC eyes, More sensory detail*) and/or a 140-char note. Injected at depth 0 for one reply, survives swipes and network errors, and clears automatically once the character reply commits.
  - **Local Anti-Slop Radar (`M2`, Codex → Style):** Fully local 2–5-word n-gram analysis plus built-in RU/EN cliché dictionaries across the last 20 character replies (character & user names excluded). Modes: `Off / Highlight / Highlight + rule` (up to 6 enabled phrases).
  - **Hidden Thoughts & 3 Action Buttons (`M3`):** Shown only under the latest character message (`ui/turn.html` in Tavo, under the last `.mes` in SillyTavern). Extracted inside the existing turn-tracker call (`0` extra requests) and **never** injected back into the role-play prompt. Clicking an action inserts it into the input without sending.
  - **Smartphone / Diary & World Feed (`M4`, `📱` in drawer header):** Secret notes, NPC DMs, world-feed reactions, and hidden photos or TTS voice notes (reflecting pulse & breathing). Auto-selects **Smartphone** or **Grimoire / letters** skin by setting, supports *Present next turn*, and enforces **Click-to-Reveal** (paid media runs only on click with `confirmPaid` and `maxAutoSpendUsd` accounting).
  - **Living Session Wiki (`M5`, Codex → Wiki):** Editable *NPCs*, *Quests & threads*, *Places*, and *Timeline* tables updated roughly every N turns (configurable 4–20, default 8) with swipe-race protection. Manually edited rows are `pinned` and never overwritten; only relevant rows enter the prompt (≤ 120 tokens).
  - **Branch-Safe Journals & Snapshots (`M6`):** Append-only phone/wiki journals keyed by `turnKey` and replayed against active branch keys (`A → B → A` swipes preserve both branches; deletion runs GC).
  - **Data-Only `.clodex-pack` Presets (`M7`, `⚒️ → Packs`):** Export/import director presets, meter packs, Anti-Slop phrases, phone skin, and Codex presets up to 64 KB with import preview and strict validation (no code/HTML, no API keys, no chat state, no media).
- **Tag-Free Physiology & State Tracker:** Uses a fast background CLODEx model to extract JSON turn deltas while computing all cycle math, conception rolls, wound/bleeding states, and Fog-of-War masking deterministically in code — with automatic rollback checkpoints.
- **Default SFW Vitals + Opt-in 18+ Biology:** *Respiration, Pulse & Circulation* by default, plus *Realistic Cycle & Pregnancy (40w)*, *Omegaverse Pro (36w)*, and *Oviposition & Nest Pro* behind an explicit 18+ toggle with Family Tree tracking.
- **Cradle & Familiar (`v1.2`):** Summon an SFW familiar from Turn 1 or adopt any child/hatchling from your Family Tree with Zero-Punishment care, **Nano Banana** stage portraits, **I2V** loops, **TTS** voice reactions, and 1-click graduation to a playable **CCv2 + Lorebook PNG**.
- **Lore Codex, Live Scenes, Voice & Forge:** Multi-subtab Codex (`Questions | Wiki | Style`), Nano Banana scene backgrounds & I2V video loops, per-character `voiceMap` TTS, 1-click CCv2 PNG Forge, mobile single-row 4-tab layout (390px-ready, ≤ 4 HUD chips), and FinOps session auto-spend cap.

---

## Installation

- **Tavo AI (`v0.93.0+`):** Download **[CLODEx-RP-Studio-1.4.1.tpg](https://github.com/mereyabdenbekuly-ctrl/CLODEx-RP-Studio/releases/download/v1.4.1/CLODEx-RP-Studio-1.4.1.tpg)**, enable **Advanced Rendering**, import the `.tpg` package under **Plugins**, enter your `sk-...` key from `https://clodex.xyz`, and tap the top HUD pill in chat.
- **SillyTavern (`1.19.0+`):** Install via **Extensions → Install Extension** using `https://github.com/mereyabdenbekuly-ctrl/CLODEx-RP-Studio` (or download **[CLODEx-RP-Studio-SillyTavern-1.4.1.zip](https://github.com/mereyabdenbekuly-ctrl/CLODEx-RP-Studio/releases/download/v1.4.1/CLODEx-RP-Studio-SillyTavern-1.4.1.zip)** and unpack into `data/<user>/extensions/CLODEx-RP-Studio`). If `CLODEx for SillyTavern` is already installed, your API key is detected automatically.
- **SillyTavern Slash Commands & Deletion Rollback Note:** Includes `/clodex-phone`, `/clodex-wiki`, `/clodex-director`, `/clodex-underworld` (`/clodex-casino`), `/clodex-gacha` (in addition to `/clodex-rp`, `/clodex-cradle`, `/clodex-codex`, `/clodex-scene`, `/clodex-forge`, `/clodex-speak`). Deleting messages from the **tail of the chat** is the primary rollback scenario and cleanly reverts tracker snapshots, hidden thoughts, phone entries, and wiki patches; when deleting a message from the **middle** of an ST chat, `#hash(send_date)` protects journal entries from index shifts while exact snapshot index alignment cannot be guaranteed across shifted middle items.

---

## Build & Verify from Source

```bash
npm run package
npm run check
npm test
```

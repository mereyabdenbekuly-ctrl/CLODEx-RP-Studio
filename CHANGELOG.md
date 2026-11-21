# Changelog

## 1.5.1 — 2026-11-21

- **In-App Update Notices, Promo Pet Drops & 1-Tap Feedback (`💬 Отзыв / Feedback`)**:
  - Automatic non-intrusive release & announcement check via `GET /v1/rp/studio/release` (`0` extra GitHub calls): shows a subtle `⬆` badge on the HUD pill and a dismissible update card with direct `.tpg` download for **Tavo AI** or **1-click extension update** (`/api/extensions/update`) for **SillyTavern**.
  - Supports remote promo announcements and 1-tap `CLXPET1:` gift pet drops directly inside the drawer.
  - Added a `💬 Отзыв / Feedback` button in the drawer header to send ideas or bug reports directly to the developer (`POST /v1/rp/studio/feedback`, `0` quota charged) and privacy-safe `X-Clodex-Client` / `X-Clodex-Host` version headers.

## 1.5.0 — 2026-11-20

- **Pet & Egg Gift Capsules (`🎁 Pet Gifts`, `CLXPET1:` / `.clodex-pet`)**: package any ordinary companion or Altar egg into an offline shareable `CLXPET1:` code or `.clodex-pet` file with sender alias and 140-char note (no local paths, chat text, or ownership tokens). Includes local replay guard, unlocked-skin transfer, and sender recall backup.
- **Verified Relic Ownership Transfer (`RPR-GIFT-XXXX-XXXX-XXXX`)**: issue a one-time 72-hour gift code for an owned limited-edition relic on `https://clodex.xyz/console/rp-relics` and claim it in either **Tavo AI**, **SillyTavern**, or the web console with atomic ownership transfer and fresh `ES256` certificate re-issuance.
- **Multiplayer Shared Cradle (`🤝 Shared Cradle`, `NEST-XXXX-XXXX`)**: raise a shared egg or companion across two guardians' independent RP chats via `/v1/rp/nests` (passport + bounded care deltas only, `0` chat text transmitted, `0` quota charged), preserving safe companion names across RP context, portraits, video, TTS, and CCv2 graduation while blocking prompt-injection strings and double local care mutations.

## 1.4.2 — 2026-11-20

- **Two-Way Narrative Companion Care (Zero Extra API Calls)**:
  - **Automatic Care Extraction from Story Text**: feeding, giving treats, sleeping/resting, or petting/playing/protecting a companion directly in the roleplay message now updates **`fullness`**, **`energy`**, **`bond`**, **`mood`**, and `lastActionAt` automatically via `companionCare` in the existing background tracker pass (supporting both single companions and named targets in multi-companion parties, while preserving the Zero-Punishment `20` floor and swipe/deletion rollback).
  - **Richer Companion Continuity Cues**: `buildSystemContext` now includes `energy` plus compact `hungry` / `sleepy` / `deeply bonded` cues within the 35-word budget so the AI naturally roleplays a hungry or sleepy pet back in the scene.

## 1.4.1 — 2026-11-20

- **Genesis I Verified Relics Live (`https://clodex.xyz/console/rp-relics`)**:
  - Baked the live `clodex.xyz` `ES256` (`P-256`) public verification key (`REL_PUBLIC_JWK`) directly into `CLODEx RP Studio` across **Tavo AI (`.tpg`)**, **SillyTavern (`.zip`)**, and **SillyTavern Git extension installs**.
  - Limited-edition **Genesis I** relics (`ash_seraph_2026` `#0001..#0050`, `astral_archon_2026` `#0001..#0050`, `abyssal_raven_2026` `#0001..#0100`, `crimson_wyrm_2026` `#0001..#0100`) minted on `https://clodex.xyz/console/rp-relics` now sync read-only via `GET /v1/rp/relics/inventory` and verify cryptographically offline inside exported `PNG CCv2` character cards (`💎 Verified CLODEx Relic #NNNN`).

## 1.4.0 — 2026-11-20

- **Underworld, Wanted & Relics («Подполье, Розыск и Реликвии»)** — full offline-first economy, shadow reputation, summoning altar, and cryptographically signed relic companions with strict FinOps and prompt-budget discipline:
  - **Underworld Wallet, Casino & Story Wagers (`🧬 Tracker → 🎲 Underworld & Casino`)**: chat-scoped wallet, setting-aware skin selector (`Auto / Crime / Tavern / Syndicate`), visible Casino outcome display for **Dice (`2d6`)** (`Over 7 ×2`, `Under 7 ×2`, `Exact 7 ×4.5`, `Double ×5`), **3-Reel Slots** (`[ 🍒 | 🔔 | 💎 ]`), interactive **Blackjack (`21`)** (live player cards + total, dealer upcard + `[🂠]`, *Hit*, *Stand*, and *Double* on 2-card hands), and **Story Wagers with `{{char}}`** (*Truth / Wish / Secret* stakes arming one-turn depth-0 `[Stakes won: ...]` world events).
  - **Pawn Shop, Inventory Pawning & Debt Escalation**: independent loan/pawn valuation, 1-click setting-themed property presets (*Apartment / Car / Business / Watch*, *Estate / Ancestral Blade / Artifact / Oath*, *Habitat Pod / Cyber Implant / Neurodeck / License* via `UW_PRESET_VALUES`), 1-click pawning and redemption of player inventory items (`state.inventory.user`), strict safety guard blocking character/companion names from collateral, collector DMs + turn-3 voice warning in `📱`, and foreclosure after 6 unpaid turns.
  - **Wanted Stars (`0..5★`), Factions & Shadow Services**: visual 5-star heat meter, `-100..+100` standing, 1-click NPC faction import from Living Session Wiki (`wikiCache.npcs`), single combined continuity line (`≤ 25` tokens), and 3 skin-localized Shadow Services: *Erase Traces (`−2★`, `180`)*, *Black-Market NPC Dossier → `📱` (`260`, `confirmPaid`, auto-refunded if cancelled or failed)*, and *Call Enforcers / Mercenaries / Cyber-Team (`320`, arms next-turn world event)*.
  - **Summoning Altar & 12 Collectible Egg Skins (`🐣 Cradle → 🥚 Altar & Skins`)**: story-cash summons (`50`) and optional paid CLODEx rituals (custom JSON lore + **Nano Banana** egg artwork with `confirmPaid`; paid rituals never alter rarity odds), Epic (`10`) & SSR (`30`) pity counters, localized `common..mythic` rarities and all 12 `EGG_SKINS`, egg preview cards (`artPath`, `mutationTrait`, `personality`, `prophecy`), and live unlocked-skin equipping across **Altar eggs**, **active Cradle companions**, and **Oviposition Nest eggs** (propagated on hatching).
  - **ES256 Verified Relics (`🐣 Cradle → 💎 Relics`)**: offline WebCrypto `ECDSA P-256` (`ES256`) verification of server-signed `clodex.xyz` relic certificates (`rpr_*`), read-only `/v1/rp/relics/{catalog,inventory}` sync, offline PNG Character Card V2 signature verifier, mobile WebView-safe `<a target="_blank" rel="noopener noreferrer">` edition links + copy-link action, and automatic certificate attachment when graduating a verified relic companion in Character Forge.
- **Mobile UI & Runtime Fixes**:
  - Fixed strict-mode WebView `style` string attribute handling in `hud.js`, eliminated double `.clodex-rp-tab-body` padding on `Underworld`, `Altar`, and `Relics` sub-screens for `390px` mobile screens, added a compact HUD alert chip (`🚔 N★ · 💸 $Debt`) within `HUD_MAX_CHIPS = 4`, and fixed tracker prompt JSON schema commas when `includePhone === false`.

## 1.3.1 — 2026-11-19

- **Mobile Tavo AI WebView Hotfix**:
  - Fixed `.clodex-rp-drawer-mask` (`display: flex`) overriding the HTML `[hidden]` attribute in WebViews without a `[hidden] { display: none !important; }` reset — which previously left a dark dimming veil (`rgba(5, 7, 12, 0.62)`) over the entire chat on startup, blocked taps on the chat/HUD, and prevented the `✕` close button and backdrop tap from closing the drawer. Added explicit `[hidden]` CSS rules, `.is-open` gating, inline `display`/`pointer-events` sync, and DOM cleanup when closing.
  - Fixed a literal `"null"` text node appearing under the drawer tabs when no error banner was active (caused by passing `null` to native `Element.prototype.replaceChildren`).
  - Right-aligned the collapsed `🎬 Director` pill so it sits cleanly in the open bottom-right space instead of overlapping Tavo's left-aligned input action buttons on mobile screens; added a `click` fallback on the HUD pill and `Escape` key dismissal.

## 1.3.0 — 2026-11-19

- **Director & Living World («Режиссёр и Живой мир»)** — adds seven tightly budgeted living-world modules with **0 extra API calls per turn** (aside from the optional periodic wiki refresh) and a strict **≤ 250-token** prompt cap enforced by `ctxPack`:
  - **One-Turn Director Strip (`M1`)**: collapsible strip docked above the composer (`🎬 Director`). Select up to 2 short English directives (`suspense`, `twist`, `dialogue`, `slow`, `npc_pov`, `sensory`, plus up to 8 custom pack presets) and/or a 140-char note. Injected at depth 0, preserved across network errors and swipes, and cleared only in `onAssistantMessageCommitted`.
  - **Local Anti-Slop Radar (`M2`, Codex → Style)**: zero-cost local n-gram (2–5 word) + ~120-phrase RU/EN dictionary scanner over the last 20 character replies with stop-word boundary filtering, subsumption, and character/user name exclusion. Supports `off` / `highlight` / `inject` modes and emits a concise positive style rule (`≤ 6` phrases, `≤ 60` tokens).
  - **Hidden Thoughts & 3 Action Buttons (`M3`)**: parsed inside the existing background turn extraction (`TRACKER_MAX_TOKENS = 1100`) and rendered strictly under the latest character message (`tavo/ui/turn.html` in Tavo, `.mes` container in SillyTavern). Never injected into the role-play prompt; clicking a suggestion appends it to the composer without sending.
  - **Smartphone / Diary & World Feed (`M4`, `📱` in drawer header)**: optional `phoneEvents` (max once every 3 turns via `turnsSinceLastPhone`) stored in an append-only chat journal (`clodex_rp_phone`, ≤ 120 entries / ≤ 48 KB). Features *Notes & DMs*, *World feed*, and *Photos & voice*, auto/manual **Smartphone** vs. **Grimoire / letters** skins, *Present next turn* (`pendingMemoryHint`), and strict **Click-to-Reveal** media generation (`confirmPaid` + `maxAutoSpendUsd`, vitals-aware voice tags).
  - **Living Session Wiki (`M5`, Codex → Wiki)**: *NPCs*, *Quests & threads*, *Places*, and *Timeline* stored in an append-only patch journal (`clodex_rp_wiki`, ≤ 48 KB). Refreshes roughly once every N turns (configurable 4–20, default 8) with stale `targetTurnKey` race rejection, `pinned` protection for manually edited rows, and stem-matched context injection (`≤ 120` tokens via `tnStem`).
  - **Branch-Safe State & Journals (`M6`)**: unified `turnKey` format (`${id}:${variant}` / ST `${index}:${swipe_id}#${hash(send_date)}`), diff-encoded compact snapshots (`≤ 2.5 KB` target with 6 companions + 8 meters), `restoreCheckpointExact` for `A → B → A` swipes preserving `world.director`, `pendingMemoryHint`, and `codexHistory`, and GC on `message:deleted` / `MESSAGE_DELETED`.
  - **Data-Only `.clodex-pack` Presets (`M7`, `⚒️ → Packs`)**: export/import shareable JSON preset bundles (`meterPacks`, `directorPresets`, `slopPhrases`, `phoneSkin`, `codexPresets`) up to 64 KB with import preview and strict sanitization (rejects `<script>`, strips HTML/secrets/unknown fields).
- **UI, Manifest & Platform Polish**:
  - Header quick-bar `📱 (unseen) · ⚒️ · 🔑 · ⌖ · ✕`, Codex sub-tabs `Questions | Wiki | Style`, single-row 4-tab bar preserved for `390×844` screens, HUD pill capped at `≤ 4` priority chips, SillyTavern slash commands (`/clodex-phone`, `/clodex-wiki`, `/clodex-director`), Tavo sidebar action `open-phone`, and bundler top-level collision gate in `scripts/check.mjs`.

## 1.2.0 — 2026-11-18

- **Cradle & Familiar («Колыбель и Фамильяр») — Multimodal RP Companion & Dynasty System**:
  - **Turn-1 SFW Familiars & 1-Click Family Tree Adoption**: summon an SFW companion right from Turn 1 (*Spirit Fox*, *Shadow Raven*, *Dragon Whelp*, *Homunculus*, *Celestial Wisp*) or transfer any baby/hatchling from `Family Tree & Offspring` in one click with inherited personality traits derived from your active story meters (`obsession`, `sanity`, `trust`, `mana`, etc.) and biology mode.
  - **Tag-Free Growth & Zero-Punishment Care**: 4 life stages (`infant` → `child` → `teen` → `adult`), live HUD pill chip (`🐣 Name · Stage · 💛Mood%`), 4 care meters (*Fullness*, *Mood*, *Bond*, *Energy*) with offline Zero-Punishment floor (`>= 20`), and 5 tactile care actions (*Feed*, *Pet*, *Train*, *Play*, *Rest*) that arm natural RP hints for the next AI turn and roll back cleanly on message swipe/delete.
  - **Multimodal Embodiment via CLODEx**: generate stage-evolved portraits via **Nano Banana** (`/v1/images/generations`), animate 4-second loops via **Image-to-Video** (`/v1/videos`), and synthesize stage-aware voice reactions (*infant babble/purrs → child/teen/adult speech*) via `/v1/chat/completions` + `/v1/audio/speech` with personal `voiceId`.
  - **2nd-Generation Dynasty Graduation**: 1-click graduation exports a grown child or familiar into the **CCv2 Character & Lorebook Forge** to mint a standalone playable PNG Character Card V2 with a 5-entry childhood & lineage Lorebook.
- **Mobile 1-Row Tab Discipline & Chat-Scoped Media Isolation**:
  - Streamlined primary navigation into a crisp single-row 4-tab bar (`🧬 Tracker` | `🐣 Cradle` | `📜 Codex` | `🍌 Scene`) even on 390px mobile viewports, moving `⚒️ Forge` and `🔑 Key & Models` to compact header quick-buttons; isolated Tavo virtual media files with `scope: 'chat'` and added `message:updated` regeneration checkpoint rollback.
- **Per-Character Voice Binding & FinOps Auto-Spend Shield**:
  - Selecting or entering a voice in *Scene & Voice* now persists both `defaultVoice` and per-character `voiceMap[charName]`.
  - Added `maxAutoSpendUsd` (default `$0.25`) session budget guard in *Key & Models* that tracks automatic background spend (`autoSpeak` / `autoImageEvery`) and pauses auto-calls with a clear notice before exceeding your cap, plus clearer quote-based pricing display in model selectors.

## 1.1.0 — 2026-11-18

- **Character Voice (CLODEx TTS) for Tavo AI & SillyTavern**: `/v1/audio/voices` catalog loader, per-character voice binding, one-tap `Speak Character Reply` action in Tavo's message bar, and a smart *Dialogue-Only* filter that strips `*asterisk actions*` so only spoken lines are synthesized.
- **Custom Story Meters & Inventory Builder**: one-click preset packs (*Dark Romance: Obsession/Sin/Trust*, *Fantasy RPG: Sanity/Mana/Gold*, *Detective: Suspicion/Clues*), custom user-defined sliders pinned to the HUD pill, per-character inventory tags, automatic AI turn updates, and full rollback on message swipe/deletion.
- **1-Click Character & Lorebook Forge**: generates a complete **Character Card V2** with multi-entry keyword Lorebook (`character_book`) + **Nano Banana** portrait, embeds the CCv2 JSON directly into the PNG `chara` `tEXt` chunk, and imports into Tavo AI (`tavo.character.import`) or SillyTavern / exports as a shareable PNG card.

## 1.0.0 — 2026-11-18

- Shared RP simulation core for **Tavo AI** (`.tpg` Manifest v2) and **SillyTavern 1.19+** powered by CLODEx API (`https://clodex.xyz`).
- **Physiology & Vitals Tracker** (enabled by default): heart rate, respiration rate/type, circulation, blood loss percentage, wounds/bleeding, stamina, stress, calendar dates, and anti-rollback timeskip tracking with swipe/delete checkpoints.
- **18+ Biology Modules** (opt-in toggle):
  - *Realistic Cycle & Pregnancy* (40w, contraception, hidden conception rolls, Modern/Medieval/Omniscient AI Fog-of-War, ultrasound milestones, natural & C-section delivery, postpartum recovery, Family Tree);
  - *Omegaverse Pro* (36w, Omega/Alpha/Beta/Enigma dynamics, pheromone scent & intensity, suppressants, heat/rut cycles, temporary & permanent bond marks);
  - *Oviposition & Nest Pro* (clutch fertilization, per-egg or full-clutch laying, nest warmth incubation speed, shell cracking, hatching into Family Tree).
- **Lore & Canon Navigator (Codex)**: in-chat sidecar consultant with presets (*Card & Chat Lore Keeper*, *Bible, Latin & Dante / "Biblical Mistral"*, *Medicine & Trauma*, *Custom*) plus one-click composer insertion and next-turn AI memory injection.
- **Live Scene Background & Video Loop**: Nano Banana / CLODEx image generation (`/v1/images/generations`) applied to the chat background plus Image-to-Video (`/v1/videos`) ambient looping backdrop with resumable `taskId` tracking and live wallet balance.

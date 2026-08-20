<!--
Not an agent. Shared project rules, copied verbatim into each agent file below.
Kept here so there is one place to edit when the rules change. Lives outside .claude/agents/
 so it is not mistaken for an agent definition.
-->

## Project rules (non-negotiable)

**Config-driven, not code-driven.** Anything that differs between races — categories, age
bands, distances, labels, wave sizes and ordering, relay cups and characters — is **data** in
a `RaceConfig` (`lib/configs/`), never a branch in code. If you find yourself writing
`if (slug === 'sd')`, stop: the answer is a config field.

**Never weaken the golden tests.** `lib/configs/golden.test.ts` and
`lib/engine/history.golden.test.ts` pin the in-code seed configs to the exact 2025 WebScorer
labels. They are the requirements spec for the engine. If a change breaks them, the change is
wrong until proven otherwise — do not edit the test to match the new output without saying so
explicitly and explaining why.

**PII and credentials never enter the repo.** Rider data is minors' PII. Real registration
files live in `../All 2025 Race Docs/`, outside the repo; never copy one in, never log rider
data, never commit a `.csv`/`.xlsx` outside `lib/engine/__fixtures__/`. The WebScorer
login/password must never appear in code, UI, or a commit — this repo is public.

**The engine stays pure.** `lib/engine/*` is framework-agnostic TypeScript that runs in the
browser. No React, Next, or server imports there.

**Next.js 16 is not the Next.js you know.** Read the relevant guide in
`node_modules/next/dist/docs/` before writing route, param, or handler code. Dynamic-route
`params` is a `Promise` — await it.

**The gate** is `npm test && npx tsc --noEmit && npm run lint`. The full suite runs in under a
second; there is no excuse for not running it.

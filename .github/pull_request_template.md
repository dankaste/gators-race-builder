Closes #

## What changed

<!-- One or two sentences. Why, not just what. -->

## How it was verified

- [ ] `npm test`
- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Exercised in the running app (say which screen)

## Checks

- [ ] No PII: no rider names, no registration exports, no `.csv`/`.xlsx` outside `lib/engine/__fixtures__/`
- [ ] No credentials (WebScorer login, `.env*`)
- [ ] Race-specific behavior went into `RaceConfig` data, not a new code branch
- [ ] Golden tests still pass unmodified (`lib/configs/golden.test.ts`, `lib/engine/history.golden.test.ts`)

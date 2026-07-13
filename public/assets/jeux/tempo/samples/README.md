# Tempo instrument samples

Per-note mp3 samples vendored from [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts)
(FluidR3_GM, MIT). Regenerate / extend with:

```
node scripts/fetch-tempo-samples.mjs
```

The voice → GM instrument → MIDI-list matrix lives in that script; `manifest.json`
is what the runtime sampler (`src/games/tempo/sampler.ts`) reads.

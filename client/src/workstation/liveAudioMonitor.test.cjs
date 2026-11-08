const assert = require("node:assert/strict");

import("./liveAudioMonitor.ts").then(({ liveMusicGain }) => {
  const settings = { musicVolume: 0.6, narrationDuckingLevel: 0.2, teachingPauseMusicLevel: 0.7, fadeInDuration: 1, fadeOutDuration: 1, transitionDuration: 0.5 };
  assert.equal(liveMusicGain(settings, false), 0.12);
  assert.equal(liveMusicGain(settings, true), 0.42);
  assert.equal(liveMusicGain({ ...settings, musicVolume: 2 }, true), 1);
  console.log("PASS: live monitor uses export-consistent music, ducking, and pause gain levels.");
}).catch((error) => { console.error(error); process.exitCode = 1; });

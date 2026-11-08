const assert = require("node:assert/strict");

import("./liveAudioMonitor.ts").then(async ({ liveMusicGain, musicSyncTime, playMusicBeforeResumingContext, rampMusicGain, shouldPauseMusicForNarrationPause }) => {
  const settings = { musicVolume: 0.6, narrationDuckingLevel: 0.2, teachingPauseMusicLevel: 0.7, fadeInDuration: 1, fadeOutDuration: 1, transitionDuration: 0.5 };
  assert.equal(liveMusicGain(settings, false), 0.12);
  assert.equal(liveMusicGain(settings, true), 0.42);
  assert.equal(liveMusicGain({ ...settings, musicVolume: 2 }, true), 1);
  assert.equal(musicSyncTime(8.5, true), null, "music is not sought while narration is held in a teaching pause");
  assert.equal(musicSyncTime(8.5, false), 8.5, "music syncs to the narration timeline when speech resumes");
  assert.equal(musicSyncTime(-2, false), 0, "music seek position stays within media bounds");
  assert.equal(shouldPauseMusicForNarrationPause(true), false, "music continues during a teaching pause");
  assert.equal(shouldPauseMusicForNarrationPause(false), true, "music pauses when narration is manually paused");

  function fakeParam(initial) {
    const calls = [];
    return {
      value: initial,
      calls,
      cancelScheduledValues(time) { calls.push(["cancel", time]); },
      setValueAtTime(value, time) { calls.push(["set", value, time]); this.value = value; },
      linearRampToValueAtTime(value, time) { calls.push(["ramp", value, time]); this.value = value; },
    };
  }

  for (const musicPosition of [0, 19.25]) {
    const param = fakeParam(0);
    rampMusicGain(param, 4, liveMusicGain(settings, false), settings.fadeInDuration);
    assert.deepEqual(param.calls, [["cancel", 4], ["set", 0, 4], ["ramp", 0.12, 5]], `playback at ${musicPosition}s restores gain from silence`);
    assert.equal(param.value, 0.12, `playback at ${musicPosition}s reaches the narration target`);
  }

  const sliderParam = fakeParam(0.12);
  rampMusicGain(sliderParam, 8, liveMusicGain({ ...settings, musicVolume: 0.9 }, false), 0.4);
  assert.ok(Math.abs(sliderParam.calls.at(-1)[1] - 0.18) < 1e-12, "music-volume slider changes ramp to the new gain");
  const pauseParam = fakeParam(0.12);
  rampMusicGain(pauseParam, 9, liveMusicGain(settings, true), 0.5);
  assert.equal(pauseParam.calls.at(-1)[1], 0.42, "teaching-pause gain ramps above narration level");

  const order = [];
  let paused = true;
  const music = {
    get paused() { return paused; },
    play() { order.push("play"); paused = false; return Promise.resolve(); },
  };
  await playMusicBeforeResumingContext(music, async () => { order.push("resume-context"); });
  assert.deepEqual(order, ["play", "resume-context"], "music.play is invoked synchronously before context resume");

  const resumedOrder = [];
  await playMusicBeforeResumingContext({ paused: false, play() { resumedOrder.push("unexpected-play"); return Promise.resolve(); } }, async () => { resumedOrder.push("resume-context"); });
  assert.deepEqual(resumedOrder, ["resume-context"], "an already-playing music element is not started a second time");

  await assert.rejects(
    playMusicBeforeResumingContext({ paused: true, play() { return Promise.reject(new Error("NotAllowedError")); } }, async () => {}),
    /NotAllowedError/,
    "browser autoplay rejection is surfaced to the caller",
  );
  console.log("PASS: live music gain restores at zero and nonzero track positions, follows sliders and pause levels, starts before context resume, avoids duplicate play, and surfaces autoplay rejection.");
}).catch((error) => { console.error(error); process.exitCode = 1; });

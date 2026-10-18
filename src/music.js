// A tiny music box, synthesised in the browser.
//
// Why not an mp3: no hosting, no CORS, no licence, no extra request — and a
// 7-second pentatonic loop fits a candle-lit voxel cake better than a track.
// The AudioContext is created on the first user gesture (the letters' click),
// because every browser blocks audio before one.

export function createMusic() {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let send = null;
  let timer = 0;
  let nextTime = 0;
  let step = 0;
  let started = false;
  let muted = false;

  // C major pentatonic, one octave up: C5 D5 E5 G5 A5 C6
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
  const MELODY = [0, 2, 4, 5, 4, 2, 1, 3, 5, 4, 2, 1, 0, 2, 3, -1];
  const BASS = [0, -1, -1, -1, 3, -1, -1, -1, 5, -1, -1, -1, 3, -1, -1, -1];
  const STEP = 0.44; // seconds per step; a 16-step loop ≈ 7 s
  const LEVEL = 0.5;

  function init() {
    if (ctx) return true;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // a small room: delay → damped feedback → master
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.34;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.26;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    send = ctx.createGain();
    send.gain.value = 0.3;
    send.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(master);

    document.addEventListener('visibilitychange', () => {
      if (!ctx || !started) return;
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });

    return true;
  }

  function voice(freq, at, dur, level, wet) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;

    const shine = ctx.createOscillator();
    shine.type = 'triangle';
    shine.frequency.value = freq * 2.005;
    const shineGain = ctx.createGain();
    shineGain.gain.value = 0.14;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(level, at + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    osc.connect(env);
    shine.connect(shineGain);
    shineGain.connect(env);
    env.connect(master);

    if (send) {
      const tap = ctx.createGain();
      tap.gain.value = wet;
      env.connect(tap);
      tap.connect(send);
    }

    osc.start(at);
    shine.start(at);
    osc.stop(at + dur + 0.05);
    shine.stop(at + dur + 0.05);
  }

  function schedule() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 1.2) {
      const i = step % 16;
      const melody = MELODY[i];
      if (melody >= 0) voice(SCALE[melody], nextTime, 1.5, 0.12, 0.32);
      const bass = BASS[i];
      if (bass >= 0) voice(SCALE[bass] / 4, nextTime, 2.4, 0.075, 0.12);
      nextTime += STEP;
      step += 1;
    }
  }

  function start() {
    if (!init()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    if (!started) {
      started = true;
      nextTime = ctx.currentTime + 0.15;
      schedule();
      timer = window.setInterval(schedule, 250);
    }
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.4);
    return true;
  }

  function toggle() {
    muted = !muted;
    if (ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(muted ? 0 : LEVEL, ctx.currentTime, 0.15);
    }
    return muted;
  }

  return {
    start,
    toggle,
    get started() {
      return started;
    },
    get muted() {
      return muted;
    },
    stop() {
      window.clearInterval(timer);
      timer = 0;
    },
  };
}

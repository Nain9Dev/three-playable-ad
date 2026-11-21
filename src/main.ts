import { CTA_URL, END_CARD_DELAY_MS, MAX_ACTIVE_SECONDS } from "./config.ts";
import { onViewableChange, openStore, whenAdReady } from "./ad/sdk.ts";
import { cutThud, missThud, perfectChime, unlockAudio, winFanfare } from "./audio.ts";
import { StackGame, speedForLevel } from "./game/stack.ts";
import { StackView, hueForLevel } from "./render/view.ts";

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

const canvas = element<HTMLCanvasElement>("stage");
const scoreText = element("score");
const toast = element("toast");
const hint = element("hint");
const endCard = element("end");
const endTitle = element("end-title");
const endText = element("end-text");

const view = new StackView(canvas);
let game = new StackGame();
let phase = 0;
let activeSeconds = 0;
let paused = true;
let ended = false;
let lastFrame = 0;

function setBackground(level: number): void {
  const hue = Math.round(hueForLevel(level) * 360);
  document.body.style.background = `linear-gradient(180deg, hsl(${hue}, 70%, 80%), hsl(${(hue + 40) % 360}, 65%, 62%))`;
}

function showToast(text: string): void {
  toast.textContent = text;
  toast.classList.remove("show");
  // Reading offsetWidth restarts the CSS animation.
  void toast.offsetWidth;
  toast.classList.add("show");
}

function startRound(): void {
  game = new StackGame();
  phase = 0;
  activeSeconds = 0;
  ended = false;
  view.reset();
  view.addBlock(game.top, 0);
  view.setMoving(game.movingBlock(game.movingCenter(0)), 1);
  scoreText.textContent = "0";
  hint.classList.remove("hidden");
  endCard.classList.remove("show");
  setBackground(0);
}

function showEndCard(): void {
  if (ended) return;
  ended = true;
  window.setTimeout(() => {
    endTitle.textContent = game.won ? "Perfect tower!" : game.over ? "Tower down!" : "Nice stack!";
    endText.textContent = `Score ${game.score}`;
    endCard.classList.add("show");
  }, END_CARD_DELAY_MS);
}

function handleDrop(): void {
  if (paused || game.over || ended) return;
  unlockAudio();
  hint.classList.add("hidden");

  const center = game.movingCenter(phase);
  const result = game.drop(center);
  const top = game.top;

  if (result.kind === "miss") {
    view.dropMovingAsDebris();
    view.kick();
    missThud();
    showEndCard();
    return;
  }

  view.setMoving(null, 0);
  view.addBlock(top, game.level);

  if (result.debris) {
    const previous = game.blocks[game.level - 1];
    if (previous) {
      view.spawnDebris(
        result.axis === "x"
          ? { x: result.debris.center, z: previous.z, w: result.debris.size, d: previous.d }
          : { x: previous.x, z: result.debris.center, w: previous.w, d: result.debris.size },
        game.level,
      );
    }
    cutThud();
  }

  if (result.kind === "perfect") {
    view.pulse(top, game.level);
    perfectChime(game.combo);
    showToast(game.combo > 1 ? `PERFECT x${game.combo}` : "PERFECT");
  }

  scoreText.textContent = String(game.score);
  setBackground(game.level);

  if (game.won) {
    view.confetti(top, game.level);
    winFanfare();
    showEndCard();
    return;
  }

  phase = 0;
  view.setMoving(game.movingBlock(game.movingCenter(0)), game.level + 1);
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
  lastFrame = now;

  if (!paused && !game.over && !ended) {
    phase += speedForLevel(game.level + 1) * dt;
    activeSeconds += dt;
    view.moveTo(game.movingBlock(game.movingCenter(phase)), game.level + 1);
    if (activeSeconds >= MAX_ACTIVE_SECONDS) showEndCard();
  }

  if (!paused) view.update(dt);
  view.render();
  requestAnimationFrame(frame);
}

function setPaused(value: boolean): void {
  paused = value;
  lastFrame = performance.now();
}

element("install").addEventListener("click", () => openStore(CTA_URL));
element("end-install").addEventListener("click", () => openStore(CTA_URL));
element("again").addEventListener("click", () => {
  startRound();
});

// Pointer events cover mouse, touch and pen. The install buttons stop here
// because they are not part of the game surface.
window.addEventListener("pointerdown", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("button, #end")) return;
  handleDrop();
});
window.addEventListener("keydown", (event) => {
  if (event.code === "Space") handleDrop();
});

document.addEventListener("visibilitychange", () => setPaused(document.hidden));
onViewableChange((viewable) => setPaused(!viewable));

startRound();
whenAdReady(() => {
  setPaused(false);
});
requestAnimationFrame(frame);

import {
  BoxGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OrthographicCamera,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { Block } from "../game/stack.ts";

export const BLOCK_HEIGHT = 0.5;
const GRAVITY = 22;

interface Debris {
  mesh: Mesh<BoxGeometry, MeshLambertMaterial>;
  velocity: Vector3;
  spin: Vector3;
  life: number;
}

interface Ring {
  mesh: Mesh<RingGeometry, MeshBasicMaterial>;
  age: number;
  /** Size of the block the ring was spawned on. The ring grows from this size. */
  width: number;
  depth: number;
}

interface Landing {
  mesh: Mesh<BoxGeometry, MeshLambertMaterial>;
  age: number;
}

/** Hue for a level. The color walks around the wheel as the tower grows. */
export function hueForLevel(level: number): number {
  return (0.55 + level * 0.035) % 1;
}

/** Owns everything Three.js: scene, camera, meshes and small visual effects. */
export class StackView {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly unitBox = new BoxGeometry(1, 1, 1);
  private readonly ringGeometry = new RingGeometry(0.5, 0.58, 56);
  private readonly tower: Mesh<BoxGeometry, MeshLambertMaterial>[] = [];
  private readonly debris: Debris[] = [];
  private readonly rings: Ring[] = [];
  private readonly landings: Landing[] = [];
  private moving: Mesh<BoxGeometry, MeshLambertMaterial> | null = null;
  private cameraY = 0;
  private targetY = 0;
  private shake = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearAlpha(0);

    this.scene.add(new HemisphereLight(0xffffff, 0x6f78a8, 1.25));
    const sun = new DirectionalLight(0xffffff, 1.7);
    sun.position.set(4, 9, 6);
    this.scene.add(sun);

    this.ringGeometry.rotateX(-Math.PI / 2);
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  private colorFor(level: number): Color {
    return new Color().setHSL(hueForLevel(level), 0.78, 0.5);
  }

  private makeMesh(block: Block, level: number): Mesh<BoxGeometry, MeshLambertMaterial> {
    const mesh = new Mesh(this.unitBox, new MeshLambertMaterial({ color: this.colorFor(level) }));
    this.place(mesh, block, level);
    this.scene.add(mesh);
    return mesh;
  }

  private place(mesh: Mesh, block: Block, level: number): void {
    mesh.scale.set(block.w, BLOCK_HEIGHT, block.d);
    mesh.position.set(block.x, level * BLOCK_HEIGHT, block.z);
  }

  /** Match the camera frustum to the canvas. Portrait phones need a taller view. */
  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    const aspect = width / height;
    const viewHeight = Math.max(11, (2 * 4.9) / aspect);
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
  }

  addBlock(block: Block, level: number): void {
    const mesh = this.makeMesh(block, level);
    this.tower.push(mesh);
    this.landings.push({ mesh, age: 0 });
    this.targetY = level * BLOCK_HEIGHT;
  }

  setMoving(block: Block | null, level: number): void {
    if (this.moving) {
      this.scene.remove(this.moving);
      this.moving.material.dispose();
      this.moving = null;
    }
    if (block) this.moving = this.makeMesh(block, level);
  }

  moveTo(block: Block, level: number): void {
    if (this.moving) this.place(this.moving, block, level);
  }

  /** Turn the moving block into falling debris (on a miss, the whole block). */
  dropMovingAsDebris(): void {
    const mesh = this.moving;
    if (!mesh) return;
    this.moving = null;
    this.debris.push({
      mesh,
      velocity: new Vector3(0, 1, 0),
      spin: new Vector3(1.4, 0.4, 1.1),
      life: 2.2,
    });
  }

  /** Spawn the cut-off part of a block. */
  spawnDebris(block: Block, level: number): void {
    const mesh = this.makeMesh(block, level);
    this.debris.push({
      mesh,
      velocity: new Vector3((Math.random() - 0.5) * 1.6, 0.6, (Math.random() - 0.5) * 1.6),
      spin: new Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3),
      life: 2.2,
    });
  }

  /** Expanding ring on a perfect drop. */
  pulse(block: Block, level: number): void {
    const material = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      side: DoubleSide,
      depthWrite: false,
    });
    const mesh = new Mesh(this.ringGeometry, material);
    mesh.position.set(block.x, level * BLOCK_HEIGHT + BLOCK_HEIGHT / 2 + 0.01, block.z);
    mesh.scale.set(block.w, 1, block.d);
    this.scene.add(mesh);
    this.rings.push({ mesh, age: 0, width: block.w, depth: block.d });
  }

  /** Small cubes thrown up from the top of the tower when the player wins. */
  confetti(top: Block, level: number): void {
    for (let i = 0; i < 46; i += 1) {
      const size = 0.12 + Math.random() * 0.12;
      const piece: Block = { x: top.x, z: top.z, w: size, d: size };
      const mesh = this.makeMesh(piece, Math.floor(Math.random() * 28));
      mesh.position.y = level * BLOCK_HEIGHT + BLOCK_HEIGHT;
      mesh.scale.y = size;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 3.5;
      this.debris.push({
        mesh,
        velocity: new Vector3(Math.cos(angle) * speed, 7 + Math.random() * 5, Math.sin(angle) * speed),
        spin: new Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        life: 2.4,
      });
    }
  }

  kick(): void {
    this.shake = 0.45;
  }

  /** Remove every mesh and reset the camera, so a new game starts clean. */
  reset(): void {
    for (const mesh of this.tower) this.dispose(mesh);
    this.tower.length = 0;
    for (const piece of this.debris) this.dispose(piece.mesh);
    this.debris.length = 0;
    for (const ring of this.rings) this.disposeRing(ring);
    this.rings.length = 0;
    this.landings.length = 0;
    this.setMoving(null, 0);
    this.cameraY = 0;
    this.targetY = 0;
    this.shake = 0;
  }

  private dispose(mesh: Mesh<BoxGeometry, MeshLambertMaterial>): void {
    this.scene.remove(mesh);
    mesh.material.dispose();
  }

  private disposeRing(ring: Ring): void {
    this.scene.remove(ring.mesh);
    ring.mesh.material.dispose();
  }

  update(dt: number): void {
    // Camera eases toward the top of the tower.
    this.cameraY += (this.targetY - this.cameraY) * Math.min(1, dt * 4);
    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.6 : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.6 : 0;
    this.shake = Math.max(0, this.shake - dt);
    this.camera.position.set(8 + shakeX, 8 + this.cameraY + shakeY, 8);
    this.camera.lookAt(0, this.cameraY + 1.2, 0);

    // Landing squash: the block compresses and springs back.
    for (let i = this.landings.length - 1; i >= 0; i -= 1) {
      const landing = this.landings[i];
      if (!landing) continue;
      landing.age += dt;
      const squash = 1 + 0.4 * Math.exp(-landing.age * 8) * Math.cos(landing.age * 26);
      landing.mesh.scale.y = BLOCK_HEIGHT * squash;
      if (landing.age > 0.6) {
        landing.mesh.scale.y = BLOCK_HEIGHT;
        this.landings.splice(i, 1);
      }
    }

    for (let i = this.debris.length - 1; i >= 0; i -= 1) {
      const piece = this.debris[i];
      if (!piece) continue;
      piece.life -= dt;
      piece.velocity.y -= GRAVITY * dt;
      piece.mesh.position.addScaledVector(piece.velocity, dt);
      piece.mesh.rotation.x += piece.spin.x * dt;
      piece.mesh.rotation.y += piece.spin.y * dt;
      piece.mesh.rotation.z += piece.spin.z * dt;
      if (piece.life <= 0 || piece.mesh.position.y < this.cameraY - 14) {
        this.dispose(piece.mesh);
        this.debris.splice(i, 1);
      }
    }

    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const ring = this.rings[i];
      if (!ring) continue;
      ring.age += dt;
      const t = ring.age / 0.5;
      const grow = 1 + t * 0.7;
      ring.mesh.scale.set(ring.width * grow, 1, ring.depth * grow);
      ring.mesh.material.opacity = Math.max(0, 0.9 * (1 - t));
      if (t >= 1) {
        this.disposeRing(ring);
        this.rings.splice(i, 1);
      }
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}

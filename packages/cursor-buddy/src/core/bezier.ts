import type { Point } from "./types";

/**
 * Bezier flight animation for cursor pointing.
 */

/**
 * Quadratic bezier curve: B(t) = (1-t)²P₀ + 2(1-t)t·P₁ + t²P₂
 */
function quadraticBezier(p0: Point, p1: Point, p2: Point, t: number): Point {
  const oneMinusT = 1 - t;
  return {
    x: oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x,
    y: oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y,
  };
}

/**
 * Bezier tangent (derivative): B'(t) = 2(1-t)(P₁-P₀) + 2t(P₂-P₁)
 */
function bezierTangent(p0: Point, p1: Point, p2: Point, t: number): Point {
  const oneMinusT = 1 - t;
  return {
    x: 2 * oneMinusT * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
    y: 2 * oneMinusT * (p1.y - p0.y) + 2 * t * (p2.y - p1.y),
  };
}

/**
 * Ease-in-out cubic for smooth acceleration/deceleration
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface BezierFlightCallbacks {
  onFrame: (position: Point, rotation: number, scale: number) => void;
  onComplete: () => void;
}

/**
 * Animate cursor along a parabolic bezier arc from start to end.
 * Used when the AI points at a UI element.
 *
 * @param from - Starting position
 * @param to - Target position
 * @param durationMs - Flight duration in milliseconds
 * @param callbacks - Frame and completion callbacks
 * @returns Cancel function to stop the animation
 */
export function animateBezierFlight(
  from: Point,
  to: Point,
  durationMs: number,
  callbacks: BezierFlightCallbacks,
): () => void {
  const startTime = performance.now();
  const distance = Math.hypot(to.x - from.x, to.y - from.y);

  // Control point: offset upward by 20% of distance (creates parabolic arc)
  const controlPoint: Point = {
    x: (from.x + to.x) / 2,
    y: Math.min(from.y, to.y) - distance * 0.2,
  };

  let animationFrameId: number;

  function animate(now: number) {
    const elapsed = now - startTime;
    const linearProgress = Math.min(elapsed / durationMs, 1);
    const easedProgress = easeInOutCubic(linearProgress);

    const position = quadraticBezier(from, controlPoint, to, easedProgress);
    const tangent = bezierTangent(from, controlPoint, to, easedProgress);
    const rotation = Math.atan2(tangent.y, tangent.x);

    // Scale pulse: grows to 1.3x at midpoint, returns to 1x
    const scale = 1 + Math.sin(linearProgress * Math.PI) * 0.3;

    callbacks.onFrame(position, rotation, scale);

    if (linearProgress < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      callbacks.onComplete();
    }
  }

  animationFrameId = requestAnimationFrame(animate);

  return () => cancelAnimationFrame(animationFrameId);
}

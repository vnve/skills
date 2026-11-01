import type { ActorState } from '../types/project';

// ---------------------------------------------------------------------------
// Slot Positioning System
// ---------------------------------------------------------------------------

export type SlotName = 'left' | 'right' | 'center' | 'support-left' | 'support-right';
export type ExtendedSlotName = SlotName | 'off-left' | 'off-right';

/**
 * Landscape slot positions (percentages 0-100). y=100 places feet at canvas bottom.
 * @deprecated Use {@link getSlotPositions}(canvasWidth, canvasHeight) for aspect-aware slots.
 */
export const SLOT_POSITIONS: Record<SlotName, { x: number; y: number }> = {
  'center':        { x: 50, y: 100 },
  'left':          { x: 25, y: 100 },
  'right':         { x: 75, y: 100 },
  'support-left':  { x: 12, y: 100 },
  'support-right': { x: 88, y: 100 },
};

/**
 * Landscape extended slot positions including off-screen entries for animations.
 * @deprecated Use {@link getExtendedSlotPositions}(canvasWidth, canvasHeight) for aspect-aware slots.
 */
export const EXTENDED_SLOT_POSITIONS: Record<ExtendedSlotName, { x: number; y: number }> = {
  ...SLOT_POSITIONS,
  'off-left':  { x: -20, y: 100 },
  'off-right': { x: 120, y: 100 },
};

const PORTRAIT_SLOT_POSITIONS: Record<SlotName, { x: number; y: number }> = {
  'center':        { x: 50, y: 100 },
  'left':          { x: 30, y: 100 },
  'right':         { x: 70, y: 100 },
  'support-left':  { x: 18, y: 100 },
  'support-right': { x: 82, y: 100 },
};

const PORTRAIT_EXTENDED_SLOT_POSITIONS: Record<ExtendedSlotName, { x: number; y: number }> = {
  ...PORTRAIT_SLOT_POSITIONS,
  'off-left':  { x: -20, y: 100 },
  'off-right': { x: 120, y: 100 },
};

/** Returns slot positions appropriate for the given canvas dimensions. */
export function getSlotPositions(canvasWidth: number, canvasHeight: number): Record<SlotName, { x: number; y: number }> {
  return canvasHeight > canvasWidth ? PORTRAIT_SLOT_POSITIONS : SLOT_POSITIONS;
}

/** Returns extended slot positions (including off-screen) appropriate for the given canvas dimensions. */
export function getExtendedSlotPositions(canvasWidth: number, canvasHeight: number): Record<ExtendedSlotName, { x: number; y: number }> {
  return canvasHeight > canvasWidth ? PORTRAIT_EXTENDED_SLOT_POSITIONS : EXTENDED_SLOT_POSITIONS;
}

/** Human-readable labels for slot names. */
export const SLOT_LABELS: Record<ExtendedSlotName, string> = {
  'center': '中央',
  'left': '左',
  'right': '右',
  'support-left': '远左',
  'support-right': '远右',
  'off-left': '画面外（左）',
  'off-right': '画面外（右）',
};

/** Reverse-lookup: find the nearest slot name for given coordinates, within tolerance. Returns null if no slot is close enough. */
export function findSlotByCoords(
  x: number,
  y: number,
  tolerance = 3,
  canvasWidth = 1920,
  canvasHeight = 1080,
): ExtendedSlotName | null {
  let best: ExtendedSlotName | null = null;
  let bestDist = Infinity;
  const slots = getExtendedSlotPositions(canvasWidth, canvasHeight);
  for (const [name, pos] of Object.entries(slots) as [ExtendedSlotName, { x: number; y: number }][]) {
    const dist = Math.abs(x - pos.x) + Math.abs(y - pos.y);
    if (dist <= tolerance && dist < bestDist) {
      best = name;
      bestDist = dist;
    }
  }
  return best;
}

export interface GuideLine {
  orientation: 'h' | 'v';
  position: number; // percentage coordinate
}

export interface SnapResult {
  guides: GuideLine[];
  snapX?: number;
  snapY?: number;
}

/** Return the set of slots currently occupied by actors (within tolerance %). */
export function getOccupiedSlots(
  actors: ReadonlyArray<{ x: number; y: number }>,
  tolerance = 3,
  canvasWidth = 1920,
  canvasHeight = 1080,
): Set<SlotName> {
  const slots = getSlotPositions(canvasWidth, canvasHeight);
  const slotNames = Object.keys(slots) as SlotName[];
  const occupied = new Set<SlotName>();
  for (const actor of actors) {
    for (const name of slotNames) {
      const slot = slots[name];
      if (Math.abs(actor.x - slot.x) <= tolerance && Math.abs(actor.y - slot.y) <= tolerance) {
        occupied.add(name);
      }
    }
  }
  return occupied;
}

/** Find the nearest unoccupied slot within threshold x-distance (percentage). Only horizontal proximity matters since slots are vertical lines. */
export function findNearestSlot(
  cursorX: number,
  _cursorY: number,
  occupiedSlots: Set<SlotName>,
  threshold = 8,
  canvasWidth = 1920,
  canvasHeight = 1080,
): SlotName | null {
  let best: SlotName | null = null;
  let bestDist = Infinity;
  const slots = getSlotPositions(canvasWidth, canvasHeight);
  const slotNames = Object.keys(slots) as SlotName[];

  for (const name of slotNames) {
    if (occupiedSlots.has(name)) continue;
    const slot = slots[name];
    const dist = Math.abs(cursorX - slot.x);
    if (dist <= threshold && dist < bestDist) {
      best = name;
      bestDist = dist;
    }
  }
  return best;
}

/** Compute auto-position for a new actor based on existing actors. */
export function getAutoSlotPosition(
  existingActors: ReadonlyArray<{ x: number; y: number }>,
  canvasWidth = 1920,
  canvasHeight = 1080,
): { x: number; y: number } {
  const slots = getSlotPositions(canvasWidth, canvasHeight);
  const occupied = getOccupiedSlots(existingActors, 3, canvasWidth, canvasHeight);

  // 0 actors → center
  if (existingActors.length === 0) {
    return { ...slots['center'] };
  }

  // 1 actor → place on opposite side
  if (existingActors.length === 1) {
    if (occupied.has('center')) {
      return { ...slots['right'] };
    }
    if (occupied.has('left')) {
      return { ...slots['right'] };
    }
    if (occupied.has('right')) {
      return { ...slots['left'] };
    }
    // Actor at a support slot or free position — default to center
    if (!occupied.has('center')) {
      return { ...slots['center'] };
    }
    return { ...slots['right'] };
  }

  // 2+ actors → first available slot in priority order
  const priority: SlotName[] = ['left', 'right', 'center', 'support-left', 'support-right'];
  for (const name of priority) {
    if (!occupied.has(name)) {
      return { ...slots[name] };
    }
  }

  // All slots occupied — fallback to center
  return { ...slots['center'] };
}

/** Compute alignment guides and snap positions for an actor being dragged. */
export function computeAlignmentGuides(
  actorX: number,
  actorY: number,
  otherActors: ReadonlyArray<{ x: number; y: number }>,
  threshold = 2,
  canvasWidth = 1920,
  canvasHeight = 1080,
): SnapResult {
  const guides: GuideLine[] = [];
  let snapX: number | undefined;
  let snapY: number | undefined;

  const slots = getSlotPositions(canvasWidth, canvasHeight);
  const slotXValues = [...new Set((Object.keys(slots) as SlotName[]).map((n) => slots[n].x))];

  // Slot vertical lines
  for (const sx of slotXValues) {
    if (Math.abs(actorX - sx) <= threshold) {
      guides.push({ orientation: 'v', position: sx });
      if (snapX === undefined) snapX = sx;
      break;
    }
  }

  // Horizontal baseline (y=100, canvas bottom)
  if (Math.abs(actorY - 100) <= threshold) {
    guides.push({ orientation: 'h', position: 100 });
    snapY = 100;
  }

  // Align with other actors
  for (const other of otherActors) {
    if (snapX === undefined && Math.abs(actorX - other.x) <= threshold) {
      guides.push({ orientation: 'v', position: other.x });
      snapX = other.x;
    }
    if (snapY === undefined && Math.abs(actorY - other.y) <= threshold) {
      guides.push({ orientation: 'h', position: other.y });
      snapY = other.y;
    }
  }

  return { guides, snapX, snapY };
}

/** Convert a 0-100 percentage to pixel position. */
export function percentToPixel(percent: number, stageDimension: number): number {
  return (percent / 100) * stageDimension;
}

/** Convert a pixel position to 0-100 percentage. */
export function pixelToPercent(pixel: number, stageDimension: number): number {
  if (stageDimension === 0) return 0;
  return clampPercent((pixel / stageDimension) * 100);
}

/** Clamp a value to 0-100 range. */
export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Move actor to the top (highest zIndex). */
export function moveActorToTop(actors: ActorState[], actorId: string): ActorState[] {
  const maxZ = Math.max(...actors.map((a) => a.zIndex), 0);
  return actors.map((a) => (a.id === actorId ? { ...a, zIndex: maxZ + 1 } : a));
}

/** Move actor to the bottom (lowest zIndex). */
export function moveActorToBottom(actors: ActorState[], actorId: string): ActorState[] {
  const minZ = Math.min(...actors.map((a) => a.zIndex), 0);
  return actors.map((a) => (a.id === actorId ? { ...a, zIndex: minZ - 1 } : a));
}

/** Move actor one step up in z-order (swap with the next higher neighbor). */
export function moveActorUp(actors: ActorState[], actorId: string): ActorState[] {
  const sorted = [...actors].sort((a, b) => a.zIndex - b.zIndex);
  const idx = sorted.findIndex((a) => a.id === actorId);
  if (idx < 0 || idx === sorted.length - 1) return actors;

  const current = sorted[idx];
  const above = sorted[idx + 1];

  return actors.map((a) => {
    if (a.id === current.id) return { ...a, zIndex: above.zIndex };
    if (a.id === above.id) return { ...a, zIndex: current.zIndex };
    return a;
  });
}

/** Move actor one step down in z-order (swap with the next lower neighbor). */
export function moveActorDown(actors: ActorState[], actorId: string): ActorState[] {
  const sorted = [...actors].sort((a, b) => a.zIndex - b.zIndex);
  const idx = sorted.findIndex((a) => a.id === actorId);
  if (idx <= 0) return actors;

  const current = sorted[idx];
  const below = sorted[idx - 1];

  return actors.map((a) => {
    if (a.id === current.id) return { ...a, zIndex: below.zIndex };
    if (a.id === below.id) return { ...a, zIndex: current.zIndex };
    return a;
  });
}

import { HTTP_BACKEND } from "@/config";
import axios from "axios";

export interface DrawingElement {
  type:
    | "rectangle"
    | "circle"
    | "diamond"
    | "arrow"
    | "line"
    | "pencil"
    | "text";
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  endX?: number;
  endY?: number;
  points?: { x: number; y: number }[];
  text?: string;
  strokeColor: string;
  fillColor?: string;
  strokeWidth: number;
  opacity?: number;
  angle?: number; // radians
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
}

export type Tool =
  | "select"
  | "rectangle"
  | "circle"
  | "diamond"
  | "arrow"
  | "line"
  | "pencil"
  | "text"
  | "eraser";

export interface SelectionInfo {
  elements: DrawingElement[];
  isSingle: boolean;
  type?: string;
  strokeColor?: string;
  fillColor?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
}

export interface DrawCallbacks {
  onHistoryChange?: (history: DrawingElement[], step: number) => void;
  onSelectionChange?: (selection: SelectionInfo | null) => void;
  onEditText?: (element: DrawingElement, isNew: boolean) => void;
  onCommitText?: () => void;
}

// Module State
let currentTool: Tool = "select";
let isDrawing = false;
let startX = 0;
let startY = 0;
let elements: DrawingElement[] = [];
let currentElement: DrawingElement | null = null;
let isDarkModeGlobal: boolean = true;
let history: DrawingElement[][] = [];
let historyIndex: number = -1;

// Selection & Transform State
let selectedElementIds: Set<string> = new Set();
let isDragging = false;
let isResizing = false;
let isRotating = false;
let isMarqueeSelecting = false;
let marqueeStart = { x: 0, y: 0 };
let marqueeEnd = { x: 0, y: 0 };
let activeHandle: string | null = null;
let transformInitialElements: Map<string, DrawingElement> = new Map();
let transformOriginCenter = { x: 0, y: 0 };
let transformInitialAngle = 0;
let dragStartX = 0;
let dragStartY = 0;
let isErasing = false;

// Internal Clipboard
let clipboardElements: DrawingElement[] = [];

// Inline Text Editing State
let editingTextId: string | null = null;

export function setEditingTextId(id: string | null) {
  editingTextId = id;
  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
  }
}

// Callbacks & Canvas Context
let drawCallbacks: DrawCallbacks | null = null;
let canvasRef: HTMLCanvasElement | null = null;
let canvasCtx: CanvasRenderingContext2D | null = null;
let socketRef: WebSocket | null = null;
let roomIdRef: string = "";

// ----------------------------------------------------
// MATH & GEOMETRY HELPERS
// ----------------------------------------------------

export function rotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  angle: number
): { x: number; y: number } {
  if (!angle) return { x, y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

export function unrotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  angle: number
): { x: number; y: number } {
  if (!angle) return { x, y };
  return rotatePoint(x, y, cx, cy, -angle);
}

export function getElementBounds(el: DrawingElement): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} {
  let minX = el.x;
  let minY = el.y;
  let maxX = el.x;
  let maxY = el.y;

  switch (el.type) {
    case "rectangle":
    case "diamond": {
      const w = el.width || 0;
      const h = el.height || 0;
      minX = Math.min(el.x, el.x + w);
      maxX = Math.max(el.x, el.x + w);
      minY = Math.min(el.y, el.y + h);
      maxY = Math.max(el.y, el.y + h);
      break;
    }
    case "circle": {
      const r = el.radius || 0;
      minX = el.x - r;
      maxX = el.x + r;
      minY = el.y - r;
      maxY = el.y + r;
      break;
    }
    case "line":
    case "arrow": {
      const endX = el.endX ?? el.x;
      const endY = el.endY ?? el.y;
      minX = Math.min(el.x, endX);
      maxX = Math.max(el.x, endX);
      minY = Math.min(el.y, endY);
      maxY = Math.max(el.y, endY);
      break;
    }
    case "pencil": {
      if (el.points && el.points.length > 0) {
        const xs = el.points.map((p) => p.x);
        const ys = el.points.map((p) => p.y);
        minX = Math.min(...xs);
        maxX = Math.max(...xs);
        minY = Math.min(...ys);
        maxY = Math.max(...ys);
      }
      break;
    }
    case "text": {
      const fontSize = el.fontSize || 18;
      const lines = (el.text || "").split("\n");
      const maxLineLength = Math.max(...lines.map((l) => l.length), 1);
      const textWidth = Math.max(el.width || 0, maxLineLength * fontSize * 0.6 + 10);
      const textHeight = Math.max(el.height || 0, lines.length * fontSize * 1.3 + 6);
      minX = el.x;
      minY = el.y;
      maxX = el.x + textWidth;
      maxY = el.y + textHeight;
      break;
    }
  }

  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return { minX, minY, maxX, maxY, width, height, centerX, centerY };
}

export function getSelectionBounds(selected: DrawingElement[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  angle: number;
} {
  if (selected.length === 0) {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
      angle: 0,
    };
  }

  if (selected.length === 1) {
    const el = selected[0];
    const b = getElementBounds(el);
    return { ...b, angle: el.angle || 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  selected.forEach((el) => {
    const b = getElementBounds(el);
    const angle = el.angle || 0;
    if (angle === 0) {
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    } else {
      const corners = [
        rotatePoint(b.minX, b.minY, b.centerX, b.centerY, angle),
        rotatePoint(b.maxX, b.minY, b.centerX, b.centerY, angle),
        rotatePoint(b.maxX, b.maxY, b.centerX, b.centerY, angle),
        rotatePoint(b.minX, b.maxY, b.centerX, b.centerY, angle),
      ];
      corners.forEach((c) => {
        minX = Math.min(minX, c.x);
        minY = Math.min(minY, c.y);
        maxX = Math.max(maxX, c.x);
        maxY = Math.max(maxY, c.y);
      });
    }
  });

  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return { minX, minY, maxX, maxY, width, height, centerX, centerY, angle: 0 };
}

function distanceFromPointToLine(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const A = px - x1;
  const B = py - y1;
  const C = x2 - x1;
  const D = y2 - y1;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) {
    param = dot / lenSq;
  }
  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }
  const dx = px - xx;
  const dy = py - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

export function isPointInElement(
  px: number,
  py: number,
  element: DrawingElement
): boolean {
  const bounds = getElementBounds(element);
  const angle = element.angle || 0;
  const unrotated = unrotatePoint(px, py, bounds.centerX, bounds.centerY, angle);
  const ux = unrotated.x;
  const uy = unrotated.y;

  const hitTolerance = Math.max(element.strokeWidth / 2 + 5, 8);

  switch (element.type) {
    case "rectangle":
      return (
        ux >= bounds.minX - hitTolerance &&
        ux <= bounds.maxX + hitTolerance &&
        uy >= bounds.minY - hitTolerance &&
        uy <= bounds.maxY + hitTolerance
      );
    case "circle": {
      const r = element.radius || 0;
      const dist = Math.hypot(ux - element.x, uy - element.y);
      return dist <= r + hitTolerance;
    }
    case "diamond":
      return (
        ux >= bounds.minX - hitTolerance &&
        ux <= bounds.maxX + hitTolerance &&
        uy >= bounds.minY - hitTolerance &&
        uy <= bounds.maxY + hitTolerance
      );
    case "line":
    case "arrow": {
      const endX = element.endX ?? element.x;
      const endY = element.endY ?? element.y;
      return distanceFromPointToLine(ux, uy, element.x, element.y, endX, endY) <= hitTolerance;
    }
    case "pencil": {
      if (!element.points || element.points.length === 0) return false;
      for (let i = 0; i < element.points.length - 1; i++) {
        const p1 = element.points[i];
        const p2 = element.points[i + 1];
        if (distanceFromPointToLine(ux, uy, p1.x, p1.y, p2.x, p2.y) <= hitTolerance) {
          return true;
        }
      }
      return false;
    }
    case "text":
      return (
        ux >= bounds.minX - 4 &&
        ux <= bounds.maxX + 4 &&
        uy >= bounds.minY - 4 &&
        uy <= bounds.maxY + 4
      );
  }
  return false;
}

function findElementAtPosition(x: number, y: number): DrawingElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    if (isPointInElement(x, y, elements[i])) {
      return elements[i];
    }
  }
  return null;
}

// ----------------------------------------------------
// SELECTION HANDLES & HIT-TESTING
// ----------------------------------------------------

interface HandleDefinition {
  id: string;
  x: number;
  y: number;
  cursor: string;
}

export function getSelectionHandles(selected: DrawingElement[]): HandleDefinition[] {
  if (selected.length === 0) return [];

  const b = getSelectionBounds(selected);
  const angle = b.angle;
  const padding = 6;
  const minX = b.minX - padding;
  const minY = b.minY - padding;
  const maxX = b.maxX + padding;
  const maxY = b.maxY + padding;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Unrotated handle positions
  const rawHandles = [
    { id: "nw", x: minX, y: minY, cursor: "nwse-resize" },
    { id: "n", x: midX, y: minY, cursor: "ns-resize" },
    { id: "ne", x: maxX, y: minY, cursor: "nesw-resize" },
    { id: "e", x: maxX, y: midY, cursor: "ew-resize" },
    { id: "se", x: maxX, y: maxY, cursor: "nwse-resize" },
    { id: "s", x: midX, y: maxY, cursor: "ns-resize" },
    { id: "sw", x: minX, y: maxY, cursor: "nesw-resize" },
    { id: "w", x: minX, y: midY, cursor: "ew-resize" },
    { id: "rot", x: midX, y: minY - 24, cursor: "grab" },
  ];

  return rawHandles.map((h) => {
    const rotated = rotatePoint(h.x, h.y, b.centerX, b.centerY, angle);
    return {
      id: h.id,
      x: rotated.x,
      y: rotated.y,
      cursor: h.cursor,
    };
  });
}

export function getHandleAtPoint(
  x: number,
  y: number,
  selected: DrawingElement[]
): string | null {
  const handles = getSelectionHandles(selected);
  const handleRadius = 9;

  for (const h of handles) {
    const dist = Math.hypot(x - h.x, y - h.y);
    if (dist <= handleRadius) {
      return h.id;
    }
  }
  return null;
}

// ----------------------------------------------------
// STATE & SELECTION NOTIFICATION
// ----------------------------------------------------

function notifySelection() {
  if (!drawCallbacks?.onSelectionChange) return;

  const selected = getSelectedElements();
  if (selected.length === 0) {
    drawCallbacks.onSelectionChange(null);
    return;
  }

  const first = selected[0];
  const allSameType = selected.every((e) => e.type === first.type);

  drawCallbacks.onSelectionChange({
    elements: selected,
    isSingle: selected.length === 1,
    type: allSameType ? first.type : "multiple",
    strokeColor: first.strokeColor,
    fillColor: first.fillColor,
    strokeWidth: first.strokeWidth,
    opacity: first.opacity ?? 1,
    fontSize: first.fontSize ?? 18,
    bold: first.bold ?? false,
    italic: first.italic ?? false,
  });
}

export function getSelectedElements(): DrawingElement[] {
  return elements.filter((el) => selectedElementIds.has(el.id));
}

export function getSelectedElementIds(): string[] {
  return Array.from(selectedElementIds);
}

export function selectElementsByIds(ids: string[]) {
  selectedElementIds = new Set(ids);
  notifySelection();
  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
  }
}

export function clearSelection() {
  selectedElementIds.clear();
  notifySelection();
  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
  }
}

export function selectAll() {
  selectedElementIds = new Set(elements.map((e) => e.id));
  notifySelection();
  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
  }
}

// ----------------------------------------------------
// HISTORY & UNDO / REDO
// ----------------------------------------------------

function saveHistory() {
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  history.push(JSON.parse(JSON.stringify(elements)));
  historyIndex = history.length - 1;
}

export function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    elements = JSON.parse(JSON.stringify(history[historyIndex]));
    // Prune invalid selected IDs
    const validIds = new Set(elements.map((e) => e.id));
    selectedElementIds = new Set(
      Array.from(selectedElementIds).filter((id) => validIds.has(id))
    );
    notifySelection();

    if (canvasRef && canvasCtx) {
      redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
      drawCallbacks?.onHistoryChange?.(elements, historyIndex);

      if (socketRef && roomIdRef) {
        socketRef.send(
          JSON.stringify({
            type: "undo",
            elements: elements,
            roomId: roomIdRef,
          })
        );
      }
    }
  }
}

export function redo() {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    elements = JSON.parse(JSON.stringify(history[historyIndex]));
    const validIds = new Set(elements.map((e) => e.id));
    selectedElementIds = new Set(
      Array.from(selectedElementIds).filter((id) => validIds.has(id))
    );
    notifySelection();

    if (canvasRef && canvasCtx) {
      redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
      drawCallbacks?.onHistoryChange?.(elements, historyIndex);

      if (socketRef && roomIdRef) {
        socketRef.send(
          JSON.stringify({
            type: "redo",
            elements: elements,
            roomId: roomIdRef,
          })
        );
      }
    }
  }
}

export function clearCanvas() {
  elements = [];
  history = [[]];
  historyIndex = 0;
  selectedElementIds.clear();
  notifySelection();

  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
    drawCallbacks?.onHistoryChange?.(elements, 0);

    if (socketRef && roomIdRef) {
      socketRef.send(
        JSON.stringify({
          type: "clearCanvas",
          roomId: roomIdRef,
        })
      );
    }
  }
}

// ----------------------------------------------------
// CLIPBOARD & DUPLICATION
// ----------------------------------------------------

export function copySelected() {
  const selected = getSelectedElements();
  if (selected.length === 0) return false;
  clipboardElements = JSON.parse(JSON.stringify(selected));
  return true;
}

export function pasteClipboard(offsetX = 20, offsetY = 20) {
  if (clipboardElements.length === 0) return false;

  const newElements: DrawingElement[] = clipboardElements.map((el) => {
    const clone: DrawingElement = JSON.parse(JSON.stringify(el));
    clone.id = Math.random().toString(36).substring(2, 11);
    clone.x += offsetX;
    clone.y += offsetY;
    if (clone.endX !== undefined) clone.endX += offsetX;
    if (clone.endY !== undefined) clone.endY += offsetY;
    if (clone.points) {
      clone.points = clone.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));
    }
    return clone;
  });

  elements.push(...newElements);
  selectedElementIds = new Set(newElements.map((e) => e.id));
  saveHistory();
  notifySelection();

  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
    drawCallbacks?.onHistoryChange?.(elements, historyIndex);

    if (socketRef && roomIdRef) {
      newElements.forEach((el) => {
        socketRef?.send(
          JSON.stringify({
            type: "drawing",
            message: JSON.stringify(el),
            roomId: roomIdRef,
          })
        );
      });
    }
  }

  // Update clipboard so subsequent pastes keep shifting
  clipboardElements = JSON.parse(JSON.stringify(newElements));
  return true;
}

export function duplicateSelected() {
  const copied = copySelected();
  if (copied) {
    return pasteClipboard(20, 20);
  }
  return false;
}

export function deleteSelected() {
  const selected = getSelectedElements();
  if (selected.length === 0) return false;

  const idsToDelete = new Set(selected.map((e) => e.id));
  elements = elements.filter((el) => !idsToDelete.has(el.id));
  selectedElementIds.clear();
  saveHistory();
  notifySelection();

  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
    drawCallbacks?.onHistoryChange?.(elements, historyIndex);

    if (socketRef && roomIdRef) {
      idsToDelete.forEach((elementId) => {
        socketRef?.send(
          JSON.stringify({
            type: "elementRemoved",
            elementId,
            roomId: roomIdRef,
          })
        );
      });
    }
  }
  return true;
}

// ----------------------------------------------------
// CONTEXTUAL STYLE UPDATES
// ----------------------------------------------------

export function updateSelectionStyle(updates: Partial<DrawingElement>) {
  const selected = getSelectedElements();
  if (selected.length === 0) return;

  selected.forEach((el) => {
    Object.assign(el, updates);
  });

  saveHistory();
  notifySelection();

  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
    drawCallbacks?.onHistoryChange?.(elements, historyIndex);

    if (socketRef && roomIdRef) {
      selected.forEach((el) => {
        socketRef?.send(
          JSON.stringify({
            type: "elementUpdated",
            element: el,
            roomId: roomIdRef,
          })
        );
      });
    }
  }
}

// ----------------------------------------------------
// INLINE TEXT EDITING COMMIT
// ----------------------------------------------------

export function commitTextElement(
  id: string,
  text: string,
  x: number,
  y: number,
  styles?: {
    strokeColor?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    opacity?: number;
  },
  isNew = false
) {
  editingTextId = null;
  const trimmed = text.trim();
  const index = elements.findIndex((e) => e.id === id);

  if (!trimmed) {
    if (index > -1) {
      elements.splice(index, 1);
      selectedElementIds.delete(id);
      saveHistory();
      notifySelection();
      if (canvasRef && canvasCtx) {
        redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
        if (socketRef && roomIdRef) {
          socketRef.send(
            JSON.stringify({
              type: "elementRemoved",
              elementId: id,
              roomId: roomIdRef,
            })
          );
        }
      }
    }
    return;
  }

  const stroke = styles?.strokeColor || (isDarkModeGlobal ? "#ffffff" : "#000000");

  if (index > -1) {
    elements[index].text = text;
    if (styles?.fontSize) elements[index].fontSize = styles.fontSize;
    if (styles?.bold !== undefined) elements[index].bold = styles.bold;
    if (styles?.italic !== undefined) elements[index].italic = styles.italic;
    if (styles?.strokeColor) elements[index].strokeColor = styles.strokeColor;
    if (styles?.opacity !== undefined) elements[index].opacity = styles.opacity;

    saveHistory();
    selectedElementIds = new Set([id]);
    notifySelection();

    if (canvasRef && canvasCtx) {
      redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
      if (socketRef && roomIdRef) {
        socketRef.send(
          JSON.stringify({
            type: "elementUpdated",
            element: elements[index],
            roomId: roomIdRef,
          })
        );
      }
    }
  } else {
    const newElement: DrawingElement = {
      type: "text",
      id,
      x,
      y,
      text,
      strokeColor: stroke,
      strokeWidth: 2,
      fontSize: styles?.fontSize || 18,
      bold: styles?.bold || false,
      italic: styles?.italic || false,
      opacity: styles?.opacity ?? 1,
    };
    elements.push(newElement);
    saveHistory();
    selectedElementIds = new Set([id]);
    notifySelection();

    if (canvasRef && canvasCtx) {
      redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
      if (socketRef && roomIdRef) {
        socketRef.send(
          JSON.stringify({
            type: "drawing",
            message: JSON.stringify(newElement),
            roomId: roomIdRef,
          })
        );
      }
    }
  }
}

// ----------------------------------------------------
// RENDERING
// ----------------------------------------------------

export function setCurrentTool(tool: Tool) {
  if (tool !== "text" && editingTextId !== null) {
    drawCallbacks?.onCommitText?.();
  }
  currentTool = tool;
  if (tool !== "select") {
    selectedElementIds.clear();
    notifySelection();
  }
  isDragging = false;
  isResizing = false;
  isRotating = false;
  isMarqueeSelecting = false;
  isErasing = false;

  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
  }
}

export function setDarkMode(isDark: boolean) {
  isDarkModeGlobal = isDark;
  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
  }
}

function drawElement(
  ctx: CanvasRenderingContext2D,
  element: DrawingElement,
  isDark: boolean = isDarkModeGlobal
) {
  ctx.save();

  const strokeColor =
    element.strokeColor === "#000000" && isDark
      ? "#ffffff"
      : element.strokeColor === "#ffffff" && !isDark
      ? "#000000"
      : element.strokeColor;

  const bounds = getElementBounds(element);

  // Apply rotation around element center
  if (element.angle) {
    ctx.translate(bounds.centerX, bounds.centerY);
    ctx.rotate(element.angle);
    ctx.translate(-bounds.centerX, -bounds.centerY);
  }

  // Apply opacity
  if (element.opacity !== undefined) {
    ctx.globalAlpha = Math.max(0.05, Math.min(1, element.opacity));
  }

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = element.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const hasFill = element.fillColor && element.fillColor !== "transparent";
  if (hasFill) {
    ctx.fillStyle = element.fillColor!;
  }

  switch (element.type) {
    case "rectangle":
      if (element.width !== undefined && element.height !== undefined) {
        if (hasFill) {
          ctx.fillRect(element.x, element.y, element.width, element.height);
        }
        ctx.strokeRect(element.x, element.y, element.width, element.height);
      }
      break;

    case "circle":
      if (element.radius && element.radius > 0) {
        ctx.beginPath();
        ctx.arc(element.x, element.y, element.radius, 0, 2 * Math.PI);
        if (hasFill) {
          ctx.fill();
        }
        ctx.stroke();
      }
      break;

    case "diamond":
      if (element.width !== undefined && element.height !== undefined) {
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        ctx.beginPath();
        ctx.moveTo(cx, element.y);
        ctx.lineTo(element.x + element.width, cy);
        ctx.lineTo(cx, element.y + element.height);
        ctx.lineTo(element.x, cy);
        ctx.closePath();
        if (hasFill) {
          ctx.fill();
        }
        ctx.stroke();
      }
      break;

    case "line":
      if (element.endX !== undefined && element.endY !== undefined) {
        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        ctx.lineTo(element.endX, element.endY);
        ctx.stroke();
      }
      break;

    case "arrow":
      if (element.endX !== undefined && element.endY !== undefined) {
        const headLength = 18;
        const angle = Math.atan2(element.endY - element.y, element.endX - element.x);

        ctx.beginPath();
        ctx.moveTo(element.x, element.y);
        ctx.lineTo(element.endX, element.endY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(element.endX, element.endY);
        ctx.lineTo(
          element.endX - headLength * Math.cos(angle - Math.PI / 6),
          element.endY - headLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(element.endX, element.endY);
        ctx.lineTo(
          element.endX - headLength * Math.cos(angle + Math.PI / 6),
          element.endY - headLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
      break;

    case "pencil":
      if (element.points && element.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(element.points[0].x, element.points[0].y);
        for (let i = 1; i < element.points.length; i++) {
          ctx.lineTo(element.points[i].x, element.points[i].y);
        }
        ctx.stroke();
      }
      break;

    case "text":
      if (element.text && element.id !== editingTextId) {
        const fontSize = element.fontSize || 18;
        const fontWeight = element.bold ? "bold" : "normal";
        const fontStyle = element.italic ? "italic" : "normal";
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = strokeColor;
        ctx.textBaseline = "top";

        const lines = element.text.split("\n");
        const lineHeight = fontSize * 1.3;
        lines.forEach((line, idx) => {
          ctx.fillText(line, element.x, element.y + idx * lineHeight);
        });
      }
      break;
  }

  ctx.restore();
}

function drawSelectionBox(
  ctx: CanvasRenderingContext2D,
  selected: DrawingElement[],
  isDark: boolean
) {
  if (selected.length === 0) return;

  const b = getSelectionBounds(selected);
  const angle = b.angle;
  const padding = 6;
  const minX = b.minX - padding;
  const minY = b.minY - padding;
  const width = b.width + padding * 2;
  const height = b.height + padding * 2;

  ctx.save();
  if (angle) {
    ctx.translate(b.centerX, b.centerY);
    ctx.rotate(angle);
    ctx.translate(-b.centerX, -b.centerY);
  }

  // Bounding dashed box
  ctx.strokeStyle = "#8b5cf6"; // Violet primary
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minX, minY, width, height);

  // Rotation handle line
  const midX = minX + width / 2;
  ctx.beginPath();
  ctx.moveTo(midX, minY);
  ctx.lineTo(midX, minY - 22);
  ctx.strokeStyle = "#8b5cf6";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Rotation handle circle
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(midX, minY - 22, 5, 0, 2 * Math.PI);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.strokeStyle = "#8b5cf6";
  ctx.lineWidth = 2;
  ctx.stroke();

  // 8 Resize handle squares
  const handleSize = 8;
  const half = handleSize / 2;
  const handlePositions = [
    { x: minX, y: minY },
    { x: midX, y: minY },
    { x: minX + width, y: minY },
    { x: minX + width, y: minY + height / 2 },
    { x: minX + width, y: minY + height },
    { x: midX, y: minY + height },
    { x: minX, y: minY + height },
    { x: minX, y: minY + height / 2 },
  ];

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#8b5cf6";
  ctx.lineWidth = 1.5;

  handlePositions.forEach((pos) => {
    ctx.fillRect(pos.x - half, pos.y - half, handleSize, handleSize);
    ctx.strokeRect(pos.x - half, pos.y - half, handleSize, handleSize);
  });

  ctx.restore();
}

function drawMarquee(
  ctx: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.fillStyle = "rgba(139, 92, 246, 0.08)";
  ctx.fillRect(minX, minY, width, height);
  ctx.strokeStyle = "#8b5cf6";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(minX, minY, width, height);
  ctx.restore();
}

export function redrawCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  isDark: boolean = isDarkModeGlobal
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = isDark ? "#090d16" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  elements.forEach((element) => drawElement(ctx, element, isDark));

  if (currentTool === "select") {
    const selected = getSelectedElements();
    if (selected.length > 0) {
      drawSelectionBox(ctx, selected, isDark);
    }
  }

  if (isMarqueeSelecting) {
    drawMarquee(ctx, marqueeStart, marqueeEnd);
  }
}

function redrawCanvasWithPreview(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  previewElement: DrawingElement,
  isDark: boolean = isDarkModeGlobal
) {
  redrawCanvas(canvas, ctx, isDark);
  drawElement(ctx, previewElement, isDark);
}

// ----------------------------------------------------
// CANVAS INITIALIZATION & EVENT LISTENERS
// ----------------------------------------------------

export async function initDraw(
  canvas: HTMLCanvasElement,
  roomId: string,
  socket: WebSocket,
  tool: Tool,
  callbacks: DrawCallbacks,
  isDarkMode: boolean = true
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  canvasRef = canvas;
  canvasCtx = ctx;
  drawCallbacks = callbacks;
  currentTool = tool;
  isDarkModeGlobal = isDarkMode;
  socketRef = socket;
  roomIdRef = roomId;

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === "drawing") {
        const element = JSON.parse(message.message);
        // Avoid duplicate push
        const existingIdx = elements.findIndex((e) => e.id === element.id);
        if (existingIdx > -1) {
          elements[existingIdx] = element;
        } else {
          elements.push(element);
        }
        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        drawCallbacks?.onHistoryChange?.(elements, historyIndex);
      } else if (message.type === "elementRemoved") {
        const elementIndex = elements.findIndex((el) => el.id === message.elementId);
        if (elementIndex > -1) {
          selectedElementIds.delete(message.elementId);
          elements.splice(elementIndex, 1);
          notifySelection();
          redrawCanvas(canvas, ctx, isDarkModeGlobal);
          drawCallbacks?.onHistoryChange?.(elements, historyIndex);
        }
      } else if (message.type === "elementUpdated") {
        const elementIndex = elements.findIndex((el) => el.id === message.element.id);
        if (elementIndex > -1) {
          elements[elementIndex] = message.element;
          notifySelection();
          redrawCanvas(canvas, ctx, isDarkModeGlobal);
          drawCallbacks?.onHistoryChange?.(elements, historyIndex);
        }
      } else if (message.type === "clearCanvas") {
        elements = [];
        history = [[]];
        historyIndex = 0;
        selectedElementIds.clear();
        notifySelection();
        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        drawCallbacks?.onHistoryChange?.(elements, 0);
      } else if (message.type === "undo" || message.type === "redo") {
        elements = message.elements;
        history = history.slice(0, historyIndex + 1);
        history.push(JSON.parse(JSON.stringify(elements)));
        historyIndex = history.length - 1;
        const validIds = new Set(elements.map((e) => e.id));
        selectedElementIds = new Set(
          Array.from(selectedElementIds).filter((id) => validIds.has(id))
        );
        notifySelection();
        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        drawCallbacks?.onHistoryChange?.(elements, historyIndex);
      }
    } catch (e) {
      console.error("Failed to parse incoming socket message:", e);
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return; // Only primary button
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    startX = (e.clientX - rect.left) * scaleX;
    startY = (e.clientY - rect.top) * scaleY;

    if (currentTool === "select") {
      const selected = getSelectedElements();

      // Check handle click
      if (selected.length > 0) {
        const handle = getHandleAtPoint(startX, startY, selected);
        if (handle) {
          const bounds = getSelectionBounds(selected);
          transformOriginCenter = { x: bounds.centerX, y: bounds.centerY };
          transformInitialAngle = bounds.angle;
          transformInitialElements = new Map(
            selected.map((el) => [el.id, JSON.parse(JSON.stringify(el))])
          );
          dragStartX = startX;
          dragStartY = startY;

          if (handle === "rot") {
            isRotating = true;
          } else {
            isResizing = true;
            activeHandle = handle;
          }
          return;
        }
      }

      // Check click on element
      const clickedEl = findElementAtPosition(startX, startY);

      if (clickedEl) {
        if (e.shiftKey) {
          if (selectedElementIds.has(clickedEl.id)) {
            selectedElementIds.delete(clickedEl.id);
          } else {
            selectedElementIds.add(clickedEl.id);
          }
        } else {
          if (!selectedElementIds.has(clickedEl.id)) {
            selectedElementIds = new Set([clickedEl.id]);
          }
        }

        notifySelection();
        isDragging = true;
        dragStartX = startX;
        dragStartY = startY;
        transformInitialElements = new Map(
          getSelectedElements().map((el) => [el.id, JSON.parse(JSON.stringify(el))])
        );
        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        return;
      }

      // Clicked on empty space -> start marquee selection
      if (!e.shiftKey) {
        selectedElementIds.clear();
        notifySelection();
      }
      isMarqueeSelecting = true;
      marqueeStart = { x: startX, y: startY };
      marqueeEnd = { x: startX, y: startY };
      redrawCanvas(canvas, ctx, isDarkModeGlobal);
      return;
    }

    if (currentTool === "eraser") {
      isErasing = true;
      const elementToRemove = findElementAtPosition(startX, startY);
      if (elementToRemove) {
        deleteElements([elementToRemove.id]);
      }
      return;
    }

    if (currentTool === "text") {
      // If there is already an active text editor, commit it first and return
      if (editingTextId !== null) {
        drawCallbacks?.onCommitText?.();
        return;
      }

      const strokeColor = isDarkModeGlobal ? "#ffffff" : "#000000";
      const newTextElement: DrawingElement = {
        type: "text",
        id: Math.random().toString(36).substring(2, 11),
        x: startX,
        y: startY,
        text: "",
        strokeColor,
        strokeWidth: 2,
        fontSize: 18,
        bold: false,
        italic: false,
        opacity: 1,
      };

      editingTextId = newTextElement.id;
      drawCallbacks?.onEditText?.(newTextElement, true);
      return;
    }

    // New shape creation
    isDrawing = true;
    const id = Math.random().toString(36).substring(2, 11);
    const strokeColor = isDarkModeGlobal ? "#ffffff" : "#000000";

    switch (currentTool) {
      case "pencil":
        currentElement = {
          type: "pencil",
          id,
          x: startX,
          y: startY,
          points: [{ x: startX, y: startY }],
          strokeColor,
          strokeWidth: 2,
          opacity: 1,
        };
        break;
      case "line":
        currentElement = {
          type: "line",
          id,
          x: startX,
          y: startY,
          endX: startX,
          endY: startY,
          strokeColor,
          strokeWidth: 2,
          opacity: 1,
        };
        break;
      case "rectangle":
        currentElement = {
          type: "rectangle",
          id,
          x: startX,
          y: startY,
          width: 0,
          height: 0,
          strokeColor,
          strokeWidth: 2,
          opacity: 1,
        };
        break;
      case "circle":
        currentElement = {
          type: "circle",
          id,
          x: startX,
          y: startY,
          radius: 0,
          strokeColor,
          strokeWidth: 2,
          opacity: 1,
        };
        break;
      case "diamond":
        currentElement = {
          type: "diamond",
          id,
          x: startX,
          y: startY,
          width: 0,
          height: 0,
          strokeColor,
          strokeWidth: 2,
          opacity: 1,
        };
        break;
      case "arrow":
        currentElement = {
          type: "arrow",
          id,
          x: startX,
          y: startY,
          endX: startX,
          endY: startY,
          strokeColor,
          strokeWidth: 2,
          opacity: 1,
        };
        break;
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    if (currentTool === "eraser" && isErasing) {
      const elementToRemove = findElementAtPosition(currentX, currentY);
      if (elementToRemove) {
        deleteElements([elementToRemove.id]);
      }
      return;
    }

    if (currentTool === "select") {
      // Rotation interaction
      if (isRotating) {
        const cx = transformOriginCenter.x;
        const cy = transformOriginCenter.y;
        let angle = Math.atan2(currentY - cy, currentX - cx) + Math.PI / 2;
        // Normalize angle
        while (angle < 0) angle += 2 * Math.PI;
        while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;

        const selected = getSelectedElements();
        if (selected.length === 1) {
          selected[0].angle = angle;
        } else {
          // Rotate group of elements around group center
          const deltaAngle = angle - transformInitialAngle;
          selected.forEach((el) => {
            const initial = transformInitialElements.get(el.id);
            if (initial) {
              const rotatedCenter = rotatePoint(
                initial.x,
                initial.y,
                cx,
                cy,
                deltaAngle
              );
              el.x = rotatedCenter.x;
              el.y = rotatedCenter.y;
              if (el.endX !== undefined && el.endY !== undefined && initial.endX !== undefined && initial.endY !== undefined) {
                const rotatedEnd = rotatePoint(initial.endX, initial.endY, cx, cy, deltaAngle);
                el.endX = rotatedEnd.x;
                el.endY = rotatedEnd.y;
              }
              if (el.points && initial.points) {
                el.points = initial.points.map((p) => rotatePoint(p.x, p.y, cx, cy, deltaAngle));
              }
              el.angle = (initial.angle || 0) + deltaAngle;
            }
          });
        }

        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        return;
      }

      // Resizing interaction
      if (isResizing && activeHandle) {
        const handle = activeHandle;
        const dx = currentX - dragStartX;
        const dy = currentY - dragStartY;

        getSelectedElements().forEach((el) => {
          const initial = transformInitialElements.get(el.id);
          if (!initial) return;

          switch (el.type) {
            case "rectangle":
            case "diamond": {
              const initialW = initial.width || 0;
              const initialH = initial.height || 0;
              let newW = initialW;
              let newH = initialH;
              let newX = initial.x;
              let newY = initial.y;

              if (handle.includes("e")) newW += dx;
              if (handle.includes("s")) newH += dy;
              if (handle.includes("w")) {
                newW -= dx;
                newX += dx;
              }
              if (handle.includes("n")) {
                newH -= dy;
                newY += dy;
              }

              if (Math.abs(newW) >= 5) {
                el.width = newW;
                el.x = newX;
              }
              if (Math.abs(newH) >= 5) {
                el.height = newH;
                el.y = newY;
              }
              break;
            }
            case "circle": {
              const initialR = initial.radius || 0;
              const dist = Math.hypot(dx, dy);
              const sign = handle.includes("s") || handle.includes("e") ? 1 : -1;
              el.radius = Math.max(5, initialR + sign * (dist / 2));
              break;
            }
            case "line":
            case "arrow": {
              if (handle.includes("w") || handle.includes("n")) {
                el.x = initial.x + dx;
                el.y = initial.y + dy;
              } else {
                el.endX = (initial.endX ?? initial.x) + dx;
                el.endY = (initial.endY ?? initial.y) + dy;
              }
              break;
            }
            case "text": {
              if (handle.includes("e")) {
                el.width = Math.max(20, (initial.width || 50) + dx);
              }
              break;
            }
          }
        });

        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        return;
      }

      // Dragging movement interaction
      if (isDragging) {
        const dx = currentX - dragStartX;
        const dy = currentY - dragStartY;

        getSelectedElements().forEach((el) => {
          const initial = transformInitialElements.get(el.id);
          if (initial) {
            el.x = initial.x + dx;
            el.y = initial.y + dy;
            if (el.endX !== undefined && initial.endX !== undefined) {
              el.endX = initial.endX + dx;
            }
            if (el.endY !== undefined && initial.endY !== undefined) {
              el.endY = initial.endY + dy;
            }
            if (el.points && initial.points) {
              el.points = initial.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
            }
          }
        });

        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        return;
      }

      // Marquee Box Dragging
      if (isMarqueeSelecting) {
        marqueeEnd = { x: currentX, y: currentY };
        const minX = Math.min(marqueeStart.x, marqueeEnd.x);
        const maxX = Math.max(marqueeStart.x, marqueeEnd.x);
        const minY = Math.min(marqueeStart.y, marqueeEnd.y);
        const maxY = Math.max(marqueeStart.y, marqueeEnd.y);

        const newSelected = new Set<string>();
        elements.forEach((el) => {
          const b = getElementBounds(el);
          const intersects =
            b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY;
          if (intersects) {
            newSelected.add(el.id);
          }
        });

        selectedElementIds = newSelected;
        notifySelection();
        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        return;
      }

      // Update cursor when hovering over handles
      const selected = getSelectedElements();
      if (selected.length > 0) {
        const handle = getHandleAtPoint(currentX, currentY, selected);
        if (handle) {
          const handles = getSelectionHandles(selected);
          const found = handles.find((h) => h.id === handle);
          canvas.style.cursor = found ? found.cursor : "default";
          return;
        }
      }
      canvas.style.cursor = "default";
      return;
    }

    if (!isDrawing || !currentElement) return;

    switch (currentTool) {
      case "pencil":
        if (currentElement.points) {
          currentElement.points.push({ x: currentX, y: currentY });
        }
        break;
      case "line":
      case "arrow":
        currentElement.endX = currentX;
        currentElement.endY = currentY;
        break;
      case "rectangle":
      case "diamond":
        currentElement.width = currentX - startX;
        currentElement.height = currentY - startY;
        break;
      case "circle":
        currentElement.radius = Math.hypot(currentX - startX, currentY - startY);
        break;
    }

    redrawCanvasWithPreview(canvas, ctx, currentElement, isDarkModeGlobal);
  };

  const handleMouseUp = () => {
    if (currentTool === "eraser") {
      isErasing = false;
      return;
    }

    if (currentTool === "select") {
      if (isDragging || isResizing || isRotating) {
        saveHistory();
        const selected = getSelectedElements();
        selected.forEach((el) => {
          socketRef?.send(
            JSON.stringify({
              type: "elementUpdated",
              element: el,
              roomId: roomIdRef,
            })
          );
        });
        drawCallbacks?.onHistoryChange?.(elements, historyIndex);
      }

      isDragging = false;
      isResizing = false;
      isRotating = false;
      isMarqueeSelecting = false;
      activeHandle = null;
      redrawCanvas(canvas, ctx, isDarkModeGlobal);
      return;
    }

    if (!isDrawing || !currentElement) return;

    isDrawing = false;
    elements.push(currentElement);
    saveHistory();
    selectedElementIds = new Set([currentElement.id]);
    notifySelection();

    redrawCanvas(canvas, ctx, isDarkModeGlobal);

    socketRef?.send(
      JSON.stringify({
        type: "drawing",
        message: JSON.stringify(currentElement),
        roomId: roomIdRef,
      })
    );

    currentElement = null;
    drawCallbacks?.onHistoryChange?.(elements, historyIndex);
  };

  const handleDoubleClick = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const clickedEl = findElementAtPosition(x, y);
    if (clickedEl && clickedEl.type === "text") {
      selectedElementIds = new Set([clickedEl.id]);
      notifySelection();
      drawCallbacks?.onEditText?.(clickedEl, false);
    }
  };

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseout", handleMouseUp);
  canvas.addEventListener("dblclick", handleDoubleClick);

  void getExistingElements(roomId).then((loaded) => {
    if (loaded && loaded.length > 0) {
      elements = loaded;
      history = [JSON.parse(JSON.stringify(elements))];
      historyIndex = 0;
      if (canvasRef && canvasCtx) {
        redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
      }
    }
  });

  return () => {
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mousemove", handleMouseMove);
    canvas.removeEventListener("mouseup", handleMouseUp);
    canvas.removeEventListener("mouseout", handleMouseUp);
    canvas.removeEventListener("dblclick", handleDoubleClick);
  };
}

function deleteElements(ids: string[]) {
  const toDelete = new Set(ids);
  elements = elements.filter((el) => !toDelete.has(el.id));
  ids.forEach((id) => selectedElementIds.delete(id));
  saveHistory();
  notifySelection();

  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
    drawCallbacks?.onHistoryChange?.(elements, historyIndex);

    if (socketRef && roomIdRef) {
      ids.forEach((elementId) => {
        socketRef?.send(
          JSON.stringify({
            type: "elementRemoved",
            elementId,
            roomId: roomIdRef,
          })
        );
      });
    }
  }
}

async function getExistingElements(roomId: string): Promise<DrawingElement[]> {
  try {
    const res = await axios.get(`${HTTP_BACKEND}/drawings/${roomId}`);
    const drawings = res.data.drawings || [];
    return drawings;
  } catch (error) {
    console.error("Failed to load existing elements:", error);
    return [];
  }
}

export function getCurrentElements(): DrawingElement[] {
  return JSON.parse(JSON.stringify(elements));
}

export async function saveDrawingToBackend(
  roomId: string,
  userId?: string
): Promise<{ success: boolean; message: string; count: number }> {
  try {
    const currentList = getCurrentElements();
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const resolvedUserId =
      userId || (typeof window !== "undefined" ? localStorage.getItem("userId") : undefined);

    const response = await axios.post(
      `${HTTP_BACKEND}/drawings/save`,
      {
        roomId,
        elements: currentList,
        userId: resolvedUserId,
      },
      {
        headers: token ? { authorization: token } : {},
      }
    );

    return {
      success: true,
      message: response.data.message || "Drawing saved successfully",
      count: response.data.count ?? currentList.length,
    };
  } catch (error: any) {
    console.error("Failed to save drawing to backend:", error);
    return {
      success: false,
      message: error.response?.data?.message || "Failed to save drawing",
      count: 0,
    };
  }
}

// ----------------------------------------------------
// EXPORT HELPERS (PNG, SVG, JSON)
// ----------------------------------------------------

export function exportAsPng(
  canvas: HTMLCanvasElement | null,
  filename: string = "whiteboard.png"
): boolean {
  try {
    if (!canvas) return false;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width || window.innerWidth;
    exportCanvas.height = canvas.height || window.innerHeight;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return false;

    // Fill background
    ctx.fillStyle = isDarkModeGlobal ? "#090d16" : "#ffffff";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    // Render all elements with rotation, fill, opacity, text styles
    elements.forEach((el) => drawElement(ctx, el, isDarkModeGlobal));

    const imageUri = exportCanvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = filename.endsWith(".png") ? filename : `${filename}.png`;
    link.href = imageUri;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error("Failed to export PNG:", err);
    return false;
  }
}

export function exportAsJson(
  customElements?: DrawingElement[],
  filename: string = "whiteboard.json"
): boolean {
  try {
    const listToExport = customElements || getCurrentElements();
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(listToExport, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute(
      "download",
      filename.endsWith(".json") ? filename : `${filename}.json`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return true;
  } catch (err) {
    console.error("Failed to export JSON:", err);
    return false;
  }
}

export function exportAsSvg(
  customElements?: DrawingElement[],
  isDark: boolean = isDarkModeGlobal,
  filename: string = "whiteboard.svg"
): boolean {
  try {
    const list = customElements || getCurrentElements();
    const width = typeof window !== "undefined" ? window.innerWidth : 1920;
    const height = typeof window !== "undefined" ? window.innerHeight : 1080;
    const bgColor = isDark ? "#090d16" : "#ffffff";

    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n`;
    svgContent += `  <rect width="100%" height="100%" fill="${bgColor}"/>\n`;

    list.forEach((el) => {
      const stroke =
        el.strokeColor === "#000000" && isDark
          ? "#ffffff"
          : el.strokeColor === "#ffffff" && !isDark
          ? "#000000"
          : el.strokeColor;
      const strokeWidth = el.strokeWidth || 2;
      const fill = el.fillColor && el.fillColor !== "transparent" ? el.fillColor : "none";
      const opacity = el.opacity ?? 1;
      const bounds = getElementBounds(el);
      const angleDeg = (((el.angle || 0) * 180) / Math.PI).toFixed(2);

      svgContent += `  <g transform="rotate(${angleDeg} ${bounds.centerX} ${bounds.centerY})" opacity="${opacity}">\n`;

      switch (el.type) {
        case "rectangle":
          if (el.width !== undefined && el.height !== undefined) {
            svgContent += `    <rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}" rx="2"/>\n`;
          }
          break;
        case "circle":
          if (el.radius && el.radius > 0) {
            svgContent += `    <circle cx="${el.x}" cy="${el.y}" r="${el.radius}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}"/>\n`;
          }
          break;
        case "diamond":
          if (el.width !== undefined && el.height !== undefined) {
            const cx = el.x + el.width / 2;
            const cy = el.y + el.height / 2;
            svgContent += `    <polygon points="${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="${fill}"/>\n`;
          }
          break;
        case "line":
          if (el.endX !== undefined && el.endY !== undefined) {
            svgContent += `    <line x1="${el.x}" y1="${el.y}" x2="${el.endX}" y2="${el.endY}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"/>\n`;
          }
          break;
        case "arrow":
          if (el.endX !== undefined && el.endY !== undefined) {
            const headLength = 15;
            const angle = Math.atan2(el.endY - el.y, el.endX - el.x);
            const x3 = el.endX - headLength * Math.cos(angle - Math.PI / 6);
            const y3 = el.endY - headLength * Math.sin(angle - Math.PI / 6);
            const x4 = el.endX - headLength * Math.cos(angle + Math.PI / 6);
            const y4 = el.endY - headLength * Math.sin(angle + Math.PI / 6);

            svgContent += `    <line x1="${el.x}" y1="${el.y}" x2="${el.endX}" y2="${el.endY}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round"/>\n`;
            svgContent += `    <polygon points="${el.endX},${el.endY} ${x3},${y3} ${x4},${y4}" fill="${stroke}"/>\n`;
          }
          break;
        case "pencil":
          if (el.points && el.points.length > 1) {
            const d = el.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
            svgContent += `    <path d="${d}" stroke="${stroke}" stroke-width="${strokeWidth}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>\n`;
          }
          break;
        case "text":
          if (el.text) {
            const fontSize = el.fontSize || 18;
            const fontWeight = el.bold ? "bold" : "normal";
            const fontStyle = el.italic ? "italic" : "normal";
            const lines = el.text.split("\n");
            const lineHeight = fontSize * 1.3;

            svgContent += `    <text x="${el.x}" y="${el.y}" fill="${stroke}" font-family="system-ui, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}">\n`;
            lines.forEach((line, idx) => {
              const escaped = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
              svgContent += `      <tspan x="${el.x}" dy="${idx === 0 ? fontSize : lineHeight}">${escaped}</tspan>\n`;
            });
            svgContent += `    </text>\n`;
          }
          break;
      }

      svgContent += `  </g>\n`;
    });

    svgContent += `</svg>`;

    const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error("Failed to export SVG:", err);
    return false;
  }
}

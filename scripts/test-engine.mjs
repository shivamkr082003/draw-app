function rotatePoint(x, y, cx, cy, angle) {
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

function unrotatePoint(x, y, cx, cy, angle) {
  if (!angle) return { x, y };
  return rotatePoint(x, y, cx, cy, -angle);
}

function getElementBounds(el) {
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

function isPointInElement(px, py, element) {
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

function assert(condition, msg) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✓ ${msg}`);
}

// Test 1: rotation
const p = { x: 100, y: 50 };
const center = { x: 100, y: 100 };
const angle = Math.PI / 2;
const rot = rotatePoint(p.x, p.y, center.x, center.y, angle);
assert(Math.abs(rot.x - 150) < 0.001 && Math.abs(rot.y - 100) < 0.001, "rotatePoint 90 deg");
const unrot = unrotatePoint(rot.x, rot.y, center.x, center.y, angle);
assert(Math.abs(unrot.x - p.x) < 0.001 && Math.abs(unrot.y - p.y) < 0.001, "unrotatePoint recovers point");

// Test 2: Rectangle bounds & rotated hit testing
const rectEl = {
  id: "r1",
  type: "rectangle",
  x: 100,
  y: 100,
  width: 100,
  height: 50,
  strokeColor: "#000000",
  strokeWidth: 2,
  angle: 0,
};

const bounds = getElementBounds(rectEl);
assert(bounds.width === 100 && bounds.height === 50, "Rectangle bounds width and height");
assert(bounds.centerX === 150 && bounds.centerY === 125, "Rectangle center");
assert(isPointInElement(120, 120, rectEl), "Point inside unrotated rectangle");
assert(!isPointInElement(50, 50, rectEl), "Point outside rectangle");

// Rotate rectangle by 90 deg
rectEl.angle = Math.PI / 2;
assert(isPointInElement(150, 125, rectEl), "Center is inside rotated rectangle");

// Test 3: Text multiline bounds
const textEl = {
  id: "t1",
  type: "text",
  x: 50,
  y: 50,
  text: "Hello\nWorld!",
  strokeColor: "#3b82f6",
  strokeWidth: 2,
  fontSize: 20,
};
const textBounds = getElementBounds(textEl);
assert(textBounds.height > 20, "Multiline text bounds calculates height with line count");
assert(isPointInElement(55, 60, textEl), "Point inside text element");

console.log("\nAll whiteboard engine mathematical tests passed successfully!");

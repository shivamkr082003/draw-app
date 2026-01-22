import { HTTP_BACKEND } from "@/config";
import axios from "axios";

type DrawingElement = {
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
};

type Tool =
  | "select"
  | "rectangle"
  | "circle"
  | "diamond"
  | "arrow"
  | "line"
  | "pencil"
  | "text"
  | "eraser";

let currentTool: Tool = "select";
let isDrawing = false;
let startX = 0;
let startY = 0;
let elements: DrawingElement[] = [];
let currentElement: DrawingElement | null = null;
let isDarkModeGlobal: boolean = false;
let history: DrawingElement[][] = [];
let historyIndex: number = -1;
let selectedElement: DrawingElement | null = null;
let selectedElementIndex: number = -1;
let isDragging = false;
let isResizing = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let resizeHandle: string | null = null;
let dragStartX = 0;
let dragStartY = 0;
let isErasing = false;

let historyCallbacks: {
  onHistoryChange: (history: DrawingElement[], step: number) => void;
} | null = null;
let canvasRef: HTMLCanvasElement | null = null;
let canvasCtx: CanvasRenderingContext2D | null = null;
let socketRef: WebSocket | null = null;
let roomIdRef: string = "";

export function setCurrentTool(tool: Tool) {
  selectedElement = null;
  selectedElementIndex = -1;
  isDragging = false;
  isResizing = false;
  isErasing = false;
  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
  }
  currentTool = tool;
}

export function setDarkMode(isDark: boolean) {
  isDarkModeGlobal = isDark;
}

export function undo() {
  if (historyIndex > 0) {
    historyIndex--;
    elements = JSON.parse(JSON.stringify(history[historyIndex]));
    if (canvasRef && canvasCtx) {
      redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
      if (historyCallbacks) {
        historyCallbacks.onHistoryChange(elements, historyIndex);
      }
      if (socketRef && roomIdRef) {
        console.log("Sending undo to room:", roomIdRef);
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
    if (canvasRef && canvasCtx) {
      redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
      if (historyCallbacks) {
        historyCallbacks.onHistoryChange(elements, historyIndex);
      }
      if (socketRef && roomIdRef) {
        console.log("Sending redo to room:", roomIdRef);
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
  if (canvasRef && canvasCtx) {
    redrawCanvas(canvasRef, canvasCtx, isDarkModeGlobal);
    if (historyCallbacks) {
      historyCallbacks.onHistoryChange(elements, 0);
    }
    if (socketRef && roomIdRef) {
      console.log("Sending clearCanvas message to room:", roomIdRef);
      socketRef.send(
        JSON.stringify({
          type: "clearCanvas",
          roomId: roomIdRef,
        })
      );
    } else {
      console.log("Socket or roomId not available:", { socketRef: !!socketRef, roomIdRef });
    }
  }
}

function saveHistory() {
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  history.push(JSON.parse(JSON.stringify(elements)));
  historyIndex = history.length - 1;
}

function getStrokeColor(): string {
  return isDarkModeGlobal ? "#ffffff" : "#000000";
}

function findElementAtPosition(x: number, y: number): DrawingElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i];
    if (isPointInElement(x, y, element)) {
      return element;
    }
  }
  return null;
}

function isPointInElement(x: number, y: number, element: DrawingElement): boolean {
  switch (element.type) {
    case "rectangle":
      if (element.width && element.height) {
        return x >= element.x && x <= element.x + element.width &&
               y >= element.y && y <= element.y + element.height;
      }
      break;
    case "circle":
      if (element.radius) {
        const distance = Math.sqrt(Math.pow(x - element.x, 2) + Math.pow(y - element.y, 2));
        return distance <= element.radius;
      }
      break;
    case "diamond":
      if (element.width && element.height) {
        return x >= element.x && x <= element.x + element.width &&
               y >= element.y && y <= element.y + element.height;
      }
      break;
    case "line":
    case "arrow":
      if (element.endX !== undefined && element.endY !== undefined) {
        const distance = distanceFromPointToLine(x, y, element.x, element.y, element.endX, element.endY);
        return distance <= 5;
      }
      break;
    case "pencil":
      if (element.points) {
        for (const point of element.points) {
          const distance = Math.sqrt(Math.pow(x - point.x, 2) + Math.pow(y - point.y, 2));
          if (distance <= 5) return true;
        }
      }
      break;
    case "text":
      return x >= element.x && x <= element.x + 100 &&
             y >= element.y - 20 && y <= element.y;
      break;
  }
  return false;
}

function distanceFromPointToLine(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
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

function drawSelectionBox(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  ctx.strokeStyle = "#007bff";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  
  let x = element.x;
  let y = element.y;
  let width = 0;
  let height = 0;
  
  switch (element.type) {
    case "rectangle":
    case "diamond":
      width = element.width || 0;
      height = element.height || 0;
      break;
    case "circle":
      if (element.radius) {
        x = element.x - element.radius;
        y = element.y - element.radius;
        width = element.radius * 2;
        height = element.radius * 2;
      }
      break;
    case "line":
    case "arrow":
      if (element.endX !== undefined && element.endY !== undefined) {
        x = Math.min(element.x, element.endX);
        y = Math.min(element.y, element.endY);
        width = Math.abs(element.endX - element.x);
        height = Math.abs(element.endY - element.y);
      }
      break;
    case "text":
      width = 100;
      height = 20;
      break;
    case "pencil":
      if (element.points && element.points.length > 0) {
        const xs = element.points.map(p => p.x);
        const ys = element.points.map(p => p.y);
        x = Math.min(...xs);
        y = Math.min(...ys);
        width = Math.max(...xs) - x;
        height = Math.max(...ys) - y;
      }
      break;
  }
  
  ctx.strokeRect(x - 5, y - 5, width + 10, height + 10);
  
  const handleSize = 8;
  ctx.fillStyle = "#007bff";
  ctx.fillRect(x - 5 - handleSize / 2, y - 5 - handleSize / 2, handleSize, handleSize);
  ctx.fillRect(x + width + 5 - handleSize / 2, y - 5 - handleSize / 2, handleSize, handleSize);
  ctx.fillRect(x - 5 - handleSize / 2, y + height + 5 - handleSize / 2, handleSize, handleSize);
  ctx.fillRect(x + width + 5 - handleSize / 2, y + height + 5 - handleSize / 2, handleSize, handleSize);
  
  ctx.setLineDash([]);
}

function getResizeHandle(x: number, y: number, element: DrawingElement): string | null {
  let boundsX = element.x;
  let boundsY = element.y;
  let boundsWidth = 0;
  let boundsHeight = 0;

  switch (element.type) {
    case "rectangle":
    case "diamond":
      boundsWidth = element.width || 0;
      boundsHeight = element.height || 0;
      break;
    case "circle":
      if (element.radius) {
        boundsX = element.x - element.radius;
        boundsY = element.y - element.radius;
        boundsWidth = element.radius * 2;
        boundsHeight = element.radius * 2;
      }
      break;
    case "line":
    case "arrow":
      if (element.endX !== undefined && element.endY !== undefined) {
        boundsX = Math.min(element.x, element.endX);
        boundsY = Math.min(element.y, element.endY);
        boundsWidth = Math.abs(element.endX - element.x);
        boundsHeight = Math.abs(element.endY - element.y);
      }
      break;
    case "text":
      boundsWidth = 100;
      boundsHeight = 20;
      break;
    case "pencil":
      if (element.points && element.points.length > 0) {
        const xs = element.points.map(p => p.x);
        const ys = element.points.map(p => p.y);
        boundsX = Math.min(...xs);
        boundsY = Math.min(...ys);
        boundsWidth = Math.max(...xs) - boundsX;
        boundsHeight = Math.max(...ys) - boundsY;
      }
      break;
  }

  const handleSize = 8;
  const tolerance = 5;

  if (Math.abs(x - (boundsX - 5)) < handleSize + tolerance && Math.abs(y - (boundsY - 5)) < handleSize + tolerance) {
    return "top-left";
  }
  if (Math.abs(x - (boundsX + boundsWidth + 5)) < handleSize + tolerance && Math.abs(y - (boundsY - 5)) < handleSize + tolerance) {
    return "top-right";
  }
  if (Math.abs(x - (boundsX - 5)) < handleSize + tolerance && Math.abs(y - (boundsY + boundsHeight + 5)) < handleSize + tolerance) {
    return "bottom-left";
  }
  if (Math.abs(x - (boundsX + boundsWidth + 5)) < handleSize + tolerance && Math.abs(y - (boundsY + boundsHeight + 5)) < handleSize + tolerance) {
    return "bottom-right";
  }

  return null;
}

function resizeElement(element: DrawingElement, handle: string, newX: number, newY: number, startX: number, startY: number) {
  const dx = newX - startX;
  const dy = newY - startY;

  switch (element.type) {
    case "rectangle":
    case "diamond":
      if (handle === "top-left") {
        const newWidth = (element.width || 0) - dx;
        const newHeight = (element.height || 0) - dy;
        if (Math.abs(newWidth) > 5 && Math.abs(newHeight) > 5) {
          element.x += dx;
          element.y += dy;
          element.width = newWidth;
          element.height = newHeight;
        }
      } else if (handle === "top-right") {
        const newWidth = (element.width || 0) + dx;
        const newHeight = (element.height || 0) - dy;
        if (Math.abs(newWidth) > 5 && Math.abs(newHeight) > 5) {
          element.y += dy;
          element.width = newWidth;
          element.height = newHeight;
        }
      } else if (handle === "bottom-left") {
        const newWidth = (element.width || 0) - dx;
        const newHeight = (element.height || 0) + dy;
        if (Math.abs(newWidth) > 5 && Math.abs(newHeight) > 5) {
          element.x += dx;
          element.width = newWidth;
          element.height = newHeight;
        }
      } else if (handle === "bottom-right") {
        const newWidth = (element.width || 0) + dx;
        const newHeight = (element.height || 0) + dy;
        if (Math.abs(newWidth) > 5 && Math.abs(newHeight) > 5) {
          element.width = newWidth;
          element.height = newHeight;
        }
      }
      break;
    case "circle":
      if (element.radius) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        const direction = (handle === "top-left" || handle === "bottom-left") ? -1 : 1;
        element.radius = Math.max(5, (element.radius || 0) + direction * distance / 2);
      }
      break;
    case "line":
    case "arrow":
      if (handle === "top-left") {
        element.x += dx;
        element.y += dy;
      } else if (handle === "bottom-right") {
        element.endX = (element.endX || element.x) + dx;
        element.endY = (element.endY || element.y) + dy;
      }
      break;
  }
}

function moveElement(element: DrawingElement, dx: number, dy: number) {
  element.x += dx;
  element.y += dy;

  switch (element.type) {
    case "line":
    case "arrow":
      if (element.endX !== undefined) element.endX += dx;
      if (element.endY !== undefined) element.endY += dy;
      break;
    case "pencil":
      if (element.points) {
        element.points = element.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      }
      break;
  }
}

export async function initDraw(
  canvas: HTMLCanvasElement,
  roomId: string,
  socket: WebSocket,
  tool: Tool,
  callbacks: {
    onHistoryChange: (history: DrawingElement[], step: number) => void;
  },
  isDarkMode: boolean = false
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvasRef = canvas;
  canvasCtx = ctx;
  historyCallbacks = callbacks;
  currentTool = tool;
  isDarkModeGlobal = isDarkMode;
  socketRef = socket;
  roomIdRef = roomId;
  elements = await getExistingElements(roomId);
  history = [JSON.parse(JSON.stringify(elements))];
  historyIndex = 0;
  redrawCanvas(canvas, ctx, isDarkMode);

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "drawing") {
      const element = JSON.parse(message.message);
      elements.push(element);
      redrawCanvas(canvas, ctx, isDarkMode);
      if (selectedElement && selectedElementIndex !== -1) {
        drawSelectionBox(ctx, elements[selectedElementIndex]);
      }
      callbacks.onHistoryChange(elements, historyIndex);
    } else if (message.type === "elementRemoved") {
      const elementIndex = elements.findIndex(el => el.id === message.elementId);
      if (elementIndex > -1) {
        if (selectedElementIndex === elementIndex) {
          selectedElement = null;
          selectedElementIndex = -1;
        } else if (selectedElementIndex > elementIndex) {
          selectedElementIndex--;
        }
        elements.splice(elementIndex, 1);
        redrawCanvas(canvas, ctx, isDarkMode);
        if (selectedElement && selectedElementIndex !== -1) {
          drawSelectionBox(ctx, elements[selectedElementIndex]);
        }
        callbacks.onHistoryChange(elements, historyIndex);
      }
    } else if (message.type === "elementUpdated") {
      const elementIndex = elements.findIndex(el => el.id === message.element.id);
      if (elementIndex > -1) {
        elements[elementIndex] = message.element;
        if (selectedElementIndex === elementIndex) {
          selectedElement = elements[elementIndex];
        }
        redrawCanvas(canvas, ctx, isDarkMode);
        if (selectedElement && selectedElementIndex !== -1) {
          drawSelectionBox(ctx, elements[selectedElementIndex]);
        }
        callbacks.onHistoryChange(elements, historyIndex);
      }
    } else if (message.type === "clearCanvas") {
      console.log("Received clearCanvas message");
      elements = [];
      history = [[]];
      historyIndex = 0;
      selectedElement = null;
      selectedElementIndex = -1;
      redrawCanvas(canvas, ctx, isDarkMode);
      callbacks.onHistoryChange(elements, 0);
    } else if (message.type === "undo") {
      console.log("Received undo message");
      elements = message.elements;
      history = history.slice(0, historyIndex + 1);
      history.push(JSON.parse(JSON.stringify(elements)));
      historyIndex = history.length - 1;
      selectedElement = null;
      selectedElementIndex = -1;
      redrawCanvas(canvas, ctx, isDarkMode);
      callbacks.onHistoryChange(elements, historyIndex);
    } else if (message.type === "redo") {
      console.log("Received redo message");
      elements = message.elements;
      history = history.slice(0, historyIndex + 1);
      history.push(JSON.parse(JSON.stringify(elements)));
      historyIndex = history.length - 1;
      selectedElement = null;
      selectedElementIndex = -1;
      redrawCanvas(canvas, ctx, isDarkMode);
      callbacks.onHistoryChange(elements, historyIndex);
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (currentTool === "select") {
      let clickedOnSelected = false;
      
      if (selectedElement && selectedElementIndex !== -1) {
        const handle = getResizeHandle(startX, startY, selectedElement);
        if (handle) {
          isResizing = true;
          resizeHandle = handle;
          dragStartX = startX;
          dragStartY = startY;
          return;
        }
        
        if (isPointInElement(startX, startY, selectedElement)) {
          if (selectedElement.type === "text") {
            const newText = prompt("Edit text:", selectedElement.text || "");
            if (newText !== null) {
              elements[selectedElementIndex].text = newText;
              redrawCanvas(canvas, ctx, isDarkModeGlobal);
              drawSelectionBox(ctx, elements[selectedElementIndex]);
              
              socket.send(
                JSON.stringify({
                  type: "elementUpdated",
                  element: elements[selectedElementIndex],
                  roomId,
                })
              );
              callbacks.onHistoryChange(elements, elements.length - 1);
            }
            return;
          }
          
          isDragging = true;
          dragOffsetX = startX - selectedElement.x;
          dragOffsetY = startY - selectedElement.y;
          clickedOnSelected = true;
          return;
        }
      }
      
      if (!clickedOnSelected) {
        selectedElement = null;
        selectedElementIndex = -1;
        
        for (let i = elements.length - 1; i >= 0; i--) {
          if (isPointInElement(startX, startY, elements[i])) {
            selectedElement = elements[i];
            selectedElementIndex = i;
            break;
          }
        }
      }
      
      redrawCanvas(canvas, ctx, isDarkModeGlobal);
      if (selectedElement) {
        drawSelectionBox(ctx, selectedElement);
      }
      return;
    }

    if (currentTool === "eraser") {
      isErasing = true;
      const elementToRemove = findElementAtPosition(startX, startY);
      if (elementToRemove) {
        const index = elements.indexOf(elementToRemove);
        if (index > -1) {
          if (selectedElementIndex === index) {
            selectedElement = null;
            selectedElementIndex = -1;
          } else if (selectedElementIndex > index) {
            selectedElementIndex--;
          }
          
          const elementId = elementToRemove.id;
          elements.splice(index, 1);
          saveHistory();
          redrawCanvas(canvas, ctx, isDarkModeGlobal);
          
          socket.send(
            JSON.stringify({
              type: "elementRemoved",
              elementId: elementId,
              roomId,
            })
          );

          callbacks.onHistoryChange(elements, historyIndex);
        }
      }
      return;
    }

    if (currentTool === "text") {
      const text = prompt("Enter text:");
      if (text) {
        const textElement: DrawingElement = {
          type: "text",
          id: Math.random().toString(36).substr(2, 9),
          x: startX,
          y: startY,
          text: text,
          strokeColor: getStrokeColor(),
          strokeWidth: 2,
        };
        elements.push(textElement);
        saveHistory();
        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        
        socket.send(
          JSON.stringify({
            type: "drawing",
            message: JSON.stringify(textElement),
            roomId,
          })
        );

        callbacks.onHistoryChange(elements, historyIndex);
      }
      return;
    }

    isDrawing = true;
    const id = Math.random().toString(36).substr(2, 9);

    switch (currentTool) {
      case "pencil":
        currentElement = {
          type: "pencil",
          id,
          x: startX,
          y: startY,
          points: [{ x: startX, y: startY }],
          strokeColor: getStrokeColor(),
          strokeWidth: 2,
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
          strokeColor: getStrokeColor(),
          strokeWidth: 2,
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
          strokeColor: getStrokeColor(),
          strokeWidth: 2,
        };
        break;
      case "circle":
        currentElement = {
          type: "circle",
          id,
          x: startX,
          y: startY,
          radius: 0,
          strokeColor: getStrokeColor(),
          strokeWidth: 2,
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
          strokeColor: getStrokeColor(),
          strokeWidth: 2,
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
          strokeColor: getStrokeColor(),
          strokeWidth: 2,
        };
        break;
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    if (currentTool === "eraser" && isErasing) {
      const elementToRemove = findElementAtPosition(currentX, currentY);
      if (elementToRemove) {
        const index = elements.indexOf(elementToRemove);
        if (index > -1) {
          if (selectedElementIndex === index) {
            selectedElement = null;
            selectedElementIndex = -1;
          } else if (selectedElementIndex > index) {
            selectedElementIndex--;
          }
          
          const elementId = elementToRemove.id;
          elements.splice(index, 1);
          redrawCanvas(canvas, ctx, isDarkModeGlobal);
          
          socket.send(
            JSON.stringify({
              type: "elementRemoved",
              elementId: elementId,
              roomId,
            })
          );

          callbacks.onHistoryChange(elements, elements.length - 1);
        }
      }
      return;
    }

    if (currentTool === "select") {
      if (isResizing && selectedElement && resizeHandle && selectedElementIndex !== -1) {
        resizeElement(elements[selectedElementIndex], resizeHandle, currentX, currentY, dragStartX, dragStartY);
        dragStartX = currentX;
        dragStartY = currentY;
        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        drawSelectionBox(ctx, elements[selectedElementIndex]);
        return;
      }

      if (isDragging && selectedElement && selectedElementIndex !== -1) {
        const newX = currentX - dragOffsetX;
        const newY = currentY - dragOffsetY;
        const dx = newX - elements[selectedElementIndex].x;
        const dy = newY - elements[selectedElementIndex].y;
        moveElement(elements[selectedElementIndex], dx, dy);
        redrawCanvas(canvas, ctx, isDarkModeGlobal);
        drawSelectionBox(ctx, elements[selectedElementIndex]);
        return;
      }
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
        const radius = Math.sqrt(
          Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2)
        );
        currentElement.radius = radius;
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
      if ((isDragging || isResizing) && selectedElement && selectedElementIndex !== -1) {
        saveHistory();
        socket.send(
          JSON.stringify({
            type: "elementUpdated",
            element: elements[selectedElementIndex],
            roomId,
          })
        );
        
        callbacks.onHistoryChange(elements, historyIndex);
      }
      isDragging = false;
      isResizing = false;
      resizeHandle = null;
      return;
    }

    if (!isDrawing || !currentElement) return;

    isDrawing = false;
    elements.push(currentElement);
    saveHistory();

    redrawCanvas(canvas, ctx, isDarkModeGlobal);

    socket.send(
      JSON.stringify({
        type: "drawing",
        message: JSON.stringify(currentElement),
        roomId,
      })
    );

    currentElement = null;
    callbacks.onHistoryChange(elements, historyIndex);
  };

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseout", handleMouseUp);

  return () => {
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mousemove", handleMouseMove);
    canvas.removeEventListener("mouseup", handleMouseUp);
    canvas.removeEventListener("mouseout", handleMouseUp);
  };
}

function drawElement(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  const strokeColor =
    element.strokeColor === "#000000" && isDarkModeGlobal
      ? "#ffffff"
      : element.strokeColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = element.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (element.type) {
    case "rectangle":
      if (element.width && element.height) {
        ctx.strokeRect(element.x, element.y, element.width, element.height);
      }
      break;
    case "circle":
      if (element.radius && element.radius > 0) {
        ctx.beginPath();
        ctx.arc(element.x, element.y, element.radius, 0, 2 * Math.PI);
        ctx.stroke();
      }
      break;
    case "diamond":
      if (element.width && element.height) {
        const centerX = element.x + element.width / 2;
        const centerY = element.y + element.height / 2;

        ctx.beginPath();
        ctx.moveTo(centerX, element.y);
        ctx.lineTo(element.x + element.width, centerY);
        ctx.lineTo(centerX, element.y + element.height);
        ctx.lineTo(element.x, centerY);
        ctx.closePath();
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
        const headLength = 20;
        const angle = Math.atan2(
          element.endY - element.y,
          element.endX - element.x
        );

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
      if (element.text) {
        ctx.font = "16px Arial";
        ctx.fillStyle = strokeColor;
        ctx.fillText(element.text, element.x, element.y);
      }
      break;
  }
}

function redrawCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  isDarkMode: boolean = false
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = isDarkMode ? "#1f2937" : "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  elements.forEach((element) => drawElement(ctx, element));
}

function redrawCanvasWithPreview(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  previewElement: DrawingElement,
  isDarkMode: boolean = false
) {
  redrawCanvas(canvas, ctx, isDarkMode);
  drawElement(ctx, previewElement);
}

async function getExistingElements(roomId: string): Promise<DrawingElement[]> {
  try {
    const res = await axios.get(`${HTTP_BACKEND}/drawings/${roomId}`);
    const drawings = res.data.drawings || [];
    console.log(`Loaded ${drawings.length} existing drawings for room ${roomId}`);
    return drawings;
  } catch (error) {
    console.error("Failed to load existing elements:", error);
    return [];
  }
}

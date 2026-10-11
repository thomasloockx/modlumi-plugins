// An example plugin: a tool that moves one vertex at a time.
//
// Click a vertex to pick it up, move the pointer and click again to place it. The pointer snaps
// like the built-in tools: endpoints, midpoints and faces, and the arrow keys lock the red,
// green or blue axis. Type a distance and press Enter to move the vertex that far toward the
// pointer. Escape puts it back. Faces the move bends fold, as with the Move tool. The tool's
// Step option rounds the distance to a multiple of a length.

const model = modlumi.activeModel;
/** @type {modlumi.Color} */
const kAccent = { r: 1, g: 0.58, b: 0.03, a: 1 };
/** @type {modlumi.Color} */
const kNeighbor = { r: 0.25, g: 0.25, b: 0.25, a: 1 };

/** @type {modlumi.Vertex | null} The vertex being moved. */
let held = null;
/** @type {modlumi.Vertex | null} The vertex under the pointer while nothing is held. */
let hovered = null;
/** @type {modlumi.Point3d | null} The point under the pointer while a vertex is held. */
let pointer = null;
/** Rounds the distance moved to a multiple of this many meters; 0 doesn't round. */
let step = 0;

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  /** Puts the tool back in its first step. */
  function reset() {
    held = null;
    hovered = null;
    pointer = null;
    tool.reference = null;
    tool.status = "Click a vertex to move it.";
    tool.measurement = { label: "Distance", value: "" };
  }

  /**
   * Moves the held vertex to point in one undo step, and reports a move the model refuses.
   * @param {modlumi.Point3d} point
   */
  function place(point) {
    const vertex = held;
    if (vertex === null || !vertex.isValid) {
      reset();
      return;
    }
    try {
      model.operation("Move Vertex", () => {
        vertex.position = point;
      });
    } catch (error) {
      context.showMessage(`Can't move the vertex there: ${error instanceof Error ? error.message : error}`);
    }
    reset();
  }

  /**
   * Returns where the held vertex would go: toward the pointer, by a multiple of the step.
   * @returns {modlumi.Point3d | null}
   */
  function target() {
    if (held === null || pointer === null || step <= 0) {
      return pointer;
    }
    const direction = held.position.vectorTo(pointer);
    if (direction.length === 0) {
      return pointer;
    }
    return held.position.offset(direction.normalize().scale(Math.round(direction.length / step) * step));
  }

  /**
   * Tracks the vertex under the pointer, or the point under it while a vertex is held.
   * @param {modlumi.ToolEvent} event
   */
  function follow(event) {
    if (held === null) {
      // Only vertices of the context being edited can move.
      const vertex = event.point?.vertex ?? null;
      hovered = vertex !== null && model.activeEntities.vertices.includes(vertex) ? vertex : null;
      return;
    }
    pointer = event.point?.position ?? pointer;
  }

  const tool = context.registerTool({
    id: "move-vertex",
    title: "Move Vertex",
    tip: "Moves one vertex, with inference, axis locks and typed distances.",
    icon: "icons/vertex.svg",
    toolbar: true,
    shortcut: "Ctrl+Alt+V",
    activate: reset,
    deactivate: reset,
    onMouseMove: follow,
    onMouseUp(event) {
      // A click needn't follow a move, such as right after choosing the tool with its shortcut.
      follow(event);
      if (held === null) {
        if (hovered !== null) {
          held = hovered;
          hovered = null;
          pointer = held.position;
          tool.reference = held.position;
          tool.status = "Click where the vertex goes, or type a distance.";
        }
        return;
      }
      const point = target();
      if (point !== null) {
        place(point);
      }
    },
    onValue(text) {
      const distance = model.parseLength(text);
      if (held === null || pointer === null || distance === null) {
        context.showMessage(`Can't move by "${text}"`);
        return;
      }
      const direction = held.position.vectorTo(pointer);
      if (direction.length === 0) {
        context.showMessage("Move the pointer to show the direction first.");
        return;
      }
      place(held.position.offset(direction.normalize().scale(distance)));
    },
    onCancel: reset,
    options(ui) {
      step = ui.length("Step", step, { min: 0, tip: "Rounds the distance to a multiple of this length; 0 doesn't round." });
    },
    draw(view) {
      if (held === null) {
        if (hovered !== null) {
          view.points([hovered.position], { color: kAccent, width: 10 });
        }
        return;
      }
      const point = target();
      if (point === null) {
        return;
      }
      tool.measurement = { label: "Distance", value: model.formatLength(held.position.distance(point)) };
      // The edges at the vertex, as they would run after the move.
      for (const edge of held.edges) {
        const other = edge.start === held ? edge.end : edge.start;
        view.lines([other.position, point], { color: kNeighbor, stipple: "dashed" });
      }
      view.lines([held.position, point], { color: kAccent, width: 2 });
      view.points([point], { color: kAccent, width: 10 });
    },
  });
}

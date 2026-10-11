// Levels: the floors of a building, each a name and an elevation, kept in the model so they
// travel with it and come back with Undo. A panel edits them. In elevations and sections,
// where the camera looks sideways, each level draws as a dashed line across the view with its
// name and height, and the Select tool picks a line so Delete removes its level. The cursor
// snaps to level heights in every tool that snaps, with the level's name in the tooltip.

/** @typedef {{ id: string, name: string, elevation: number }} Level */

const model = modlumi.activeModel;
// The height of a new level above the highest one.
const kStoreyHeight = 3;
const kLineColor = { r: 0.15, g: 0.42, b: 0.82, a: 0.95 };
// Level lines show while the view direction is within this of horizontal, about 30°.
const kSidewaysSine = 0.5;
// How far from the viewport's left edge a level's label sits, in pixels.
const kLabelInset = 12;

/**
 * Formats an elevation with its sign, such as "+3.00 m" or "-0.50 m".
 * @param {number} elevation
 */
function formatElevation(elevation) {
  return `${elevation < 0 ? "-" : "+"}${model.formatLength(Math.abs(elevation))}`;
}

/**
 * Reads the levels kept in the model, lowest first; anything malformed is left out.
 * @param {unknown} data
 * @returns {Level[]}
 */
function readLevels(data) {
  const stored = /** @type {{ levels?: unknown }} */ (data ?? {}).levels;
  if (!Array.isArray(stored)) {
    return [];
  }
  return stored
    .filter((level) => typeof level?.id === "string" && typeof level.name === "string" &&
      Number.isFinite(level.elevation))
    .map((level) => ({ id: level.id, name: level.name, elevation: level.elevation }))
    .sort((a, b) => a.elevation - b.elevation);
}

/**
 * Returns the horizontal direction across the view, or null when the camera looks too far up
 * or down for levels to show as lines.
 * @param {modlumi.Camera} camera
 */
function getAcross(camera) {
  const forward = camera.eye.vectorTo(camera.target).normalize();
  if (Math.abs(forward.z) > kSidewaysSine) {
    return null;
  }
  return new modlumi.Vector3d(forward.y, -forward.x, 0).normalize();
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  /** @type {Level[]} */
  let levels = readLevels(context.documentData.get());
  let showLines = Boolean(context.settings.get("showLines", true));
  let snapToLevels = Boolean(context.settings.get("snap", true));

  // Undo, redo and other documents change the levels too.
  const reread = () => {
    levels = readLevels(context.documentData.get());
  };
  context.onModelChanged(reread);
  context.onDocumentOpened(reread);

  /**
   * Stores levels in the model in one undo step.
   * @param {string} name
   * @param {Level[]} next
   */
  function save(name, next) {
    model.operation(name, () => context.documentData.set({ levels: next }));
    reread();
  }

  /**
   * Returns the ends of a level's line across the view, through the camera's target at the
   * level's height, long enough to cross the whole view, or null when the view isn't sideways.
   * @param {Level} level
   */
  function getLine(level) {
    const camera = context.viewport.camera;
    const across = getAcross(camera);
    if (across === null) {
      return null;
    }
    const reach = Math.max(100, 20 * camera.eye.distance(camera.target));
    const middle = new modlumi.Point3d(camera.target.x, camera.target.y, level.elevation);
    return /** @type {[modlumi.Point3d, modlumi.Point3d]} */ ([
      middle.offset(across.scale(-reach)), middle.offset(across.scale(reach)),
    ]);
  }

  // Level lines are annotations, so they draw over the model, across the whole viewport.
  context.addOverlay((view) => {
    if (!showLines) {
      return;
    }
    const { width, height } = context.viewport;
    for (const level of levels) {
      const line = getLine(level);
      if (line === null) {
        return;
      }
      const [start, end] = line.map((point) => context.viewport.project(point));
      if (start === null || end === null || start[0] === end[0]) {
        continue;
      }
      /** @param {number} x */
      const at = (x) => start[1] + ((x - start[0]) / (end[0] - start[0])) * (end[1] - start[1]);
      if (Math.max(at(0), at(width)) < 0 || Math.min(at(0), at(width)) > height) {
        continue;
      }
      view.lines([[0, at(0)], [width, at(width)]], { screen: true, color: kLineColor, width: 1.5, stipple: "dashed" });
      view.text([kLabelInset, at(kLabelInset) - 18], `${level.name}  ${formatElevation(level.elevation)}`,
        { screen: true, color: kLineColor });
    }
  });

  context.addSnapProvider(() => {
    if (!snapToLevels) {
      return [];
    }
    return levels.map((level) => ({
      plane: { point: [0, 0, level.elevation], normal: [0, 0, 1] },
      label: `${level.name} (${formatElevation(level.elevation)})`,
    }));
  });

  context.addPickableItems({
    items() {
      if (!showLines) {
        return [];
      }
      return levels.flatMap((level) => {
        const line = getLine(level);
        return line === null ? [] : [{ id: level.id, lines: [line] }];
      });
    },
    // Runs inside the Delete operation, so the levels come back with Undo.
    onDelete(ids) {
      context.documentData.set({ levels: levels.filter((level) => !ids.includes(level.id)) });
    },
  });

  /** Adds a level a storey above the highest one, or at the ground for the first, and returns its id. */
  function addLevel() {
    const top = levels.at(-1);
    const used = new Set(levels.map((level) => level.id));
    let number = levels.length + 1;
    while (used.has(`level-${number}`)) {
      number += 1;
    }
    const id = `level-${number}`;
    save("Add Level", [...levels, {
      id,
      name: top === undefined ? "Ground Floor" : `Level ${levels.length}`,
      elevation: top === undefined ? 0 : top.elevation + kStoreyHeight,
    }]);
    return id;
  }

  /** Glides to a front elevation that fits the model and its levels, in a parallel projection. */
  function lookFromTheFront() {
    const bounds = model.entities.bounds;
    const top = Math.max(bounds?.max.z ?? 0, levels.at(-1)?.elevation ?? 0);
    const bottom = Math.min(bounds?.min.z ?? 0, levels[0]?.elevation ?? 0);
    const center = new modlumi.Point3d(bounds?.center.x ?? 0, bounds?.center.y ?? 0, (top + bottom) / 2);
    // A parallel view shows as much as a perspective one does at the camera's distance.
    const fieldOfView = 45;
    const aspect = context.viewport.width / Math.max(1, context.viewport.height);
    // Room around the model, and for panels docked over the viewport's sides.
    const half = 0.9 * Math.max(top - bottom, (bounds?.width ?? 0) / aspect, 1);
    const distance = half / Math.tan((fieldOfView * Math.PI) / 360) + (bounds?.depth ?? 0);
    const front = new modlumi.Camera(center.offset([0, -distance, 0]), center, { perspective: false, fieldOfView });
    context.viewport.setCamera(front, { duration: 0.6 });
  }

  // The level the panel edits, which follows the level lines the user selects.
  /** @type {string | null} */
  let chosen = null;
  let lastSelected = "";

  const panel = context.addPanel({
    id: "levels",
    title: "Levels",
    draw(ui) {
      const selected = context.selectedItems;
      if (selected.join("\n") !== lastSelected) {
        lastSelected = selected.join("\n");
        chosen = selected.at(-1) ?? chosen;
      }
      if (levels.length === 0) {
        ui.text("No levels yet. Add the ground floor to start.", { tone: "muted" });
      } else {
        // Highest first, as on a section drawing.
        const rows = [...levels].reverse().map((level) => ({
          id: level.id, cells: [level.name, formatElevation(level.elevation)],
        }));
        chosen = ui.table("Levels", ["Name", { title: "Elevation", numeric: true }], rows, chosen,
          { visibleRows: 6 });
      }
      const level = levels.find((candidate) => candidate.id === chosen);
      if (level !== undefined) {
        const name = ui.textField("Name", level.name, { id: "name" });
        const elevation = ui.length("Elevation", level.elevation, { id: "elevation" });
        if (name !== level.name || elevation !== level.elevation) {
          save("Change Level", levels.map((other) => (other.id === level.id ? { ...other, name, elevation } : other)));
        }
      }
      ui.row(() => {
        if (ui.button("Add Level", { primary: true })) {
          chosen = addLevel();
        }
        if (ui.button("Remove", { disabled: level === undefined, tip: "Removes the chosen level" })) {
          save("Remove Level", levels.filter((other) => other.id !== chosen));
          chosen = null;
        }
        if (ui.button("Front Elevation", { tip: "Glides to a parallel view of the model from the front" })) {
          lookFromTheFront();
        }
      }, { id: "actions" });
      ui.separator("Display");
      const show = ui.checkbox("Show level lines", showLines,
        { tip: "Dashed lines across elevations and sections, which the Select tool picks" });
      if (show !== showLines) {
        showLines = show;
        context.settings.set("showLines", show);
      }
      const snap = ui.checkbox("Snap to levels", snapToLevels, { tip: "Points snap to level heights, seen from the side" });
      if (snap !== snapToLevels) {
        snapToLevels = snap;
        context.settings.set("snap", snap);
      }
      if (getAcross(context.viewport.camera) === null) {
        ui.text("Level lines show in front, back and side views.", { tone: "muted" });
      }
    },
  });

  context.registerCommand({
    id: "open",
    title: "Levels",
    tip: "Opens the building levels.",
    run: () => panel.show(),
  });
}

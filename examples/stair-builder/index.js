// An example plugin: a panel of stair parameters and a button that builds the stair, which
// stays editable from Properties.
//
// A draw runs every frame. Each widget takes a value from the parameters and returns it,
// changed when the user edited it, so the window always shows the plugin's state. The draw
// that reports a change may edit the model: the panel builds on Build, and the Properties
// section rebuilds the selected stair as soon as one of its parameters changes.

/**
 * @typedef {"Solid" | "Open treads"} Style
 * @typedef {{
 *   totalRise: number, steps: number, run: number, width: number, turn: number,
 *   style: Style, nosing: number, posts: boolean,
 * }} Stair
 */

const model = modlumi.activeModel;
// Comfortable risers are up to about 18 cm.
const kMaxComfortableRiser = 0.18;
/** @type {Style[]} */
const kStyles = ["Solid", "Open treads"];

/** The parameters of the next stair the panel builds. @type {Stair} */
const next = {
  totalRise: 2.7,
  steps: 15,
  run: 0.28,
  width: 1,
  turn: 0,
  style: "Solid",
  nosing: 10,
  posts: false,
};

/**
 * Draws the stair parameters and returns them, changed where the user edited them.
 * @param {modlumi.Ui} ui
 * @param {Stair} stair
 * @returns {Stair}
 */
function drawParameters(ui, stair) {
  const result = { ...stair };
  result.totalRise = ui.length("Total rise", stair.totalRise, { min: 0.1 });
  result.steps = ui.integer("Steps", stair.steps, { min: 1, max: 100 });
  result.run = ui.length("Tread depth", stair.run, { min: 0.1 });
  result.width = ui.length("Width", stair.width, { min: 0.3 });
  result.turn = ui.angle("Turn", stair.turn, { tip: "Rotation about the vertical axis" });
  result.style = ui.dropdown("Style", stair.style, kStyles);
  ui.section("Details", () => {
    result.nosing = ui.slider("Nosing", stair.nosing, {
      min: 0,
      max: 30,
      decimals: 0,
      suffix: "%",
      disabled: result.style === "Solid",
      tip: "How far open treads overhang the tread below, as a share of the tread depth",
    });
    result.posts = ui.checkbox("Railing posts", stair.posts);
  });
  const rise = result.totalRise / result.steps;
  ui.readOnly("Riser height", model.formatLength(rise));
  ui.readOnly("Pitch", `${((Math.atan2(rise, result.run) * 180) / Math.PI).toFixed(1)}°`);
  if (rise > kMaxComfortableRiser) {
    ui.text("Risers this high are hard to climb; add steps.", { tone: "warning" });
  }
  return result;
}

/**
 * Draws the stair's steps and posts into entities, in the stair's own coordinates.
 * @param {modlumi.Entities} entities
 * @param {Stair} stair
 */
function drawStair(entities, stair) {
  const rise = stair.totalRise / stair.steps;
  if (stair.style === "Solid") {
    // The side profile, from the bottom of the first riser up the steps and back down.
    /** @type {modlumi.Point3dLike[]} */
    const profile = [[0, 0, 0]];
    for (let step = 0; step < stair.steps; ++step) {
      profile.push([step * stair.run, 0, (step + 1) * rise], [(step + 1) * stair.run, 0, (step + 1) * rise]);
    }
    profile.push([stair.steps * stair.run, 0, 0]);
    entities.addFace(profile).extrude(stair.width);
  } else {
    const nosing = (stair.run * stair.nosing) / 100;
    const thickness = Math.min(0.04, rise / 2);
    for (let step = 0; step < stair.steps; ++step) {
      entities.addBox([step * stair.run - nosing, 0, (step + 1) * rise - thickness], stair.run + nosing, stair.width,
        thickness);
    }
  }
  if (stair.posts) {
    for (let step = 0; step < stair.steps; ++step) {
      entities.addCylinder([(step + 0.5) * stair.run, 0.05, (step + 1) * rise], 0.02, 0.9);
    }
  }
}

/**
 * Rotates about the vertical axis through the group's own origin.
 * @param {modlumi.Group} group
 * @param {number} angle
 */
function turn(group, angle) {
  const origin = group.transformation.multiply(new modlumi.Point3d(0, 0, 0));
  group.transform(modlumi.Transformation.rotation(origin, [0, 0, 1], angle));
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  /** Builds a stair as a new group at the origin that keeps its parameters. One undo step. */
  function build() {
    model.operation("Build Stairs", () => {
      const group = model.entities.addGroup();
      group.name = "Stairs";
      drawStair(group.entities, next);
      turn(group, next.turn);
      context.entityData.set(group, next);
    });
  }

  /**
   * Replaces the stair in group with one built from new parameters. One undo step.
   * @param {modlumi.Group} group
   * @param {Stair} old
   * @param {Stair} stair
   */
  function rebuild(group, old, stair) {
    model.operation("Change Stairs", () => {
      // Copies of the stair share its entities until one of them changes.
      group.makeUnique();
      const entities = group.entities;
      for (const nested of entities.ofType("Group")) {
        entities.erase(nested);
      }
      entities.eraseEdges(entities.ofType("Edge"));
      drawStair(entities, stair);
      turn(group, stair.turn - old.turn);
      context.entityData.set(group, stair);
    });
  }

  const panel = context.addPanel({
    id: "stairs",
    title: "Stair Builder",
    draw(ui) {
      Object.assign(next, drawParameters(ui, next));
      ui.spacing();
      if (ui.button("Build", { primary: true })) {
        build();
        context.showMessage(`Built ${next.steps} steps`);
      }
    },
  });

  context.addPropertiesSection({
    id: "stair",
    title: "Stair",
    draw(ui, container) {
      /** @type {Stair | undefined} */
      const stair = context.entityData.get(container);
      if (stair === undefined || !(container instanceof modlumi.Group)) {
        return;
      }
      const changed = drawParameters(ui, stair);
      if (JSON.stringify(changed) !== JSON.stringify(stair)) {
        rebuild(container, stair, changed);
      }
    },
  });

  context.registerCommand({
    id: "open",
    title: "Stair Builder",
    tip: "Opens the stair parameters.",
    run: () => panel.show(),
  });
}

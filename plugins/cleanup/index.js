// Cleans up models, especially imported ones: purges unused components and materials, merges
// coplanar faces and identical materials, repairs split edges, erases stray edges and hidden
// geometry, and smooths edges by angle, all in one undo step.
//
// A port of CleanUp (https://github.com/thomthom/cleanup):
//
// Copyright (c) 2009 Thomas Thomassen
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software
// and associated documentation files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all copies or
// substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
// BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

/**
 * @typedef {"Whole model" | "Context being edited"} Scope
 * @typedef {{
 *   scope: Scope,
 *   purge: boolean,
 *   eraseHidden: boolean,
 *   mergeFaces: boolean,
 *   ignoreMaterials: boolean,
 *   mergeMaterials: boolean,
 *   repairEdges: boolean,
 *   strayEdges: boolean,
 *   smoothAngle: number,
 * }} Options
 * @typedef {Record<string, number>} Statistics
 */

const model = modlumi.activeModel;
/** @type {Scope[]} */
const kScopes = ["Whole model", "Context being edited"];

/** @type {Options} */
const kDefaults = {
  scope: "Whole model",
  purge: true,
  eraseHidden: false,
  mergeFaces: true,
  ignoreMaterials: false,
  mergeMaterials: false,
  repairEdges: true,
  strayEdges: true,
  smoothAngle: 0,
};

/** @type {Record<string, modlumi.FormField>} */
const kSchema = {
  scope: { type: "radio", label: "Scope", choices: kScopes },
  purge: { type: "checkbox", label: "Purge unused components and materials" },
  eraseHidden: { type: "checkbox", label: "Erase hidden geometry" },
  mergeFaces: { type: "checkbox", label: "Merge coplanar faces" },
  ignoreMaterials: {
    type: "checkbox",
    label: "Merge faces with different materials",
    tip: "Coplanar faces merge even when their materials differ",
  },
  mergeMaterials: {
    type: "checkbox",
    label: "Merge identical materials",
    tip: "Materials with the same color and image become one, across the whole model",
  },
  repairEdges: { type: "checkbox", label: "Repair split edges" },
  strayEdges: { type: "checkbox", label: "Erase stray edges", tip: "Edges that bound no face" },
  smoothAngle: {
    type: "angle",
    label: "Smooth edges below",
    min: 0,
    max: Math.PI / 2,
    tip: "Softens and smooths edges between faces that meet at less than this angle; 0 smooths none",
  },
};

/**
 * The drawing contexts in scope: the context being edited, or the model root and every
 * component definition.
 * @param {Scope} scope
 * @returns {modlumi.Entities[]}
 */
function getContexts(scope) {
  if (scope === "Context being edited") {
    return [model.activeEntities];
  }
  return [model.entities, ...model.definitions.map((definition) => definition.entities)];
}

/**
 * Erases hidden faces, containers and guides, then hidden or soft edges that no visible face
 * needs. Returns how many elements went.
 * @param {modlumi.Entities} entities
 */
function eraseHidden(entities) {
  let erased = 0;
  for (const element of entities.toArray()) {
    if (element.type !== "Edge" && element.isValid && element.hidden) {
      entities.erase(element);
      erased += 1;
    }
  }
  const edges = entities.ofType("Edge").filter((edge) =>
    (edge.hidden || edge.soft) && edge.faces.every((face) => face.hidden));
  return erased + eraseEdges(entities, edges);
}

/**
 * Erases edges, skipping curves of which only some edges were chosen, because erasing one
 * edge of a curve erases all of it. Returns how many edges went.
 * @param {modlumi.Entities} entities
 * @param {modlumi.Edge[]} edges
 */
function eraseEdges(entities, edges) {
  const chosen = new Set(edges);
  const erasable = edges.filter((edge) => edge.curve === null ||
    edge.curve.edges.every((member) => chosen.has(member)));
  if (erasable.length > 0) {
    entities.eraseEdges(erasable);
  }
  return erasable.length;
}

/**
 * Softens and smooths edges between two faces that meet at less than angle. Returns how many
 * edges changed.
 * @param {modlumi.Entities} entities
 * @param {number} angle
 */
function smoothEdges(entities, angle) {
  let smoothed = 0;
  for (const edge of entities.ofType("Edge")) {
    const [first, second, ...rest] = edge.faces;
    if (!first || !second || rest.length > 0 || !first.normal || !second.normal || (edge.soft && edge.smooth)) {
      continue;
    }
    if (first.normal.angleBetween(second.normal) <= angle) {
      edge.soft = true;
      edge.smooth = true;
      smoothed += 1;
    }
  }
  return smoothed;
}

/**
 * Whether two materials look the same: the same color and the same image at the same size.
 * @param {modlumi.Material} a
 * @param {modlumi.Material} b
 */
function isIdentical(a, b) {
  const [ca, cb] = [a.color, b.color];
  if (ca.r !== cb.r || ca.g !== cb.g || ca.b !== cb.b || ca.a !== cb.a) {
    return false;
  }
  const [ta, tb] = [a.texture, b.texture];
  if (ta === null || tb === null) {
    return ta === tb;
  }
  return ta.width === tb.width && ta.height === tb.height && ta.image.length === tb.image.length &&
    ta.image.every((byte, index) => byte === tb.image[index]);
}

/**
 * Makes faces, edges and containers in every context use one of each set of identical materials,
 * and removes the others. Returns how many materials went.
 */
function mergeMaterials() {
  /** @type {Map<modlumi.Material, modlumi.Material>} */
  const replacements = new Map();
  const materials = [...model.materials];
  for (let index = 0; index < materials.length; ++index) {
    const kept = materials[index];
    if (replacements.has(kept)) {
      continue;
    }
    for (const other of materials.slice(index + 1)) {
      if (!replacements.has(other) && isIdentical(kept, other)) {
        replacements.set(other, kept);
      }
    }
  }
  if (replacements.size === 0) {
    return 0;
  }
  /** @param {modlumi.Material | null} material */
  const replace = (material) => (material === null ? null : replacements.get(material) ?? material);
  for (const entities of getContexts("Whole model")) {
    for (const face of entities.ofType("Face")) {
      face.material = replace(face.material);
      face.backMaterial = replace(face.backMaterial);
    }
    for (const edge of entities.ofType("Edge")) {
      edge.material = replace(edge.material);
    }
    for (const container of [...entities.ofType("Group"), ...entities.ofType("ComponentInstance")]) {
      container.material = replace(container.material);
    }
  }
  for (const material of replacements.keys()) {
    model.removeMaterial(material);
  }
  return replacements.size;
}

/**
 * Adds amount to a statistic.
 * @param {Statistics} statistics
 * @param {string} name
 * @param {number} amount
 */
function count(statistics, name, amount) {
  statistics[name] = (statistics[name] ?? 0) + amount;
}

/**
 * Cleans up with the options as one undo step and returns what it did.
 * @param {Options} options
 * @returns {Statistics}
 */
function cleanUp(options) {
  /** @type {Statistics} */
  const statistics = {};
  model.operation("Clean Up", () => {
    const purge = () => {
      const purged = model.purgeUnused();
      count(statistics, "Components purged", purged.definitions);
      count(statistics, "Materials purged", purged.materials);
    };
    if (options.eraseHidden) {
      for (const entities of getContexts(options.scope)) {
        count(statistics, "Hidden elements erased", eraseHidden(entities));
      }
    }
    // Purging first leaves fewer contexts to clean; purging again removes what cleaning orphaned.
    if (options.purge) {
      purge();
    }
    if (options.mergeMaterials) {
      count(statistics, "Materials merged", mergeMaterials());
    }
    for (const entities of getContexts(options.scope)) {
      if (options.mergeFaces) {
        count(statistics, "Edges between coplanar faces erased",
          entities.mergeCoplanarFaces({ sameMaterials: !options.ignoreMaterials }));
      }
      if (options.strayEdges) {
        const stray = entities.ofType("Edge").filter((edge) => edge.faces.length === 0);
        count(statistics, "Stray edges erased", eraseEdges(entities, stray));
      }
      if (options.repairEdges) {
        count(statistics, "Split edges repaired", entities.mergeCollinearEdges());
      }
      if (options.smoothAngle > 0) {
        count(statistics, "Edges smoothed", smoothEdges(entities, options.smoothAngle));
      }
    }
    if (options.purge) {
      purge();
    }
  });
  return statistics;
}

/**
 * Describes the statistics in one line per change, or says nothing needed cleaning.
 * @param {Statistics} statistics
 */
function describe(statistics) {
  const lines = Object.entries(statistics).filter(([, value]) => value > 0).map(([name, value]) => `${name}: ${value}`);
  return lines.length > 0 ? lines.join("\n") : "The model was already clean.";
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  /** The last options used, which the dialog starts from. @returns {Options} */
  const lastOptions = () => ({ ...kDefaults, ...context.settings.get("options", {}) });

  /** @param {Options} options */
  function run(options) {
    try {
      context.settings.set("options", options);
    } catch (error) {
      console.warn(`Could not remember the cleanup options: ${error}`);
    }
    context.alert(describe(cleanUp(options)), { title: "Clean Up" });
  }

  context.registerCommand({
    id: "clean",
    title: "Clean Up...",
    tip: "Chooses what to clean, then cleans the model in one undo step.",
    run() {
      let options = lastOptions();
      context.showDialog({
        id: "options",
        title: "Clean Up",
        modal: true,
        draw(ui) {
          options = /** @type {Options} */ (ui.form(options, kSchema));
          ui.spacing();
          ui.row(() => {
            if (ui.button("Clean Up", { primary: true })) {
              ui.close();
              run(options);
            }
            if (ui.button("Cancel")) {
              ui.close();
            }
          });
        },
      });
    },
  });
  context.registerCommand({
    id: "clean-again",
    title: "Clean Up with Last Settings",
    tip: "Cleans the model with the options used last time.",
    run: () => run(lastOptions()),
  });

  /** Commands that run one cleanup step on the context being edited, or the model. */
  const steps = /** @type {const} */ ([
    ["purge", "Purge Unused", "Removes components and materials nothing uses.", { purge: true }],
    ["merge-faces", "Merge Coplanar Faces", "Erases edges between coplanar faces with the same materials.",
      { mergeFaces: true }],
    ["merge-materials", "Merge Identical Materials", "Makes identical materials one.", { mergeMaterials: true }],
    ["repair-edges", "Repair Split Edges", "Joins collinear edges split by an unneeded vertex.", { repairEdges: true }],
    ["stray-edges", "Erase Stray Edges", "Erases edges that bound no face.", { strayEdges: true }],
    ["erase-hidden", "Erase Hidden Geometry", "Erases hidden faces, edges, groups and components.",
      { eraseHidden: true }],
  ]);
  /** @type {Options} */
  const nothing = {
    scope: "Context being edited",
    purge: false,
    eraseHidden: false,
    mergeFaces: false,
    ignoreMaterials: false,
    mergeMaterials: false,
    repairEdges: false,
    strayEdges: false,
    smoothAngle: 0,
  };
  for (const [id, title, tip, enabled] of steps) {
    context.registerCommand({
      id,
      title,
      tip,
      run: () => context.showMessage(describe(cleanUp({ ...nothing, ...enabled })).replaceAll("\n", "; ")),
    });
  }
}

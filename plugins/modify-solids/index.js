// Changes solid groups and components in place with other solids, so they keep their names,
// paint, placement and plugin data, and every instance of a component changes along.
// A port of Eneroth Solid Tools (MIT) by Julia Christina Eneroth:
// https://github.com/Eneroth3/eneroth-solid-tools
//
// Copyright (c) 2017 Julia Christina Eneroth
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
//
// Eneroth's tools ask for a target and then each modifier with the mouse. Here the user marks
// modifiers once, then selects targets and runs a command. Without marked modifiers, Union and
// Intersect combine the selection into its largest solid, like Eneroth's instant mode.

/** @typedef {modlumi.Group | modlumi.ComponentInstance} Solid */

/** @type {Solid[]} */
let modifiers = [];

/**
 * @param {unknown} element
 * @returns {element is Solid}
 */
function isSolid(element) {
  if (!(element instanceof modlumi.Group || element instanceof modlumi.ComponentInstance)) {
    return false;
  }
  if (solidity === undefined) {
    return element.isSolid;
  }
  let solid = solidity.get(element);
  if (solid === undefined) {
    solid = element.isSolid;
    solidity.set(element, solid);
  }
  return solid;
}

/**
 * Whether entities are solid, kept while the commands' isEnabled checks run: they only read,
 * and each looks at the whole selection, which can hold thousands of entities.
 * @type {WeakMap<Solid, boolean> | undefined}
 */
let solidity;

/**
 * Runs a read-only check with solidity kept until the current run's code finishes.
 * @param {() => boolean} check
 */
function withSolidity(check) {
  if (solidity === undefined) {
    solidity = new WeakMap();
    Promise.resolve().then(() => {
      solidity = undefined;
    });
  }
  return check();
}

// Returns the marked modifiers that still exist and belong to the context being edited.
function liveModifiers() {
  const entities = modlumi.activeModel.activeEntities.toArray();
  modifiers = modifiers.filter((modifier) => modifier.isValid && entities.includes(modifier));
  return modifiers;
}

// Returns the selected solids that aren't marked as modifiers.
function selectedTargets() {
  const marked = liveModifiers();
  return modlumi.activeModel.selection
    .toArray()
    .filter(isSolid)
    .filter((solid) => !marked.includes(solid));
}

/**
 * @param {number} count
 * @param {string} noun
 */
function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Changes each target in place with each modifier in turn, as one undo step.
 * @param {"union" | "subtract" | "intersect"} operation
 * @param {Solid[]} targets
 * @param {Solid[]} cutters
 */
function modify(operation, targets, cutters) {
  const entities = modlumi.activeModel.activeEntities;
  for (const target of targets) {
    for (const cutter of cutters) {
      entities.modifySolid(target, cutter, operation);
    }
  }
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  const keepModifiers = () => context.settings.get("keepModifiers", false);

  context.registerCommand({
    id: "mark-modifiers",
    title: "Mark Modifiers",
    tip: "Remembers the selected solids as the modifiers the other commands change targets with.",
    when: "selection",
    contextMenu: true,
    isEnabled: () => withSolidity(() => modlumi.activeModel.selection.toArray().some(isSolid)),
    run() {
      modifiers = modlumi.activeModel.selection.toArray().filter(isSolid);
      context.showMessage(`Marked ${plural(modifiers.length, "modifier")}. Now select the targets.`);
    },
  });

  context.registerCommand({
    id: "keep-modifiers",
    title: "Keep Modifiers",
    tip: "Keeps the modifiers after Subtract instead of erasing them.",
    isChecked: keepModifiers,
    run() {
      context.settings.set("keepModifiers", !keepModifiers());
    },
  });

  /**
   * Registers a command that changes the selected targets with the marked modifiers.
   * @param {string} id
   * @param {string} title
   * @param {string} tip
   * @param {"union" | "subtract" | "intersect"} operation
   * @param {{ erase: () => boolean, instant: boolean }} options
   */
  const registerTool = (id, title, tip, operation, { erase, instant }) =>
    context.registerCommand({
      id,
      title,
      tip,
      when: "selection",
      contextMenu: true,
      isEnabled() {
        return withSolidity(() => {
          const targets = selectedTargets();
          return targets.length > 0 && (liveModifiers().length > 0 || (instant && targets.length > 1));
        });
      },
      run() {
        const model = modlumi.activeModel;
        let targets = selectedTargets();
        let cutters = liveModifiers();
        if (cutters.length === 0 && instant) {
          // The largest solid takes in the others.
          targets.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
          cutters = targets.slice(1);
          targets = targets.slice(0, 1);
        }
        if (targets.length === 0 || cutters.length === 0) {
          context.showMessage("Mark modifiers first, then select the solids to change.");
          return;
        }
        const erased = erase();
        model.operation(title, () => {
          modify(operation, targets, cutters);
          if (erased) {
            for (const cutter of cutters) {
              model.activeEntities.erase(cutter);
            }
          }
        });
        if (erased) {
          modifiers = [];
        }
        model.selection.clear();
        for (const target of targets) {
          model.selection.add(target);
        }
        context.showMessage(`${title}: changed ${plural(targets.length, "solid")} with ${plural(cutters.length, "modifier")}.`);
      },
    });

  registerTool("union", "Union", "Adds the modifiers to the selected solids, which keep their names and paint.", "union", {
    erase: () => false,
    instant: true,
  });
  registerTool(
    "subtract",
    "Subtract",
    "Cuts the modifiers out of the selected solids and erases them, unless Keep Modifiers is on.",
    "subtract",
    { erase: () => !keepModifiers(), instant: false },
  );
  registerTool("trim", "Trim", "Cuts the modifiers out of the selected solids and keeps them.", "subtract", {
    erase: () => false,
    instant: false,
  });
  registerTool(
    "intersect",
    "Intersect",
    "Keeps only the parts of the selected solids that lie inside the modifiers.",
    "intersect",
    { erase: () => false, instant: true },
  );
}

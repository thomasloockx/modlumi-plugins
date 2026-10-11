// An example plugin: counts the selected faces and keeps a running total in the model.
//
// The total is document data, so it is saved in .modl files and each count is one undo step.
// Whether hidden faces count is a setting of the user, kept outside the model.

/**
 * The plugin's value in the model.
 * @typedef {{ total: number, counts: number }} Tally
 */

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  const model = modlumi.activeModel;
  /** @returns {Tally} */
  const tally = () => context.documentData.get() ?? { total: 0, counts: 0 };
  const countHidden = () => context.settings.get("countHidden", false);

  context.registerCommand({
    id: "count",
    title: "Count Selected Faces",
    tip: "Adds the selected faces to the model's running total.",
    when: "selection",
    contextMenu: true,
    toolbar: true,
    icon: "icons/count.svg",
    shortcut: "Ctrl+Alt+F",
    run() {
      const faces = model.selection.toArray().filter(
        (element) => element instanceof modlumi.Face && (countHidden() || !element.hidden),
      ).length;
      const { total, counts } = tally();
      // Outside model.operation, each set is an undo step of its own.
      context.documentData.set({ total: total + faces, counts: counts + 1 });
      context.showMessage(`${faces} faces; ${total + faces} counted in this model`);
    },
  });

  context.registerCommand({
    id: "reset",
    title: "Reset Face Count",
    // Asked again after every change to the model, so it follows undo and redo.
    isEnabled: () => tally().counts > 0,
    run() {
      context.documentData.set(undefined);
      context.showMessage("Face count reset");
    },
  });

  context.registerCommand({
    id: "count-hidden",
    title: "Count Hidden Faces",
    isChecked: countHidden,
    run() {
      context.settings.set("countHidden", !countHidden());
    },
  });

  // Listeners may only read. This one reports the total of each model that opens.
  context.onDocumentOpened(() => {
    const { total } = tally();
    if (total > 0) {
      console.log(`Face Counter: this model has ${total} counted faces`);
    }
  });
}

export function deactivate() {
  console.log("Face Counter turned off");
}

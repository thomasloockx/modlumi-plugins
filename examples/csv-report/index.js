// An example plugin: writes a CSV report of the model's groups and components to a file the
// user chooses. It asks only for the "files.dialog" permission, so it can write the file the
// user picks in the save dialog, and no other.

const model = modlumi.activeModel;

/**
 * Quotes a CSV cell when it holds a comma, a quote or a line break.
 * @param {unknown} value
 */
function cell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Returns the report's rows, a header first: one row per group or component at the top level. */
function getRows() {
  /** @type {unknown[][]} */
  const rows = [["Name", "Type", "Faces", "Area"]];
  for (const entity of model.entities) {
    /** @type {modlumi.Entities} */
    let entities;
    let name;
    if (entity instanceof modlumi.Group) {
      entities = entity.entities;
      name = entity.name || "Group";
    } else if (entity instanceof modlumi.ComponentInstance) {
      entities = entity.definition.entities;
      name = entity.name || entity.definition.name;
    } else {
      continue;
    }
    const faces = entities.ofType("Face");
    // As placed in the model, which may scale the instance.
    const area = faces.reduce((sum, face) => sum + face.transformedArea(entity.transformation), 0);
    rows.push([name, entity instanceof modlumi.Group ? "Group" : "Component", faces.length, model.formatArea(area)]);
  }
  return rows;
}

/** @param {modlumi.PluginContext} context */
export function activate(context) {
  context.registerCommand({
    id: "export",
    title: "Export CSV Report...",
    tip: "Writes the model's groups and components, with their faces and areas, to a CSV file.",
    async run() {
      const rows = getRows();
      const file = await context.files.save({
        title: "Export CSV report",
        name: "report.csv",
        filters: [{ name: "CSV spreadsheet", extensions: ["csv"] }],
      });
      if (file === null) {
        return;
      }
      file.writeText(rows.map((row) => row.map(cell).join(",")).join("\n") + "\n");
      context.showMessage(`Wrote ${rows.length - 1} rows to ${file.name}`);
    },
  });
}

import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface TaskDef {
  id: string;
  category: string;
  title: string;
  outputFile: string;
  type: string;
}

const TEMPLATES_DIR = join(import.meta.dir, "templates");

function loadTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_DIR, name), "utf-8");
}

const templateCache = new Map<string, string>();

function getTemplate(name: string): string {
  if (!templateCache.has(name)) {
    templateCache.set(name, loadTemplate(name));
  }
  return templateCache.get(name)!;
}

function interpolate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

function extractModuleName(outputFile: string): string {
  const base = outputFile.split("/").pop() ?? outputFile;
  return base
    .replace(/\.test\.ts$/, "")
    .replace(/\.ts$/, "")
    .replace(/\.json$/, "")
    .replace(/\.md$/, "");
}

function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function toCamelCase(kebab: string): string {
  const pascal = toPascalCase(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function generateResponse(task: TaskDef): string {
  const moduleName = extractModuleName(task.outputFile);
  const className = toPascalCase(moduleName);
  const fnName = toCamelCase(moduleName);

  const vars: Record<string, string> = {
    MODULE_NAME: moduleName,
    CLASS_NAME: className,
    FN_NAME: fnName,
    TASK_ID: task.id,
    TASK_TITLE: task.title,
    OUTPUT_FILE: task.outputFile,
  };

  switch (task.type) {
    case "implementation":
      return interpolate(getTemplate("implementation.ts.tmpl"), vars);
    case "test":
      return interpolate(getTemplate("test.ts.tmpl"), vars);
    case "documentation":
      return interpolate(getTemplate("documentation.md.tmpl"), vars);
    case "build":
      return interpolate(getTemplate("build.json.tmpl"), vars);
    default:
      return interpolate(getTemplate("implementation.ts.tmpl"), vars);
  }
}

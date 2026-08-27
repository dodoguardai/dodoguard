import { asString, isRecord } from './utils';

/**
 * Spec 5: app, kind, version, dependencies, features.
 */
export function extractApp(root: Record<string, unknown>): Record<string, unknown> {
  const appRaw = root.app;
  if (!isRecord(appRaw)) {
    return {};
  }
  return {
    name: asString(appRaw.name),
    mode: asString(appRaw.mode),
    description: asString(appRaw.description),
    icon: asString(appRaw.icon),
    icon_background: asString(appRaw.icon_background),
    use_icon_as_answer_icon: Boolean(appRaw.use_icon_as_answer_icon),
  };
}

export function extractDependencies(root: Record<string, unknown>): unknown[] {
  const d = root.dependencies;
  if (!Array.isArray(d)) {
    return [];
  }
  return d.map((item) => {
    if (!isRecord(item)) {
      return item;
    }
    return {
      type: asString(item.type) ?? 'unknown',
      identifier: asString(item.identifier) ?? asString(item.name) ?? '',
      version: item.version ?? null,
    };
  });
}

export function extractFeatures(root: Record<string, unknown>): Record<string, unknown> {
  const wf = root.workflow;
  if (!isRecord(wf)) {
    return {};
  }
  const f = wf.features;
  return isRecord(f) ? { ...f } : {};
}

import type { Diagnostic } from '@vnve/core';
import { commandParamsSchemas } from '@vnve/core';
import { makeDiag, D } from './diagnostics';

export const COMMAND_SCHEMAS = commandParamsSchemas;

function firstField(path: Array<string | number>): string | undefined {
  const value = path.find((segment) => typeof segment === 'string');
  return typeof value === 'string' ? value : undefined;
}

function looksLikeMissingParam(issue: { code?: string; message?: string; received?: string }): boolean {
  if (issue.code === 'invalid_type' && issue.received === 'undefined') return true;
  if (typeof issue.message !== 'string') return false;
  const normalized = issue.message.toLowerCase();
  return normalized.includes('required') || normalized.includes('require');
}

export function validateParams(
  commandName: string,
  params: Record<string, unknown>,
  index: number,
): Diagnostic[] {
  const schema = (COMMAND_SCHEMAS as Record<string, { safeParse: (value: unknown) => { success: boolean; error?: { issues: Array<Record<string, unknown>> } } }>)[commandName];
  if (!schema) return [];

  const parsed = schema.safeParse(params);
  if (parsed.success) return [];

  const diags: Diagnostic[] = [];
  for (const issue of parsed.error?.issues ?? []) {
    if (
      commandName === 'camera'
      && issue.code === 'custom'
      && typeof issue.message === 'string'
      && issue.message.includes('camera focus requires')
    ) {
      // Keep parser-specific CAMERA_NO_TARGET diagnostic emitted in emitCameraMulti.
      continue;
    }

    if (issue.code === 'unrecognized_keys') {
      const keys = Array.isArray(issue.keys) ? issue.keys.filter((k): k is string => typeof k === 'string') : [];
      for (const key of keys) {
        diags.push(
          makeDiag(
            'error',
            D.INVALID_PARAM_TYPE,
            `Command '${commandName}' has unrecognized param '${key}'`,
            index,
            key,
          ),
        );
      }
      continue;
    }

    const path = Array.isArray(issue.path) ? issue.path.filter((p): p is string | number => typeof p === 'string' || typeof p === 'number') : [];
    const field = firstField(path);
    if (looksLikeMissingParam(issue as { code?: string; message?: string; received?: string })) {
      diags.push(
        makeDiag(
          'error',
          D.MISSING_PARAM,
          field
            ? `Command '${commandName}' requires param '${field}'`
            : `Command '${commandName}' is missing required params`,
          index,
          field,
        ),
      );
      continue;
    }

    const expected = typeof issue.expected === 'string' ? issue.expected : undefined;
    const received = typeof issue.received === 'string' ? issue.received : undefined;
    const fallbackMessage = field
      ? `Param '${field}' of '${commandName}' is invalid`
      : `Params of '${commandName}' are invalid`;
    const message = expected && received
      ? `Param '${field ?? '?'}' of '${commandName}' must be ${expected}, got ${received}`
      : (typeof issue.message === 'string' && issue.message.length > 0 ? issue.message : fallbackMessage);

    diags.push(makeDiag('error', D.INVALID_PARAM_TYPE, message, index, field));
  }
  return diags;
}

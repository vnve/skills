import type { Diagnostic, DiagnosticLevel } from '@vnve/core';

export const D = {
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  MISSING_PARAM: 'MISSING_PARAM',
  INVALID_PARAM_TYPE: 'INVALID_PARAM_TYPE',
  EMPTY_TEXT: 'EMPTY_TEXT',
  NEGATIVE_DURATION: 'NEGATIVE_DURATION',
  CAMERA_NO_TARGET: 'CAMERA_NO_TARGET',
  CAMERA_INVALID_ACTION: 'CAMERA_INVALID_ACTION',
} as const;

export function makeDiag(
  level: DiagnosticLevel,
  code: string,
  message: string,
  index: number,
  field?: string,
): Diagnostic {
  return {
    level,
    code,
    message,
    location: { index, ...(field ? { field } : {}) },
  };
}

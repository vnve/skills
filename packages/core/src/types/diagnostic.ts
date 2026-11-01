export type DiagnosticLevel = 'error' | 'warning';

export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  message: string;
  location?: {
    nodeId?: string;
    sceneId?: string;
    animationId?: string;
    field?: string;
    index?: number;
  };
}

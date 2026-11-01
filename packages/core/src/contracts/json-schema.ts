import { z } from 'zod/v3';
import { zodToJsonSchema } from 'zod-to-json-schema';

type JsonSchema = Record<string, unknown>;

export function buildJsonSchemaResponseFormat(
  name: string,
  schema: z.ZodTypeAny,
): {
  type: 'json_schema';
  json_schema: { name: string; strict: true; schema: JsonSchema };
} {
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'openAi',
    $refStrategy: 'none',
  }) as JsonSchema;
  const { $schema: _ignored, ...rest } = jsonSchema;
  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema: rest,
    },
  };
}

/** CLI/file inputs keep Zod optional fields optional; provider response schemas have different rules. */
export function buildInputJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  return zodToJsonSchema(schema, { target: 'jsonSchema7', $refStrategy: 'none' }) as JsonSchema;
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '$'}: ${issue.message}`)
    .join('\n');
}

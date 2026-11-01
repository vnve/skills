import { describe, expect, it } from 'vitest';
import { z } from 'zod/v3';

import { buildJsonSchemaResponseFormat, buildInputJsonSchema, formatZodError } from './contracts/json-schema';

describe('json schema helpers', () => {
  it('builds openai response format and strips $schema meta field', () => {
    const schema = z.object({
      name: z.string().min(1),
      age: z.number().int().optional(),
    });

    const result = buildJsonSchemaResponseFormat('person', schema);

    expect(result.type).toBe('json_schema');
    expect(result.json_schema.name).toBe('person');
    expect(result.json_schema.strict).toBe(true);
    expect(result.json_schema.schema).toMatchObject({
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      additionalProperties: false,
    });
    const required = (result.json_schema.schema.required ?? []) as string[];
    expect(required).toContain('name');
    expect(result.json_schema.schema).not.toHaveProperty('$schema');
  });

  it('formats zod issues with both root and nested paths', () => {
    const schema = z.object({
      title: z.string().min(3),
      profile: z.object({
        age: z.number().int().min(18),
      }),
    });

    const parsed = schema.safeParse({ title: '', profile: { age: 12 } });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    const formatted = formatZodError(parsed.error);

    expect(formatted).toContain('title: String must contain at least 3 character(s)');
    expect(formatted).toContain('profile.age: Number must be greater than or equal to 18');

    const rootParsed = z.string().min(1).safeParse('');
    expect(rootParsed.success).toBe(false);
    if (rootParsed.success) {
      return;
    }

    const rootFormatted = formatZodError(rootParsed.error);
    expect(rootFormatted).toContain('$: String must contain at least 1 character(s)');
  });
});


it('exports file input optionals without making them required or accepting null', () => {
  const schema = z.object({ title: z.string(), gender: z.enum(['male', 'female']).optional(), operations: z.array(z.object({ volume: z.number().optional(), actorId: z.string().nullable().optional() })).optional() });
  const result = buildInputJsonSchema(schema);
  expect(result).toMatchObject({ required: ['title'], properties: { gender: { type: 'string', enum: ['male', 'female'] }, operations: { type: 'array', items: { properties: { volume: { type: 'number' }, actorId: { type: ['string', 'null'] } } } } } });
  expect(schema.safeParse({ title: 'Story' }).success).toBe(true);
  expect(schema.safeParse({ title: 'Story', gender: null }).success).toBe(false);
});

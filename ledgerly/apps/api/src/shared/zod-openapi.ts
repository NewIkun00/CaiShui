import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { toJSONSchema, type ZodType } from 'zod';

type SwaggerSchema = Extract<Parameters<typeof ApiBody>[0], { schema: unknown }>['schema'];

export function zodOpenApiSchema(schema: ZodType, io: 'input' | 'output'): SwaggerSchema {
  return toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    reused: 'inline',
    unrepresentable: 'any',
  }) as SwaggerSchema;
}

export function ApiZodBody(schema: ZodType): MethodDecorator {
  return applyDecorators(ApiBody({ schema: zodOpenApiSchema(schema, 'input') }));
}

export function ApiZodCreatedResponse(schema: ZodType): MethodDecorator {
  return applyDecorators(ApiCreatedResponse({ schema: zodOpenApiSchema(schema, 'output') }));
}

export function ApiZodOkResponse(schema: ZodType): MethodDecorator {
  return applyDecorators(ApiOkResponse({ schema: zodOpenApiSchema(schema, 'output') }));
}

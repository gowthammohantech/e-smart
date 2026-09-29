/**
 * Types generated from openapi.yaml. Regenerate after editing the spec:
 *
 *   npm run generate -w @esmart/api-contract
 *
 * `Schema<'Party'>` is the wire shape of a component schema, and
 * `OperationId` names every operation the server must implement.
 */
import type { components, operations, paths } from './schema';

export type { components, operations, paths };

export type Schemas = components['schemas'];
export type Schema<K extends keyof Schemas> = Schemas[K];
export type OperationId = keyof operations;

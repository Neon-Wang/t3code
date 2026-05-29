/**
 * KimiAdapter — shape type for the Kimi Code provider adapter.
 *
 * @module KimiAdapter
 */
import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

/**
 * KimiAdapterShape — per-instance Kimi Code adapter contract.
 */
export interface KimiAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {}

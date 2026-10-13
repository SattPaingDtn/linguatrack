import "server-only";
import { DRAFT_CHAIN_PINS } from "@/lib/curriculum/catalog/contracts";
// Existing authoring baseline pins only. They confer no approval or learner access.
const pins = new Map<string, string>([
  ...DRAFT_CHAIN_PINS.map(({ version, hash }) => [version, hash] as [string, string]),
  ["1.4.0", "e45e197c9bfeef0280d4611b0f48f3a5b5c0ed900a3895a078462e52ce551d67"],
  ["1.5.0", "994a859c4a3b9782f757dfea50b45e9a5fd19d085715eb7fa14feaf79e253ffa"],
  ["1.6.0", "dbd4fe0e93f82dfded12645f706d5c9cf1600956e04c5588bd6bdf130b677d9e"],
  ["1.7.0", "cacc1e19a1794400babae8c5e73d40af8d75902d7dff661d9f3a577aa6b693c9"],
  ["1.8.0", "17a087e714ca5bcaea6e3ba2051664b6c0ee73da612f4337a4a81211def3d604"],
]);
export function assertExistingDraftPin(version: string, hash: string) {
  const pinned = pins.get(version);
  if (pinned && pinned !== hash)
    throw new Error("An immutable validated draft changed its package hash.");
}

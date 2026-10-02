import "server-only";
import { providerMode } from "@/lib/ai-provider";
import { reserveForProviderMode } from "@/lib/provider-work-budget";
export { allowAiRequest } from "@/lib/request-work-budget";

// Stage 3 V1 single-instance guard. Serverless instances do not share this Map.
/** Request counting stays separate from real Provider work counting. */
export function allowProviderWork(userId: number, units: number): boolean {
  return reserveForProviderMode(providerMode(), userId, units);
}

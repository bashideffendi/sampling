/**
 * Sampling engine entrypoint. Routes ke metode yang sesuai berdasarkan
 * MethodParam discriminated union.
 */

import type { MethodParam, SamplingResult, SP2DRow } from "@/types";
import { musSampleSize, musSelection } from "./mus";
import { srsSampleSize, srsSelection } from "./srs";
import { stratifiedSampleSize, stratifiedSelection } from "./stratified";
import { judgmentalSelection } from "./judgmental";
import {
  attributeSampleSizeWithMeta,
  attributeSelection,
  upperDeviationRate,
} from "./attribute";

export {
  musSampleSize,
  musSelection,
  srsSampleSize,
  srsSelection,
  stratifiedSampleSize,
  stratifiedSelection,
  judgmentalSelection,
  attributeSampleSizeWithMeta,
  attributeSelection,
  upperDeviationRate,
};

export function runSampling(
  populasi: SP2DRow[],
  mp: MethodParam,
): SamplingResult {
  switch (mp.method) {
    case "mus":
      return musSelection(populasi, mp.param);
    case "srs":
      return srsSelection(populasi, { ...mp.param, populationSize: populasi.length });
    case "stratified":
      return stratifiedSelection(populasi, mp.param);
    case "judgmental":
      return judgmentalSelection(populasi, mp.param);
    case "attribute":
      return attributeSelection(populasi, { ...mp.param, populationSize: populasi.length });
    default: {
      // exhaustive check
      const _exhaustive: never = mp;
      throw new Error(`Unknown sampling method: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

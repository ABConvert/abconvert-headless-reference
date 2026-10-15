'use client';
// Reading a price records nothing: the exposure is sent once the price is on
// screen. The SDK sends it once per test per visit.
// https://docs.abconvert.io/headless-sdk/tracking#exposure
import { useEffect } from 'react';
import { useABConvert } from '@abconvert/headless/react';

export function Exposure({ experimentId }: { experimentId: string }) {
  const { trackExposure } = useABConvert();
  useEffect(() => trackExposure(experimentId), [experimentId, trackExposure]);
  return null;
}

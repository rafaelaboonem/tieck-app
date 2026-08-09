import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { createV4Attempt, getV4Status } from '@/lib/camera-v4.functions';

export function useCameraVerificationV4() {
  const [attempt, setAttempt] = useState<any>(null);
  const startAttempt = useServerFn(createV4Attempt);
  
  const initialize = async (data: { checklistId: string; blockId: string; cameraBlockId: string }) => {
    const res = await startAttempt({ data });
    setAttempt(res);
    return res;
  };

  return {
    attempt,
    initialize
  };
}

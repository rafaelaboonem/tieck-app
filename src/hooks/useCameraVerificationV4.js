import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { createV4Attempt } from '@/lib/camera-v4.functions';
export function useCameraVerificationV4() {
    const [attempt, setAttempt] = useState(null);
    const startAttempt = useServerFn(createV4Attempt);
    const initialize = async (data) => {
        const res = await startAttempt({ data });
        setAttempt(res);
        return res;
    };
    return {
        attempt,
        initialize
    };
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSamplingStore } from "@/store/samplingStore";

export default function NewExpressPage() {
  const router = useRouter();
  const resetDraft = useSamplingStore((s) => s.resetDraft);

  useEffect(() => {
    resetDraft();
    const id = useSamplingStore.getState().draftMeta.draftId;
    router.replace(`/express/${id}`);
  }, [router, resetDraft]);

  return null;
}

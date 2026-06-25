"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useNotebookStore } from "@/store/notebookStore";

/**
 * v0.3.7: Notebook cell-based. Create new draft + redirect ke /notebook/[id].
 */
export default function NewNotebookRedirect() {
  const router = useRouter();
  const createNew = useNotebookStore((s) => s.createNew);

  useEffect(() => {
    const nb = createNew();
    router.replace(`/notebook/${nb.draftId}`);
  }, [createNew, router]);

  return null;
}

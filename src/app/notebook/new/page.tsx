"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * v0.1: Notebook UI belum di-build (lihat task tracker). Redirect ke Express
 * yang sudah cover 5 metode + run + download. Cell-based notebook menyusul v0.2.
 */
export default function NotebookNewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/express/new");
  }, [router]);
  return null;
}

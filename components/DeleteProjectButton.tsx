"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmButton } from "./ConfirmButton";

export function DeleteProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (res.ok) router.push("/projects");
      else setError("Delete failed");
    } catch {
      setError("Delete failed");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <ConfirmButton
        onConfirm={remove}
        prompt={`Delete "${name}" and all its rider data?`}
        confirmLabel="Delete"
        className="text-sm text-muted hover:text-danger disabled:opacity-50"
        title="Delete this project"
      >
        Delete project
      </ConfirmButton>
      {error && <span className="text-sm text-danger">{error}</span>}
    </span>
  );
}

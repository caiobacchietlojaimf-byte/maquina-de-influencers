"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { addCreditsAction, type AdminState } from "@/app/actions/admin";

export function AdminCreditsForm({ userId, userName }: { userId: string; userName: string }) {
  // A new key per successful grant: retries of the same submission stay idempotent.
  const [grantId, setGrantId] = useState(() => crypto.randomUUID());
  const [state, action, pending] = useActionState<AdminState, FormData>(addCreditsAction, null);
  useEffect(() => { if (state?.success) setGrantId(crypto.randomUUID()); }, [state]);
  return (
    <form action={action} style={{ display: "grid", gap: 4 }}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="grantId" value={grantId} />
      <div style={{ display: "flex", gap: 6 }}>
        <input className="input" name="credits" type="number" min={1} max={1_000_000} step={1} required inputMode="numeric" placeholder="Créditos" aria-label={`Créditos para adicionar a ${userName}`} disabled={pending} style={{ width: 110, padding: "8px 10px" }} />
        <button className="btn btn-accent btn-sm" disabled={pending} title={`Adicionar créditos a ${userName}`}>
          {pending ? <span className="spinner" aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}Adicionar
        </button>
      </div>
      <span role="status" style={{ fontSize: 11.5, color: state?.error ? "var(--danger)" : "var(--accent)" }}>{state?.error ?? state?.success ?? ""}</span>
    </form>
  );
}

"use client";
import { useActionState } from "react";
import { saveSettingsAction } from "@/app/actions/admin";
import type { SystemSettings } from "@/lib/commerce";
import styles from "./commerce.module.css";
export function AdminSettings({ settings }: { settings: SystemSettings }) {
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  return <form action={action} className={styles.form}>
    <h2>Configurações gerais</h2>
    <label><span><input style={{width:"auto"}} type="checkbox" name="registrationsOpen" defaultChecked={settings.registrationsOpen}/> Permitir novos cadastros</span></label>
    <label><span><input style={{width:"auto"}} type="checkbox" name="checkoutEnabled" defaultChecked={settings.checkoutEnabled}/> Habilitar checkout após configurar o gateway</span></label>
    <label>E-mail de suporte<input type="email" name="supportEmail" maxLength={254} defaultValue={settings.supportEmail} required/></label>
    <label>Aviso na área do cliente<textarea name="announcement" maxLength={280} rows={3} defaultValue={settings.announcement}/></label>
    <button className="btn btn-accent" disabled={pending}>{pending ? "Salvando…" : "Salvar configurações"}</button>
    {state?.error && <p role="alert">{state.error}</p>}{state?.success && <p role="status">{state.success}</p>}
  </form>;
}

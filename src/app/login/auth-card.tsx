"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { loginAction, registerAction, type AuthState } from "@/app/actions/auth";
import type { PlanId } from "@/lib/plans";
import { GoogleButton } from "./google-button";

function PasswordInput({
  id,
  name,
  autoComplete,
  minLength,
}: {
  id: string;
  name: string;
  autoComplete: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <input
        id={id}
        className="input"
        name={name}
        type={visible ? "text" : "password"}
        required
        minLength={minLength}
        maxLength={128}
        autoComplete={autoComplete}
        style={{ paddingRight: 46 }}
      />
      <button
        type="button"
        className="auth-eye"
        onClick={() => setVisible((v) => !v)}
        title={visible ? "Esconder senha" : "Mostrar senha"}
        aria-label={visible ? "Esconder senha" : "Mostrar senha"}
        aria-pressed={visible}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function AuthCard({
  initialMode,
  planId,
  notice,
  linkEmail,
}: {
  initialMode: "login" | "cadastro";
  planId?: PlanId;
  /** Mensagem vinda do fluxo do Google (erro, cancelamento, indisponibilidade). */
  notice?: string | null;
  /** Conta com senha que o Google tentou usar: a senha precisa ser confirmada para vincular. */
  linkEmail?: string;
}) {
  const [mode, setMode] = useState<"login" | "cadastro">(initialMode);
  const [loginState, login, loginPending] = useActionState<AuthState, FormData>(loginAction, null);
  const [registerState, register, registerPending] = useActionState<AuthState, FormData>(
    registerAction,
    null,
  );

  const error = mode === "login" ? loginState?.error : registerState?.error;
  const pending = mode === "login" ? loginPending : registerPending;
  const login_ = mode === "login";

  return (
    <div className="auth-card">
      <header className="auth-head">
        <h1>{login_ ? "Bem-vindo de volta" : "Crie sua conta"}</h1>
        <p>
          {login_
            ? "Entre para continuar criando seus personagens e vídeos."
            : "Comece a criar influencers e vídeos com IA em poucos minutos."}
        </p>
      </header>

      {notice ? <div className="auth-error" role="alert">{notice}</div> : null}
      {linkEmail ? (
        <div className="auth-info" role="status">
          Já existe uma conta com o e-mail <strong>{linkEmail}</strong>. Entre com a sua senha para vincular o login com Google a ela.
        </div>
      ) : null}

      <GoogleButton planId={planId} />

      <div className="auth-divider" role="separator" aria-label="ou">
        <span>ou com e-mail</span>
      </div>

      <div className="auth-tabs" role="tablist" aria-label="Entrar ou criar conta">
        <button type="button" role="tab" id="tab-login" aria-selected={login_} aria-controls="panel-auth" data-active={login_} onClick={() => setMode("login")}>
          Entrar
        </button>
        <button type="button" role="tab" id="tab-cadastro" aria-selected={!login_} aria-controls="panel-auth" data-active={!login_} onClick={() => setMode("cadastro")}>
          Criar conta
        </button>
      </div>

      {login_ ? (
        <form id="panel-auth" role="tabpanel" aria-labelledby="tab-login" className="auth-form" action={login}>
          <input type="hidden" name="planId" value={planId ?? ""} />
          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <div className="field">
            <label htmlFor="login-email">E-mail</label>
            <input id="login-email" className="input" name="email" type="email" required autoComplete="email" defaultValue={linkEmail ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="login-password">Senha</label>
            <PasswordInput id="login-password" name="password" autoComplete="current-password" />
          </div>
          <button className="btn btn-accent auth-submit" disabled={pending} type="submit">
            {pending ? <span className="spinner" /> : "Entrar"}
          </button>
        </form>
      ) : (
        <form id="panel-auth" role="tabpanel" aria-labelledby="tab-cadastro" className="auth-form" action={register}>
          <input type="hidden" name="planId" value={planId ?? ""} />
          {error ? <div className="auth-error" role="alert">{error}</div> : null}
          <div className="field">
            <label htmlFor="reg-name">Nome</label>
            <input id="reg-name" className="input" name="name" required autoComplete="name" />
          </div>
          <div className="field">
            <label htmlFor="reg-email">E-mail</label>
            <input id="reg-email" className="input" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="reg-password">Senha</label>
            <PasswordInput id="reg-password" name="password" autoComplete="new-password" minLength={10} />
            <span className="auth-hint">Mínimo de 10 caracteres.</span>
          </div>
          <button className="btn btn-accent auth-submit" disabled={pending} type="submit">
            {pending ? <span className="spinner" /> : "Criar minha conta"}
          </button>
          <p className="auth-hint" style={{ textAlign: "center" }}>
            Conheça a plataforma e escolha seu plano para começar a gerar.
          </p>
        </form>
      )}
    </div>
  );
}

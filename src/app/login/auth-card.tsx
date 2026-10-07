"use client";

import { useActionState, useState } from "react";

import { loginAction, registerAction, type AuthState } from "@/app/actions/auth";

export function AuthCard({ initialMode }: { initialMode: "login" | "cadastro" }) {
  const [mode, setMode] = useState<"login" | "cadastro">(initialMode);
  const [loginState, login, loginPending] = useActionState<AuthState, FormData>(loginAction, null);
  const [registerState, register, registerPending] = useActionState<AuthState, FormData>(
    registerAction,
    null,
  );

  const error = mode === "login" ? loginState?.error : registerState?.error;
  const pending = mode === "login" ? loginPending : registerPending;

  return (
    <div className="auth-card">
      <h1>{mode === "login" ? "Bem-vindo de volta" : "Crie sua conta"}</h1>
      <div className="auth-tabs" role="tablist">
        <button type="button" data-active={mode === "login"} onClick={() => setMode("login")}>
          Entrar
        </button>
        <button type="button" data-active={mode === "cadastro"} onClick={() => setMode("cadastro")}>
          Criar conta
        </button>
      </div>

      {mode === "login" ? (
        <form className="auth-form" action={login}>
          {error ? <div className="auth-error">{error}</div> : null}
          <div className="field">
            <label htmlFor="login-email">E-mail</label>
            <input id="login-email" className="input" name="email" type="email" required autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="login-password">Senha</label>
            <input
              id="login-password"
              className="input"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </div>
          <button className="btn btn-accent" disabled={pending} type="submit">
            {pending ? <span className="spinner" /> : "Entrar"}
          </button>
        </form>
      ) : (
        <form className="auth-form" action={register}>
          {error ? <div className="auth-error">{error}</div> : null}
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
            <input
              id="reg-password"
              className="input"
              name="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>
          <button className="btn btn-accent" disabled={pending} type="submit">
            {pending ? <span className="spinner" /> : "Criar conta e ganhar créditos"}
          </button>
          <p style={{ color: "var(--tx3)", fontSize: 12, textAlign: "center" }}>
            Contas novas começam com 10.000 créditos para gerar.
          </p>
        </form>
      )}
    </div>
  );
}

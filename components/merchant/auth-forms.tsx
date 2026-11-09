"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, signupAction } from "@/app/merchant/actions";
import type { AuthActionState } from "@/lib/auth/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <section aria-labelledby="login-title" className="auth-card">
      <h1 className="auth-title" id="login-title">Welcome back.</h1>
      <p className="auth-intro">Sign in to manage your AgentShelf shop.</p>
      <form action={action} className="auth-form">
        <div className="auth-field">
          <Label htmlFor="email">Email</Label>
          <Input
            autoComplete="email"
            className="auth-input"
            id="email"
            name="email"
            placeholder="you@yourshop.com"
            required
            type="email"
          />
        </div>
        <div className="auth-field">
          <Label htmlFor="password">Password</Label>
          <Input
            autoComplete="current-password"
            className="auth-input"
            id="password"
            name="password"
            required
            type="password"
          />
        </div>
        {state.error ? (
          <p aria-live="polite" className="auth-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button className="auth-submit" disabled={pending} type="submit">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <p className="auth-switch">
        New to AgentShelf? <Link href="/merchant/signup">Open your shop</Link>
      </p>
    </section>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialState);

  return (
    <section aria-labelledby="signup-title" className="auth-card">
      <h1 className="auth-title" id="signup-title">Open your shop.</h1>
      <p className="auth-intro">
        Start with the shop details. You decide what becomes visible to agents.
      </p>
      <form action={action} className="auth-form">
        <div className="auth-field">
          <Label htmlFor="shopName">Shop name</Label>
          <Input
            autoComplete="organization"
            className="auth-input"
            id="shopName"
            maxLength={80}
            minLength={2}
            name="shopName"
            placeholder="Maya's Clay Studio"
            required
          />
        </div>
        <div className="auth-field">
          <Label htmlFor="email">Email</Label>
          <Input
            autoComplete="email"
            className="auth-input"
            id="email"
            name="email"
            placeholder="you@yourshop.com"
            required
            type="email"
          />
        </div>
        <div className="auth-field">
          <Label htmlFor="paypalEmail">PayPal business email</Label>
          <Input
            autoComplete="email"
            className="auth-input"
            id="paypalEmail"
            name="paypalEmail"
            placeholder="payments@yourshop.com"
            required
            type="email"
          />
        </div>
        <div className="auth-field">
          <Label htmlFor="password">Password</Label>
          <Input
            autoComplete="new-password"
            className="auth-input"
            id="password"
            maxLength={72}
            minLength={12}
            name="password"
            required
            type="password"
          />
          <span className="text-xs text-muted-foreground">
            Use at least 12 characters.
          </span>
        </div>
        {state.error ? (
          <p aria-live="polite" className="auth-error" role="alert">
            {state.error}
          </p>
        ) : null}
        <Button className="auth-submit" disabled={pending} type="submit">
          {pending ? "Creating your shop…" : "Create account"}
        </Button>
      </form>
      <p className="auth-switch">
        Already have a shop? <Link href="/merchant/login">Sign in</Link>
      </p>
    </section>
  );
}

import { GoogleLogin } from "@react-oauth/google";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { IUser } from "../lib/types";
import { useAuth } from "../context/auth-store";

function destination(user: IUser): string {
  return user.role === "admin" ? "/dashboard/insights" : "/";
}

function AuthPage({ mode }: { mode: "login" | "register" }) {
  const navigate = useNavigate();
  const { user, login, register, loginWithGoogle, isLoading, error, clearError } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleError, setGoogleError] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [googleButtonWidth, setGoogleButtonWidth] = useState(280);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    clearError();
  }, [clearError, mode]);

  useEffect(() => {
    const element = googleButtonRef.current;
    if (!element) return;
    const updateWidth = () => setGoogleButtonWidth(Math.max(200, Math.min(400, Math.floor(element.clientWidth))));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (user) navigate(destination(user), { replace: true });
  }, [navigate, user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const nextUser = mode === "register"
        ? await register({ name, email, password })
        : await login({ email, password });
      navigate(destination(nextUser), { replace: true });
    } catch { /* The context exposes the user-facing error. */ }
  }

  return <main className="auth-page">
    <Link className="brand" to="/">FOLIO <span>KIT</span></Link>
    <section className="auth-panel" aria-labelledby="auth-heading">
      <h1 id="auth-heading">{mode === "register" ? "Create your account" : "Welcome back"}</h1>
      <p className="auth-lede">{mode === "register" ? "Start building your portfolio library." : "Sign in to continue to Foliokit."}</p>
      <div className="social-auth-actions" ref={googleButtonRef}>
        {googleClientId ? <GoogleLogin
          key={googleButtonWidth}
          onSuccess={(response) => {
            if (!response.credential) return setGoogleError("Google did not return a sign-in credential");
            setGoogleError(null);
            void loginWithGoogle(response.credential).then((nextUser) => navigate(destination(nextUser), { replace: true })).catch(() => undefined);
          }}
          onError={() => setGoogleError("Google sign-in could not be completed")}
          text="continue_with"
          width={String(googleButtonWidth)}
        /> : <p className="auth-error" role="alert">Google sign-in is not configured.</p>}
      </div>
      <div className="auth-divider"><span>OR</span></div>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        {mode === "register" && <label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} placeholder="e.g. Alex Morgan" required /></label>}
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="alex@example.com" required /></label>
        <label>Password<input type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "register" ? 10 : 1} maxLength={128} placeholder={mode === "register" ? "At least 10 characters" : "Enter your password"} required /></label>
        {mode === "register" && <small className="password-hint">Use 10+ characters with uppercase, lowercase, and a number.</small>}
        <button className="primary-button auth-submit" type="submit" disabled={isLoading}>
          {isLoading && <LoaderCircle className="auth-spinner" size={18} />}
          {mode === "register" ? "Create account" : "Sign in"}
        </button>
      </form>
      {(error || googleError) && <p className="auth-error" role="alert">{error || googleError}</p>}
      <p className="auth-switch">{mode === "register" ? "Already have an account?" : "Don't have an account?"} <Link to={mode === "register" ? "/sign-in" : "/sign-up"}>{mode === "register" ? "Sign in" : "Sign up"}</Link></p>
      <small>By continuing, you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</small>
    </section>
  </main>;
}

export function SignInPage() { return <AuthPage mode="login" />; }
export function SignUpPage() { return <AuthPage mode="register" />; }

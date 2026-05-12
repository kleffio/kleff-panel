"use client";

import { useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  AnimatedPlaceholderInput,
  Button,
  LetterWave,
  Label,
  Skeleton,
} from "@kleffio/ui";
import {
  ArrowRightIcon,
  CheckCircle2,
  Loader2,
  LockIcon,
  MailIcon,
  TriangleAlertIcon,
  UserIcon,
  XCircle,
} from "lucide-react";

import { useAuth, storeApiTokens, login, register, broadcastSignin } from "@/features/auth";
import { createProject } from "@/lib/api/projects";
import { checkSlugAvailable } from "@/lib/api/namespaces";
import { AuthConfigContext } from "@/features/auth/context";
import { IDPStartingSpinner } from "@/features/auth/ui/IDPStartingSpinner";
import { useBackendPlugins } from "@/features/plugins/model/use-backend-plugins";

function SignupSkeleton() {
  return (
    <>
      <div className="mb-10 space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-10 w-3/4" />
      </div>
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-12 w-full rounded-full" />
          <Skeleton className="h-12 w-full rounded-full" />
        </div>
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-12 w-full rounded-full" />
        <Skeleton className="h-12 w-full rounded-full" />
      </div>
    </>
  );
}

export function SignupPage() {
  const auth = useAuth();
  const authConfig = useContext(AuthConfigContext);
  const { signupConfig } = useBackendPlugins();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedUsername(username.trim().toLowerCase()), 400);
    return () => clearTimeout(t);
  }, [username]);

  const usernameSlug = username.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const slugCheck = useQuery({
    queryKey: ["slug-check", debouncedUsername],
    queryFn: () => checkSlugAvailable(debouncedUsername),
    enabled: debouncedUsername.length >= 2,
    staleTime: 10_000,
  });
  const slugTaken = slugCheck.data?.available === false;
  const slugChecking = debouncedUsername !== usernameSlug || slugCheck.isFetching;

  useEffect(() => {
    if (authConfig?.setup_required) {
      router.replace("/setup");
      return;
    }

    if (auth.isAuthenticated) {
      router.replace("/");
      return;
    }

    if (!auth.isLoading && authConfig?.enabled && authConfig.ready && authConfig.auth_mode === "redirect") {
      auth.signinRedirect({ extraQueryParams: { prompt: "create" } });
    }
  }, [
    auth.isAuthenticated,
    auth.isLoading,
    authConfig?.auth_mode,
    authConfig?.enabled,
    authConfig?.ready,
    authConfig?.setup_required,
    router,
  ]);

  if (authConfig?.setup_required) {
    return null;
  }

  if (authConfig?.enabled && !authConfig.ready) {
    return <IDPStartingSpinner variant="pane" />;
  }

  if (auth.isLoading) {
    return <SignupSkeleton />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (slugTaken) {
      setError("That username is already taken.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await register({ username, email, password, firstName, lastName });
      const tok = await login(username, password);
      storeApiTokens(tok, authConfig?.authority ?? "", authConfig?.client_id ?? "");
      // Create a default personal project named after the username
      try {
        const slug = username.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
        await createProject({ name: username, slug });
      } catch {
        // Non-fatal — user can create projects manually
      }
      broadcastSignin();
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mb-10 space-y-2">
        <p className="text-sm font-medium uppercase tracking-[0.28em] text-muted-foreground">
          <LetterWave text="Get started" />
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Create your account
        </h1>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlertIcon className="size-4" />
          <AlertTitle>Could not create your account</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {signupConfig?.disabled ? (
        <Alert variant="info" className="mb-8">
          <MailIcon className="size-4" />
          <AlertTitle>Registration is managed externally</AlertTitle>
          <AlertDescription>
            Contact your administrator or sign up through your identity provider.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          {!signupConfig?.hide_first_name && !signupConfig?.hide_last_name && (
            <div className="grid gap-5 sm:grid-cols-2">
              {!signupConfig?.hide_first_name && (
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <AnimatedPlaceholderInput
                    id="firstName"
                    icon={UserIcon}
                    autoComplete="given-name"
                    placeholder="Your first name"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
              )}
              {!signupConfig?.hide_last_name && (
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <AnimatedPlaceholderInput
                    id="lastName"
                    icon={UserIcon}
                    autoComplete="family-name"
                    placeholder="Your last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {!signupConfig?.hide_username && (
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <AnimatedPlaceholderInput
                  id="username"
                  icon={UserIcon}
                  autoComplete="username"
                  placeholder="Choose a username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                {debouncedUsername.length >= 2 && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    {slugChecking ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : slugTaken ? (
                      <XCircle className="size-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    )}
                  </div>
                )}
              </div>
              {slugTaken && (
                <p className="text-[12px] text-destructive">That username is already taken.</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <AnimatedPlaceholderInput
              id="email"
              icon={MailIcon}
              type="email"
              autoComplete="email"
              placeholder="Enter your email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <AnimatedPlaceholderInput
              id="password"
              icon={LockIcon}
              type="password"
              autoComplete="new-password"
              placeholder="Create a password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <AnimatedPlaceholderInput
              id="confirm"
              icon={LockIcon}
              type="password"
              autoComplete="new-password"
              placeholder="Confirm your password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          <Button
            type="submit"
            className="mt-3 h-12 w-full rounded-full bg-gradient-kleff text-primary-foreground shadow-[0_12px_27px_rgba(196,143,0,0.22)] hover:opacity-95"
            disabled={loading || slugTaken}
          >
            {loading ? "Creating account..." : "Create account"}
            {!loading && <ArrowRightIcon className="size-4" />}
          </Button>
        </form>
      )}

      <div className="mt-8 space-y-3 text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Sign in
          </Link>
        </p>
      </div>
    </>
  );
}

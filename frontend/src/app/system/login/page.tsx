"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { api, setAccessToken, type LoginResponse } from "@/lib/api";

export default function SystemLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    try {
      const result = await api<LoginResponse>("/system/login", {
        method: "POST",
        auth: false,
        body: {
          username: String(formData.get("username") ?? ""),
          password: String(formData.get("password") ?? ""),
        },
      });
      setAccessToken(result.accessToken);
      toast.success(`Welcome back, ${result.user.fName ?? result.user.username}!`);
      router.replace(result.redirectTo || "/system/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-muted/40">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ShieldCheck className="size-6" />
            </div>
            <CardTitle className="text-xl">System Console</CardTitle>
            <CardDescription>
              Sign in with your system account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="username">Username or email</Label>
                <Input
                  id="username"
                  name="username"
                  placeholder="admin"
                  autoComplete="username"
                  required
                  minLength={3}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <LoaderCircle className="size-4 animate-spin" />}
                Sign in
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center text-sm text-muted-foreground">
            No account?
            <Link
              href="/system/register"
              className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
            >
              Register
            </Link>
          </CardFooter>
        </Card>
      </div>
    </main>
  );
}

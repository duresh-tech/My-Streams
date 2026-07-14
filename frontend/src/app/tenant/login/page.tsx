"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useAnimation } from "motion/react";
import { Building2, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fadeUp, shake } from "@/components/motion/variants";
import { ThemeToggle } from "@/components/theme-toggle";
import { setTenantAccessToken, tenantApi, type TenantLoginResponse } from "@/lib/tenant-api";

export default function TenantLoginPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const cardControls = useAnimation();

  React.useEffect(() => {
    cardControls.start("visible");
  }, [cardControls]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    try {
      const result = await tenantApi<TenantLoginResponse>("/tenant/login", {
        method: "POST",
        auth: false,
        body: {
          username: String(formData.get("username") ?? ""),
          password: String(formData.get("password") ?? ""),
        },
      });
      setTenantAccessToken(result.accessToken);
      toast.success(`Welcome back, ${result.user.fName ?? result.user.username}!`);
      router.replace(result.redirectTo || "/tenant/dashboard");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Login failed");
      setLoading(false);
      cardControls.start(shake);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <div className="flex justify-end p-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <motion.div
          className="w-full max-w-sm"
          initial="hidden"
          animate={cardControls}
          variants={fadeUp}
        >
          <Card className="w-full">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Building2 className="size-6" />
              </div>
              <CardTitle className="text-xl">Tenant Portal</CardTitle>
              <CardDescription>
                Sign in with your tenant account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">Username or email</Label>
                  <Input
                    id="username"
                    name="username"
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
          </Card>
        </motion.div>
      </div>
    </main>
  );
}

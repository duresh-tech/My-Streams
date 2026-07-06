"use client";

import * as React from "react";
import { Camera, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UPLOADS_ORIGIN } from "@/lib/api";
import {
  TenantApiError,
  tenantApi,
  uploadTenantAvatar,
  type TenantAccountProfile,
} from "@/lib/tenant-api";

interface FormValues {
  fName: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

const EMPTY_FORM: FormValues = {
  fName: "",
  username: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
};

export default function TenantUserAccountPage() {
  const [profile, setProfile] = React.useState<TenantAccountProfile | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState<FormValues>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [uploadingAvatar, setUploadingAvatar] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    tenantApi<TenantAccountProfile>("/tenant/account")
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setForm({
          fName: data.fName,
          username: data.username,
          email: data.email,
          phone: data.phone ?? "",
          password: "",
          confirmPassword: "",
        });
      })
      .catch(() => toast.error("Failed to load your account"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function onAvatarSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { path } = await uploadTenantAvatar(file);
      setProfile((p) => (p ? { ...p, avatarPath: path } : p));
      toast.success("Profile picture updated");
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password && form.password !== form.confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      const updated = await tenantApi<TenantAccountProfile>("/tenant/account", {
        method: "PATCH",
        body: {
          fName: form.fName,
          username: form.username,
          email: form.email,
          phone: form.phone || undefined,
          ...(form.password ? { password: form.password } : {}),
        },
      });
      setProfile(updated);
      setForm((f) => ({ ...f, password: "", confirmPassword: "" }));
      toast.success("Account updated");
    } catch (error) {
      toast.error(error instanceof TenantApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const initials = (profile.fName || profile.username)
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Account Settings</CardTitle>
          <CardDescription>
            Update your name, username, email, phone and password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-6">
            <div className="grid gap-2">
              <Label>Profile Picture</Label>
              <div className="relative inline-block w-fit">
                <Avatar className="size-24 border">
                  {profile.avatarPath && (
                    <AvatarImage
                      src={`${UPLOADS_ORIGIN}/uploads/${profile.avatarPath}`}
                      alt="Profile picture"
                    />
                  )}
                  <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                </Avatar>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onAvatarSelected}
                />
                <Button
                  type="button"
                  size="icon"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 size-7 rounded-full"
                  aria-label="Change profile picture"
                >
                  {uploadingAvatar ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Camera className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fName">Full name</Label>
              <Input
                id="fName"
                required
                value={form.fName}
                onChange={(e) => setForm((f) => ({ ...f, fName: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  required
                  minLength={3}
                  pattern="[a-zA-Z0-9._-]+"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="Leave blank to keep current"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  minLength={8}
                  value={form.confirmPassword}
                  onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  disabled={!form.password}
                />
              </div>
            </div>

            <div>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

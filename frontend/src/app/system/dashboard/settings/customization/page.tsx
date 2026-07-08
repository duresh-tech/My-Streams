"use client";

import * as React from "react";
import { LoaderCircle, Save, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError, uploadAppLogo, UPLOADS_ORIGIN } from "@/lib/api";
import { setAppSettings } from "@/hooks/use-app-settings";
import { useSession } from "@/hooks/use-session";

interface AppSettingRow {
  id: string;
  key: string;
  dataType: string;
  value: string;
  description: string | null;
  status: string;
}

export default function CustomizationPage() {
  const { hasPermission } = useSession();
  const canView = hasPermission("app-settings:view");
  const canUpdate = hasPermission("app-settings:update");

  const [nameSettingId, setNameSettingId] = React.useState<string | null>(null);
  const [logoPath, setLogoPath] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [appName, setAppName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);
  const logoInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    api<AppSettingRow>("/system/app-settings/key/app.name")
      .then((data) => {
        if (cancelled) return;
        setNameSettingId(data.id);
        setAppName(data.value);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error instanceof ApiError ? error.message : "Failed to load settings");
      })
      .finally(() => {
        if (cancelled) return;
        api<AppSettingRow>("/system/app-settings/key/app.logo_path")
          .then((data) => !cancelled && setLogoPath(data.value))
          .catch(() => !cancelled && setLogoPath(null))
          .finally(() => !cancelled && setLoading(false));
      });
    return () => {
      cancelled = true;
    };
  }, [canView]);

  async function onLogoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingLogo(true);
    try {
      const { path } = await uploadAppLogo(file);
      setLogoPath(path);
      setAppSettings({ appName, logoPath: path });
      toast.success("Logo updated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Upload failed");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nameSettingId) return;
    setSaving(true);
    try {
      const updated = await api<AppSettingRow>(`/system/app-settings/${nameSettingId}`, {
        method: "PATCH",
        body: { value: appName },
      });
      setAppName(updated.value);
      setAppSettings({ appName: updated.value, logoPath });
      toast.success("Settings updated");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Customization</CardTitle>
          <CardDescription>You don&apos;t have permission to view this page.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError || !nameSettingId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Customization</CardTitle>
          <CardDescription>{loadError ?? "Failed to load settings."}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Customization</CardTitle>
        <CardDescription>
          {canUpdate
            ? "Update the application name and logo shown throughout the system."
            : "The application name and logo shown throughout the system."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-6">
          <div className="grid gap-2">
            <Label>Application Logo</Label>
            <div className="flex items-center gap-4">
              <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted">
                {logoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${UPLOADS_ORIGIN}/uploads/${logoPath}`}
                    alt="Application logo"
                    className="size-full object-cover"
                  />
                ) : (
                  <Upload className="size-6 text-muted-foreground/60" />
                )}
              </div>
              {canUpdate && (
                <>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onLogoSelected}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploadingLogo}
                    onClick={() => logoInputRef.current?.click()}
                  >
                    {uploadingLogo && <LoaderCircle className="size-4 animate-spin" />}
                    {logoPath ? "Change logo" : "Upload logo"}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid gap-2 sm:max-w-sm">
            <Label htmlFor="appName">
              Application name
              {canUpdate && <span className="text-destructive"> *</span>}
            </Label>
            <Input
              id="appName"
              required
              disabled={!canUpdate}
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
            />
          </div>

          {canUpdate && (
            <div>
              <Button type="submit" disabled={saving}>
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

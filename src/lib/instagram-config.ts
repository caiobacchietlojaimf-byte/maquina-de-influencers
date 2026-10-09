import "server-only";

/** Resolve a complete pair so an app ID never uses another app's secret. */
export function instagramCredentials(): { appId: string; appSecret: string } | null {
  const aliasId = process.env.ID_INSTAGRAM?.trim();
  const aliasSecret = process.env.SECRET_INSTAGRAM?.trim();
  if (aliasId || aliasSecret) {
    return aliasId && aliasSecret ? { appId: aliasId, appSecret: aliasSecret } : null;
  }
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const appSecret = process.env.INSTAGRAM_APP_SECRET?.trim();
  return appId && appSecret ? { appId, appSecret } : null;
}

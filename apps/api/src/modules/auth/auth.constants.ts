export const ACCESS_TOKEN_COOKIE = 'savitools_access_token';
export const REFRESH_TOKEN_COOKIE = 'savitools_refresh_token';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;               // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;    // 30 days
export const REFRESH_TOKEN_REUSE_GRACE_MS = 10 * 1000;
export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;    // 24 hours
export const PASSWORD_RESET_TTL_SECONDS = 30 * 60;             // 30 minutes

// Password reset rate limiting (Savitura/Savitools#196)
export const PASSWORD_RESET_MAX_PER_EMAIL = 5;                 // per window
export const PASSWORD_RESET_MAX_PER_IP = 20;                   // per window
export const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;        // 15 minutes

// WebAuthn passkeys (Savitura/Savitools#218)
export const PASSKEY_CHALLENGE_TTL_SECONDS = 120;              // 2 minutes, single-use
export const PASSKEY_REAUTH_TTL_SECONDS = 5 * 60;              // 5 minutes
export const PASSKEY_REAUTH_SCOPE = 'passkey-reauth';
export const PASSKEY_MAX_PER_USER = 25;

// Owner a discoverable (usernameless) assertion challenge is keyed under at
// issuance, before the server knows which credential will answer it (#287).
export const DISCOVERABLE_CHALLENGE_OWNER = 'anonymous';

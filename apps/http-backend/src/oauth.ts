import crypto from "crypto";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prismaClient } from "@repo/db/index";

const JWT_SECRET = process.env.JWT_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const BACKEND_URL =
  process.env.OAUTH_CALLBACK_BASE_URL || "http://localhost:3002";

type OAuthProvider = "github" | "google";

interface OAuthProfile {
  providerAccountId: string;
  email: string;
  name?: string;
  photo?: string;
}

interface OAuthStateData {
  provider: OAuthProvider;
  expiresAt: number;
  returnTo?: string;
}

const pendingStates = new Map<string, OAuthStateData>();

function cleanupExpiredStates() {
  const now = Date.now();
  for (const [state, data] of pendingStates.entries()) {
    if (data.expiresAt < now) {
      pendingStates.delete(state);
    }
  }
}

function createOAuthState(provider: OAuthProvider, returnTo?: string): string {
  cleanupExpiredStates();
  const state = crypto.randomBytes(32).toString("hex");
  pendingStates.set(state, {
    provider,
    expiresAt: Date.now() + 10 * 60 * 1000,
    returnTo,
  });
  return state;
}

function verifyOAuthState(state: string, provider: OAuthProvider): OAuthStateData | null {
  cleanupExpiredStates();
  const data = pendingStates.get(state);
  if (!data || data.provider !== provider) {
    return null;
  }
  pendingStates.delete(state);
  return data;
}

function issueJwt(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET);
}

function redirectWithError(res: Response, message: string) {
  const params = new URLSearchParams({ error: message });
  res.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
}

function redirectWithToken(
  res: Response,
  token: string,
  userId: string,
  name?: string | null,
  returnTo?: string
) {
  const params = new URLSearchParams({
    token,
    userId,
    name: name || "",
  });
  if (returnTo) {
    params.set("returnTo", returnTo);
  }
  res.redirect(`${FRONTEND_URL}/auth/callback?${params.toString()}`);
}

async function findOrCreateOAuthUser(profile: OAuthProfile, provider: OAuthProvider) {
  const existingAccount = await prismaClient.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: { user: true },
  });

  if (existingAccount) {
    const user = await prismaClient.user.update({
      where: { id: existingAccount.userId },
      data: {
        name: profile.name ?? existingAccount.user.name,
        photo: profile.photo ?? existingAccount.user.photo,
      },
    });
    return user;
  }

  const existingUser = await prismaClient.user.findUnique({
    where: { email: profile.email },
  });

  if (existingUser) {
    await prismaClient.oAuthAccount.create({
      data: {
        provider,
        providerAccountId: profile.providerAccountId,
        userId: existingUser.id,
      },
    });

    return prismaClient.user.update({
      where: { id: existingUser.id },
      data: {
        name: existingUser.name ?? profile.name,
        photo: existingUser.photo ?? profile.photo,
      },
    });
  }

  return prismaClient.user.create({
    data: {
      email: profile.email,
      name: profile.name,
      photo: profile.photo,
      oauthAccounts: {
        create: {
          provider,
          providerAccountId: profile.providerAccountId,
        },
      },
    },
  });
}

async function exchangeGitHubCode(code: string): Promise<OAuthProfile> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth is not configured");
  }

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${BACKEND_URL}/auth/github/callback`,
    }),
  });

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token) {
    throw new Error(tokenData.error_description || "Failed to get GitHub access token");
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: "application/json",
      "User-Agent": "draw-app",
    },
  });

  const githubUser = (await userResponse.json()) as {
    id: number;
    login?: string;
    name?: string;
    email?: string | null;
    avatar_url?: string;
  };

  let email = githubUser.email;

  if (!email) {
    const emailsResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
        "User-Agent": "draw-app",
      },
    });

    const emails = (await emailsResponse.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;

    const primaryEmail =
      emails.find((entry) => entry.primary && entry.verified) ||
      emails.find((entry) => entry.verified) ||
      emails[0];

    email = primaryEmail?.email;
  }

  if (!email) {
    throw new Error("Could not retrieve email from GitHub account");
  }

  return {
    providerAccountId: String(githubUser.id),
    email,
    name: githubUser.name || githubUser.login,
    photo: githubUser.avatar_url,
  };
}

async function exchangeGoogleCode(code: string): Promise<OAuthProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${BACKEND_URL}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!tokenData.access_token) {
    throw new Error(tokenData.error_description || "Failed to get Google access token");
  }

  const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
    },
  });

  const googleUser = (await userResponse.json()) as {
    id: string;
    email?: string;
    verified_email?: boolean;
    name?: string;
    picture?: string;
  };

  if (!googleUser.email) {
    throw new Error("Could not retrieve email from Google account");
  }

  if (googleUser.verified_email === false) {
    throw new Error("Google email is not verified");
  }

  return {
    providerAccountId: googleUser.id,
    email: googleUser.email,
    name: googleUser.name,
    photo: googleUser.picture,
  };
}

export function startGitHubAuth(req: Request, res: Response) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return redirectWithError(res, "GitHub OAuth is not configured on the server");
  }

  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
  const state = createOAuthState("github", returnTo);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${BACKEND_URL}/auth/github/callback`,
    scope: "read:user user:email",
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
}

export async function handleGitHubCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return redirectWithError(
      res,
      typeof error_description === "string" ? error_description : "GitHub login cancelled"
    );
  }

  if (typeof code !== "string" || typeof state !== "string") {
    return redirectWithError(res, "Invalid GitHub callback parameters");
  }

  const stateData = verifyOAuthState(state, "github");
  if (!stateData) {
    return redirectWithError(res, "Invalid or expired OAuth state");
  }

  try {
    const profile = await exchangeGitHubCode(code);
    const user = await findOrCreateOAuthUser(profile, "github");
    const token = issueJwt(user.id);
    redirectWithToken(res, token, user.id, user.name, stateData.returnTo);
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    redirectWithError(
      res,
      err instanceof Error ? err.message : "GitHub authentication failed"
    );
  }
}

export function startGoogleAuth(req: Request, res: Response) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return redirectWithError(res, "Google OAuth is not configured on the server");
  }

  const returnTo = typeof req.query.returnTo === "string" ? req.query.returnTo : undefined;
  const state = createOAuthState("google", returnTo);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${BACKEND_URL}/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export async function handleGoogleCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return redirectWithError(
      res,
      typeof error_description === "string" ? error_description : "Google login cancelled"
    );
  }

  if (typeof code !== "string" || typeof state !== "string") {
    return redirectWithError(res, "Invalid Google callback parameters");
  }

  const stateData = verifyOAuthState(state, "google");
  if (!stateData) {
    return redirectWithError(res, "Invalid or expired OAuth state");
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const user = await findOrCreateOAuthUser(profile, "google");
    const token = issueJwt(user.id);
    redirectWithToken(res, token, user.id, user.name, stateData.returnTo);
  } catch (err) {
    console.error("Google OAuth error:", err);
    redirectWithError(
      res,
      err instanceof Error ? err.message : "Google authentication failed"
    );
  }
}

import "server-only";
import { ApiError } from "../server";
type Env = Record<string, string | undefined>;
const ref = (value: string | undefined) => Boolean(value && /^[a-z0-9]{20}$/.test(value));
export function requireStagingTarget(env: Env = process.env) {
  const projectRef = env.LINGUATRACK_STAGING_PROJECT_REF,
    protectedRef = env.LINGUATRACK_PROTECTED_PROJECT_REF;
  if (
    env.LINGUATRACK_RUNTIME_ENV !== "staging" ||
    !ref(projectRef) ||
    !ref(protectedRef) ||
    projectRef === protectedRef
  )
    throw new ApiError("A distinct, explicitly configured staging project is required.", 503);
  if (
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${projectRef}.supabase.co` ||
    !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    throw new ApiError(
      "Staging authentication configuration does not match the approved target.",
      503,
    );
  return { projectRef: projectRef!, protectedRef: protectedRef! };
}
export function stagingMcqEnabled(env: Env = process.env) {
  return env.LINGUATRACK_RUNTIME_ENV === "staging" && env.LINGUATRACK_V2_MCQ_ENABLED === "true";
}
export function stagingWriterConfig(env: Env = process.env) {
  const target = requireStagingTarget(env);
  let url: URL;
  try {
    url = new URL(env.LINGUATRACK_STAGING_WRITER_DATABASE_URL ?? "");
  } catch {
    throw new ApiError("Staging writer configuration is missing.", 503);
  }
  const direct =
    url.hostname === `db.${target.projectRef}.supabase.co` &&
    decodeURIComponent(url.username) === "linguatrack_staging_app";
  const pooler =
    /^[a-z0-9.-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    decodeURIComponent(url.username) === `linguatrack_staging_app.${target.projectRef}`;
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    (!direct && !pooler) ||
    url.search ||
    url.hash ||
    !url.password ||
    url.pathname !== "/postgres" ||
    (url.port && url.port !== "5432")
  )
    throw new ApiError(
      "Only the approved staging host and restricted writer connection are permitted.",
      503,
    );
  return {
    host: url.hostname,
    port: 5432,
    database: "postgres",
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: {
      rejectUnauthorized: true,
      ...(env.LINGUATRACK_STAGING_DATABASE_CA
        ? { ca: env.LINGUATRACK_STAGING_DATABASE_CA.replaceAll("\\n", "\n") }
        : {}),
    },
    connectionTimeoutMillis: 10000,
    query_timeout: 15000,
    max: 2,
    application_name: "linguatrack-d4-staging",
    ...target,
  };
}

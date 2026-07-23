import { existsSync, readFileSync } from "node:fs";

export function buildPostgresSslConfig(environment = process.env) {
  const mode = String(environment.PGSSLMODE || "require").toLowerCase();
  if (mode === "disable") {
    if (environment.NODE_ENV === "production" && environment.ALLOW_INSECURE_DATABASE !== "true") {
      throw new Error("PGSSLMODE=disable is forbidden in production");
    }
    return false;
  }

  const rootCertificatePath = environment.PGSSLROOTCERT;
  const certificateAuthority = rootCertificatePath && existsSync(rootCertificatePath)
    ? readFileSync(rootCertificatePath, "utf8")
    : undefined;
  const rejectUnauthorized = environment.PGSSLREJECTUNAUTHORIZED !== "false";
  if (!rejectUnauthorized && environment.NODE_ENV === "production" && environment.ALLOW_INSECURE_DATABASE_TLS !== "true") {
    throw new Error("Unverified PostgreSQL TLS is forbidden in production");
  }

  return {
    rejectUnauthorized,
    ...(certificateAuthority ? { ca: certificateAuthority } : {})
  };
}

export function buildPostgresPoolConfig(connectionString, environment = process.env) {
  if (!connectionString) throw new Error("A PostgreSQL connection string is required");
  return {
    connectionString,
    ssl: buildPostgresSslConfig(environment),
    max: 8,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000
  };
}

import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { ServiceError } from "@/lib/server/tx";
import type { Database } from "@/lib/supabase/database.types";

type Fns = Database["public"]["Functions"];

/**
 * Calls a money/order Postgres function with the service role. Business errors raised by the function (SQLSTATE P0001, message
 * in Indonesian, HINT = machine code) become ServiceError with that message; anything else is a real failure and is rethrown
 * as a plain Error (the caller shows a generic message). Returns the rows of a table function, or the scalar.
 */
export async function callFn<N extends keyof Fns>(name: N, args: Fns[N]["Args"]): Promise<Fns[N]["Returns"]> {
  const { data, error } = await supabaseAdmin().rpc(name, args as never);
  if (error) {
    if (error.code === "P0001") throw new ServiceError(error.message, error.hint ?? "error");
    if (error.code === "23505") throw new ServiceError("Data yang sama sudah ada.", "conflict");
    throw new Error(`${String(name)}: ${error.message}`);
  }
  return data as Fns[N]["Returns"];
}

// App data layer: Drizzle client bound to the app schema.
import { createGetDb } from "@agent-native/core/db";
import * as schema from "../drizzle/schema";

export const getDb = createGetDb(schema);
export { schema };

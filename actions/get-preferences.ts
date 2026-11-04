import { defineAction, fail } from "@agent-native/core/action";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { z } from "zod";

import { ensurePreferences } from "../server/entries.js";

export default defineAction({
  description: "Get the signed-in user's preferences (author names, organisation, identifiers, language, alerts).",
  schema: z.object({}),
  http: { method: "GET" },
  run: async () => {
    const ownerEmail = getRequestUserEmail();
    if (!ownerEmail) fail("Not authenticated", { statusCode: 401 });
    return ensurePreferences(ownerEmail);
  },
});

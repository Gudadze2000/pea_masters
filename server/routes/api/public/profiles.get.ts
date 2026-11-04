import { defineEventHandler } from "h3";
import { listPublicProfiles } from "../../../profiles.js";

// Guest-readable: directory of public profiles. Listed in publicPaths.
export default defineEventHandler(() => listPublicProfiles());

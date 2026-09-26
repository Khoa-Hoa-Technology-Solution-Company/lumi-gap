import type { HomeOverview } from "@trend/shared-types";
import type { AuthClaims } from "../../common/middleware/auth.js";
import { getPostgresHomeOverview } from "./home.postgres.js";

export const homeService = {
  async getOverview(user?: AuthClaims): Promise<HomeOverview> {
    return getPostgresHomeOverview(user);
  },
};

import Region from "./Region";
import CursoredRessource from "./CursoredRessource";
import { getConfig } from "../config";

const url = "/organizations/:organizationId/regions/:id";

export interface OrganizationRegionQueryParams {
  organizationId: string;
  [key: string]: any;
};

// @ts-ignore
// TODO: solve the query function inheritance ts error
export default class OrganizationRegion extends Region {
  static query(params: OrganizationRegionQueryParams) {
    const { organizationId, ...queryParams } = params;
    const { api_url } = getConfig();

    return CursoredRessource.queryCursoredResult(
      this.getQueryUrl(`${api_url}${url}`),
      { organizationId },
      {},
      queryParams,
      OrganizationRegion,
      {
        queryStringArrayPrefix: "[]"
      }
    );
  }
}
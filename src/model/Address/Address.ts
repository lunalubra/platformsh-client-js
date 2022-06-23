import { APIObject } from "../Ressource";
import { getConfig } from "../../config";
import _urlParser from "../../urlParser";
import { autoImplementWithResources } from "../utils";

import { AddressParams, AddressType } from "./types";

const url = "/v1/profiles/:id/address";
const paramDefaults = {};

const _modifiableField = [
  "country",
  "name_line",
  "premise",
  "sub_premise",
  "thoroughfare",
  "administrative_area",
  "sub_administrative_area",
  "locality",
  "dependent_locality",
  "postal_code"
];

export default class Address extends autoImplementWithResources()<AddressType>() {
  id: string;

  constructor(address: APIObject) {
    const { id } = address;
    const { account_url } = getConfig();

    super(
      `${account_url}${url}`,
      paramDefaults,
      { id },
      address,
      [],
      _modifiableField
    );
    this._queryUrl = Address.getQueryUrl(`${account_url}${url}`, id);
    this.id = address.id;
  }

  static getQueryUrl(_url: string, id?: string) {
    if (id) {
      return _urlParser(_url, { id });
    }
    return "";
  }

  static get(params: AddressParams, customUrl?: string) {
    const { id, ...queryParams } = params;
    const { api_url } = getConfig();

    return super._get<Address>(
      this.getQueryUrl(customUrl || `${api_url}${url}`, id),
      { id },
      paramDefaults,
      queryParams
    );
  }

  static query(params: AddressParams) {
    const { api_url } = getConfig();
    const { id } = params;

    return super._query<Address>(
      this.getQueryUrl(`${api_url}${url}`, id),
      {},
      paramDefaults,
      params
    );
  }

  update(address: APIObject, id?: string) {
    const { api_url } = getConfig();

    let updateURL = `${api_url}${url}`

    if (id) {
      updateURL = Address.getQueryUrl(updateURL, id);
    }

    return super.update(address, updateURL);
  }
}

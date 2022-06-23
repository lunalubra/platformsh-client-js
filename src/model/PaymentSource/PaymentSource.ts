import Ressource, { APIObject, ParamsType } from "../Ressource";
import { getConfig } from "../../config";
import _urlParser from "../../urlParser";
import request from "../../api";

const url = "/platform/payment_source";
const paramDefaults = {};
const creatableField = ["type", "token", "email"];

export default class PaymentSource extends Ressource {
  id: string;
  type: string;
  name: string;
  number: string;
  card: string;
  mandate: string;

  constructor(paymentSource: APIObject, customUrl?: string, params?: ParamsType) {
    const { api_url } = getConfig();

    super(
      customUrl || `${api_url}${url}`,
      paramDefaults,
      params || {},
      paymentSource,
      creatableField
    );
    this.id = paymentSource.id;
    this.type = paymentSource.type;
    this.name = paymentSource.name;
    this.number = paymentSource.number;
    this.card = paymentSource.card;
    this.mandate = paymentSource.mandate;
  }

  static get(queryParams = {}, customUrl?: string) {
    const { api_url } = getConfig();

    const parsedUrl = _urlParser(
      customUrl || `${api_url}${url}`,
      paramDefaults,
      queryParams
    );

    return request(parsedUrl, "GET", queryParams)
      .then(data => {
        if (typeof data === undefined) return {};
        return new PaymentSource(
          this.formatDetails(data.payment_source)
        );
      })
      .catch(err => new PaymentSource({}));
  }

  static query(params = {}, customUrl?: string) {
    const { api_url } = getConfig();

    return super._query(
      customUrl || `${api_url}${url}`,
      {},
      paramDefaults,
      params
    );
  }

  /**
   * Delete the payment source.
   *
   * @return object
   */
  static delete(customUrl?: string) {
    const { api_url } = getConfig();
    return request(customUrl || `${api_url}${url}`, "DELETE");
  }

  /**
   * Get allowed payment source.
   * The list of allowed payment sources for the current API consumer.
   *
   * @return object
   */
  static getAllowed() {
    const { api_url } = getConfig();
    return request(`${api_url}${url}/allowed`, "GET");
  }

  /**
   * Create a Setup Intent.
   *
   * @return object
   */
  static intent() {
    const { api_url } = getConfig();
    return request(`${api_url}${url}/intent`, "POST");
  }

  /**
   * Format data according to the type of payment source
   *
   * @param paymentSource PaymentSource
   *
   * @return PaymentSource
   */
  static formatDetails(paymentSource: APIObject) {
    switch (paymentSource.type) {
      case "credit-card":
        paymentSource.card = paymentSource.data;
        break;
      case "stripe_sepa_debit":
        paymentSource.mandate = paymentSource.data;
        break;
    }
    return paymentSource;
  }
}

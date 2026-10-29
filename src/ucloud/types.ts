/** Teaching Cloud / CAS login result (tokens only — never store password). */
export type UCloudSession = {
  access_token: string;
  refresh_token: string;
  token_type?: string;
  expires_in?: number;
  /** Student id */
  user_name?: string;
  account?: string;
  real_name?: string;
  user_id?: string;
};

export class UCloudLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UCloudLoginError";
  }
}
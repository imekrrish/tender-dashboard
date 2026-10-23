import axios from 'axios';

export function createApiClient(baseURL: string) {
  // Let Axios select the content type from the payload. A global JSON header
  // serializes FormData as JSON and discards the uploaded file's contents.
  return axios.create({ baseURL });
}

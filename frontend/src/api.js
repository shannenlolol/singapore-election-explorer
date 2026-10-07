async function request(path, options = {}) {
  const response = await fetch(path, { ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Request failed (${response.status}).`);
  return data;
}
export const apiGet = (path, options) => request(path, options);

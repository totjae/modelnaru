export function csrfToken(): string {
  const prefix = 'modelnaru_csrf=';
  const item = document.cookie
    .split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(prefix));
  return item?.slice(prefix.length) ?? '';
}

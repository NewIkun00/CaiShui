const placeholderNames = [
  'R5_WEB_PORT',
  'R5_OIDC_ADMIN_CLIENT_SECRET',
  'R5_ALICE_EMAIL',
  'R5_ALICE_PASSWORD',
  'R5_BOB_EMAIL',
  'R5_BOB_PASSWORD',
];

export function renderRealm(template, values, ports) {
  let rendered = template;
  const replacements = { ...values, R5_WEB_PORT: String(ports.R5_WEB_PORT) };
  for (const name of placeholderNames) {
    const value = replacements[name];
    if (!value) throw new Error(`${name} is required to render the Keycloak realm`);
    const escaped = JSON.stringify(value).slice(1, -1);
    rendered = rendered.replaceAll(`__${name}__`, escaped);
  }
  if (/__[A-Z0-9_]+__/u.test(rendered))
    throw new Error('Unresolved placeholder remains in Keycloak realm');
  const document = JSON.parse(rendered);
  if (document.realm !== 'ledgerly') throw new Error('Unexpected Keycloak realm name');
  return { rendered: `${JSON.stringify(document, null, 2)}\n`, document };
}

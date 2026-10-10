export function selectAmrExecutions(executions) {
  const find = (pattern) =>
    executions.find((item) => pattern.test(`${item.displayName ?? ''} ${item.providerId ?? ''}`));

  return {
    pwd: find(/username.*password|auth-username-password-form/iu),
    otp: find(/otp.*form|auth-otp-form/iu),
    webauthn: find(/webauthn.*authenticator|webauthn-authenticator/iu),
  };
}

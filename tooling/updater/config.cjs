// Public update configuration. The private Ed25519 key stays in Keychain / GitHub Secrets.
module.exports = {
  version: '2.8.1',
  archiveSha256: '5cddb7695674ef7704268f38eccaee80e3accbf19e61c1689efff5b6116d85be',
  publicKey: 'N32wHSyKvAhuMfDMCvpfv5/oQ6mz/OtopIrzFUyZi8k=',
  repository: 'rckbrcls/polterware',
  feedUrl: (app) => `https://raw.githubusercontent.com/rckbrcls/polterware/main/updates/${app}.xml`,
};

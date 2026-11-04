export function accountingCatalog(env = process.env) {
  const authorPrices = {
    pri_01km5hnjhxxbmqayav9et25xt0: { authorId: 4141, plan: 'monthly' },
    pri_01km5hqygery4ewnnh9kvjcnss: { authorId: 4141, plan: 'annual' },
    pri_01km5ht3bbx00pa6yssfhf6td3: { authorId: 4141, plan: 'lifetime' },
    pri_01k83ehezmg0j69wyxsgeb4xr0: { authorId: 1691, plan: 'monthly' },
    pri_01k83ehxfcdf1j486d708zfdga: { authorId: 1691, plan: 'annual' },
  };
  for (const prefix of [
    'NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_',
    'NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_',
    'NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_PRODUCTION_',
    'NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EDITOR_AI_PRODUCTION_',
    'SPUNKRAM_SANDBOX_PRICE_EDITOR_',
    'SPUNKRAM_SANDBOX_PRICE_EDITOR_AI_',
  ]) {
    if (env[prefix + 'MONTHLY']) authorPrices[env[prefix + 'MONTHLY']] = { authorId: 1691, plan: 'monthly' };
    if (env[prefix + 'YEARLY']) authorPrices[env[prefix + 'YEARLY']] = { authorId: 1691, plan: 'annual' };
  }
  return {
    authorPrices,
    sandboxBuyerIds: (env.PADDLE_SANDBOX_BUYER_IDS ?? '').split(',').map(Number)
      .filter(id => Number.isSafeInteger(id) && id > 0),
    corePriceIds: ['CREATOR_MONTHLY', 'CREATOR_YEARLY', 'CREATOR_AI_MONTHLY', 'CREATOR_AI_YEARLY']
      .map(k => env['NEXT_PUBLIC_PADDLE_PRICE_' + k]).filter(Boolean),
    extraPriceIds: [
      ...[20, 50, 200].flatMap(n => [
        env['NEXT_PUBLIC_PADDLE_PRICE_EXTRA_AI_GEN_' + n],
        env['NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_' + n],
      ]),
      env.NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_100,
      ...[20, 50, 100].map(n => env['SPUNKRAM_SANDBOX_PRICE_EXTRA_' + n]),
      ...[20, 50, 100].map(n => env['NEXT_PUBLIC_SPUNKRAM_PADDLE_PRICE_EXTRA_PRODUCTION_' + n]),
    ].filter(Boolean),
  };
}

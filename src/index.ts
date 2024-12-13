import { Hono } from 'hono';

type Env = {
  HELIUS_API_KEY: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  AUTH_TOKEN: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.text('Solana Action Bot is running!'));

app.post('/create-webhook', async (c) => {
  const webhookURL = `${new URL(c.req.url).origin}/webhook`;  
  console.log('Setting up webhook with URL:', webhookURL);

  const response = await fetch(
    `https://api.helius.xyz/v0/webhooks?api-key=${c.env.HELIUS_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        webhookURL: webhookURL,
        transactionTypes: ["NFT_SALE"],
        accountAddresses: ["M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K"], // Magic Eden v2 program
        webhookType: "enhanced",
        authHeader: c.env.AUTH_TOKEN
      }),
    }
  );
  const data = await response.json();
  console.log('Helius webhook setup response:', data);
  return c.json({ success: true, webhook: data, webhookURL: webhookURL });
});

async function sendTelegramMessage(message: string, env: Env) {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
    }),
  });
  return response.json();
}

app.post('/webhook', async (c) => {

  const authToken = c.req.header('Authorization');
  if (authToken !== c.env.AUTH_TOKEN) {
    return c.text('Unauthorized', 401);
  }

  let data;
  try {
    data = await c.req.json();
    console.log('Received webhook data:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error parsing webhook data:', error);
    return c.text('Error processing webhook', 400);
  }

  if (!Array.isArray(data) || data.length === 0) {
    console.log('No transactions in webhook data');
    return c.text('No transactions to process', 200);
  }

  for (const transaction of data) {
    if (transaction.type === 'NFT_SALE') {
      const { amount, buyer, seller, signature, nfts } = transaction.events.nft;
      const message = `🎉 *NFT Sale*\n\n` +
        `*Price*: ${amount / 1e9} SOL\n` +
        `*Buyer*: \`${buyer}\`\n` +
        `*Seller*: \`${seller}\`\n` +
        `*Signature*: [View on Solana Explorer](https://explorer.solana.com/tx/${signature})`;
      
      try {
        const result = await sendTelegramMessage(message, c.env);
        console.log('Telegram message sent:', result);
      } catch (error) {
        console.error('Error sending Telegram message:', error);
      }
    }
  }

  return c.text('Webhook processed');
});

export default app;


// import { Hono } from 'hono';

// // Define environment variables
// interface Env {
//   HELIUS_API_KEY: string;
//   TELEGRAM_BOT_TOKEN: string;
//   TELEGRAM_CHAT_ID: string;
//   AUTH_TOKEN: string;
//   PUMPFUN_API_KEY: string;
// }

// const app = new Hono<{ Bindings: Env }>();

// let connectedWallets: string[] = [];
// let tradeHistory: Array<{ token: string; action: string; amount: number; price: number }> = [];
// const tokenBalances: Record<string, { amount: number; averagePrice: number }> = {};

// // Utility function to send messages to Telegram
// async function sendTelegramMessage(message: string, env: Env) {
//   const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
//   await fetch(url, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({
//       chat_id: env.TELEGRAM_CHAT_ID,
//       text: message,
//       parse_mode: 'Markdown',
//     }),
//   });
// }

// // Fetch token price (example integration with Pump.fun or another API)
// async function fetchTokenPrice(tokenAddress: string, env: Env): Promise<number> {
//   const response = await fetch(`https://api.pump.fun/v1/token/${tokenAddress}`, {
//     method: 'GET',
//     headers: { Authorization: `Bearer ${env.PUMPFUN_API_KEY}` },
//   });
//   const data = await response.json();
//   return data.price || 0; // Adjust based on API response structure
// }

// // Handle Telegram bot commands
// app.post('/telegram', async (c) => {
//   const body = await c.req.json();
//   const { message } = body;
//   const command = message?.text?.trim();
//   const env = c.env;

//   if (!command) {
//     return c.text('Invalid command', 400);
//   }

//   try {
//     if (command.startsWith('/buy')) {
//       const [, token, amountStr] = command.split(' ');
//       const amount = parseFloat(amountStr);
//       if (!amount) throw new Error('Invalid amount.');

//       const price = await fetchTokenPrice(token, env);
//       if (!price) throw new Error('Failed to fetch token price.');

//       if (!tokenBalances[token]) {
//         tokenBalances[token] = { amount: 0, averagePrice: 0 };
//       }
//       const currentBalance = tokenBalances[token];
//       currentBalance.averagePrice =
//         (currentBalance.amount * currentBalance.averagePrice + amount * price) /
//         (currentBalance.amount + amount);
//       currentBalance.amount += amount;

//       tradeHistory.push({ token, action: 'buy', amount, price });
//       await sendTelegramMessage(`✅ Bought ${amount} of ${token} at ${price.toFixed(2)} SOL`, env);
//     } else if (command.startsWith('/sell')) {
//       const [, token, amountStr] = command.split(' ');
//       const amount = parseFloat(amountStr);
//       if (!amount) throw new Error('Invalid amount.');

//       const price = await fetchTokenPrice(token, env);
//       if (!price) throw new Error('Failed to fetch token price.');

//       const currentBalance = tokenBalances[token];
//       if (!currentBalance || currentBalance.amount < amount) {
//         throw new Error('Insufficient balance.');
//       }

//       const totalCost = currentBalance.averagePrice * amount;
//       const totalRevenue = price * amount;
//       const profit = totalRevenue - totalCost;

//       currentBalance.amount -= amount;
//       if (currentBalance.amount === 0) delete tokenBalances[token];

//       tradeHistory.push({ token, action: 'sell', amount, price });
//       await sendTelegramMessage(
//         `✅ Sold ${amount} of ${token} at ${price.toFixed(2)} SOL\nProfit: ${profit.toFixed(2)} SOL`,
//         env
//       );
//     } else if (command.startsWith('/trades')) {
//       const trades = tradeHistory
//         .map((t) => `${t.action.toUpperCase()} ${t.amount} of ${t.token} at ${t.price} SOL`)
//         .join('\n');
//       await sendTelegramMessage(`📊 Trade History:\n${trades || 'No trades yet.'}`, env);
//     } else if (command.startsWith('/wallets')) {
//       const wallets = connectedWallets.length > 0 ? connectedWallets.join('\n') : 'No connected wallets.';
//       await sendTelegramMessage(`🔗 Connected Wallets:\n${wallets}`, env);
//     } else {
//       await sendTelegramMessage(
//         '❓ Unknown command. Available commands: /buy, /sell, /wallets, /trades',
//         env
//       );
//     }
//   } catch (err) {
//     await sendTelegramMessage(`❌ Error: ${err.message}`, env);
//   }

//   return c.text('Command processed');
// });

// // Webhook for Pump.fun updates (trigger sniping logic)
// app.post('/webhook', async (c) => {
//   const data = await c.req.json();
//   const env = c.env;

//   for (const token of data.newTokens || []) {
//     const price = await fetchTokenPrice(token.mintAddress, env);
//     await sendTelegramMessage(`🚀 New token launched: ${token.name} at ${price.toFixed(2)} SOL`, env);

//     // Example sniper logic: auto-buy token below a threshold price
//     if (price < 0.1) {
//       const amount = 100; // Example: Buy 100 tokens
//       if (!tokenBalances[token.mintAddress]) {
//         tokenBalances[token.mintAddress] = { amount: 0, averagePrice: 0 };
//       }
//       const currentBalance = tokenBalances[token.mintAddress];
//       currentBalance.averagePrice =
//         (currentBalance.amount * currentBalance.averagePrice + amount * price) /
//         (currentBalance.amount + amount);
//       currentBalance.amount += amount;

//       tradeHistory.push({ token: token.mintAddress, action: 'buy', amount, price });
//       await sendTelegramMessage(`🤖 Auto-bought ${amount} of ${token.name} at ${price.toFixed(2)} SOL`, env);
//     }
//   }

//   return c.text('Webhook processed');
// });

// export default app;

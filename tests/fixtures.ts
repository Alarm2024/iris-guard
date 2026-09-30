/** Realistic group-chat lines used by the tests. No real people, links, or wallets. */

export const SCAM_MESSAGES: Record<string, string[]> = {
  seed_phrase_request: [
    "Hi, to restore access to your wallet please send me your 12 word recovery phrase and I will fix it",
    "Wallet sync failed. Enter your seed phrase in the validation form to continue: wallet-sync-fix.app",
    "Support here, please type your mnemonic below so we can release the stuck transaction",
  ],
  fake_support_dm: [
    "Hello, I am from the Phantom support team. I saw your question, DM me and I will help you",
    "Having trouble with your wallet? Message our support on WhatsApp +1 555 0100, open 24/7",
    "This is Solflare customer service, please reply to me here on Telegram to resolve your ticket",
  ],
  fake_airdrop: [
    "JUP airdrop round 2 is open! Claim your tokens at jup-claim.xyz before it ends tonight",
    "Congratulations, your wallet is eligible to claim 500 bonus tokens. Connect here: bit.ly/sol-reward",
    "You have been selected for the Solana community drop, click the link to receive 20 SOL",
  ],
  unlimited_approval: [
    "Just approve unlimited USDC spending for the vault, it saves fees later",
    "Sign the unlimited approval so the bot can move your tokens any time you need",
    "Set an infinite allowance on the router contract, everyone in the group does it",
  ],
  authority_change: [
    "To upgrade your token account to v2, sign the SetAuthority transaction I just sent you",
    "We need you to transfer authority of your token account to our migration wallet today",
    "Please change the authority on your account to this address for the v2 migration",
  ],
  urgent_verify_wallet_link: [
    "URGENT: your wallet will be suspended in 24 hours. Verify your wallet here: phantom-verify.app",
    "Security alert! Click this link to verify your wallet and avoid losing your funds",
    "Final notice: wallet verification is required today. Urgent link: solana-check.io",
  ],
};

export const NORMAL_MESSAGES: string[] = [
  "the airdrop snapshot was yesterday",
  "gm everyone, SOL looking strong today",
  "did anyone make it to Breakpoint this year?",
  "I moved my tokens to a Ledger last week, the setup took ten minutes",
  "Jupiter swap fees seem lower this month",
  "reminder: never share your seed phrase with anyone",
  "admins will never DM you first, report anyone who does",
  "what RPC are you all using for devnet?",
  "freeze authority is disabled on that token, I checked on Solscan",
  "I revoked an old approval on my wallet yesterday, feels cleaner",
];

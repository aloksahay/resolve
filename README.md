# Real time Bets — Telegram Bot

A prediction market bot on the 0G blockchain. Create bets on real-world events, place YES/NO wagers, and let AI resolve them automatically using live data — all within 60 seconds.

---

## Try it now

Open Telegram and search for **[@bett0gbot](https://t.me/bett0gbot)**

No wallet, no sign-up, no gas fees required to test.

---

## How it works

1. You create a market by describing what you want to bet on
2. The bot fetches the **current real-world value** (price, temperature, etc.) and locks it in as the start condition
3. Two AI bettors automatically place opposing bets to seed the market
4. After **60 seconds**, the bot uses live data to resolve the market and announces the result

---

## Supported markets

### ETH Price
> Will ETH go up or down in the next 60 seconds?

The bot fetches the current ETH/USD price at creation time and creates a market like:
**"Will ETH be above $2,847.12 at [time]?"**

### Denver Temperature
> Will it be below freezing in Denver?

The bot fetches the current temperature and creates a market like:
**"Will the temperature in Denver, CO be above 0°C at [time]?"**

---

## Testing the bot

### 1. Create an ETH price market

Send any of these to the bot:

```
will ETH go up in 60 seconds
bet on ETH price
ETH up or down?
```

The bot will reply with:
- The **start condition** (e.g. ETH at $2,847.12)
- The **resolution criteria** (e.g. resolve YES if price > $2,847.12)
- Confirmation that two AI bettors placed opposing bets

Then **wait 60 seconds** — the bot posts the result automatically.

---

### 2. Create a Denver temperature market

Send any of these:

```
will Denver be below 0 degrees
Denver temperature bet
is it freezing in Denver?
```

Same flow — bot locks in the current temp, resolves in 60 seconds.

---

### 3. Place a bet on an existing market

Once a market is open, you can bet on it:

```
bet YES on market 3
I think ETH goes up, bet 0.1
bet against market 3
```

Or use the **YES / NO buttons** shown on each market card.

---

### 4. View open markets

```
/markets
show me the markets
what bets are open?
```

---

### 5. Manually resolve a market

If a market has passed its deadline and hasn't auto-resolved:

```
/resolve 3
resolve market 3
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Show help |
| `/markets` | List all markets |
| `/market <id>` | View a specific market |
| `/bet <id>` | Place a YES or NO bet |
| `/resolve <id>` | Trigger AI resolution |
| `/balances` | Show AI bettor wallet balances |

You can also just **talk naturally** — the bot understands plain English.

---
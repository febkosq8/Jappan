# Setup and configuration

## Configuration

Copy [`.env.example`](../.env.example) to `.env`. Set `DISCORD_TOKEN` to your Discord bot token and `DB_URL` to your MongoDB connection string. See [Environment variables](./ENVIRONMENT.md) for the complete variable reference, including defaults, accepted values, and event-debug options.

## Log files

Runtime output is written to the `logs/` folder. Docker Compose writes `logs/docker.log`, and PM2 writes `logs/pm2.log`. These files are generated at runtime; keep configuration and application data elsewhere.

## Running Jappan

Choose one of the two options below. Both need the `.env` file described in [Configuration](#configuration).

### Option 1: Docker

The image is published to [GitHub Container Registry](https://github.com/febkosq8/Jappan/pkgs/container/jappan). You only need Docker Compose, [`docker-compose.yaml`](../docker-compose.yaml), and the `.env` file in the same folder. No clone, Node.js, or pnpm is needed; Compose pulls the published image.

1. Put `docker-compose.yaml` and `.env` in the same folder. `DB_URL` must point to a MongoDB server reachable from the container; `localhost` inside the container is not your host machine.
2. Create the log folder before the first run, otherwise Docker creates it owned by root and the container's `node` user cannot write to it:

    ```text
    mkdir -p logs
    ```

    Compose creates `logs/docker.log` on first start.

3. Start the bot:

    ```text
    docker compose up -d
    ```

Compose restarts the bot unless it is stopped. `HOST_PORT` controls the port reachable on the host (8875 by default); `PORT` controls the port the app listens on inside the container (also 8875 by default).

```text
docker compose pull      # Fetch the latest image
docker compose logs -f   # Follow logs
docker compose down      # Stop the bot
```

### Option 2: Clone and run with PM2

Runs Jappan from source without Docker. Requires Node.js, pnpm, ffmpeg, and a reachable MongoDB server.

1. Clone the repository and install dependencies:

    ```text
    git clone https://github.com/febkosq8/Jappan.git
    cd Jappan
    pnpm install
    ```

2. Create `.env` as described in [Configuration](#configuration).
3. Build the bot:

    ```text
    pnpm run build
    ```

4. Install PM2 and start the bot with the included [`ecosystem.config.cjs`](../ecosystem.config.cjs):

    ```text
    npm install -g pm2
    pm2 start ecosystem.config.cjs
    ```

PM2 restarts the bot if it crashes.

```text
pm2 logs Jappan      # Follow logs
pm2 restart Jappan   # Restart after rebuilding
pm2 stop Jappan      # Stop the bot
pm2 save             # Save the process list
pm2 startup          # Start PM2 on system boot
```
